/* ==========================================================================
   Mosslight Launcher 2 · 官网交互
   包含：导航、滚动进度、界面截图切换、FAQ、强调色预览、移动端下载条。
   强调色派生公式与 Mosslight.Core/Theme/ColorMath.cs 保持一致。
   ========================================================================== */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* ------------------------------------------------------------------------
     Header / scroll state
     ------------------------------------------------------------------------ */

  const header = $("[data-header]");
  const progress = $("[data-scroll-progress]");
  const mobileCta = $("[data-mobile-cta]");
  const mobileCtaLink = mobileCta ? $("a", mobileCta) : null;
  const navLinks = $$(".desktop-nav a");

  const sections = navLinks
    .map((link) => {
      const id = link.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      return section ? { id, section, link } : null;
    })
    .filter(Boolean);

  let ticking = false;

  function updateActiveNav() {
    if (!sections.length) return;
    const threshold = window.scrollY + (header ? header.offsetHeight : 72) + 150;
    let activeId = "";

    for (const item of sections) {
      if (item.section.offsetTop <= threshold) activeId = item.id;
    }

    for (const item of sections) {
      const isActive = item.id === activeId;
      item.link.classList.toggle("is-active", isActive);
      if (isActive) {
        item.link.setAttribute("aria-current", "location");
      } else {
        item.link.removeAttribute("aria-current");
      }
    }
  }

  function updateMobileCta() {
    if (!mobileCta) return;
    if (body.classList.contains("nav-open")) {
      mobileCta.classList.remove("is-visible");
      mobileCta.setAttribute("aria-hidden", "true");
      if (mobileCtaLink) mobileCtaLink.tabIndex = -1;
      return;
    }

    const hero = $(".hero");
    const threshold = hero ? hero.offsetTop + hero.offsetHeight * 0.62 : 500;
    const download = document.getElementById("download");
    const downloadRect = download ? download.getBoundingClientRect() : null;
    const downloadInView =
      downloadRect &&
      downloadRect.top < window.innerHeight - 80 &&
      downloadRect.bottom > 120;
    const show = window.innerWidth <= 640 && window.scrollY > threshold && !downloadInView;

    mobileCta.classList.toggle("is-visible", show);
    mobileCta.setAttribute("aria-hidden", String(!show));
    if (mobileCtaLink) mobileCtaLink.tabIndex = show ? 0 : -1;
  }

  function updateOnScroll() {
    if (header) {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    }

    if (progress) {
      const max = root.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      progress.style.transform = `scaleX(${ratio})`;
    }

    updateActiveNav();
    updateMobileCta();
  }

  function requestScrollUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updateOnScroll();
      ticking = false;
    });
  }

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate);

  /* ------------------------------------------------------------------------
     Mobile navigation
     ------------------------------------------------------------------------ */

  const menuToggle = $("[data-menu-toggle]");
  const mobileNav = $("#mobile-nav");
  const pageMain = $("#main");
  const pageFooter = $(".site-footer");

  function menuFocusables() {
    return $$(".site-header a[href], .site-header button, .mobile-nav a[href], .mobile-nav button").filter(
      (element) => element.getClientRects().length > 0
    );
  }

  function setMenu(open, { returnFocus = false } = {}) {
    if (!menuToggle || !mobileNav) return;

    body.classList.toggle("nav-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    mobileNav.setAttribute("aria-hidden", String(!open));

    if (pageMain) pageMain.inert = open;
    if (pageFooter) pageFooter.inert = open;

    if (open) {
      document.addEventListener("keydown", onGlobalKeydown);
      window.setTimeout(() => {
        const firstLink = $(".mobile-nav-links a", mobileNav);
        if (firstLink) firstLink.focus({ preventScroll: true });
      }, 120);
    } else {
      document.removeEventListener("keydown", onGlobalKeydown);
      if (returnFocus) menuToggle.focus({ preventScroll: true });
    }

    updateMobileCta();
  }

  function onGlobalKeydown(event) {
    if (!body.classList.contains("nav-open")) return;

    if (event.key === "Escape") {
      setMenu(false, { returnFocus: true });
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = menuFocusables();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !focusables.includes(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !focusables.includes(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      setMenu(!body.classList.contains("nav-open"));
    });

    $$(".mobile-nav a", mobileNav).forEach((link) => {
      link.addEventListener("click", () => setMenu(false));
    });

    mobileNav.addEventListener("click", (event) => {
      if (event.target === mobileNav) setMenu(false, { returnFocus: true });
    });
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && body.classList.contains("nav-open")) {
      setMenu(false);
    }
  });

  /* ------------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------------ */

  const revealItems = $$(".reveal");

  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));

    // Safety net: never leave content invisible if something interrupts observation.
    window.setTimeout(() => {
      revealItems.forEach((item) => item.classList.add("is-in"));
    }, 3500);
  } else {
    revealItems.forEach((item) => item.classList.add("is-in"));
  }

  /* ------------------------------------------------------------------------
     Screenshot tabs
     ------------------------------------------------------------------------ */

  const screenTabs = $$(".screen-tab");
  const screenSlides = $$(".screen-slide");
  const screenTitle = $("[data-screen-title]");
  const screenDesc = $("[data-screen-desc]");
  const screenCount = $("[data-screen-count]");
  const screenPanel = $("#screen-panel");
  const screenPrev = $("[data-screen-prev]");
  const screenNext = $("[data-screen-next]");

  let activeScreen = 0;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function activateScreen(index, { focusTab = false } = {}) {
    if (!screenTabs.length) return;
    const total = screenTabs.length;
    activeScreen = ((index % total) + total) % total;

    const activeTab = screenTabs[activeScreen];
    const activeSlide = screenSlides[activeScreen];

    screenTabs.forEach((tab, i) => {
      const isActive = i === activeScreen;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    screenSlides.forEach((slide, i) => {
      const isActive = i === activeScreen;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    if (screenTitle) screenTitle.textContent = activeTab.dataset.title || "";
    if (screenDesc) screenDesc.textContent = activeTab.dataset.desc || "";
    if (screenCount) screenCount.textContent = `${pad(activeScreen + 1)} / ${pad(total)}`;
    if (screenPanel) screenPanel.setAttribute("aria-labelledby", activeTab.id);

    if (focusTab) {
      activeTab.focus({ preventScroll: true });
      activeTab.scrollIntoView({
        behavior: reduceMotion.matches ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }

  screenTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateScreen(index));

    tab.addEventListener("keydown", (event) => {
      let next = null;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = index + 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = index - 1;
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = screenTabs.length - 1;
      }

      if (next === null) return;
      event.preventDefault();
      activateScreen(next, { focusTab: true });
    });
  });

  if (screenPrev) {
    screenPrev.addEventListener("click", () => activateScreen(activeScreen - 1));
  }

  if (screenNext) {
    screenNext.addEventListener("click", () => activateScreen(activeScreen + 1));
  }

  // Start with the visible slide and sync the accessibility state.
  if (screenTabs.length) activateScreen(0);

  // Warm the remaining screenshots once the page is idle.
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(
      () => {
        screenSlides.forEach((slide, index) => {
          if (index === 0) return;
          const img = $("img", slide);
          if (img && img.loading === "lazy") img.loading = "eager";
        });
      },
      { timeout: 2500 }
    );
  }

  /* ------------------------------------------------------------------------
     FAQ accordion
     ------------------------------------------------------------------------ */

  const faqItems = $$(".faq-item");

  function setFaqItem(item, open) {
    const button = $(".faq-q", item);
    const answer = $(".faq-answer", item);
    if (!button || !answer) return;

    item.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    answer.inert = !open;

    if (open) {
      answer.removeAttribute("aria-hidden");
    } else {
      answer.setAttribute("aria-hidden", "true");
    }
  }

  faqItems.forEach((item) => {
    const button = $(".faq-q", item);
    if (!button) return;

    setFaqItem(item, button.getAttribute("aria-expanded") === "true");

    button.addEventListener("click", () => {
      const willOpen = button.getAttribute("aria-expanded") !== "true";

      if (willOpen) {
        faqItems.forEach((other) => {
          if (other !== item) setFaqItem(other, false);
        });
      }

      setFaqItem(item, willOpen);
    });
  });

  /* ------------------------------------------------------------------------
     Accent color preview
     The derivation mirrors Mosslight.Core/Theme/ColorMath.cs:
     fill -0.13 lightness, hover -0.07, pressed -0.20,
     text +0.16, strong +0.30, bg / border blended onto bg_page.
     ------------------------------------------------------------------------ */

  const PAGE_BG = "#1b1c1f";

  const presets = {
    default: {
      name: "默认",
      base: "#5ec269",
      fixed: {
        accent: "#5ec269",
        fill: "#3f8f4b",
        hover: "#4da25a",
        pressed: "#357d40",
        text: "#8fd49a",
        strong: "#b6f0bf",
        bg: "#24361f",
        border: "#37522f",
        onAccent: "#ffffff",
      },
    },
    lapis: { name: "青金石", base: "#3b6ea5" },
    diamond: { name: "钻石", base: "#3fbfb0" },
    cactus: { name: "仙人掌", base: "#4caf50" },
    gold: { name: "金锭", base: "#d9a03a" },
    amethyst: { name: "紫水晶", base: "#a06bd6" },
    redstone: { name: "红石", base: "#c94f4f" },
  };

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }

  function roundEven(value) {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (diff < 0.5) return floor;
    if (diff > 0.5) return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;
  }

  function rgbToHex(rgb) {
    return (
      "#" +
      rgb
        .map((channel) => {
          const value = Math.min(255, Math.max(0, roundEven(channel)));
          return value.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  function rgbToHls(rgb) {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sum = max + min;
    const lightness = sum / 2;

    if (Math.abs(max - min) < 1e-12) return [0, lightness, 0];

    const diff = max - min;
    const saturation = lightness > 0.5 ? diff / (2 - max - min) : diff / sum;

    let hue;
    if (Math.abs(max - r) < 1e-12) {
      hue = (g - b) / diff + (g < b ? 6 : 0);
    } else if (Math.abs(max - g) < 1e-12) {
      hue = (b - r) / diff + 2;
    } else {
      hue = (r - g) / diff + 4;
    }

    return [hue / 6, lightness, saturation];
  }

  function hlsToRgb(hue, lightness, saturation) {
    if (saturation === 0) return [lightness * 255, lightness * 255, lightness * 255];

    const m2 = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const m1 = 2 * lightness - m2;

    function channel(value) {
      let h = value;
      if (h < 0) h += 1;
      if (h > 1) h -= 1;
      if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
      if (h * 2 < 1) return m2;
      if (h * 3 < 2) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
      return m1;
    }

    return [
      channel(hue + 1 / 3) * 255,
      channel(hue) * 255,
      channel(hue - 1 / 3) * 255,
    ];
  }

  function shift(hex, lightnessDelta) {
    const [hue, lightness, saturation] = rgbToHls(hexToRgb(hex));
    return rgbToHex(hlsToRgb(hue, Math.min(1, Math.max(0, lightness + lightnessDelta)), saturation));
  }

  function blend(foreground, background, ratio) {
    const fg = hexToRgb(foreground);
    const bg = hexToRgb(background);
    return rgbToHex([
      bg[0] + (fg[0] - bg[0]) * ratio,
      bg[1] + (fg[1] - bg[1]) * ratio,
      bg[2] + (fg[2] - bg[2]) * ratio,
    ]);
  }

  function readableOn(hex) {
    const [r, g, b] = hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? "#101317" : "#ffffff";
  }

  function deriveAccent(base) {
    const fill = shift(base, -0.13);
    return {
      accent: base,
      fill,
      hover: shift(base, -0.07),
      pressed: shift(base, -0.2),
      text: shift(base, 0.16),
      strong: shift(base, 0.3),
      bg: blend(base, PAGE_BG, 0.13),
      border: blend(base, PAGE_BG, 0.24),
      onAccent: readableOn(fill),
    };
  }

  function rgbChannels(hex) {
    return hexToRgb(hex).join(", ");
  }

  function applyAccent(key) {
    const preset = presets[key];
    if (!preset) return;

    const tokens = preset.fixed || deriveAccent(preset.base);
    const style = root.style;

    style.setProperty("--accent", tokens.accent);
    style.setProperty("--accent-rgb", rgbChannels(tokens.accent));
    style.setProperty("--accent-fill", tokens.fill);
    style.setProperty("--accent-fill-rgb", rgbChannels(tokens.fill));
    style.setProperty("--accent-fill-hover", tokens.hover);
    style.setProperty("--accent-fill-pressed", tokens.pressed);
    style.setProperty("--accent-text", tokens.text);
    style.setProperty("--accent-text-strong", tokens.strong);
    style.setProperty("--accent-strong-rgb", rgbChannels(tokens.strong));
    style.setProperty("--accent-bg", tokens.bg);
    style.setProperty("--accent-border", tokens.border);
    style.setProperty("--on-accent", tokens.onAccent);
    root.dataset.accent = key;

    $$(".accent-dot").forEach((dot) => {
      const isActive = dot.dataset.accent === key;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });

    const name = $("[data-accent-name]");
    if (name) name.textContent = preset.name;

    const live = $("[data-accent-live]");
    if (live) live.textContent = `已切换到${preset.name}强调色`;

    window.dispatchEvent(new CustomEvent("mosslight:accent", { detail: { key, tokens } }));
  }

  const accentPicker = $("[data-accent-picker]");

  if (accentPicker) {
    const dots = $$(".accent-dot", accentPicker);

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        applyAccent(dot.dataset.accent);
      });
    });

    const dotsWrap = $(".accent-dots", accentPicker);

    if (dotsWrap) {
      dotsWrap.addEventListener("keydown", (event) => {
        const current = dots.indexOf(document.activeElement);
        if (current < 0) return;

        let next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % dots.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + dots.length) % dots.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = dots.length - 1;
        if (next === null) return;

        event.preventDefault();
        dots[next].focus();
        dots[next].click();
      });
    }
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  updateOnScroll();
  updateActiveNav();

  // Keep the first screen in a clean state even after a bfcache restore.
  window.addEventListener("pageshow", () => {
    updateOnScroll();
  });
})();
