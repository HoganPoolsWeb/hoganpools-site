const INTERVAL_MS = 5000;
const slideshowCleanups = new WeakMap();
const toggleCleanups = new WeakMap();
const activeProcessCleanups = new Set();

function isInDocument(element) {
  return element?.isConnected && document.documentElement.contains(element);
}

function parseDurationMs(value) {
  const trimmed = value.trim();
  if (!trimmed) return 750;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return 750;
  return trimmed.includes("ms") ? parsed : parsed * 1000;
}

function initSlideshow(slideshowEl) {
  if (slideshowCleanups.has(slideshowEl)) return;

  const slides = Array.from(slideshowEl.querySelectorAll(".process-row__slide"));
  const dots = Array.from(slideshowEl.querySelectorAll(".process-row__dot"));
  let current = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  let animating = false;
  let timer = 0;
  let transitionTimer = 0;
  let observer = null;
  const controller = new AbortController();
  const { signal } = controller;

  const clearAnimationClasses = (slide) => {
    slide.classList.remove(
      "is-entering",
      "is-entering-left",
      "is-exiting",
      "is-exiting-right"
    );
  };

  const updateDots = (index) => {
    dots.forEach((dot, i) => {
      const active = i === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
    });
  };

  const setActiveSlide = (index) => {
    slides.forEach((slide, i) => {
      clearAnimationClasses(slide);
      slide.classList.toggle("is-active", i === index);
    });
    updateDots(index);
    current = index;
  };

  const stopTimer = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  const startTimer = () => {
    if (slides.length < 2 || !isInDocument(slideshowEl)) return;
    stopTimer();
    timer = window.setInterval(nextSlide, INTERVAL_MS);
  };

  const clearTransitionTimer = () => {
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = 0;
    }
  };

  function finishTransition(oldSlide, newSlide, next) {
    if (!isInDocument(slideshowEl)) return;
    clearAnimationClasses(oldSlide);
    clearAnimationClasses(newSlide);
    newSlide.classList.add("is-active");
    current = next;
    animating = false;
  }

  function goTo(next, direction = "forward") {
    if (animating || next === current || next < 0 || next >= slides.length) return;
    if (!isInDocument(slideshowEl)) return;

    animating = true;

    const oldSlide = slides[current];
    const newSlide = slides[next];
    const enterClass = direction === "forward" ? "is-entering" : "is-entering-left";
    const exitClass = direction === "forward" ? "is-exiting" : "is-exiting-right";

    clearTransitionTimer();
    slides.forEach(clearAnimationClasses);

    oldSlide.classList.remove("is-active");
    newSlide.classList.remove("is-active");
    newSlide.classList.add(enterClass);
    oldSlide.classList.add(exitClass);

    updateDots(next);

    const durationMs = parseDurationMs(
      getComputedStyle(newSlide).getPropertyValue("--wipe-duration")
    );
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTransitionTimer();
      newSlide.removeEventListener("animationend", onAnimEnd);
      finishTransition(oldSlide, newSlide, next);
    };

    function onAnimEnd(event) {
      if (!newSlide.contains(event.target) && event.target !== newSlide) return;
      settle();
    }

    newSlide.addEventListener("animationend", onAnimEnd, { once: true, signal });
    transitionTimer = window.setTimeout(settle, durationMs + 100);
  }

  function nextSlide() {
    goTo((current + 1) % slides.length, "forward");
  }

  function previousSlide() {
    goTo((current - 1 + slides.length) % slides.length, "backward");
  }

  const cleanup = () => {
    stopTimer();
    clearTransitionTimer();
    observer?.disconnect();
    controller.abort();
    slides.forEach(clearAnimationClasses);
    slideshowCleanups.delete(slideshowEl);
    activeProcessCleanups.delete(cleanup);
  };

  slideshowCleanups.set(slideshowEl, cleanup);
  activeProcessCleanups.add(cleanup);

  if (!slideshowEl.hasAttribute("tabindex")) {
    slideshowEl.setAttribute("tabindex", "0");
  }

  if (!slides.length) return;
  setActiveSlide(current);
  if (slides.length < 2) return;

  dots.forEach((dot, index) => {
    dot.addEventListener(
      "click",
      () => {
        if (animating) return;
        stopTimer();
        goTo(index, index > current ? "forward" : "backward");
        startTimer();
      },
      { signal }
    );
  });

  slideshowEl.addEventListener("mouseenter", stopTimer, { signal });
  slideshowEl.addEventListener("mouseleave", startTimer, { signal });
  slideshowEl.addEventListener("focusin", stopTimer, { signal });
  slideshowEl.addEventListener("focusout", startTimer, { signal });
  slideshowEl.addEventListener(
    "keydown",
    (event) => {
      if (animating) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        stopTimer();
        nextSlide();
        startTimer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        stopTimer();
        previousSlide();
        startTimer();
      }
    },
    { signal }
  );

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          startTimer();
        } else {
          stopTimer();
        }
      });
    },
    { threshold: 0.5 }
  );
  observer.observe(slideshowEl);
}

function initProcessStepToggle(button) {
  if (toggleCleanups.has(button)) return;

  const card = button.closest(".process-step");
  const detailsId = button.getAttribute("aria-controls");
  const details = detailsId ? card?.querySelector(`#${CSS.escape(detailsId)}`) : null;
  if (!card || !details) return;

  const controller = new AbortController();
  const cleanup = () => {
    controller.abort();
    toggleCleanups.delete(button);
    activeProcessCleanups.delete(cleanup);
  };

  button.addEventListener(
    "click",
    () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      details.hidden = expanded;
      card.classList.toggle("is-open", !expanded);
    },
    { signal: controller.signal }
  );

  toggleCleanups.set(button, cleanup);
  activeProcessCleanups.add(cleanup);
}

export function cleanupProcessPage() {
  Array.from(activeProcessCleanups).forEach((cleanup) => cleanup());
}

export function initProcessPage(root = document) {
  const processRoot = root.matches?.(".process-page")
    ? root
    : root.querySelector?.(".process-page");
  if (!processRoot) return;

  processRoot
    .querySelectorAll(".process-row__slideshow")
    .forEach((slideshowEl) => initSlideshow(slideshowEl));

  processRoot
    .querySelectorAll(".process-step__toggle")
    .forEach((button) => initProcessStepToggle(button));
}
