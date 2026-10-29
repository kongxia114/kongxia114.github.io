#!/usr/bin/env node
/**
 * 把 GitHub Issues 抓取为静态数据快照。
 *
 * 产出：
 *   data/posts.json  —— 前端读取的文章数据（不受 GitHub API 限流影响）
 *   data/feed.xml    —— RSS 订阅源
 *
 * 用法：
 *   node scripts/build-posts.mjs
 *   GITHUB_TOKEN=xxx node scripts/build-posts.mjs      # 提高限流额度
 *   node scripts/build-posts.mjs --owner=foo --repo=bar
 *   node scripts/build-posts.mjs --input=issues.json   # 离线：直接读已抓好的 API JSON
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.join('=') || 'true'];
    })
);

const OWNER = argv.owner || process.env.BLOG_OWNER || 'kongxia114';
const REPO = argv.repo || process.env.BLOG_REPO || 'kongxia114.github.io';
const SITE = argv.site || process.env.BLOG_SITE || `https://${OWNER.toLowerCase()}.github.io/`;
const TOKEN = argv.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// 与前端 CONFIG.excludeLabels 保持一致：这些标签的 issue 不当作文章
const EXCLUDE_LABELS = ['documentation', 'invalid', 'duplicate', 'wontfix', 'hidden', '不发布'];

const API = `https://api.github.com/repos/${OWNER}/${REPO}/issues`;

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'redstone-blog-builder',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function gh(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: headers() });
    if (res.ok) return res;
    const retryable = res.status === 403 || res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => '');
    if (!retryable || attempt === 3) {
      throw new Error(`GitHub API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    const wait = 1500 * attempt;
    console.warn(`  ! ${res.status}，${wait}ms 后重试（${attempt}/3）`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error('unreachable');
}

async function fetchIssues() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${API}?state=all&sort=created&direction=desc&per_page=100&page=${page}`;
    const res = await gh(url);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('接口返回格式异常');
    all.push(...batch);
    process.stdout.write(`  第 ${page} 页：${batch.length} 条\n`);
    if (batch.length < 100) break;
  }
  return all;
}

const isPull = (issue) => Boolean(issue.pull_request);
const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const isPublishable = (issue) =>
  !isPull(issue) &&
  !labelNames(issue).some((n) => EXCLUDE_LABELS.includes(String(n).toLowerCase()));

function toPost(issue) {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    state: issue.state,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    comments: issue.comments || 0,
    labels: (issue.labels || []).map((l) => ({
      name: typeof l === 'string' ? l : l.name,
      color: typeof l === 'string' ? '888888' : l.color || '888888'
    })),
    html_url: issue.html_url,
    author: issue.user ? issue.user.login : ''
  };
}

/* ---------------- RSS ---------------- */

function xmlEscape(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function plain(md, limit = 300) {
  let t = String(md || '');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  t = t.replace(/^\s{0,3}>\s?/gm, '');
  t = t.replace(/[*_~`|]/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > limit ? `${t.slice(0, limit).trimEnd()}…` : t;
}

function feedXML(posts, now) {
  const items = posts.slice(0, 30).map((p) => {
    const link = `${SITE}#/post/${p.number}`;
    const pub = new Date(p.created_at).toUTCString();
    return `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(`issue-${p.number}@${OWNER}`)}</guid>
      <pubDate>${pub}</pubDate>
      <description>${xmlEscape(plain(p.body))}</description>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>红石块工作室 · 技术博客</title>
    <link>${xmlEscape(SITE)}</link>
    <description>红石、Minecraft 模组、代码与折腾日常</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(`${SITE}data/feed.xml`)}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;
}

/* ---------------- 主流程 ---------------- */

async function main() {
  let raw;

  if (argv.input) {
    console.log(`读取本地 API 数据：${argv.input}`);
    const data = JSON.parse((await readFile(resolve(ROOT, argv.input), 'utf8')).replace(/^\uFEFF/, ''));
    raw = Array.isArray(data) ? data : data.issues || data.items || [];
  } else {
    console.log(`抓取 ${OWNER}/${REPO} 的 issues…`);
    if (!TOKEN) console.log('  （未提供 GITHUB_TOKEN，受 60 次/小时限流，本地够用）');
    raw = await fetchIssues();
  }

  const posts = raw.filter(isPublishable).map(toPost);
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const now = new Date().toISOString();
  const snapshot = {
    generated_at: now,
    repo: `${OWNER}/${REPO}`,
    source: `https://github.com/${OWNER}/${REPO}/issues`,
    site: SITE,
    count: posts.length,
    issues: posts
  };

  const dataDir = resolve(ROOT, 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(resolve(dataDir, 'posts.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(resolve(dataDir, 'feed.xml'), feedXML(posts, now), 'utf8');

  console.log(`✓ 共 ${raw.length} 条 issue，发布 ${posts.length} 篇`);
  console.log(`  data/posts.json  (${(JSON.stringify(snapshot).length / 1024).toFixed(1)} KB)`);
  console.log(`  data/feed.xml    (${posts.length} 条)`);
}

main().catch((err) => {
  console.error('✗ 构建失败：', err.message);
  process.exit(1);
});
