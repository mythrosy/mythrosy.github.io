// scripts/notion.mjs
// 跟 Notion API 溝通的小工具：讀資料庫、讀文章內容、把內容轉成 HTML、寫回發布網址。
// 用的是 Notion 公開 REST API（不需要額外套件，Node 18+ 內建 fetch 就能用）。

const NOTION_VERSION = "2022-06-28";

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// 讀出資料庫裡「全部」的列（文章），會自動翻頁直到讀完。
export async function fetchAllPages(databaseId, apiKey) {
  const results = [];
  let cursor = undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) {
      throw new Error(`讀取 Notion 資料庫失敗（${res.status}）：${await res.text()}`);
    }
    const data = await res.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

// 讀出一個 block 底下的所有子 block（會自動翻頁）。
async function fetchBlockChildren(blockId, apiKey) {
  const results = [];
  let cursor = undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      throw new Error(`讀取文章內容失敗（${res.status}）：${await res.text()}`);
    }
    const data = await res.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

// 讀出一篇文章「正文」的所有 block（page 本身底下的所有子 block）。
export async function fetchPageContent(pageId, apiKey) {
  return fetchBlockChildren(pageId, apiKey);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// 把一段 Notion 的 rich_text 陣列轉成一段 HTML（處理粗體、斜體、底線、刪除線、行內程式碼、連結）。
function richTextToHtml(richText = []) {
  return richText
    .map((t) => {
      let html = escapeHtml(t.plain_text ?? "");
      const a = t.annotations || {};
      if (a.code) html = `<code>${html}</code>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.strikethrough) html = `<s>${html}</s>`;
      if (a.underline) html = `<u>${html}</u>`;
      if (t.href) html = `<a href="${escapeHtml(t.href)}" target="_blank" rel="noopener">${html}</a>`;
      return html;
    })
    .join("");
}

// 把純文字（不含格式）抽出來，給摘要、閱讀時間估算用。
export function richTextToPlain(richText = []) {
  return richText.map((t) => t.plain_text ?? "").join("");
}

// 把一批 Notion block 轉成文章內文 HTML。
// 支援：段落、標題(H2/H3/H4)、項目符號、編號清單、引言、分隔線、圖片(外部連結)、程式碼區塊、折疊區塊。
// 不支援的區塊類型（例如表格、內嵌影片）會被安靜跳過，不會讓整個流程失敗。
export async function blocksToHtml(blocks, apiKey) {
  const html = [];
  let listBuffer = []; // 暫存連續的清單項目
  let listType = null; // 'bulleted' | 'numbered'

  function flushList() {
    if (listBuffer.length === 0) return;
    const tag = listType === "numbered" ? "ol" : "ul";
    html.push(`<${tag}>${listBuffer.join("")}</${tag}>`);
    listBuffer = [];
    listType = null;
  }

  for (const block of blocks) {
    const type = block.type;

    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const kind = type === "numbered_list_item" ? "numbered" : "bulleted";
      if (listType && listType !== kind) flushList();
      listType = kind;
      listBuffer.push(`<li>${richTextToHtml(block[type].rich_text)}</li>`);
      continue;
    }

    flushList();

    if (type === "paragraph") {
      const text = richTextToHtml(block.paragraph.rich_text);
      if (text.trim()) html.push(`<p>${text}</p>`);
    } else if (type === "heading_1") {
      html.push(`<h2>${richTextToHtml(block.heading_1.rich_text)}</h2>`);
    } else if (type === "heading_2") {
      html.push(`<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>`);
    } else if (type === "heading_3") {
      html.push(`<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>`);
    } else if (type === "quote") {
      html.push(`<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`);
    } else if (type === "divider") {
      html.push(`<div class="article-divider"><span></span></div>`);
    } else if (type === "code") {
      const code = richTextToPlain(block.code.rich_text);
      html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    } else if (type === "image") {
      const img = block.image;
      const src = img.type === "external" ? img.external.url : img.type === "file" ? img.file.url : null;
      if (src) {
        const caption = richTextToPlain(img.caption || []);
        html.push(
          `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(caption || "")}" loading="lazy">${
            caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
          }</figure>`
        );
        // 注意：如果圖片是直接上傳到 Notion（type "file"），這個網址幾小時後會失效，
        // 圖片就會在網站上顯示不出來。要長期有效，建議在 Notion 裡用「嵌入外部連結」的方式放圖，
        // 或之後請 Claude 幫忙加上「自動把圖片另外存起來」的功能。
      }
    } else if (type === "toggle") {
      const children = block.has_children ? await fetchBlockChildren(block.id, apiKey) : [];
      const inner = await blocksToHtml(children, apiKey);
      html.push(`<details><summary>${richTextToHtml(block.toggle.rich_text)}</summary>${inner}</details>`);
    }
    // 其他不支援的類型（表格、影片嵌入等）先安靜跳過。
  }

  flushList();
  return html.join("\n");
}

// 更新一篇文章在 Notion 裡的屬性（用來寫回發布網址、把「已排程」自動轉成「已發布」）。
export async function updatePageProperties(pageId, properties, apiKey) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(apiKey),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    console.warn(`寫回 Notion 失敗（${res.status}），略過但不中斷流程：${await res.text()}`);
  }
}

// 把 Notion 資料庫回傳的一列資料，整理成好用的物件。
export function parsePage(page) {
  const props = page.properties;
  const get = (name) => props[name];
  const title = get("標題")?.title?.[0]?.plain_text?.trim() || "";
  const slug = get("Slug")?.rich_text?.[0]?.plain_text?.trim() || "";
  const category = get("文章分類")?.select?.name || "";
  const status = get("發布狀態")?.select?.name || "";
  const publishDate = get("預計發布日")?.date?.start || null;
  const mainKeyword = get("主要關鍵字")?.rich_text?.[0]?.plain_text?.trim() || "";
  const relatedKeywords = get("相關關鍵字")?.rich_text?.[0]?.plain_text?.trim() || "";
  const excerpt = get("摘要")?.rich_text?.[0]?.plain_text?.trim() || "";
  const publishedUrl = get("發布網址")?.url || "";

  return {
    id: page.id,
    title,
    slug,
    category,
    status,
    publishDate,
    mainKeyword,
    relatedKeywords,
    excerpt,
    publishedUrl,
  };
}
