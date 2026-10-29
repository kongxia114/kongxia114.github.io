# 红石块工作室 · 技术博客

一个纯静态博客：**内容写在 GitHub Issues 里，页面由 GitHub Pages 托管**。
没有数据库、没有构建框架、没有第三方依赖（Markdown 渲染库已本地内置）。

- 站点：<https://kongxia114.github.io/>
- 文章源：<https://github.com/kongxia114/kongxia114.github.io/issues>
- 订阅：<https://kongxia114.github.io/data/feed.xml>

## 怎么写一篇新文章

1. 在这个仓库的 **Issues** 里新建一个 issue，标题就是文章标题。
2. 正文用 Markdown 写，支持标题、代码块、表格、引用、`<details>` 折叠、图片粘贴上传。
3. 需要分类就加 label，页面顶部的分类标签会自动从 label 生成。
4. 提交后，GitHub Actions 会自动刷新数据快照（也可以手动跑一次 `同步 Issues 数据`）。

### 不想让某个 issue 出现在站点上

给 issue 加上下面任意一个 label 即可（构建脚本和前端都会跳过）：

`documentation` · `invalid` · `duplicate` · `wontfix` · `hidden` · `不发布`

### 关闭的 issue

关闭的文章仍会保留在网站上，只是卡片上会标一个「已关闭」标记，不会被隐藏。
如果完全不想展示，给它加 `hidden` label。

## 评论

文章页的评论区就是 issue 的评论：构建时通过 API 拉取，作者、头像、时间、Markdown
正文都会一起同步，头像也会下载到 `assets/media/`。评论本身仍在 GitHub 上管理——
站点是纯静态的，没有后端，所以「发评论」会跳到对应 issue。

新评论、修改评论、删除评论都会触发 `.github/workflows/refresh-posts.yml`
（`issue_comment` 事件），一两分钟后站点自动更新。

## 结构

```
index.html                 单页应用外壳（列表 + 文章视图）
404.html                   自定义 404
assets/
  css/style.css            全部样式（含深色模式）
  js/app.js                数据加载、路由、Markdown 渲染、主题、灯箱
  vendor/marked.min.js     Markdown 解析（本地内置，不走 CDN）
  vendor/purify.min.js     HTML 清洗，防 XSS
  media/                   issue 图片镜像（构建时下载，不依赖 GitHub 图床）
  favicon.svg
data/
  posts.json               Issues 数据快照（含评论，前端主要读取它，不受 API 限流影响）
  feed.xml                 RSS 订阅源
  media.json               原图 URL → assets/media 的映射
scripts/build-posts.mjs    Issues + 评论 → posts.json / feed.xml / 图片头像镜像（零依赖）
.github/workflows/
  refresh-posts.yml        issue / 评论变动、每天定时自动刷新数据
.nojekyll                  关掉 Jekyll，按纯静态文件原样发布
```

> 图片本地化：正文里引用的图片（GitHub issue 附件、YouTube 封面等外链）会在构建时
> 下载到 `assets/media/`，正文链接自动改写成本地路径。这样即使 GitHub 图床、YouTube
> 在某些网络下打不开，站点图片也能正常显示。下载失败（或不是图片）时自动保留原链接，
> 不会中断构建；`data/media.json` 记录映射，重复构建只下载新增图片。

## 本地预览

`fetch()` 不能在 `file://` 下工作，需要起一个静态服务器：

```bash
# 任选其一
python -m http.server 8000
npx serve .
```

然后打开 <http://localhost:8000/>。

只想重新生成数据（不启动服务器）：

```bash
node scripts/build-posts.mjs
```

在线抓取受 GitHub 未登录限流（60 次/小时）影响。有 token 时更快：

```bash
GITHUB_TOKEN=ghp_xxx node scripts/build-posts.mjs
```

## 部署

仓库名 `kongxia114.github.io` 属于**用户主页仓库**，默认访问地址就是
<https://kongxia114.github.io/>。

在仓库 **Settings → Pages** 中确认：

- Source 选择 **Deploy from a branch**
- Branch 选择 **main**，目录选择 **/ (root)**

之后每次 `git push` 到 `main`，Pages 会在一两分钟内自动重新发布。

## 数据流

```
GitHub Issues（正文 + 评论）
   │  issues / issue_comment 事件、每天定时
   ▼
Actions: node scripts/build-posts.mjs
   │  提交 data/posts.json + data/feed.xml + assets/media
   ▼
GitHub Pages（静态托管）
   │
   ▼
浏览器：读 data/posts.json → 渲染列表 / 文章 / 评论
        （快照读取失败时，退回到直接请求 GitHub API）
```

## 关于旧版本

仓库里原先的 `index.html` 是一段从聊天窗口整体复制出来的内容，开头带着
「以下是您需要的HTML代码」和 ` ```html ` 代码围栏，页面里只有假数据，
`app.js` 里还把仓库名写成了 `Yexiaowei11`。这些文件已经全部重写/删除。
