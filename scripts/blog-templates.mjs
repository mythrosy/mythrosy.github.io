// scripts/blog-templates.mjs
// 產生部落格頁面 HTML 的地方：單篇文章頁、文章列表頁。
// 視覺跟首頁（index.html）共用同一套字體、色系、導覽列、頁尾，維持是「同一個網站」的感覺。

export const SITE_URL = "https://mythrosy.com";
export const SITE_NAME = "mythrosy 柔思溫罐";

// 每個分類的顏色（跟設計稿一致）。之後在 Notion 加新分類，
// 沒列在這裡的話會自動套用最後的 DEFAULT 顏色，不會壞掉，只是配色比較普通，
// 想要更好看的話，屆時請 Claude 幫忙補上這個分類的顏色就好。
const CATEGORY_STYLES = {
  身體保養: { tagBg: "#fbe3dc", tagColor: "#b8586c", accent: "#e46c82" },
  創業觀察: { tagBg: "#f1e4de", tagColor: "#9a6b52", accent: "#c58a97" },
  卡牌對話: { tagBg: "#f0e2e6", tagColor: "#8d4956", accent: "#8d4956" },
  學員故事: { tagBg: "#fbe8dc", tagColor: "#b87a58", accent: "#d4967a" },
  生活隨筆: { tagBg: "#ece2e4", tagColor: "#7d5a63", accent: "#7d5a63" },
  DEFAULT: { tagBg: "#f1e9e6", tagColor: "#8d7d78", accent: "#c9a8ad" },
};

function categoryStyle(category) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.DEFAULT;
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${y}.${m}.${d}`;
}

// 粗估閱讀時間：中文內容大約每分鐘 400 字。
function estimateReadingMinutes(plainText) {
  const minutes = Math.ceil(plainText.length / 400);
  return Math.max(1, minutes);
}

const HEAD = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Noto+Serif+TC:wght@300;400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap">
<style>
  :root {
    --cream: #fef2ef;
    --terracotta: #e46c82;
    --terracotta-light: #f5b1a2;
    --brown: #8d4956;
    --dark-brown: #474237;
    --text: #474237;
    --text-light: #8d4956;
    --muted: #9a8f86;
    --hairline: #f3d9d2;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Serif TC', serif;
    font-weight: 300;
    background: var(--cream);
    color: var(--text);
  }
  a { color: inherit; text-decoration: none; }
  nav {
    display: flex; justify-content: space-between; align-items: center;
    padding: 22px 56px; border-bottom: 1px solid var(--hairline);
    background: rgba(254, 242, 239, 0.92); backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 10;
  }
  .nav-logo { font-family: 'Playfair Display', 'Noto Serif TC', serif; font-size: 17px; font-weight: 500; letter-spacing: 0.04em; color: var(--text-light); }
  .nav-links { display: flex; gap: 26px; font-size: 13px; color: var(--muted); list-style: none; }
  .nav-links a:hover { color: var(--terracotta); }
  .nav-links .current { color: var(--terracotta); font-weight: 500; }
  footer {
    background: var(--dark-brown); color: #e8dfd8; padding: 40px 56px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; flex-wrap: wrap; gap: 16px;
  }
  .footer-logo { font-family: 'Playfair Display', 'Noto Serif TC', serif; font-size: 15px; color: var(--terracotta-light); }
  footer .footer-text { color: #b8a89f; }
  footer ul { display: flex; gap: 20px; list-style: none; }
  @media (max-width: 900px) {
    nav { padding: 18px 24px; }
    .nav-links { display: none; }
    footer { flex-direction: column; text-align: center; padding: 32px 24px; }
  }
</style>
`;

function navHtml(current) {
  const link = (href, label, key) =>
    `<li><a href="${href}"${current === key ? ' class="current"' : ""}>${label}</a></li>`;
  return `
<nav>
  <a href="/index.html" class="nav-logo">${SITE_NAME}</a>
  <ul class="nav-links">
    ${link("/index.html#about", "關於我", "about")}
    ${link("/index.html#services", "服務", "services")}
    ${link("/course.html", "課程", "course")}
    ${link("/blog/index.html", "部落格", "blog")}
    ${link("/index.html#contact", "預約", "contact")}
  </ul>
</nav>`;
}

function footerHtml() {
  return `
<footer>
  <div class="footer-logo">${SITE_NAME}</div>
  <div class="footer-text">© ${new Date().getFullYear()} ${SITE_NAME} . All rights reserved.</div>
  <ul>
    <li><a href="/index.html#about">關於我</a></li>
    <li><a href="/index.html#services">服務</a></li>
    <li><a href="/course.html">課程</a></li>
    <li><a href="/index.html#contact">預約</a></li>
  </ul>
</footer>`;
}

// ── 單篇文章頁 ──────────────────────────────────────────────
// contentHash／updateDate：用來判斷這篇文章的內容有沒有真的被改過，
// 藏在頁面最上面的 HTML 註解裡，下次產生頁面時會拿來跟新內容比對。
// 妳平常看網頁的時候不會看到這兩行，是給程式自己用的小紀錄。
export function renderArticlePage(post, contentHtml, { prev, categoryPosts, allCategoryCounts, contentHash, updateDate }) {
  const style = categoryStyle(post.category);
  const plain = post.excerpt || "";
  const minutes = estimateReadingMinutes(contentHtml.replace(/<[^>]+>/g, ""));
  const canonical = `${SITE_URL}/blog/${post.slug}/`;
  const keywords = [post.mainKeyword, post.relatedKeywords].filter(Boolean).join("、");

  const tagsHtml = [post.mainKeyword, ...post.relatedKeywords.split(/[,，]/).map((s) => s.trim())]
    .filter(Boolean)
    .slice(0, 4)
    .map((t) => `<span class="tag">#${t}</span>`)
    .join("");

  const sidebarCategories = Object.entries(allCategoryCounts)
    .map(([cat, count]) => {
      const active = cat === post.category;
      return `<a href="/blog/index.html#${encodeURIComponent(cat)}" class="cat-link${active ? " active" : ""}">
        <span class="cat-name"><span class="dot" style="background:${categoryStyle(cat).accent}"></span>${cat}</span>
        <span class="count">${count}</span>
      </a>`;
    })
    .join("");

  const relatedHtml = categoryPosts
    .slice(0, 3)
    .map(
      (p) => `<a href="/blog/${p.slug}/">
        <span class="related-title">${p.title}</span>
        <span class="related-date">${formatDate(p.publishDate)}</span>
      </a>`
    )
    .join("");

  const metaLine = `${formatDate(post.publishDate)}${
    updateDate && updateDate !== post.publishDate ? ` ・ 更新於 ${formatDate(updateDate)}` : ""
  } ・ by Rosy ・ 閱讀約 ${minutes} 分鐘`;

  return `<!doctype html>
<!-- content-hash: ${contentHash} -->
<!-- updated: ${updateDate || ""} -->
<html lang="zh-TW">
<head>
<title>${post.title}｜${SITE_NAME}</title>
<meta name="description" content="${plain}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${post.title}">
<meta property="og:description" content="${plain}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
${keywords ? `<meta name="keywords" content="${keywords}">` : ""}
${HEAD}
<style>
  .wrap { max-width: 1040px; margin: 0 auto; padding: 64px 32px 96px; display: grid; grid-template-columns: minmax(0,1fr) 244px; gap: 60px; align-items: start; }
  article { max-width: 640px; justify-self: center; width: 100%; }
  .art-head { display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; }
  .cat-tag { display: inline-block; padding: 6px 16px; border-radius: 999px; font-weight: 500; font-size: 12px; letter-spacing: 0.1em; background: ${style.tagBg}; color: ${style.tagColor}; }
  h1 { font-size: 34px; line-height: 1.5; font-weight: 500; color: var(--text-light); }
  .meta { font-size: 13px; color: #b3a89f; }
  .divider-hr { display: flex; justify-content: center; margin: 48px 0; }
  .divider-hr span { width: 40px; height: 2px; background: var(--terracotta-light); border-radius: 2px; }
  .content { font-size: 17px; line-height: 2.05; }
  .content p { margin: 0 0 30px; }
  .content h2 { font-size: 22px; font-weight: 500; color: var(--text-light); margin: 44px 0 18px; line-height: 1.6; }
  .content h3 { font-size: 19px; font-weight: 500; color: var(--text-light); margin: 36px 0 14px; line-height: 1.6; }
  .content ul, .content ol { margin: 0 0 30px; padding-left: 1.4em; }
  .content li { margin-bottom: 10px; }
  .content blockquote { margin: 0 0 30px; padding: 4px 0 4px 20px; border-left: 3px solid var(--terracotta-light); color: var(--text-light); font-style: italic; }
  .content figure { margin: 0 0 30px; }
  .content img { max-width: 100%; border-radius: 12px; display: block; }
  .content figcaption { font-size: 12px; color: var(--muted); margin-top: 8px; text-align: center; }
  .content pre { background: #fff; border-radius: 10px; padding: 16px; overflow-x: auto; margin: 0 0 30px; font-size: 13px; }
  .article-divider { display: flex; justify-content: center; margin: 40px 0; }
  .article-divider span { width: 40px; height: 1px; background: var(--hairline); }
  .tags { margin-top: 48px; display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; }
  .tag { padding: 5px 12px; border-radius: 999px; border: 1px solid #ecc9c1; color: #a8798a; }
  .post-nav { margin-top: 26px; padding-top: 26px; border-top: 1px solid var(--hairline); display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
  .post-nav .prev-label { font-size: 12px; color: #b3a89f; letter-spacing: 0.04em; display: block; margin-bottom: 5px; }
  .post-nav .prev-title { font-size: 15px; font-weight: 500; color: var(--text-light); }
  .post-nav .back-link { font-size: 14px; color: var(--text-light); white-space: nowrap; }
  .author-card { margin-top: 40px; background: #fff; border-left: 3px solid var(--terracotta); border-radius: 14px; padding: 26px 28px; display: flex; gap: 18px; align-items: center; }
  .author-avatar { width: 54px; height: 54px; border-radius: 999px; background: linear-gradient(135deg, var(--terracotta-light), var(--terracotta)); flex-shrink: 0; }
  .author-name { font-weight: 500; color: var(--text-light); font-size: 15px; }
  .author-bio { font-size: 13px; line-height: 1.7; color: var(--muted); margin-top: 5px; }
  aside { display: flex; flex-direction: column; gap: 34px; padding-top: 6px; }
  .side-label { font-size: 12px; font-weight: 500; letter-spacing: 0.14em; color: #b8a89f; margin-bottom: 14px; }
  .cat-link { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-radius: 10px; color: #7d746a; font-size: 14px; margin-bottom: 4px; }
  .cat-link.active { background: #fbe3dc; color: var(--text-light); font-weight: 500; }
  .cat-name { display: flex; align-items: center; gap: 8px; }
  .dot { width: 6px; height: 6px; border-radius: 999px; display: inline-block; }
  .cat-link .count { font-size: 12px; color: #c3b8ad; }
  .related-list { display: flex; flex-direction: column; gap: 16px; }
  .related-list a { display: flex; flex-direction: column; gap: 4px; }
  .related-title { font-size: 14px; font-weight: 500; color: #6a5f56; line-height: 1.5; }
  .related-date { font-size: 11px; color: #b8a89f; }
  @media (max-width: 900px) {
    .wrap { grid-template-columns: 1fr; padding: 40px 20px 64px; }
    aside { display: none; }
  }
</style>
</head>
<body>
${navHtml("blog")}
<div class="wrap">
  <article>
    <div class="art-head">
      <span class="cat-tag">${post.category}</span>
      <h1>${post.title}</h1>
      <div class="meta">${metaLine}</div>
    </div>
    <div class="divider-hr"><span></span></div>
    <div class="content">
${contentHtml}
    </div>
    ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ""}
    <div class="post-nav">
      ${
        prev
          ? `<a href="/blog/${prev.slug}/"><span class="prev-label">← 前一篇</span><span class="prev-title">${prev.title}</span></a>`
          : "<span></span>"
      }
      <a href="/blog/index.html" class="back-link">回部落格 →</a>
    </div>
    <div class="author-card">
      <div class="author-avatar"></div>
      <div>
        <div class="author-name">Rosy ・ 柔思溫罐</div>
        <div class="author-bio">溫罐按摩師・創業路上的觀察者。用務實溫暖的方式，陪你照顧身體、也陪你把事情做起來。</div>
      </div>
    </div>
  </article>
  <aside>
    <div>
      <div class="side-label">文章分類</div>
      ${sidebarCategories}
    </div>
    ${
      relatedHtml
        ? `<div><div class="side-label">${post.category}・最新</div><div class="related-list">${relatedHtml}</div></div>`
        : ""
    }
  </aside>
</div>
${footerHtml()}
</body>
</html>`;
}

// ── 文章列表頁（/blog/index.html）──────────────────────────
export function renderIndexPage(posts) {
  const categories = [...new Set(posts.map((p) => p.category))];

  const pills = [`<span class="cat-pill active" data-cat="all">全部</span>`]
    .concat(categories.map((c) => `<span class="cat-pill" data-cat="${escapeAttr(c)}">${c}</span>`))
    .join("\n    ");

  const cards = posts
    .map((p) => {
      const style = categoryStyle(p.category);
      return `<a href="/blog/${p.slug}/" class="post-card" data-cat="${escapeAttr(p.category)}" style="border-top: 4px solid ${style.accent};">
      <div class="card-body">
        <span class="cat-tag" style="background:${style.tagBg}; color:${style.tagColor};">${p.category}</span>
        <div class="post-title">${p.title}</div>
        <p class="post-excerpt">${p.excerpt}</p>
        <span class="post-date">${formatDate(p.publishDate)}</span>
      </div>
    </a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-TW">
<head>
<title>柔思所思｜${SITE_NAME}</title>
<meta name="description" content="身體保養的心得、創業路上的觀察，還有一些生活裡的隨筆。慢慢寫，慢慢說。">
<link rel="canonical" href="${SITE_URL}/blog/index.html">
${HEAD}
<style>
  .head { max-width: 1040px; margin: 0 auto; padding: 72px 32px 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .eyebrow { font-weight: 500; font-size: 12px; letter-spacing: 0.22em; color: #c58a97; text-transform: uppercase; }
  h1 { font-family: 'Playfair Display', 'Noto Serif TC', serif; font-size: 38px; font-weight: 500; color: var(--text-light); }
  .lede { max-width: 460px; font-weight: 300; font-size: 15px; line-height: 1.9; color: var(--muted); }
  .pills { max-width: 1040px; margin: 0 auto; padding: 36px 32px 0; display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; }
  .cat-pill { padding: 8px 20px; border-radius: 999px; background: #fff; border: 1px solid #ecc9c1; color: #a8798a; font-size: 13px; cursor: pointer; transition: all .2s ease; }
  .cat-pill.active { background: var(--text-light); border-color: var(--text-light); color: #fff; }
  .grid { max-width: 1040px; margin: 0 auto; padding: 44px 32px 96px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
  .post-card { display: flex; flex-direction: column; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 14px rgba(141,73,86,0.06); transition: transform .2s ease; }
  .post-card:hover { transform: translateY(-6px); }
  .post-card:hover .post-title { color: var(--terracotta); }
  .card-body { padding: 26px 22px 24px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  .cat-tag { align-self: flex-start; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; }
  .post-title { font-size: 17px; font-weight: 500; color: var(--text-light); line-height: 1.55; transition: color .2s ease; }
  .post-excerpt { font-size: 13px; font-weight: 300; line-height: 1.75; color: var(--muted); flex: 1; }
  .post-date { font-size: 11px; font-weight: 300; color: #c3b8ad; }
  .empty-note { max-width: 1040px; margin: 0 auto; padding: 0 32px 96px; text-align: center; color: var(--muted); font-size: 14px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
${navHtml("blog")}
<div class="head">
  <div class="eyebrow">Blog</div>
  <h1>柔思所思</h1>
  <p class="lede">身體保養的心得、創業路上的觀察，還有一些生活裡的隨筆。<br>慢慢寫，慢慢說。</p>
</div>
${posts.length > 0 ? `<div class="pills">\n    ${pills}\n  </div>` : ""}
${posts.length > 0 ? `<div class="grid">\n${cards}\n</div>` : `<p class="empty-note">還沒有發布的文章，敬請期待。</p>`}
${footerHtml()}
<script>
  document.querySelectorAll('.cat-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.cat-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      var cat = pill.dataset.cat;
      document.querySelectorAll('.post-card').forEach(function (card) {
        card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
      });
    });
  });
</script>
</body>
</html>`;
}

function escapeAttr(str) {
  return String(str).replaceAll('"', "&quot;");
}

export { categoryStyle, formatDate };
