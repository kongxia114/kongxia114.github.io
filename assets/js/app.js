/* =========================================================
   红石块工作室 · 技术博客
   数据源：GitHub Issues（构建脚本快照 + 在线 API 兜底）
   ========================================================= */
(function () {
  'use strict';

  const CONFIG = {
    owner: 'kongxia114',
    repo: 'kongxia114.github.io',
    // 构建脚本生成的快照，静态托管、不受 API 限流影响
    snapshotUrl: 'data/posts.json',
    // 快照缺失时的兜底：直接读 GitHub API（未登录 60 次/小时）
    apiUrl: null,
    perPage: 100,
    pageSize: 9,
    // 带这些标签的 issue 不当文章发布
    excludeLabels: ['documentation', 'invalid', 'duplicate', 'wontfix', 'hidden', '不发布'],
    maxTags: 8
  };
  CONFIG.apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues?state=all&sort=created&direction=desc&per_page=${CONFIG.perPage}`;

  /* ---------------- 工具函数 ---------------- */

  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripMarkdown(md, limit) {
    let t = String(md || '');
    t = t.replace(/```[\s\S]*?```/g, ' ');
    t = t.replace(/~~~[\s\S]*?~~~/g, ' ');
    t = t.replace(/<[^>]+>/g, ' ');
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
    t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s*[-*+]\s+/gm, '');
    t = t.replace(/^\s*\d+\.\s+/gm, '');
    t = t.replace(/[*_~`|]/g, '');
    t = t.replace(/\s+/g, ' ').trim();
    if (limit && t.length > limit) t = t.slice(0, limit).trimEnd() + '…';
    return t;
  }

  function isHttp(url) {
    return /^https?:\/\//i.test(url || '');
  }

  function formatDate(iso, withTime) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return withTime ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
  }

  function relativeDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diff = Date.now() - d.getTime();
    const day = 86400000;
    if (diff < 3600000) return '刚刚';
    if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < day * 30) return `${Math.floor(diff / day)} 天前`;
    if (diff < day * 365) return `${Math.floor(diff / (day * 30))} 个月前`;
    return `${Math.floor(diff / (day * 365))} 年前`;
  }

  function readMinutes(text) {
    const len = String(text || '').replace(/\s/g, '').length;
    return Math.max(1, Math.round(len / 400));
  }

  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // 把底层报错翻译成一句人话
  function friendlyError(err) {
    const msg = String((err && err.message) || err || '');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      return '连接不上数据源：可能是离线、被网络拦截，或者 Actions 还没生成数据快照。';
    }
    if (/\b403\b/.test(msg)) return 'GitHub API 触发限流（403），可以稍后重试，或等 Actions 更新快照。';
    if (/\b404\b/.test(msg)) return '找不到 data/posts.json（404），请确认它已提交，或手动跑一次「同步 Issues 数据」。';
    return msg || '未知错误';
  }

  /* ---------------- 状态 ---------------- */

  const state = {
    posts: [],
    generatedAt: null,
    tag: 'all',
    query: '',
    visible: CONFIG.pageSize,
    current: null,
    listScrollY: 0,
    restoreScroll: false
  };

  const els = {
    listView: $('#listView'),
    postView: $('#postView'),
    grid: $('#postsGrid'),
    loading: $('#loadingState'),
    error: $('#errorState'),
    errorDetail: $('#errorDetail'),
    empty: $('#emptyState'),
    retry: $('#retryBtn'),
    reset: $('#resetBtn'),
    chips: $('#tagChips'),
    search: $('#searchInput'),
    loadMore: $('#loadMoreBtn'),
    heroStats: $('#heroStats'),
    footUpdate: $('#footUpdate'),
    year: $('#year'),
    toolbar: $('#toolbar'),
    // 详情
    postTitle: $('#postTitle'),
    postLabels: $('#postLabels'),
    postMeta: $('#postMeta'),
    postContent: $('#postContent'),
    postToc: $('#postToc'),
    tocList: $('#tocList'),
    postNav: $('#postNav'),
    issueLink: $('#issueLink'),
    copyLink: $('#copyLinkBtn'),
    readingBar: $('#readingBar'),
    // 杂项
    themeToggle: $('#themeToggle'),
    lightbox: $('#lightbox'),
    lightboxImg: $('#lightboxImg'),
    lightboxClose: $('#lightboxClose')
  };

  /* ---------------- 数据加载 ---------------- */

  function normalizeIssue(raw) {
    const labels = (raw.labels || [])
      .map((l) => (typeof l === 'string' ? { name: l, color: '888888' } : l))
      .map((l) => ({ name: String(l.name || ''), color: l.color || '888888' }))
      .filter((l) => l.name);
    return {
      number: raw.number,
      title: raw.title || '(无标题)',
      body: raw.body || '',
      state: raw.state || 'open',
      createdAt: raw.created_at || raw.createdAt || '',
      updatedAt: raw.updated_at || raw.updatedAt || '',
      comments: raw.comments || 0,
      labels,
      url: raw.html_url || raw.url || `https://github.com/${CONFIG.owner}/${CONFIG.repo}/issues/${raw.number}`,
      isPull: Boolean(raw.pull_request)
    };
  }

  function isPublishable(post) {
    if (post.isPull) return false;
    const names = post.labels.map((l) => l.name.toLowerCase());
    return !names.some((n) => CONFIG.excludeLabels.some((bad) => n === bad.toLowerCase()));
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    return res.json();
  }

  async function loadPosts() {
    setListState('loading');
    try {
      let issues = null;
      let generatedAt = null;

      try {
        const data = await fetchJSON(CONFIG.snapshotUrl);
        issues = Array.isArray(data) ? data : data && (data.issues || data.posts || data.items);
        generatedAt = (data && (data.generated_at || data.generatedAt)) || null;
      } catch (snapshotErr) {
        console.warn('[blog] 快照读取失败，改用 GitHub API：', snapshotErr.message);
        const data = await fetchJSON(CONFIG.apiUrl);
        issues = Array.isArray(data) ? data : data && (data.issues || data.items);
      }

      if (!Array.isArray(issues)) throw new Error('数据格式无法识别');

      state.posts = issues
        .map(normalizeIssue)
        .filter(isPublishable)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      state.generatedAt = generatedAt;

      if (!state.posts.length) throw new Error('没有可展示的文章（检查 issue 是否被排除了）');

      renderChips();
      renderHeroStats();
      setListState('ready');
      renderList();
      updateFooter();

      // 支持直接打开 #/post/11 的深链接
      if (parseRoute().type === 'post') route();
    } catch (err) {
      console.error('[blog] 加载失败：', err);
      setListState('error', friendlyError(err));
      if (els.footUpdate) els.footUpdate.textContent = '数据加载失败';
    }
  }

  /* ---------------- 列表渲染 ---------------- */

  function setListState(name, detail) {
    if (els.loading) els.loading.hidden = name !== 'loading';
    if (els.error) els.error.hidden = name !== 'error';
    if (els.empty) els.empty.hidden = name !== 'empty';
    if (els.grid) els.grid.hidden = name === 'loading' || name === 'error' || name === 'empty';
    if (name === 'error' && els.errorDetail) els.errorDetail.textContent = detail || '';
    if (name === 'loading') els.grid.innerHTML = '';
  }

  function renderHeroStats() {
    if (!els.heroStats) return;
    const latest = state.posts[0];
    els.heroStats.innerHTML = [
      `共 <strong>${state.posts.length}</strong> 篇`,
      `最近更新 <strong>${escapeHtml(relativeDate(latest ? (latest.updatedAt || latest.createdAt) : ''))}</strong>`,
      state.generatedAt ? `数据快照 <strong>${escapeHtml(formatDate(state.generatedAt, true))}</strong>` : ''
    ].filter(Boolean).map((s) => `<span>${s}</span>`).join('');
  }

  function tagCounts() {
    const map = new Map();
    state.posts.forEach((p) => p.labels.forEach((l) => map.set(l.name, (map.get(l.name) || 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, CONFIG.maxTags);
  }

  function renderChips() {
    if (!els.chips) return;
    const tags = tagCounts();
    els.chips.innerHTML = [
      `<button class="chip" type="button" data-tag="all" aria-pressed="${state.tag === 'all'}">全部<span class="chip-count">${state.posts.length}</span></button>`,
      ...tags.map(([name, count]) =>
        `<button class="chip" type="button" data-tag="${escapeHtml(name)}" aria-pressed="${state.tag === name}">${escapeHtml(name)}<span class="chip-count">${count}</span></button>`
      )
    ].join('');
  }

  function filteredPosts() {
    const q = state.query.trim().toLowerCase();
    return state.posts.filter((p) => {
      const tagOk = state.tag === 'all' || p.labels.some((l) => l.name === state.tag);
      if (!tagOk) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.labels.some((l) => l.name.toLowerCase().includes(q))
      );
    });
  }

  function cardHTML(post) {
    const excerpt = stripMarkdown(post.body, 150) || '（这篇没有正文，点进去看看）';
    const imageCount = (String(post.body).match(/!\[[^\]]*\]\(|<img[^>]+src=/gi) || []).length;
    const labels = post.labels
      .slice(0, 4)
      .map((l) => `<span class="label"><span class="dot" style="color:#${escapeHtml(l.color)}"></span>${escapeHtml(l.name)}</span>`)
      .join('');
    const stateLabel = post.state === 'closed'
      ? '<span class="label state-closed">已关闭</span>'
      : '';

    return `
      <a class="post-card" href="#/post/${post.number}">
        <span class="card-body">
          <span class="card-labels">${stateLabel}${labels}</span>
          <span class="card-title">${escapeHtml(post.title)}</span>
          <span class="card-excerpt">${escapeHtml(excerpt)}</span>
          <span class="card-foot">
            <span class="meta-item">${escapeHtml(formatDate(post.createdAt))}${imageCount ? ` · ${imageCount} 图` : ''}</span>
            <span class="meta-item">${readMinutes(post.body)} 分钟 · ${post.comments} 评论</span>
          </span>
        </span>
      </a>`;
  }

  function renderList() {
    if (!els.grid) return;
    const list = filteredPosts();

    if (!list.length) {
      els.grid.innerHTML = '';
      setListState('empty');
      if (els.loadMore) els.loadMore.hidden = true;
      return;
    }

    setListState('ready');
    const shown = list.slice(0, state.visible);
    els.grid.innerHTML = shown.map(cardHTML).join('');
    if (els.loadMore) els.loadMore.hidden = shown.length >= list.length;
  }

  function updateFooter() {
    if (els.footUpdate) {
      const stamp = state.generatedAt ? formatDate(state.generatedAt, true) : formatDate(new Date().toISOString());
      els.footUpdate.textContent = `数据更新于 ${stamp}`;
    }
    if (els.year) els.year.textContent = String(new Date().getFullYear());
  }

  /* ---------------- Markdown 渲染 ---------------- */

  function renderMarkdown(md) {
    const text = String(md || '');
    if (!text.trim()) return '<p>（这篇 issue 还没有正文）</p>';

    let html;
    if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(text, { gfm: true, breaks: true });
    } else {
      html = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    }

    if (window.DOMPurify) {
      html = window.DOMPurify.sanitize(html, {
        ADD_TAGS: ['details', 'summary', 'kbd', 'picture', 'source'],
        ADD_ATTR: ['width', 'height', 'loading', 'decoding', 'referrerpolicy', 'colspan', 'rowspan', 'align']
      });
    }
    return html;
  }

  function decorateContent(container) {
    container.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (isHttp(href) && !href.startsWith(location.origin)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer nofollow';
      }
    });

    const used = new Set();
    const headings = [];
    container.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
      let slug = stripMarkdown(h.textContent, 60)
        .toLowerCase()
        .replace(/[\s\u3000]+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '') || 'section';
      let id = slug;
      let i = 2;
      while (used.has(id)) id = `${slug}-${i++}`;
      used.add(id);
      h.id = id;
      if (h.tagName === 'H2' || h.tagName === 'H3') headings.push({ id, text: h.textContent, level: h.tagName === 'H3' ? 3 : 2 });
    });

    container.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      if (!img.alt) img.alt = '';
    });

    return headings;
  }

  function renderToc(headings) {
    if (!els.postToc || !els.tocList) return;
    if (headings.length < 2) {
      els.postToc.hidden = true;
      els.tocList.innerHTML = '';
      return;
    }
    els.postToc.hidden = false;
    els.tocList.innerHTML = headings
      .map((h) => `<li class="lv${h.level}"><a href="#" data-anchor="${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`)
      .join('');
  }

  /* ---------------- 详情渲染 ---------------- */

  function postMetaHTML(post) {
    const items = [
      `<span class="meta-item">发布于 ${escapeHtml(formatDate(post.createdAt))}</span>`,
      `<span class="meta-item">更新于 ${escapeHtml(relativeDate(post.updatedAt || post.createdAt))}</span>`,
      `<span class="meta-item">约 ${readMinutes(post.body)} 分钟</span>`,
      `<span class="meta-item">#${post.number}</span>`
    ];
    return items.join('');
  }

  function renderPost(post) {
    state.current = post;

    els.postTitle.textContent = post.title;
    document.title = `${post.title} · 红石块工作室`;

    els.postLabels.innerHTML = post.labels
      .map((l) => `<a class="label" href="#/" data-jump-tag="${escapeHtml(l.name)}"><span class="dot" style="color:#${escapeHtml(l.color)}"></span>${escapeHtml(l.name)}</a>`)
      .join('') + (post.state === 'closed'
        ? '<span class="label state-closed">已关闭</span>'
        : '<span class="label state-open">连载中</span>');

    els.postMeta.innerHTML = postMetaHTML(post);
    els.postContent.innerHTML = renderMarkdown(post.body);
    const headings = decorateContent(els.postContent);
    renderToc(headings);

    if (els.issueLink) els.issueLink.href = post.url;

    // 上一篇 / 下一篇（按发布时间新→旧）
    const idx = state.posts.findIndex((p) => p.number === post.number);
    const newer = idx > 0 ? state.posts[idx - 1] : null;
    const older = idx >= 0 && idx < state.posts.length - 1 ? state.posts[idx + 1] : null;
    els.postNav.innerHTML = [
      newer ? `<a class="prev" href="#/post/${newer.number}"><span class="nav-label">← 更新的一篇</span><span class="nav-title">${escapeHtml(newer.title)}</span></a>` : '<span></span>',
      older ? `<a class="next" href="#/post/${older.number}"><span class="nav-label">更早的一篇 →</span><span class="nav-title">${escapeHtml(older.title)}</span></a>` : '<span></span>'
    ].join('');

    els.listView.hidden = true;
    els.postView.hidden = false;
    if (els.toolbar) els.toolbar.hidden = true;

    window.scrollTo({ top: 0, behavior: 'auto' });
    updateReadingProgress();
  }

  function showList() {
    const wasReading = state.current !== null;
    state.current = null;
    els.postView.hidden = true;
    els.listView.hidden = false;
    if (els.toolbar) els.toolbar.hidden = false;
    document.title = '红石块工作室 · 技术博客';

    if (state.restoreScroll) {
      const y = state.listScrollY;
      state.restoreScroll = false;
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    if (wasReading) updateReadingProgress();
  }

  /* ---------------- 路由 ---------------- */

  function parseRoute() {
    const hash = location.hash || '';
    const m = hash.match(/^#\/post\/(\d+)/);
    if (m) return { type: 'post', number: Number(m[1]) };
    return { type: 'list' };
  }

  function route() {
    const r = parseRoute();
    if (r.type === 'post') {
      const post = state.posts.find((p) => p.number === r.number);
      if (post) {
        if (!els.listView.hidden) {
          state.listScrollY = window.scrollY;
          state.restoreScroll = true;
        }
        renderPost(post);
        return;
      }
      // 深链接但数据里没有这篇
      if (state.posts.length) {
        console.warn(`[blog] 没有找到 #${r.number}，可能是被删除或被标签排除了`);
        location.hash = '#/';
        return;
      }
    }
    showList();
  }

  /* ---------------- 阅读进度 ---------------- */

  function updateReadingProgress() {
    if (!els.readingBar || !els.postView || els.postView.hidden) {
      if (els.readingBar) els.readingBar.style.width = '0';
      return;
    }
    const doc = document.documentElement;
    const total = doc.scrollHeight - window.innerHeight;
    const pct = total > 0 ? Math.min(100, Math.max(0, (window.scrollY / total) * 100)) : 0;
    els.readingBar.style.width = pct.toFixed(2) + '%';
  }

  /* ---------------- 图片灯箱 ---------------- */

  function openLightbox(src, alt) {
    if (!els.lightbox || !els.lightboxImg) return;
    els.lightboxImg.src = src;
    els.lightboxImg.alt = alt || '';
    els.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!els.lightbox) return;
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  /* ---------------- 主题 ---------------- */

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('rs-theme', theme); } catch (e) { /* ignore */ }
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    if (els.themeToggle) {
      els.themeToggle.addEventListener('click', () => {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
    }

    if (els.chips) {
      els.chips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        state.tag = chip.dataset.tag || 'all';
        state.visible = CONFIG.pageSize;
        renderChips();
        renderList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (els.postLabels) {
      els.postLabels.addEventListener('click', (e) => {
        const link = e.target.closest('[data-jump-tag]');
        if (!link) return;
        e.preventDefault();
        state.tag = link.dataset.jumpTag;
        state.query = '';
        if (els.search) els.search.value = '';
        state.visible = CONFIG.pageSize;
        renderChips();
        renderList();
        location.hash = '#/';
      });
    }

    if (els.tocList) {
      els.tocList.addEventListener('click', (e) => {
        const link = e.target.closest('[data-anchor]');
        if (!link) return;
        e.preventDefault();
        const target = document.getElementById(link.dataset.anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (els.search) {
      const onSearch = debounce(() => {
        state.query = els.search.value;
        state.visible = CONFIG.pageSize;
        if (parseRoute().type === 'post') {
          location.hash = '#/';
        } else {
          renderList();
        }
      }, 140);
      els.search.addEventListener('input', onSearch);
      els.search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          els.search.value = '';
          state.query = '';
          state.visible = CONFIG.pageSize;
          renderList();
          els.search.blur();
        }
      });
    }

    if (els.loadMore) {
      els.loadMore.addEventListener('click', () => {
        state.visible += CONFIG.pageSize;
        renderList();
      });
    }

    if (els.retry) els.retry.addEventListener('click', loadPosts);

    if (els.reset) {
      els.reset.addEventListener('click', () => {
        state.tag = 'all';
        state.query = '';
        state.visible = CONFIG.pageSize;
        if (els.search) els.search.value = '';
        renderChips();
        renderList();
      });
    }

    if (els.copyLink) {
      els.copyLink.addEventListener('click', async () => {
        const url = location.href;
        const label = els.copyLink.querySelector('span');
        try {
          await navigator.clipboard.writeText(url);
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        if (label) {
          const old = label.textContent;
          label.textContent = '已复制';
          setTimeout(() => { label.textContent = old; }, 1500);
        }
      });
    }

    // 正文图片点击放大（事件委托）
    if (els.postContent) {      els.postContent.addEventListener('click', (e) => {
        const img = e.target.closest('img');
        if (img && img.src) openLightbox(img.src, img.alt);
      });
    }
    if (els.lightbox) {
      els.lightbox.addEventListener('click', (e) => {
        if (e.target === els.lightbox || e.target === els.lightboxImg) closeLightbox();
      });
    }
    if (els.lightboxClose) els.lightboxClose.addEventListener('click', closeLightbox);

    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);

    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (els.lightbox && !els.lightbox.hidden) { closeLightbox(); return; }
        if (parseRoute().type === 'post') { location.hash = '#/'; return; }
        if (typing && els.search) {
          els.search.value = '';
          state.query = '';
          renderList();
        }
      }
      if (e.key === '/' && !typing && els.search && parseRoute().type !== 'post') {
        e.preventDefault();
        els.search.focus();
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  bindEvents();
  if (els.year) els.year.textContent = String(new Date().getFullYear());
  loadPosts();
})();
