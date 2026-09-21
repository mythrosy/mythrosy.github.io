// scripts/build-blog.mjs
// 主程式：讀 Notion「長文聚集地」資料庫 → 把「已發布」的文章轉成網頁 → 寫進 /blog/ 資料夾。
// 由 .github/workflows/publish-blog.yml 定期自動執行，妳平常不需要手動跑這個檔案。
//
// 本機測試方式（不會影響正式網站，只是在你電腦上多產生檔案看看）：
//   NOTION_API_KEY=ntn_xxx node scripts/build-blog.mjs

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  fetchAllPages,
  fetchPageContent,
  blocksToHtml,
  updatePageProperties,
  parsePage,
} from "./notion.mjs";
import { renderArticlePage, renderIndexPage, SITE_URL } from "./blog-templates.mjs";

// 這是「長文聚集地」資料庫的 ID，不是密碼，寫死在這裡沒關係。
const DATABASE_ID = process.env.NOTION_DATABASE_ID || "3e0f93a249e4807483f7c5ec1b3835ef";
const API_KEY = process.env.NOTION_API_KEY;

if (!API_KEY) {
  console.error("找不到 NOTION_API_KEY，請確認 GitHub repo 的 Secrets 裡有設定這把金鑰。");
  process.exit(1);
}

const REPO_ROOT = process.cwd();
const BLOG_DIR = path.join(REPO_ROOT, "blog");

function slugify(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayISO() {
  // 用台灣時區判斷「今天」，避免 GitHub Actions 伺服器用 UTC 時間造成日期差一天。
  const now = new Date();
  const tw = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  return `${tw.getFullYear()}-${String(tw.getMonth() + 1).padStart(2, "0")}-${String(tw.getDate()).padStart(2, "0")}`;
}

async function main() {
  console.log("讀取 Notion 資料庫…");
  const rawPages = await fetchAllPages(DATABASE_ID, API_KEY);
  const today = todayISO();

  const candidates = rawPages.map(parsePage);

  const posts = [];
  const seenSlugs = new Set();

  for (const p of candidates) {
    if (!p.title || !p.slug) {
      console.warn(`略過一篇文章：缺少標題或 Slug（Notion page id: ${p.id}）`);
      continue;
    }
    const isPublished = p.status === "已發布";
    const isDueScheduled = p.status === "已排程" && p.publishDate && p.publishDate <= today;
    if (!isPublished && !isDueScheduled) continue;

    const slug = slugify(p.slug);
    if (!slug) {
      console.warn(`略過文章「${p.title}」：Slug 整理後是空的，請檢查 Notion 裡的 Slug 欄位。`);
      continue;
    }
    if (seenSlugs.has(slug)) {
      console.warn(`略過文章「${p.title}」：Slug「${slug}」跟別篇文章重複了，請到 Notion 改成不一樣的 Slug。`);
      continue;
    }
    seenSlugs.add(slug);

    if (isDueScheduled) {
      console.log(`「${p.title}」的預計發布日已到，自動轉成「已發布」。`);
      await updatePageProperties(p.id, { 發布狀態: { select: { name: "已發布" } } }, API_KEY);
    }

    posts.push({ ...p, slug, publishDate: p.publishDate || today });
  }

  if (posts.length === 0) {
    console.log("目前沒有已發布的文章，只會產生一個空的部落格首頁。");
  }

  // 新到舊排序
  posts.sort((a, b) => (a.publishDate < b.publishDate ? 1 : a.publishDate > b.publishDate ? -1 : 0));

  // 每個分類目前有幾篇（只算已發布的）
  const categoryCounts = {};
  for (const p of posts) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  // 清掉舊的 /blog/ 產出，重新整批產生，避免刪掉的文章留下孤兒頁面。
  await rm(BLOG_DIR, { recursive: true, force: true });
  await mkdir(BLOG_DIR, { recursive: true });

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`產生文章頁：${post.title}`);

    const blocks = await fetchPageContent(post.id, API_KEY);
    const contentHtml = await blocksToHtml(blocks, API_KEY);

    const prev = posts[i + 1] || null; // 排序是新到舊，下一筆就是比較舊的「前一篇」
    const categoryPosts = posts.filter((p) => p.category === post.category && p.slug !== post.slug);

    const html = renderArticlePage(post, contentHtml, {
      prev,
      categoryPosts,
      allCategoryCounts: categoryCounts,
    });

    const dir = path.join(BLOG_DIR, post.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html, "utf8");

    // 把正式網址寫回 Notion，方便妳自己在 Notion 裡也能直接點連結。
    const canonical = `${SITE_URL}/blog/${post.slug}/`;
    if (post.publishedUrl !== canonical) {
      await updatePageProperties(post.id, { 發布網址: { url: canonical } }, API_KEY);
    }
  }

  console.log("產生文章列表頁 /blog/index.html …");
  const indexHtml = renderIndexPage(posts);
  await writeFile(path.join(BLOG_DIR, "index.html"), indexHtml, "utf8");

  console.log(`完成！共產生 ${posts.length} 篇文章頁。`);
}

main().catch((err) => {
  console.error("自動上架失敗：", err);
  process.exit(1);
});
