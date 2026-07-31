// /js/router.js
export const ROUTES = {
  home: "home",
  process: "process",
  gallery: "gallery",
  // design: "design",
  about: "about",
  faq: "faq",
  financing: "financing",
  careers: "careers",
};

const ROUTE_PATHS = {
  home: "/",
  process: "/our-process/",
  gallery: "/gallery/",
  // design: "/design/",
  about: "/about-us/",
  faq: "/faq/",
  financing: "/financing/",
  careers: "/careers/",
};

const PATH_ROUTES = {
  "/": "home",
  "/our-process/": "process",
  "/gallery/": "gallery",
  // "/design/": "design",
  "/about-us/": "about",
  "/faq/": "faq",
  "/financing/": "financing",
  "/careers/": "careers",
};

function normalizePath(pathname = "/") {
  const base = pathname.trim() || "/";
  if (base === "/") return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export function routeToPath(route) {
  return ROUTE_PATHS[route] || "/";
}

export function getRouteFromHref(href) {
  try {
    const u = new URL(href, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return PATH_ROUTES[normalizePath(u.pathname)] || null;
  } catch {
    return null;
  }
}

export function getRouteFromLocation() {
  const hash = (location.hash || "").replace(/^#/, "");
  if (ROUTES[hash]) return hash;

  const byPath = PATH_ROUTES[normalizePath(location.pathname)];
  if (byPath) return byPath;

  return "home";
}

function parseRouteDocument(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function getRouteContentRoot(doc) {
  return doc.getElementById("app") || doc.querySelector(".stage__content");
}

function getMetaContent(doc, selector) {
  return doc.querySelector(selector)?.getAttribute("content") || "";
}

function getRouteSeo(doc, fallbackUrl) {
  return {
    title: doc.title || "",
    description: getMetaContent(doc, 'meta[name="description"]'),
    robots: getMetaContent(doc, 'meta[name="robots"]'),
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || fallbackUrl,
    ogType: getMetaContent(doc, 'meta[property="og:type"]'),
    ogSiteName: getMetaContent(doc, 'meta[property="og:site_name"]'),
    ogTitle: getMetaContent(doc, 'meta[property="og:title"]'),
    ogDescription: getMetaContent(doc, 'meta[property="og:description"]'),
    ogUrl: getMetaContent(doc, 'meta[property="og:url"]'),
    ogImage: getMetaContent(doc, 'meta[property="og:image"]'),
    twitterCard: getMetaContent(doc, 'meta[name="twitter:card"]'),
    twitterTitle: getMetaContent(doc, 'meta[name="twitter:title"]'),
    twitterDescription: getMetaContent(doc, 'meta[name="twitter:description"]'),
    twitterImage: getMetaContent(doc, 'meta[name="twitter:image"]'),
    jsonLd: Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((script) => script.textContent || ""),
  };
}

function getRouteShell(doc, contentRoot) {
  return {
    bodyClassName: doc.body?.className || "",
    stageClassName: doc.querySelector(".stage")?.className || "",
    contentClassName: contentRoot?.className || "",
  };
}

export async function loadRoute(route, mountEl) {
  const url = routeToPath(route);
  const res = await fetch(url, { cache: "no-store" });
  const targetEl = mountEl || document.getElementById("app");
  if (!res.ok) {
    if (targetEl) {
      targetEl.innerHTML = `<div class="container"><h1>Not found</h1><p>Missing: ${url}</p></div>`;
    }
    return null;
  }

  const html = await res.text();
  const doc = parseRouteDocument(html);
  const contentRoot = getRouteContentRoot(doc);
  if (!contentRoot) {
    if (targetEl) {
      targetEl.innerHTML = `<div class="container"><h1>Not found</h1><p>Missing route content for: ${url}</p></div>`;
    }
    return null;
  }

  contentRoot.querySelectorAll("script").forEach((script) => script.remove());

  if (targetEl) {
    targetEl.innerHTML = contentRoot.innerHTML;
  }

  return {
    html,
    url,
    seo: getRouteSeo(doc, url),
    shell: getRouteShell(doc, contentRoot),
  };
}
