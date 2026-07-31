import { initObfuscatedPhoneLinks } from "./obfuscated-phone-links.js";
import { cleanupProcessPage, initProcessPage } from "./process-page.js";
import { loadRoute } from "./router.js";

(() => {
  const BG_VIDEO_BASELINE_SRC = "/assets/video/water720p-baseline.mp4";
  const HEADER_DEBUG_ENABLED = /(?:^|\?)headerdebug=1(?:&|$)/i.test(window.location.search);
  const BG_VIDEO_DEFAULT_SRC = "/assets/video/water720p.mp4";
  // Restore "design" in this array when the Design page should reappear in static-page arrow navigation.
  const ROUTE_ORDER = ["home", "process", "gallery", "about", "financing", "careers"];
  const PATH_ROUTES = {
    "/": "home",
    "/our-process/": "process",
    "/gallery/": "gallery",
    // "/design/": "design",
    "/about-us/": "about",
    "/financing/": "financing",
    "/careers/": "careers",
  };
  const ROUTE_PATHS = {
    home: "/",
    process: "/our-process/",
    gallery: "/gallery/",
    // design: "/design/",
    about: "/about-us/",
    financing: "/financing/",
    careers: "/careers/",
  };
  let hasArmedBackgroundVideoRetry = false;
  let currentRoute = getRouteFromLocation();
  let isStageTransitioning = false;

  function normalizePath(pathname = "/") {
    const base = pathname.trim() || "/";
    if (base === "/") return "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  function getRouteFromLocation() {
    return PATH_ROUTES[normalizePath(window.location.pathname)] || "home";
  }

  function routeToPath(route) {
    return ROUTE_PATHS[route] || "/";
  }

  function getNextRoute(direction) {
    const current = getRouteFromLocation();
    const index = ROUTE_ORDER.indexOf(current);
    const nextIndex = (index + direction + ROUTE_ORDER.length) % ROUTE_ORDER.length;
    return ROUTE_ORDER[nextIndex];
  }

  function getDirection(fromRoute, toRoute) {
    const fromIndex = ROUTE_ORDER.indexOf(fromRoute);
    const toIndex = ROUTE_ORDER.indexOf(toRoute);
    if (fromIndex === -1 || toIndex === -1) return "forward";

    const forwardDistance = (toIndex - fromIndex + ROUTE_ORDER.length) % ROUTE_ORDER.length;
    const backwardDistance = (fromIndex - toIndex + ROUTE_ORDER.length) % ROUTE_ORDER.length;
    return forwardDistance <= backwardDistance ? "forward" : "backward";
  }

  function revealBackgroundVideoWhenReady(videoEl, reveal) {
    if (!videoEl || typeof reveal !== "function") return;

    let didReveal = false;
    const revealOnce = () => {
      if (didReveal) return;
      didReveal = true;
      reveal();
    };

    ["playing", "canplay", "loadeddata", "timeupdate", "loadedmetadata"].forEach((eventName) => {
      videoEl.addEventListener(eventName, revealOnce, { once: true });
    });

    window.setTimeout(() => {
      if (!didReveal && !videoEl.paused && videoEl.currentTime > 0) {
        revealOnce();
      }
    }, 2000);
  }

  function selectBackgroundVideoSource(videoEl) {
    if (!videoEl) return;

    const desiredSources = [BG_VIDEO_BASELINE_SRC, BG_VIDEO_DEFAULT_SRC];
    const existingSources = Array.from(videoEl.querySelectorAll('source[type="video/mp4"]'));
    let changed = false;

    desiredSources.forEach((src, index) => {
      let source = existingSources[index];
      if (!source) {
        source = document.createElement("source");
        source.type = "video/mp4";
        videoEl.appendChild(source);
        changed = true;
      }

      if (source.getAttribute("src") !== src) {
        source.setAttribute("src", src);
        changed = true;
      }
    });

    existingSources.slice(desiredSources.length).forEach((source) => {
      source.remove();
      changed = true;
    });

    if (changed) {
      videoEl.load();
    }
  }

  function armBackgroundVideoRetry(videoEl) {
    if (!videoEl || hasArmedBackgroundVideoRetry) return;
    hasArmedBackgroundVideoRetry = true;

    const retryPlay = () => {
      window.removeEventListener("touchstart", retryPlay, true);
      window.removeEventListener("click", retryPlay, true);
      hasArmedBackgroundVideoRetry = false;

      try {
        const retryPromise = videoEl.play();
        if (retryPromise && typeof retryPromise.catch === "function") {
          retryPromise.catch(() => {
            // Ignore second-play failures and keep poster fallback.
          });
        }
      } catch {
        // Ignore second-play failures and keep poster fallback.
      }
    };

    window.addEventListener("touchstart", retryPlay, true);
    window.addEventListener("click", retryPlay, true);
  }

  function initStageVisibility() {
    const root = document.documentElement;
    const stage = document.querySelector(".stage");
    const bg = document.querySelector(".bg");
    const bgVideo = document.querySelector(".bg__video");

    // Match SPA boot behavior so static pages don't keep stage content hidden.
    root.classList.add("bg-ready");
    if (stage) {
      stage.classList.add("is-ready", "is-controls");
      stage.classList.remove("is-intro");
    }

    if (!bg || !bgVideo) return;

    selectBackgroundVideoSource(bgVideo);
    bgVideo.muted = true;
    bgVideo.defaultMuted = true;
    bgVideo.autoplay = true;
    bgVideo.loop = true;
    bgVideo.playsInline = true;
    bgVideo.setAttribute("muted", "");
    bgVideo.setAttribute("autoplay", "");
    bgVideo.setAttribute("loop", "");
    bgVideo.setAttribute("playsinline", "");
    bgVideo.setAttribute("webkit-playsinline", "");

    const revealVideo = () => bg.classList.add("is-video-ready");
    if (bgVideo.readyState >= 3) {
      revealVideo();
    } else {
      revealBackgroundVideoWhenReady(bgVideo, revealVideo);
    }

    try {
      const p = bgVideo.play();
      if (p && typeof p.catch === "function") {
        if (typeof p.then === "function") {
          p.then(() => {
            revealVideo();
          });
        }
        p.catch(() => {
          armBackgroundVideoRetry(bgVideo);
        });
      }
    } catch {
      armBackgroundVideoRetry(bgVideo);
    }
  }

  function initHeaderBubbles() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    const getBubble = (btn) => {
      const targetId = btn.getAttribute("aria-controls");
      const target = targetId ? header.querySelector(`#${targetId}`) : null;
      return target?.classList.contains("topbar__bubble") ? target : null;
    };
    const buttons = Array.from(header.querySelectorAll(".topbar__icon[aria-controls]"))
      .filter((btn) => getBubble(btn));
    if (!buttons.length) return;

    const closeAll = () => {
      buttons.forEach((btn) => {
        const bubble = getBubble(btn);
        btn.setAttribute("aria-expanded", "false");
        if (bubble) {
          bubble.classList.remove("is-open");
          bubble.setAttribute("aria-hidden", "true");
        }
      });
    };

    buttons.forEach((btn) => {
      const bubble = getBubble(btn);
      if (!bubble) return;

      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = btn.getAttribute("aria-expanded") === "true";
        closeAll();
        if (!isOpen) {
          btn.setAttribute("aria-expanded", "true");
          bubble.classList.add("is-open");
          bubble.setAttribute("aria-hidden", "false");
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (!header.contains(event.target)) closeAll();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAll();
    });
  }

  function initNavToggles() {
    const debugNav = window.location.search.includes("navdebug=1");
    if (window.__hoganMobileDrawerBound) {
      if (debugNav) console.log("[nav]", "drawer binding skipped from static-page.js", window.__hoganMobileDrawerBound);
      return;
    }
    const toggles = Array.from(document.querySelectorAll('.navtoggle[aria-controls="site-nav"], .topbar__icon--menu'));
    if (!toggles.length) return;
    window.__hoganMobileDrawerBound = "static-page.js";

    const hamburgerHeaderQuery = window.matchMedia("(max-width: 919px)");
    const compactHeaderQuery = window.matchMedia("(max-width: 470px)");
    const compactHeaderXsQuery = window.matchMedia("(max-width: 347px)");
    const header = document.getElementById("site-header");

    const updateCompactClasses = () => {
      if (!header) return false;
      const isCompact = compactHeaderQuery.matches;
      const isCompactXs = compactHeaderXsQuery.matches;
      header.classList.toggle("header-mobile-compact", isCompact);
      header.classList.toggle("header-mobile-compact-xs", isCompactXs);
      return hamburgerHeaderQuery.matches;
    };

    const ensureDrawer = () => {
      let drawer = document.getElementById("mobile-menu-drawer");
      if (!drawer) {
        drawer = document.createElement("div");
        drawer.id = "mobile-menu-drawer";
        drawer.className = "mobile-menu-drawer";
        drawer.hidden = true;
        drawer.innerHTML = `
          <div class="mobile-menu-drawer__backdrop" data-mobile-menu-close></div>
          <nav class="mobile-menu-drawer__panel" aria-label="Mobile navigation">
            <button type="button" class="mobile-menu-drawer__close" data-mobile-menu-close aria-label="Close menu">&times;</button>
            <a href="/">Home</a>
            <a href="/our-process/">Our Process</a>
            <a href="/gallery/">Gallery</a>
            <a href="/about-us/">About Us</a>
            <a href="/financing/">Financing</a>
            <a href="/careers/">Careers</a>
          </nav>
        `;
        document.body.appendChild(drawer);
      }
      if (debugNav) {
        console.log("[nav]", "drawer ready from static-page.js", {
          exists: Boolean(drawer),
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
      return drawer;
    };

    const drawer = ensureDrawer();
    if (!drawer) return;

    const syncButtons = (open) => {
      toggles.forEach((toggle) => {
        toggle.setAttribute("aria-expanded", String(open));
        if (toggle.dataset.iconToggle === "true") {
          toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
          const icon = toggle.querySelector("span[aria-hidden='true']");
          if (icon) icon.textContent = open ? "✕" : "☰";
        } else {
          toggle.textContent = open ? "Close" : "Menu";
        }
      });
    };

    const openDrawer = () => {
      updateCompactClasses();
      drawer.hidden = false;
      drawer.classList.add("is-open");
      document.body.classList.add("mobile-menu-open");
      syncButtons(true);
      if (debugNav) {
        console.log("[nav]", "drawer opened from static-page.js", {
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
    };

    const closeDrawer = (reason = "close") => {
      drawer.classList.remove("is-open");
      drawer.hidden = true;
      document.body.classList.remove("mobile-menu-open");
      syncButtons(false);
      if (debugNav) {
        console.log("[nav]", "drawer closed from static-page.js", {
          reason,
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
    };

    if (debugNav) console.log("[nav]", "drawer binding from static-page.js");

    toggles.forEach((toggle) => {
      if (toggle.dataset.mobileDrawerBound === "true") return;
      toggle.dataset.mobileDrawerBound = "true";
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openDrawer();
      });
    });

    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-mobile-menu-close]")) {
        event.preventDefault();
        closeDrawer("close-control");
        return;
      }
      if (event.target?.closest?.("#mobile-menu-drawer a")) {
        closeDrawer("link");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer("escape");
    });

    window.addEventListener("resize", () => {
      if (!hamburgerHeaderQuery.matches) {
        closeDrawer("desktop-resize");
        return;
      }
      updateCompactClasses();
    });

    closeDrawer("init");
  }

  function getComputedSnapshot(el) {
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return {
      display: style.display,
      visibility: style.visibility,
      position: style.position,
      top: style.top,
      bottom: style.bottom,
      transform: style.transform,
      height: style.height,
      minHeight: style.minHeight,
      maxHeight: style.maxHeight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      gridTemplateRows: style.gridTemplateRows,
      gridTemplateColumns: style.gridTemplateColumns,
      gap: style.gap,
      rowGap: style.rowGap,
      flexDirection: style.flexDirection,
      overflow: style.overflow,
    };
  }

  function getRect(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      width: rect.width,
      left: rect.left,
      right: rect.right,
      centerY: rect.top + rect.height / 2,
      centerX: rect.left + rect.width / 2,
    };
  }

  function collectHeaderDebugData() {
    const siteHeader = document.querySelector("#site-header");
    const header = siteHeader?.querySelector(".site-header");
    const navwrap = siteHeader?.querySelector(".navwrap");
    const brand = siteHeader?.querySelector(".brand");
    const logo = siteHeader?.querySelector(".brand__logo");
    const clock = siteHeader?.querySelector(".topbar__icon--hours");
    const phone = siteHeader?.querySelector(".topbar__icon--phone");
    const iconStrip = siteHeader?.querySelector(".topbar");
    const hamburger = siteHeader?.querySelector(".topbar__icon--menu");
    const nav = siteHeader?.querySelector("#site-nav");
    const cyanNav = null;
    const headerRect = getRect(header);
    const navwrapRect = getRect(navwrap);
    const brandRect = getRect(brand);
    const logoRect = getRect(logo);
    const clockRect = getRect(clock);
    const phoneRect = getRect(phone);
    const iconStripRect = getRect(iconStrip);
    const hamburgerRect = getRect(hamburger);
    const navRect = getRect(nav);
    const cyanRect = getRect(cyanNav);

    const navOpen = !!nav?.classList.contains("nav--open");
    const compact = !!siteHeader?.classList.contains("header-mobile-compact");
    const compactXs = !!siteHeader?.classList.contains("header-mobile-compact-xs");
    const navVisible = !!nav && nav.getClientRects().length > 0;
    const navHeight = nav ? nav.getBoundingClientRect().height : 0;
    const hamburgerVisible = !!hamburger && hamburger.getClientRects().length > 0;
    const fullNavExists = !!nav;

    return {
      timestamp: new Date().toISOString(),
      viewport: {
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        visualViewportWidth: window.visualViewport?.width ?? null,
        devicePixelRatio: window.devicePixelRatio,
        outerWidth: window.outerWidth,
        url: window.location.href,
        cssHrefs: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href')),
        jsSrcs: Array.from(document.querySelectorAll('script[src]')).map((script) => script.getAttribute('src')),
      },
      headerState: {
        hasCompactClass: compact,
        hasCompactXsClass: compactXs,
        navOpen,
        hasHamburger: !!hamburger,
        hamburgerVisible,
        hasFullNav: fullNavExists,
        fullNavVisible: navVisible,
        fullNavHeight: navHeight,
      },
      rects: {
        darkHeader: headerRect,
        navwrap: navwrapRect,
        logoImage: logoRect,
        brandContainer: brandRect,
        clockIcon: clockRect,
        phoneIcon: phoneRect,
        iconStrip: iconStripRect,
        hamburgerButton: hamburgerRect,
        fullNav: navRect,
        cyanNavBar: cyanRect,
      },
      alignmentDeltas: {
        logoCenterMinusHeaderCenter: headerRect && logoRect ? logoRect.centerY - headerRect.centerY : null,
        clockCenterMinusLogoCenter: logoRect && clockRect ? clockRect.centerY - logoRect.centerY : null,
        phoneCenterMinusLogoCenter: logoRect && phoneRect ? phoneRect.centerY - logoRect.centerY : null,
        hamburgerCenterMinusLogoCenter: logoRect && hamburgerRect ? hamburgerRect.centerY - logoRect.centerY : null,
        navTopMinusHeaderBottom: headerRect && navRect ? navRect.top - headerRect.bottom : null,
        darkHeaderHeight: headerRect?.height ?? null,
      },
      computed: {
        darkHeader: getComputedSnapshot(header),
        navwrap: getComputedSnapshot(navwrap),
        logoImage: getComputedSnapshot(logo),
        logoContainer: getComputedSnapshot(brand),
        clockIcon: getComputedSnapshot(clock),
        phoneIcon: getComputedSnapshot(phone),
        iconStrip: getComputedSnapshot(iconStrip),
        hamburgerButton: getComputedSnapshot(hamburger),
        fullNav: getComputedSnapshot(nav),
        cyanNavBar: null,
      },
    };
  }

  function renderHeaderDebugOverlay() {
    if (!HEADER_DEBUG_ENABLED) return;

    const existing = document.getElementById("header-debug-overlay");
    if (existing) existing.remove();

    const panel = document.createElement("aside");
    panel.id = "header-debug-overlay";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="header-debug__toolbar">
        <strong>Header Debug</strong>
        <button type="button" id="header-debug-copy">Copy Header Debug JSON</button>
        <button type="button" id="header-debug-recalc">Recalculate</button>
        <button type="button" id="header-debug-toggle">Toggle Mobile Nav</button>
      </div>
      <pre id="header-debug-output">Loading…</pre>
    `;
    document.body.appendChild(panel);

    const output = document.getElementById("header-debug-output");
    const copyBtn = document.getElementById("header-debug-copy");
    const recalcBtn = document.getElementById("header-debug-recalc");
    const toggleBtn = document.getElementById("header-debug-toggle");

    const update = () => {
      const data = collectHeaderDebugData();
      if (output) output.textContent = JSON.stringify(data, null, 2);
      return data;
    };

    copyBtn?.addEventListener("click", async () => {
      try {
        const data = update();
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        copyBtn.textContent = "Copied";
        window.setTimeout(() => { copyBtn.textContent = "Copy Header Debug JSON"; }, 1200);
      } catch (error) {
        console.error("Header debug copy failed", error);
      }
    });

    recalcBtn?.addEventListener("click", () => update());
    toggleBtn?.addEventListener("click", () => {
      const drawer = document.getElementById("mobile-menu-drawer");
      if (!drawer) return;
      const nextOpen = drawer.hidden;
      drawer.hidden = !nextOpen;
      drawer.classList.toggle("is-open", nextOpen);
      document.body.classList.toggle("mobile-menu-open", nextOpen);
      document.querySelectorAll('.navtoggle[aria-controls="site-nav"]').forEach((toggle) => {
        toggle.setAttribute("aria-expanded", String(nextOpen));
      });
      update();
    });

    window.dumpHeaderDebug = () => {
      const data = update();
      console.table([
        { label: "innerWidth", value: data.viewport.innerWidth },
        { label: "clientWidth", value: data.viewport.clientWidth },
        { label: "visualViewportWidth", value: data.viewport.visualViewportWidth },
        { label: "devicePixelRatio", value: data.viewport.devicePixelRatio },
        { label: "outerWidth", value: data.viewport.outerWidth },
        { label: "compact", value: data.headerState.hasCompactClass },
        { label: "compactXs", value: data.headerState.hasCompactXsClass },
        { label: "navOpen", value: data.headerState.navOpen },
      ]);
      return data;
    };

    const refresh = () => window.requestAnimationFrame(update);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("load", refresh, { passive: true });
    const observer = new MutationObserver(() => refresh());
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
    panel._debugObserver = observer;
    update();
  }

  function applyHeaderDebugOutlines() {
    if (!HEADER_DEBUG_ENABLED) return;

    const style = document.createElement("style");
    style.id = "header-debug-outlines";
    style.textContent = `
      #header-debug-overlay {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
        max-height: 48vh; overflow: auto; background: rgba(5, 10, 18, 0.96); color: #eff6ff;
        border-top: 1px solid rgba(148,163,184,0.35); box-shadow: 0 -10px 28px rgba(0,0,0,0.45);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 8px;
      }
      #header-debug-overlay .header-debug__toolbar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px; }
      #header-debug-overlay button { border: 1px solid rgba(148,163,184,0.35); background:#0f172a; color:#eff6ff; border-radius:6px; padding:4px 8px; font: inherit; }
      #header-debug-overlay pre { margin:0; white-space:pre-wrap; word-break:break-word; max-height: 38vh; overflow:auto; }
      #site-header .site-header { outline: 2px solid red !important; outline-offset: 2px; }
      #site-header .navwrap { outline: 2px solid magenta !important; outline-offset: 2px; }
      #site-header .brand, #site-header .brand__logo { outline: 2px solid yellow !important; outline-offset: 2px; }
      #site-header .topbar, #site-header .topbar__item, #site-header .topbar__icon--hours, #site-header .topbar__icon--phone { outline: 2px solid lime !important; outline-offset: 2px; }
      #site-header .topbar__icon--menu { outline: 2px solid orange !important; outline-offset: 2px; }
      #site-header #site-nav { outline: 2px solid magenta !important; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
  }

  function initStageControls() {
    const stage = document.querySelector(".stage");
    if (!stage) return;

    let prevButton = stage.querySelector(".stage__control--left");
    let nextButton = stage.querySelector(".stage__control--right");
    const shouldCreateControls = Boolean(document.querySelector(".process-page"));

    if (!prevButton && shouldCreateControls) {
      prevButton = document.createElement("button");
      prevButton.className = "stage__control stage__control--left";
      prevButton.type = "button";
      prevButton.setAttribute("aria-label", "Previous section");
      prevButton.textContent = "‹";
      stage.prepend(prevButton);
    }

    if (!nextButton && shouldCreateControls) {
      nextButton = document.createElement("button");
      nextButton.className = "stage__control stage__control--right";
      nextButton.type = "button";
      nextButton.setAttribute("aria-label", "Next section");
      nextButton.textContent = "›";
      stage.append(nextButton);
    }

    if (!prevButton && !nextButton) return;
    if (stage.dataset.stageControlsBound === "true") return;
    stage.dataset.stageControlsBound = "true";

    const stageCard = stage.querySelector(".stage__card");
    const stageContent = stage.querySelector(".stage__content");

    const setStageTransitioning = (active) => {
      isStageTransitioning = active;
      document.body.classList.toggle("is-stage-transitioning", active);
    };

    const prefersReducedMotion = () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    const parseTime = (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      if (trimmed.endsWith("ms")) return parseFloat(trimmed);
      if (trimmed.endsWith("s")) return parseFloat(trimmed) * 1000;
      return 0;
    };

    const waitForCardTransformEnd = () => {
      if (!stageCard) return Promise.resolve();
      return new Promise((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          stageCard.removeEventListener("transitionend", onEnd);
          window.clearTimeout(fallbackTimer);
          resolve();
        };
        const onEnd = (event) => {
          if (event.propertyName !== "transform") return;
          finish();
        };
        stageCard.addEventListener("transitionend", onEnd);

        const style = getComputedStyle(stageCard);
        const durations = style.transitionDuration.split(",").map(parseTime);
        const delays = style.transitionDelay.split(",").map(parseTime);
        const maxTransitionMs = durations.reduce((max, duration, index) => {
          const delay = delays[index] ?? delays[delays.length - 1] ?? 0;
          return Math.max(max, duration + delay);
        }, 0);
        const fallbackTimer = window.setTimeout(finish, Math.max(700, maxTransitionMs + 120));
      });
    };

    const syncHeaderNavState = (route) => {
      const navLinks = Array.from(document.querySelectorAll("#site-nav a"));
      const currentPath = routeToPath(route);
      navLinks.forEach((link) => {
        const linkUrl = new URL(link.href, window.location.origin);
        if (normalizePath(linkUrl.pathname) === currentPath) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    const syncRouteBodyClasses = (route) => {
      document.body.classList.toggle("is-home", route === "home");
    };

    const syncStageShell = (route, shell = {}) => {
      const stageClassNames = new Set((shell.stageClassName || "stage").split(/\s+/).filter(Boolean));
      stageClassNames.add("stage");
      [
        "is-intro",
        "is-ready",
        "is-controls",
        "is-sliding",
        "stage-prep",
        "slide-out-left",
        "slide-out-right",
        "slide-in-from-left",
        "slide-in-from-right",
      ].forEach((className) => stageClassNames.delete(className));

      if (route === "home") {
        stageClassNames.delete("stage--static");
      } else {
        stageClassNames.add("stage--static");
      }

      stageClassNames.add("is-ready");
      stageClassNames.add("is-controls");
      stage.className = Array.from(stageClassNames).join(" ");
    };

    const renderRoute = async (route) => {
      cleanupProcessPage();
      syncRouteBodyClasses(route);
      const payload = await loadRoute(route, stageContent);
      if (!payload) return false;
      syncStageShell(route, payload.shell);
      if (payload.shell?.contentClassName) {
        stageContent.className = payload.shell.contentClassName;
      }
      syncHeaderNavState(route);
      initObfuscatedPhoneLinks(document);
      if (route === "process") {
        initProcessPage(stageContent || document);
      }
      currentRoute = route;
      return true;
    };

    const slideNavigate = async (route, direction, options = {}) => {
      if (isStageTransitioning || !stageCard || !stageContent) return;

      if (prefersReducedMotion()) {
        if (await renderRoute(route)) {
          if (options.updateHistory !== false) {
            history.pushState({ route }, "", routeToPath(route));
          }
        }
        return;
      }

      const slideOutClass = direction === "right" ? "slide-out-left" : "slide-out-right";
      const slideInClass = direction === "right" ? "slide-in-from-right" : "slide-in-from-left";

      setStageTransitioning(true);

      try {
        stage.classList.add("is-sliding", "stage-prep");
        stage.classList.remove("slide-out-left", "slide-out-right", "slide-in-from-left", "slide-in-from-right");
        stageCard.getBoundingClientRect();
        stage.classList.remove("stage-prep");
        stage.classList.add(slideOutClass);

        await waitForCardTransformEnd();
        const rendered = await renderRoute(route);
        if (!rendered) return;
        if (options.updateHistory !== false) {
          history.pushState({ route }, "", routeToPath(route));
        }

        stage.classList.add("is-sliding", "stage-prep");
        stage.classList.remove(slideOutClass);
        stage.classList.add(slideInClass);
        stageCard.getBoundingClientRect();
        stage.classList.remove("stage-prep");
        stageCard.getBoundingClientRect();
        stage.classList.remove(slideInClass);

        await waitForCardTransformEnd();
      } finally {
        stage.classList.remove("is-sliding", "stage-prep", "slide-out-left", "slide-out-right", "slide-in-from-left", "slide-in-from-right");
        setStageTransitioning(false);
      }
    };

    const onStageControl = (direction) => {
      const nextRoute = getNextRoute(direction);
      const nextPath = routeToPath(nextRoute);
      if (!nextPath || nextPath === normalizePath(window.location.pathname)) return;
      slideNavigate(nextRoute, direction > 0 ? "right" : "left");
    };

    prevButton?.addEventListener("click", () => onStageControl(-1));
    nextButton?.addEventListener("click", () => onStageControl(1));
    document.addEventListener("keydown", (event) => {
      if (event.target?.closest?.(".process-row__slideshow")) return;
      if (event.key === "ArrowLeft") onStageControl(-1);
      if (event.key === "ArrowRight") onStageControl(1);
    });

    window.addEventListener("popstate", () => {
      const nextRoute = getRouteFromLocation();
      if (nextRoute === currentRoute) return;
      const direction = getDirection(currentRoute, nextRoute);
      slideNavigate(nextRoute, direction === "forward" ? "right" : "left", {
        updateHistory: false,
      });
    });
  }

  function boot() {
    initStageVisibility();
    initObfuscatedPhoneLinks(document);
    initHeaderBubbles();
    initNavToggles();
    initStageControls();
    initProcessPage(document);
    if (HEADER_DEBUG_ENABLED) {
      applyHeaderDebugOutlines();
      renderHeaderDebugOverlay();
      window.setTimeout(() => window.dumpHeaderDebug?.(), 300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
