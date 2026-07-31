const BG_VIDEO_BASELINE_SRC = "/assets/video/water720p-baseline.mp4";
const BG_VIDEO_DEFAULT_SRC = "/assets/video/water720p.mp4";
const BG_VIDEO_QUERY = "(min-width: 920px)";
const READY_TIMEOUT_MS = 3000;
const WATCHDOG_MS = 3000;

const videoStates = new WeakMap();
let lifecycleListenersBound = false;
let responsiveModeListenerBound = false;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function shouldUseBackgroundVideo() {
  return window.matchMedia?.(BG_VIDEO_QUERY)?.matches ?? true;
}

function normalizeUrl(src) {
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function getSourceCandidates() {
  return [BG_VIDEO_DEFAULT_SRC, BG_VIDEO_BASELINE_SRC];
}

function getState(video) {
  let state = videoStates.get(video);
  if (state) return state;

  state = {
    sourceIndex: 0,
    playAttemptId: 0,
    playPromise: null,
    readyPromise: null,
    autoplayRejected: false,
    watchdogTimer: 0,
    readyTimer: 0,
    warned: new Set(),
  };
  videoStates.set(video, state);
  return state;
}

function warnOnce(state, key, message, detail) {
  if (state.warned.has(key)) return;
  state.warned.add(key);
  if (detail) {
    console.warn(message, detail);
  } else {
    console.warn(message);
  }
}

function ensureAttributes(video) {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
}

function useStaticBackgroundOnly(root = document) {
  const bg = root.querySelector?.(".bg") || document.querySelector(".bg");
  bg?.classList.remove("is-video-ready");
  document.documentElement.classList.add("bg-ready");
}

function setVideoSource(video, src) {
  const state = getState(video);
  const desired = normalizeUrl(src);
  const current = video.currentSrc || video.src || video.querySelector("source")?.src || "";
  const existingSource = video.querySelector('source[type="video/mp4"]');

  if (normalizeUrl(current) === desired && existingSource) return false;

  let source = existingSource;
  if (!source) {
    source = document.createElement("source");
    source.type = "video/mp4";
    source.media = BG_VIDEO_QUERY;
    video.appendChild(source);
  }

  if (normalizeUrl(source.getAttribute("src") || "") === desired) return false;

  source.setAttribute("src", src);
  source.setAttribute("media", BG_VIDEO_QUERY);
  Array.from(video.querySelectorAll('source[type="video/mp4"]'))
    .slice(1)
    .forEach((extraSource) => extraSource.remove());
  state.playAttemptId += 1;
  state.playPromise = null;
  state.autoplayRejected = false;
  showPoster(video);
  video.load();
  return true;
}

function ensureSource(video) {
  const state = getState(video);
  const candidates = getSourceCandidates();
  const sourceIndex = Math.min(state.sourceIndex, candidates.length - 1);
  state.sourceIndex = sourceIndex;
  return setVideoSource(video, candidates[sourceIndex]);
}

function reveal(video) {
  video.closest(".bg")?.classList.add("is-video-ready");
}

function showPoster(video) {
  video.closest(".bg")?.classList.remove("is-video-ready");
}

function waitForReadiness(video) {
  const state = getState(video);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve(true);
  }
  if (state.readyPromise) return state.readyPromise;

  if (video.error) {
    warnOnce(state, "media-error", "Background video media error.", video.error);
    return Promise.resolve(false);
  }

  state.readyPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(state.readyTimer);
      state.readyTimer = 0;
      events.forEach((eventName) => video.removeEventListener(eventName, onReady));
      failureEvents.forEach((eventName) => video.removeEventListener(eventName, onFailure));
      state.readyPromise = null;
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onFailure = (event) => {
      warnOnce(state, `media-${event.type}`, `Background video ${event.type}.`);
      showPoster(video);
      finish(false);
    };
    const events = ["loadedmetadata", "loadeddata", "canplay"];
    const failureEvents = ["error", "stalled", "abort"];

    events.forEach((eventName) => video.addEventListener(eventName, onReady, { once: true }));
    failureEvents.forEach((eventName) => video.addEventListener(eventName, onFailure, { once: true }));
    state.readyTimer = window.setTimeout(() => finish(false), READY_TIMEOUT_MS);
  });
  return state.readyPromise;
}

function armWatchdog(video) {
  const state = getState(video);
  if (state.watchdogTimer) {
    window.clearTimeout(state.watchdogTimer);
    state.watchdogTimer = 0;
  }

  const startTime = video.currentTime || 0;
  state.watchdogTimer = window.setTimeout(() => {
    state.watchdogTimer = 0;
    if (document.hidden || video.paused || video.ended) return;

    const progressed = (video.currentTime || 0) > startTime + 0.05;
    if (!progressed && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      showPoster(video);
      tryNextSource(video, "watchdog");
    }
  }, WATCHDOG_MS);
}

function tryNextSource(video, reason) {
  const state = getState(video);
  const candidates = getSourceCandidates();
  if (state.sourceIndex >= candidates.length - 1) {
    warnOnce(state, `source-exhausted-${reason}`, "Background video could not recover playback.");
    return false;
  }

  state.sourceIndex += 1;
  state.autoplayRejected = false;
  setVideoSource(video, candidates[state.sourceIndex]);
  startBackgroundVideo(video, { force: true });
  return true;
}

function bindElementListeners(video) {
  if (video.dataset.bgLifecycleBound === "true") return;
  video.dataset.bgLifecycleBound = "true";

  video.addEventListener("playing", () => {
    getState(video).autoplayRejected = false;
    reveal(video);
  });

  video.addEventListener("timeupdate", () => {
    if (!video.paused && !video.ended && video.currentTime > 0) {
      reveal(video);
    }
  });

  video.addEventListener("waiting", () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      showPoster(video);
    }
  });

  video.addEventListener("emptied", () => {
    showPoster(video);
  });

  video.addEventListener("abort", () => {
    showPoster(video);
  });

  video.addEventListener("error", () => {
    showPoster(video);
    tryNextSource(video, "error");
  });

  video.addEventListener("stalled", () => {
    showPoster(video);
  });
}

function bindGlobalLifecycle() {
  if (lifecycleListenersBound) return;
  lifecycleListenersBound = true;

  window.addEventListener("pageshow", () => {
    initBackgroundVideo(document, { attemptPlayback: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    initBackgroundVideo(document, { attemptPlayback: true });
  });
}

function bindResponsiveModeListener() {
  if (responsiveModeListenerBound) return;
  responsiveModeListenerBound = true;

  const query = window.matchMedia?.(BG_VIDEO_QUERY);
  if (!query) return;

  const onModeChange = (event) => {
    if (event.matches) {
      initBackgroundVideo(document, { attemptPlayback: true });
      return;
    }

    const video = document.querySelector(".bg__video");
    if (video) {
      const state = getState(video);
      state.autoplayRejected = false;
      if (state.watchdogTimer) {
        window.clearTimeout(state.watchdogTimer);
        state.watchdogTimer = 0;
      }
      try {
        video.pause();
      } catch {
        // Ignore pause failures while switching to the static background.
      }
    }
    useStaticBackgroundOnly(document);
  };

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onModeChange);
  } else if (typeof query.addListener === "function") {
    query.addListener(onModeChange);
  }
}

export function initBackgroundVideo(root = document, options = {}) {
  bindResponsiveModeListener();
  if (!shouldUseBackgroundVideo()) {
    useStaticBackgroundOnly(root);
    return null;
  }

  const video = root.matches?.(".bg__video")
    ? root
    : root.querySelector?.(".bg__video") || document.querySelector(".bg__video");
  if (!video) return null;

  ensureAttributes(video);
  ensureSource(video);
  bindElementListeners(video);
  bindGlobalLifecycle();

  document.documentElement.classList.add("bg-ready");
  waitForReadiness(video);

  if (options.attemptPlayback) {
    startBackgroundVideo(video);
  }

  return video;
}

export function startBackgroundVideo(video = null, options = {}) {
  if (!shouldUseBackgroundVideo()) {
    useStaticBackgroundOnly(document);
    return Promise.resolve(false);
  }

  video = video || document.querySelector(".bg__video");
  if (!video || !video.isConnected || prefersReducedMotion()) return Promise.resolve(false);

  initBackgroundVideo(video);

  const state = getState(video);
  if (!options.force && state.autoplayRejected) return Promise.resolve(false);
  if (!video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (video.currentTime > 0) {
      reveal(video);
    }
    return Promise.resolve(true);
  }
  if (state.playPromise) return state.playPromise;

  const playAttemptId = state.playAttemptId + 1;
  state.playAttemptId = playAttemptId;

  try {
    state.playPromise = video.play();
  } catch (error) {
    if (state.playAttemptId === playAttemptId) {
      state.autoplayRejected = true;
    }
    showPoster(video);
    warnOnce(state, "play-throw", "Background video playback could not start.", error);
    if (state.playAttemptId === playAttemptId) {
      state.playPromise = null;
    }
    return Promise.resolve(false);
  }

  if (!state.playPromise || typeof state.playPromise.then !== "function") {
    state.playPromise = null;
    return Promise.resolve(true);
  }

  armWatchdog(video);
  state.playPromise = state.playPromise
    .then(() => {
      if (!video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        reveal(video);
      }
      if (state.playAttemptId === playAttemptId) {
        state.autoplayRejected = false;
      }
      return true;
    })
    .catch((error) => {
      if (state.playAttemptId === playAttemptId) {
        state.autoplayRejected = true;
      }
      showPoster(video);
      warnOnce(state, "autoplay-rejected", "Background video autoplay was rejected.", error);
      return false;
    })
    .finally(() => {
      if (state.playAttemptId === playAttemptId) {
        state.playPromise = null;
      }
    });

  return state.playPromise;
}

export function retryBackgroundVideoPlayback() {
  if (!shouldUseBackgroundVideo()) {
    useStaticBackgroundOnly(document);
    return;
  }

  const video = document.querySelector(".bg__video");
  if (!video) return;

  const state = getState(video);
  state.autoplayRejected = false;
  startBackgroundVideo(video, { force: true });
}
