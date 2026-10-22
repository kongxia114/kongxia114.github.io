# Mosslight Launcher 2 · 官网

单页静态站点，给 **Mosslight Launcher 2** 做介绍与下载引导。

- 当前版本：**2.11.8**
- 平台：Windows 10 1809+ / x64
- 许可：**GPL-3.0**
- 下载：一律指向 [GitHub Releases](https://github.com/kongxia114/Mosslight-Launcher-2/releases/latest)，没有自建镜像

## 本地预览

直接双击 `index.html` 就能看；也可以起一个静态服务器：

```powershell
cd "D:\开发工程\Mosslight-Launcher 官网"
python -m http.server 8080
# 打开 http://127.0.0.1:8080
```

没有构建步骤，不需要 Node / npm。所有字体都走系统字体栈，不联网加载字体。

## 页面结构

首屏（一句话 + 下载 + 主截图）→ 三条卖点 → 功能 8 项 → 截图（6 个标签页）
→ 下载（含 .NET 提示）→ 常见问题 3 条 → 页脚（GPL-3.0 / GitHub / 更新日志）。

## 视觉与交互

- **背景**：保留 `FirstLogonAnim.html` 里 `circle1Path` / `circle2Path` / `circle3Path`
  三组轨迹、时长和 `fadeCircleIn` 的节奏，只把原来的蓝色 RGB 重映射到 Mosslight 强调色族：

  | FirstLogonAnim 原色 | 站内用途 |
  |---|---|
  | `rgba(12, 119, 255, .30)` | `--accent` `#5EC269` |
  | `rgba(0, 56, 255, .30)` | `--accent-fill` `#3F8F4B` |
  | `rgba(65, 56, 210, .50)` | `--accent-text-strong` `#B6F0BF`（降透明度） |

  同时叠加了网格、噪点、暗角和一层深色渐变，保证长页阅读对比度。

- **强调色预览**：首屏那排小圆点来自交接清单里的 7 个预设
  （默认 / 青金石 / 钻石 / 仙人掌 / 金锭 / 紫水晶 / 红石），
  点击后整站即时换色。派生公式跟 `Mosslight.Core/Theme/ColorMath.cs` 对齐：
  `fill=-0.13 / hover=-0.07 / pressed=-0.20 / text=+0.16 / strong=+0.30`，
  再按 13% / 24% 把 bg / border 混到 `bg_page` 上。

- **图标**：页面图标全部为内联 Lucide 风格线性 SVG；品牌标使用 Lucide 的 `box`
  图标（ISC），颜色改为站点强调色。没有 emoji。
- **动效**：滚动进场、截图交叉淡入、导航下划线、悬浮卡片漂浮；
  全部响应 `prefers-reduced-motion`。
- **无障碍**：跳转链接、可见焦点、`aria-expanded` / `aria-selected` / `aria-live`、
  FAQ 面板 `inert`、移动端菜单焦点陷阱、`main` / `footer` 在菜单打开时 `inert`。

## 素材说明

- 界面截图取自 `D:\开发工程\smoke-screenshots (1)\`（2026-10-22 冒烟截图，commit `49acb46`）：
  `download`、`mods`、`download-modpack`、`download-shaders`、
  `accounts`、`personalize`、`settings`。原图 1280×820，统一转成 WebP（质量 86）。
- 首屏主截图用的是 `download.png`（版本下载页）；截图区是 6 个常用页面：
  社区资源 / 整合包 / 光影包 / 账户 / 个性化 / 设置。
- 截图底部 29px 由一条“MOSSLIGHT LAUNCHER 2 / WINDOWS X64”状态条覆盖，
  用来遮掉开发构建里的旧版本号，同时保持截图真实比例。
- 这组冒烟图里有几张是**空状态或错误态**（`home` 里有一条版本目录读取失败、
  `versions` / `versionsettings` 没有选中版本、`download-loader` 带本地路径），
  不上站点；只挑了能代表真实使用状态的页面。
- 站点 logo 按你给的图标页里的 `box`（立方体）重绘为 SVG；favicon 由同一形状用
  Pillow 渲染成 32 / 192 / 180 三个尺寸。Lucide 图标为 ISC 许可。

## 文件

```
index.html                 页面
site.webmanifest           PWA 基础信息
assets/css/site.css        全部样式
assets/js/site.js          交互
assets/img/*.webp          截图
assets/img/favicon.*       图标
preview/desktop.png        1440px 首屏预览
preview/mobile.png         390px 首屏预览
```

## 维护提示

- 版本号在 `index.html` 里有多处（首屏 pill、下载区、页脚、注释），升级版本时一起改。
- 部署到正式域名后，建议把 `og:image` 换成绝对 URL（现在用的是相对路径），
  分享卡片才能稳定取到图。
- 下载链接全部指向 `releases/latest`；更新日志指向 `CHANGELOG.md`；
  页脚 GPL-3.0 指向仓库的 `LICENSE`。
- 新增截图时保持 1280×820 或同比例（1.560:1），直接放进 `assets/img/` 并更新
  `index.html` 里的标签页 `data-*` 和 `screen-slide` 即可，计数会自动更新。
