// /js/app.js
import { initObfuscatedPhoneLinks } from "./obfuscated-phone-links.js";
import { cleanupProcessPage, initProcessPage } from "./process-page.js";
import { getRouteFromHref, getRouteFromLocation, loadRoute, routeToPath } from "./router.js";

const app = document.getElementById("app");
const siteHeader = document.getElementById("site-header");
const stage = document.querySelector(".stage");
const stageCard = document.querySelector(".stage__card");
const bg = document.querySelector(".bg");
const bgVideo = document.querySelector(".bg__video");
const prevButton = document.querySelector(".stage__control--left");
const nextButton = document.querySelector(".stage__control--right");
const BG_VIDEO_BASELINE_SRC = "/assets/video/water720p-baseline.mp4";
const BG_VIDEO_DEFAULT_SRC = "/assets/video/water720p.mp4";

// Restore "design" in this array when the Design page should reappear in SPA arrow navigation.
const ROUTE_ORDER = ["home", "process", "gallery", "about", "financing", "careers"];

let cleanupHomeTestimonialsMobileRotator = null;
let galleryLightboxModulePromise = null;
let galleryProjectCardModulePromise = null;
let hearthLoaderModulePromise = null;
// let designToolModulePromise = null;
let hasStartedBackgroundVideo = false;
let hasArmedBackgroundVideoRetry = false;
let backgroundVideoWatchdogTimer = 0;

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

function isAndroidChrome() {
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && /Chrome\//i.test(ua) && !/EdgA\//i.test(ua);
}

function getBackgroundVideoSourceCandidates() {
  if (isAndroidChrome()) {
    return [BG_VIDEO_BASELINE_SRC, BG_VIDEO_DEFAULT_SRC];
  }

  return [BG_VIDEO_DEFAULT_SRC, BG_VIDEO_BASELINE_SRC];
}

function setBackgroundVideoSources(videoEl, sources) {
  if (!videoEl) return;

  const desiredSources = Array.isArray(sources) ? sources : [];
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

function selectBackgroundVideoSource(videoEl) {
  if (!videoEl) return;

  const candidates = getBackgroundVideoSourceCandidates();
  videoEl.dataset.bgSourceIndex = "0";
  setBackgroundVideoSources(videoEl, [candidates[0]]);
}

function tryNextBackgroundVideoSource(videoEl) {
  if (!videoEl) return false;

  const candidates = getBackgroundVideoSourceCandidates();
  const currentIndex = Number(videoEl.dataset.bgSourceIndex || "0");
  const nextIndex = currentIndex + 1;

  if (nextIndex >= candidates.length) return false;

  videoEl.dataset.bgSourceIndex = String(nextIndex);
  setBackgroundVideoSources(videoEl, [candidates[nextIndex]]);
  return true;
}

function armBackgroundVideoWatchdog(videoEl, onFailure) {
  if (!videoEl || typeof onFailure !== "function") return;

  if (backgroundVideoWatchdogTimer) {
    window.clearTimeout(backgroundVideoWatchdogTimer);
    backgroundVideoWatchdogTimer = 0;
  }

  const startTime = videoEl.currentTime || 0;

  backgroundVideoWatchdogTimer = window.setTimeout(() => {
    backgroundVideoWatchdogTimer = 0;
    if (document.hidden) return;

    const progressed = (videoEl.currentTime || 0) > startTime + 0.05;
    const healthyPlayback = !videoEl.paused && videoEl.readyState >= 2 && progressed;

    if (!healthyPlayback) {
      onFailure();
    }
  }, isAndroidChrome() ? 3400 : 2600);
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
          if (!tryNextBackgroundVideoSource(videoEl)) {
            // Ignore second-play failures and keep poster fallback.
            return;
          }

          try {
            const fallbackPromise = videoEl.play();
            if (fallbackPromise && typeof fallbackPromise.catch === "function") {
              fallbackPromise.catch(() => {
                // Keep poster fallback if alternate source also fails.
              });
            }
          } catch {
            // Keep poster fallback if alternate source throws.
          }
        });
      }
    } catch {
      // Ignore second-play failures and keep poster fallback.
    }
  };

  window.addEventListener("touchstart", retryPlay, true);
  window.addEventListener("click", retryPlay, true);
}

function ensureMetaByName(name) {
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  return tag;
}

function ensureMetaByProperty(property) {
  let tag = document.head.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  return tag;
}

function ensureCanonicalLink() {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  return link;
}

function syncRouteJsonLd(jsonLdBlocks = []) {
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    script.remove();
  });

  jsonLdBlocks
    .filter((content) => content && content.trim())
    .forEach((content) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = content;
      document.head.appendChild(script);
    });
}

function updateSeoForRoute(seo, route) {
  const routePath = routeToPath(route);
  const title = seo?.title || document.title;
  const description = seo?.description || "";
  const robots = seo?.robots || "index,follow,max-image-preview:large";
  const canonical = seo?.canonical || routePath;
  const ogType = seo?.ogType || "website";
  const ogSiteName = seo?.ogSiteName || "Hogan Pools";
  const ogTitle = seo?.ogTitle || title;
  const ogDescription = seo?.ogDescription || description;
  const ogUrl = seo?.ogUrl || canonical;
  const ogImage = seo?.ogImage || "https://www.hoganpools.com/assets/hero/hero-1440.jpg";
  const twitterCard = seo?.twitterCard || "summary_large_image";
  const twitterTitle = seo?.twitterTitle || title;
  const twitterDescription = seo?.twitterDescription || description;
  const twitterImage = seo?.twitterImage || ogImage;

  document.title = title;
  ensureMetaByName("description").setAttribute("content", description);
  ensureMetaByName("robots").setAttribute("content", robots);
  ensureMetaByName("twitter:card").setAttribute("content", twitterCard);
  ensureMetaByName("twitter:title").setAttribute("content", twitterTitle);
  ensureMetaByName("twitter:description").setAttribute("content", twitterDescription);
  ensureMetaByName("twitter:image").setAttribute("content", twitterImage);
  ensureMetaByProperty("og:type").setAttribute("content", ogType);
  ensureMetaByProperty("og:site_name").setAttribute("content", ogSiteName);
  ensureMetaByProperty("og:title").setAttribute("content", ogTitle);
  ensureMetaByProperty("og:description").setAttribute("content", ogDescription);
  ensureMetaByProperty("og:url").setAttribute("content", ogUrl);
  ensureMetaByProperty("og:image").setAttribute("content", ogImage);
  ensureCanonicalLink().setAttribute("href", canonical);
  syncRouteJsonLd(seo?.jsonLd || []);
}

function syncHomeHeroPriority(route) {
  const heroImg = app?.querySelector(".home-hero-media__media img");
  if (!heroImg) return;

  if (route === "home") {
    heroImg.loading = "eager";
    heroImg.fetchPriority = "high";
  } else {
    heroImg.loading = "lazy";
    heroImg.fetchPriority = "auto";
  }
}

async function initializeGalleryProjectCards(root = app || document) {
  if (!root) return;

  const cards = Array.from(root.querySelectorAll(".gallery-project-card"));
  if (!cards.length) return;

  if (!galleryProjectCardModulePromise) {
    galleryProjectCardModulePromise = import("./gallery-project-card.js");
  }

  await galleryProjectCardModulePromise;
  cards.forEach((card) => {
    window.HoganPoolsGalleryProjectCard?.init?.(card);
  });
}

async function ensureRouteAssets(route) {
  if (route === "gallery") {
    if (!galleryLightboxModulePromise) {
      galleryLightboxModulePromise = import("./gallery-lightbox.js");
    }
    if (!galleryProjectCardModulePromise) {
      galleryProjectCardModulePromise = import("./gallery-project-card.js");
    }
    await Promise.all([galleryLightboxModulePromise, galleryProjectCardModulePromise]);
  }

  if (route === "financing") {
    if (!hearthLoaderModulePromise) {
      hearthLoaderModulePromise = import("./hearth-loader.js");
    }
    await hearthLoaderModulePromise;
  }

  /*
  if (route === "design") {
    if (!designToolModulePromise) {
      designToolModulePromise = import("./design-tool.js");
    }
    await designToolModulePromise;
  }
  */
}

function syncRouteBodyClasses(route) {
  document.body.classList.toggle("is-home", route === "home");
  // document.body.classList.toggle("is-design", route === "design");
}

function syncHeaderNavState(route) {
  const navLinks = Array.from(siteHeader?.querySelectorAll?.("#site-nav a") || []);
  if (!navLinks.length) return;

  const currentPath = routeToPath(route);
  navLinks.forEach((link) => {
    const linkRoute = getRouteFromHref(link.href);
    if (linkRoute && routeToPath(linkRoute) === currentPath) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function syncStageShell(route, shell = {}) {
  if (!stage) return;

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
    if (stage.classList.contains("is-intro") && !prefersReducedMotion()) {
      stageClassNames.add("is-intro");
    }
    stageClassNames.add("is-ready");
    stageClassNames.add("is-controls");
  } else {
    stageClassNames.add("stage--static");
    stageClassNames.add("is-ready");
    stageClassNames.add("is-controls");
  }

  stage.className = Array.from(stageClassNames).join(" ");

  if (app && shell.contentClassName) {
    app.className = shell.contentClassName;
  }
}

function updateHomeFitScale() {
  if (!stageCard) return;

  const isHome = document.body.classList.contains("is-home");
  const homeStack = document.querySelector(".home-stack");

  // Always clean up when not on Home
  if (!isHome || !homeStack) {
    stageCard.classList.remove("is-home-fit");
    // Home sets an inline paddingBottom for its fit behavior; clear it when leaving Home
    // so other routes (e.g. Gunite) don't inherit extra space below their content.
    stageCard.style.paddingBottom = "";
    if (homeStack) homeStack.style.setProperty("--home-fit-scale", "1");
    return;
  }

  stageCard.classList.add("is-home-fit");

  // Measure header height (already injected into #site-header)
  const headerEl = document.getElementById("site-header");
  const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;

  // Pull stage vertical padding from CSS variables (fallbacks are safe)
  const rootStyle = getComputedStyle(document.documentElement);
  const stagePadTotal = parseFloat(rootStyle.getPropertyValue("--stage-pad-total")) || 64;

  // Available viewport height for the card CONTENT (not the card box)
  const viewportH = window.innerHeight || 0;

  const stageContent = document.querySelector(".stage__content");
  const contentStyle = stageContent ? getComputedStyle(stageContent) : null;
  const padTop = contentStyle ? (parseFloat(contentStyle.paddingTop) || 0) : 0;
  const padBot = contentStyle ? (parseFloat(contentStyle.paddingBottom) || 0) : 0;

  const desiredBottomPad = 32;
  const buffer = 38;
  const available = Math.max(0, viewportH - headerH - stagePadTotal - padTop - desiredBottomPad - buffer);

  // Measure natural height with scaling disabled
  const prevTransform = homeStack.style.transform;
  homeStack.style.transform = "none";
  const natural = homeStack.getBoundingClientRect().height;
  homeStack.style.transform = prevTransform;

  // ONLY scale down (never scale up)
  let scale = available / natural;
  scale = Math.min(1, scale);
  if (!Number.isFinite(scale)) scale = 1;

  homeStack.style.setProperty("--home-fit-scale", String(scale));

  // Ensure bottom padding is always present
  stageCard.style.paddingBottom = `${padBot || 32}px`;
}

function syncHeaderHeight() {
  if (!siteHeader) return;
  const height = siteHeader.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--header-height", `${height}px`);
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initHomeTestimonialsMobileRotator() {
  cleanupHomeTestimonialsMobileRotator?.();
  cleanupHomeTestimonialsMobileRotator = null;
  // Testimonials now use a CSS-only marquee carousel on Home.
  // Keep this function as a no-op so the previous JS rotator can be restored later if needed.
}

function applyTestimonialSizing(root = document) {
  const quotes = root.querySelectorAll(".home-testimonial__quote");
  const LENGTH_THRESHOLD = 200;

  quotes.forEach((quoteEl) => {
    const charCount = quoteEl.textContent.trim().length;
    const card = quoteEl.closest(".home-testimonial");
    if (!card) return;

    if (charCount > LENGTH_THRESHOLD) {
      card.classList.add("home-testimonial--long");
    } else {
      card.classList.remove("home-testimonial--long");
    }
  });
}

function initBackgroundVideoGate() {
  selectBackgroundVideoSource(bgVideo);
  const root = document.documentElement;
  root.classList.add("bg-ready");
  return Promise.resolve();
}

function startBackgroundVideo() {
  if (!bgVideo || hasStartedBackgroundVideo) return;

  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
  } catch {
    // ignore
  }

  hasStartedBackgroundVideo = true;
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
  bgVideo.setAttribute("preload", "auto");

  const reveal = () => {
    if (bg) bg.classList.add("is-video-ready");
  };

  const handlePlaybackFailure = () => {
    if (tryNextBackgroundVideoSource(bgVideo)) {
      tryStartPlayback();
      return;
    }

    hasStartedBackgroundVideo = false;
    armBackgroundVideoRetry(bgVideo);
  };

  if (bgVideo.dataset.bgRecoveryBound !== "true") {
    bgVideo.dataset.bgRecoveryBound = "true";
    ["error", "stalled", "abort", "emptied"].forEach((eventName) => {
      bgVideo.addEventListener(eventName, () => {
        handlePlaybackFailure();
      });
    });
  }

  if (bgVideo.readyState >= 3) {
    reveal();
  } else {
    revealBackgroundVideoWhenReady(bgVideo, reveal);
  }

  function tryStartPlayback() {
    armBackgroundVideoWatchdog(bgVideo, handlePlaybackFailure);

    try {
      const p = bgVideo.play();
      if (p && typeof p.catch === "function") {
        if (typeof p.then === "function") {
          p.then(() => {
            reveal();
          });
        }
        p.catch(() => {
          handlePlaybackFailure();
        });
      }
    } catch {
      handlePlaybackFailure();
    }
  }

  tryStartPlayback();
}

function startBackgroundVideoAfterInitialPaint() {
  const launch = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        startBackgroundVideo();
      });
    });
  };

  if (document.readyState === "complete") {
    launch();
    return;
  }

  window.addEventListener("load", launch, { once: true });
}

function bindHeaderPressFeedback(root = siteHeader) {
  if (!root || root.dataset.pressFeedbackBound === "true") return;
  root.dataset.pressFeedbackBound = "true";

  const pressableButtons = Array.from(root.querySelectorAll(".topbar__icon, .navtoggle"))
    .filter((button) => button.getAttribute("aria-controls") !== "site-nav");
  const desktopPressQuery = window.matchMedia?.("(min-width: 821px) and (hover: hover) and (pointer: fine)");

  pressableButtons.forEach((button) => {
    let clearTimer = 0;
    let activeAnimation = null;

    const clearPressed = () => {
      button.classList.remove("is-pressed");
      activeAnimation?.cancel?.();
      activeAnimation = null;
      if (clearTimer) {
        window.clearTimeout(clearTimer);
        clearTimer = 0;
      }
    };

    const triggerPressed = () => {
      button.classList.add("is-pressed");
      if (clearTimer) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(clearPressed, 220);
    };

    button.addEventListener("click", () => {
      const allowDesktopPress = desktopPressQuery ? desktopPressQuery.matches : window.innerWidth >= 821;
      clearPressed();
      if (!allowDesktopPress) return;

      // Force a reflow so repeated clicks replay the animation class reliably.
      void button.offsetWidth;
      triggerPressed();

      activeAnimation = button.animate(
        [
          { transform: "translateY(0) scale(1)" },
          { transform: "translateY(1px) scale(0.95)", offset: 0.45 },
          { transform: "translateY(0) scale(1)" },
        ],
        {
          duration: 210,
          easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        }
      );
    });

    button.addEventListener("animationend", clearPressed);
    button.addEventListener("blur", clearPressed);
  });
}

function animateSiteNavLinkPress(link) {
  if (!link) return;

  const desktopPressQuery = window.matchMedia?.("(min-width: 821px) and (hover: hover) and (pointer: fine)");
  const allowDesktopPress = desktopPressQuery ? desktopPressQuery.matches : window.innerWidth >= 821;
  if (!allowDesktopPress) return;

  link.classList.remove("is-pressed");
  // Force a reflow so repeated clicks replay the animation class reliably.
  void link.offsetWidth;
  link.classList.add("is-pressed");

  window.setTimeout(() => {
    link.classList.remove("is-pressed");
  }, 220);
}

function animateHeaderBrandPress(link) {
  if (!link) return;

  const desktopPressQuery = window.matchMedia?.("(min-width: 821px) and (hover: hover) and (pointer: fine)");
  const allowDesktopPress = desktopPressQuery ? desktopPressQuery.matches : window.innerWidth >= 821;
  if (!allowDesktopPress) return;

  link.classList.remove("is-pressed");
  link.classList.add("is-press-cooldown");
  void link.offsetWidth;
  link.classList.add("is-pressed");

  window.setTimeout(() => {
    link.classList.remove("is-pressed");
  }, 220);

  window.setTimeout(() => {
    link.classList.remove("is-press-cooldown");
  }, 950);
}

async function injectPartials() {
  if (!siteHeader.querySelector(".site-header")) {
    const h = await fetch("/partials/header.html").then((r) => r.text());
    siteHeader.innerHTML = h;
  }

  bindHeaderPressFeedback(siteHeader);

  // Wire isolated mobile drawer. Desktop nav stays on #site-nav.
  const navToggles = Array.from(document.querySelectorAll('.navtoggle[aria-controls="site-nav"], .topbar__icon--menu'));
  if (navToggles.length) {
    const debugNav = window.location.search.includes("navdebug=1");
    if (window.__hoganMobileDrawerBound) {
      if (debugNav) console.log("[nav]", "drawer binding skipped from app.js", window.__hoganMobileDrawerBound);
    } else {
      window.__hoganMobileDrawerBound = "app.js";

      const hamburgerHeaderQuery = window.matchMedia("(max-width: 919px)");
      const compactHeaderQuery = window.matchMedia("(max-width: 470px)");
      const compactHeaderXsQuery = window.matchMedia("(max-width: 347px)");

    const updateCompactClasses = () => {
      const isCompact = compactHeaderQuery.matches;
      const isCompactXs = compactHeaderXsQuery.matches;
      siteHeader.classList.toggle("header-mobile-compact", isCompact);
      siteHeader.classList.toggle("header-mobile-compact-xs", isCompactXs);
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
        console.log("[nav]", "drawer ready from app.js", {
          exists: Boolean(drawer),
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
      return drawer;
    };

    const drawer = ensureDrawer();
    if (!drawer) return;

    const syncNavToggleState = (isOpen) => {
      navToggles.forEach((navtoggle) => {
        navtoggle.setAttribute("aria-expanded", String(isOpen));
        if (navtoggle.dataset.iconToggle === "true") {
          navtoggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
          const icon = navtoggle.querySelector("span[aria-hidden='true']");
          if (icon) {
            icon.textContent = isOpen ? "✕" : "☰";
          }
        } else {
          navtoggle.textContent = isOpen ? "Close" : "Menu";
        }
      });
    };

    const openDrawer = () => {
      updateCompactClasses();
      drawer.hidden = false;
      drawer.classList.add("is-open");
      document.body.classList.add("mobile-menu-open");
      syncNavToggleState(true);
      if (debugNav) {
        console.log("[nav]", "drawer opened from app.js", {
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
    };

    const closeDrawer = (reason = "close") => {
      drawer.classList.remove("is-open");
      drawer.hidden = true;
      document.body.classList.remove("mobile-menu-open");
      syncNavToggleState(false);
      if (debugNav) {
        console.log("[nav]", "drawer closed from app.js", {
          reason,
          hidden: drawer.hidden,
          className: drawer.className,
        });
      }
    };

    if (debugNav) console.log("[nav]", "drawer binding from app.js");

    navToggles.forEach((navtoggle) => {
      if (navtoggle.dataset.mobileDrawerBound === "true") return;
      navtoggle.dataset.mobileDrawerBound = "true";
      navtoggle.addEventListener("click", (event) => {
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
  }

  if (document.documentElement.dataset.topbarBubbles !== "true") {
    document.documentElement.dataset.topbarBubbles = "true";
    const getTopbarBubble = (btn) => {
      const bubbleId = btn.getAttribute("aria-controls");
      const bubble = bubbleId ? siteHeader.querySelector(`#${bubbleId}`) : null;
      return bubble?.classList.contains("topbar__bubble") ? bubble : null;
    };
    const bubbleButtons = Array.from(siteHeader.querySelectorAll(".topbar__icon"))
      .filter((btn) => getTopbarBubble(btn));

    const closeAll = () => {
      bubbleButtons.forEach((btn) => {
        const bubble = getTopbarBubble(btn);
        btn.setAttribute("aria-expanded", "false");
        if (bubble) {
          bubble.classList.remove("is-open");
          bubble.setAttribute("aria-hidden", "true");
        }
      });
    };

    bubbleButtons.forEach((btn) => {
      const bubble = getTopbarBubble(btn);
      if (!bubble) return;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = btn.getAttribute("aria-expanded") === "true";
        closeAll();
        if (!isOpen) {
          btn.setAttribute("aria-expanded", "true");
          bubble.classList.add("is-open");
          bubble.setAttribute("aria-hidden", "false");
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (!siteHeader.contains(e.target)) closeAll();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });
  }
}

function setIntroState() {
  if (!stage) return;
  stage.classList.add("is-intro");
  stage.classList.remove("is-ready", "is-controls");

  if (prefersReducedMotion()) {
    stage.classList.add("is-ready", "is-controls");
    stage.classList.remove("is-intro");
    document.documentElement.classList.add("reduced-motion");
    revealDeferredHomeHeroContent();
    return;
  }

  document.documentElement.classList.remove("reduced-motion");

  const introDelay = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--intro-delay"), 10) || 1800;
  const cardDelay = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--intro-card"), 10) || 900;
  const controlsDelay = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--intro-controls"), 10) || 700;

  setTimeout(() => {
    stage.classList.add("is-ready");
    revealDeferredHomeHeroContent();
    setTimeout(() => {
      stage.classList.add("is-controls");
    }, controlsDelay);
  }, introDelay + cardDelay);
}

function revealDeferredHomeHeroContent(root = document) {
  const heroContent = root.querySelector(".home-hero-media__content[hidden]");
  if (!heroContent) return;
  heroContent.hidden = false;
}

function syncDeferredHomeHeroContent(route, root = document) {
  if (route !== "home") return;
  if (!stage?.classList.contains("is-ready")) return;
  revealDeferredHomeHeroContent(root);
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
  if (fromIndex === toIndex) return "forward";
  return toIndex > fromIndex ? "forward" : "backward";
}

let currentRoute = getRouteFromLocation();
let isTransitioning = false;

async function renderRouteIntoCurrent(route) {
  cleanupProcessPage();
  syncRouteBodyClasses(route);
  await ensureRouteAssets(route);
  const payload = await loadRoute(route, app);
  syncStageShell(route, payload?.shell);
  syncHeaderNavState(route);
  updateSeoForRoute(payload?.seo, route);
  initObfuscatedPhoneLinks(document);
  if (route === "gallery") {
    await initializeGalleryProjectCards(app || document);
  }
  if (route === "process") {
    initProcessPage(app || document);
  }
  syncHomeHeroPriority(route);
  if (route === "financing") {
    window.initHearthCalculator?.();
  }
  /*
  if (route === "design") {
    designToolModulePromise?.then((module) => {
      module.initDesignTool?.(app || document);
    });
  }
  */
  currentRoute = route;
  syncHeaderHeight();
  syncDeferredHomeHeroContent(route, app || document);
  applyTestimonialSizing(app || document);
  updateHomeFitScale();
  initHomeTestimonialsMobileRotator();
}

function setStageTransitioning(active) {
  isTransitioning = active;
  document.body.classList.toggle("is-stage-transitioning", active);
}

function waitForCardTransformEnd() {
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
    const onEnd = (e) => {
      if (e.propertyName !== "transform") return;
      finish();
    };
    stageCard.addEventListener("transitionend", onEnd);

    const style = getComputedStyle(stageCard);
    const parseTime = (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      if (trimmed.endsWith("ms")) return parseFloat(trimmed);
      if (trimmed.endsWith("s")) return parseFloat(trimmed) * 1000;
      return 0;
    };
    const durations = style.transitionDuration.split(",").map(parseTime);
    const delays = style.transitionDelay.split(",").map(parseTime);
    const maxTransitionMs = durations.reduce((max, duration, index) => {
      const delay = delays[index] ?? delays[delays.length - 1] ?? 0;
      return Math.max(max, duration + delay);
    }, 0);
    const fallbackTimer = window.setTimeout(finish, Math.max(700, maxTransitionMs + 120));
  });
}

async function slideCardNavigate(route, dir) {
  if (isTransitioning) return;
  if (!stage || !stageCard) return;

  if (prefersReducedMotion()) {
    await renderRouteIntoCurrent(route);
    history.pushState({ route }, "", routeToPath(route));
    return;
  }

  setStageTransitioning(true);

  const slideOutClass = dir === "right" ? "slide-out-left" : "slide-out-right";
  const slideInClass = dir === "right" ? "slide-in-from-right" : "slide-in-from-left";

  try {
    stage.classList.add("is-sliding", "stage-prep");
    stage.classList.remove("slide-out-left", "slide-out-right", "slide-in-from-left", "slide-in-from-right");
    stageCard.getBoundingClientRect();
    stage.classList.remove("stage-prep");
    stage.classList.add(slideOutClass);

    await waitForCardTransformEnd();

    // Apply route-scoped body classes BEFORE injecting new HTML so page-specific
    // padding (e.g. Gunite) is correct on first paint during the transition.
    syncRouteBodyClasses(route);
    await ensureRouteAssets(route);
    cleanupProcessPage();
    const payload = await loadRoute(route, app);
    syncStageShell(route, payload?.shell);
    syncHeaderNavState(route);
    updateSeoForRoute(payload?.seo, route);
    initObfuscatedPhoneLinks(document);
    if (route === "gallery") {
      await initializeGalleryProjectCards(app || document);
    }
    if (route === "process") {
      initProcessPage(app || document);
    }
    if (route === "financing") {
      window.initHearthCalculator?.();
    }
    /*
    if (route === "design") {
      designToolModulePromise?.then((module) => {
        module.initDesignTool?.(app || document);
      });
    }
    */
    currentRoute = route;
    history.pushState({ route }, "", routeToPath(route));
    syncHeaderHeight();
    syncDeferredHomeHeroContent(route, app || document);
    applyTestimonialSizing(app || document);
    updateHomeFitScale();
    initHomeTestimonialsMobileRotator();

    stage.classList.add("stage-prep");
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
}

async function navigate(route) {
  await renderRouteIntoCurrent(route);
}

function onNavClick(e) {
  const a = e.target.closest("a");
  if (!a) return;
if (a.pathname.startsWith("/privacy-policy/")) {
  return;
}
  if (a.hasAttribute("download")) return;
  if (a.target && a.target.toLowerCase() === "_blank") return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

  let route = a.getAttribute("data-nav");
  if (!route) {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    route = getRouteFromHref(a.href);
  }
  if (!route) return;
  e.preventDefault();

  if (siteHeader?.contains(a) && a.classList.contains("brand")) {
    animateHeaderBrandPress(a);
  }

  if (siteHeader?.contains(a) && a.closest("#site-nav")) {
    animateSiteNavLinkPress(a);
  }

  if (route === currentRoute) return;
  const direction = getDirection(currentRoute, route);
  slideCardNavigate(route, direction === "forward" ? "right" : "left");
}

function onStageControl(direction) {
  const next = getNextRoute(direction);
  if (next === currentRoute) return;
  slideCardNavigate(next, direction > 0 ? "right" : "left");
}

async function boot() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const isStandalonePage = path === "/privacy-policy";

  initBackgroundVideoGate();

  await injectPartials();
  initObfuscatedPhoneLinks(document);

  syncHeaderHeight();

  window.addEventListener("resize", () => {
    syncHeaderHeight();
    updateHomeFitScale();
    initHomeTestimonialsMobileRotator();
  });

  if (window.ResizeObserver && siteHeader) {
    const headerResizeObserver = new ResizeObserver(() => {
      syncHeaderHeight();
      updateHomeFitScale();
    });

    headerResizeObserver.observe(siteHeader);
  }

  window.addEventListener("DOMContentLoaded", updateHomeFitScale);

  setIntroState();

  const wakeVideo = () => startBackgroundVideo();

  ["pointerdown", "touchstart", "keydown", "scroll"].forEach((eventName) => {
    window.addEventListener(eventName, wakeVideo, {
      once: true,
      passive: true,
    });
  });

  /*
    Standalone pages:
    - Keep the shared header/background behavior
    - Do not allow SPA routing to replace the page content
    - Do not call loadRoute()
  */
  if (isStandalonePage) {
    document.body.classList.remove("is-home");

    if (stage) {
      stage.classList.add("stage--static");
      stage.classList.add("is-ready");
      stage.classList.add("is-controls");
      stage.classList.remove(
        "is-intro",
        "is-sliding",
        "stage-prep",
        "slide-out-left",
        "slide-out-right",
        "slide-in-from-left",
        "slide-in-from-right"
      );
    }

    syncHeaderHeight();
    applyTestimonialSizing(document);
    updateHomeFitScale();

    startBackgroundVideoAfterInitialPaint();

    return;
  }

  /*
    SPA navigation only
  */

  document.addEventListener("click", onNavClick);

  if (prevButton) {
    prevButton.addEventListener("click", () => onStageControl(-1));
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => onStageControl(1));
  }

  document.addEventListener("keydown", (e) => {
    if (e.target?.closest?.(".process-row__slideshow")) return;
    if (e.key === "ArrowLeft") onStageControl(-1);
    if (e.key === "ArrowRight") onStageControl(1);
  });

  // Initial route load
  const initialRoute = getRouteFromLocation();

  await renderRouteIntoCurrent(initialRoute);

  const expectedPath = routeToPath(currentRoute);

  if (location.pathname !== expectedPath || location.hash) {
    history.replaceState(
      { route: currentRoute },
      "",
      expectedPath
    );
  }

  startBackgroundVideoAfterInitialPaint();

  // Browser history navigation
  window.addEventListener("popstate", async () => {
    const nextRoute = getRouteFromLocation();
    await navigate(nextRoute);
  });
}

boot();
