(() => {
  const AUTO_ADVANCE_MS = 4600;
  const FADE_MS = 900;

  const initGalleryProjectCard = (root) => {
    if (!root || root.dataset.galleryCardInitialized === 'true') {
      return () => {};
    }

    const hero = root.querySelector('.gallery-project-card__hero');
    const heroImg = root.querySelector('.gallery-project-card__hero img');
    const thumbs = Array.from(root.querySelectorAll('.gallery-project-card__grid img'));
    if (!hero || !heroImg || thumbs.length === 0) {
      return () => {};
    }

    const slides = thumbs.map((thumb) => ({
      src: thumb.dataset.fullSrc || thumb.getAttribute('src') || thumb.src || '',
      srcset: thumb.dataset.fullSrcset || thumb.getAttribute('srcset') || '',
      sizes: thumb.dataset.fullSizes || heroImg.getAttribute('sizes') || '',
      orientation: thumb.dataset.orientation || '',
      alt: thumb.getAttribute('alt') || heroImg.getAttribute('alt') || '',
      thumb,
    })).filter((slide) => Boolean(slide.src));

    if (slides.length === 0) {
      return () => {};
    }

    root.dataset.galleryCardInitialized = 'true';
    heroImg.style.transition = `opacity ${FADE_MS}ms ease`;

    const requestFullscreen = (element) => {
      const request = element.requestFullscreen || element.webkitRequestFullscreen;
      if (!request) return Promise.reject(new Error('Fullscreen is unavailable'));
      return request.call(element);
    };

    const exitFullscreen = () => {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exit) return Promise.resolve();
      return exit.call(document);
    };

    const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

    const unlockOrientation = () => {
      try {
        screen.orientation?.unlock?.();
      } catch {
        // Orientation unlock is best-effort and browser-dependent.
      }
    };

    const lockLandscape = async () => {
      try {
        await screen.orientation?.lock?.('landscape');
      } catch {
        // Some mobile browsers do not allow programmatic orientation lock.
      }
    };

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'gallery-project-card__fullscreen';
    fullscreenButton.setAttribute('aria-label', 'View image fullscreen');
    fullscreenButton.innerHTML = `
      <span class="gallery-project-card__fullscreen-icon" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </span>
      <span class="sr-only">View image fullscreen</span>
    `;
    hero.append(fullscreenButton);

    const onFullscreenClick = async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        if (getFullscreenElement() === hero) {
          await exitFullscreen();
          unlockOrientation();
          return;
        }

        await requestFullscreen(hero);
        await lockLandscape();
      } catch {
        // Fullscreen/orientation support varies; leave the normal gallery usable.
      }
    };

    fullscreenButton.addEventListener('click', onFullscreenClick);

    let currentIndex = Math.max(
      0,
      slides.findIndex((slide) => slide.src === (heroImg.getAttribute('src') || heroImg.src || '')),
    );
    let timerId = null;
    let transitionToken = 0;

    const waitForHeroOpacityTransition = (token) => new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        heroImg.removeEventListener('transitionend', onEnd);
        window.clearTimeout(fallbackTimer);
        resolve();
      };
      const onEnd = (event) => {
        if (event.propertyName !== 'opacity') return;
        finish();
      };

      heroImg.addEventListener('transitionend', onEnd);
      const fallbackTimer = window.setTimeout(finish, FADE_MS + 120);

      if (token !== transitionToken) {
        finish();
      }
    });

    const isHeroFullscreen = () => getFullscreenElement() === hero;

    const applyHeroSlide = (slide) => {
      if (isHeroFullscreen()) {
        heroImg.setAttribute('sizes', '100vw');
        heroImg.setAttribute('srcset', `${slide.src} 1440w`);
      } else {
        if (slide.sizes) heroImg.setAttribute('sizes', slide.sizes);
        if (slide.srcset) {
          heroImg.setAttribute('srcset', slide.srcset);
        } else {
          heroImg.removeAttribute('srcset');
        }
      }
      heroImg.setAttribute('src', slide.src);
      heroImg.setAttribute('alt', slide.alt);
      setHeroOrientation(slide.orientation);
    };

    const setHeroOrientation = (orientation) => {
      heroImg.classList.toggle('is-portrait', orientation === 'portrait');
      heroImg.classList.toggle('is-landscape', orientation === 'landscape');
      heroImg.classList.toggle('is-square', orientation === 'square');
    };

    const setActiveThumb = () => {
      slides.forEach((slide, index) => {
        const isActive = index === currentIndex;
        slide.thumb.classList.toggle('is-active', isActive);
        slide.thumb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const syncHero = (index, { immediate = false } = {}) => {
      const slide = slides[index];
      if (!slide) return;

      currentIndex = index;
      setActiveThumb();

      if ((heroImg.getAttribute('src') || heroImg.src || '') === slide.src) {
        applyHeroSlide(slide);
        heroImg.setAttribute('alt', slide.alt);
        return;
      }

      if (immediate) {
        applyHeroSlide(slide);
        heroImg.style.opacity = '1';
        return;
      }

      const token = ++transitionToken;
      heroImg.style.opacity = '0';

      waitForHeroOpacityTransition(token).then(() => {
        if (token !== transitionToken) return;
        applyHeroSlide(slide);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (token !== transitionToken) return;
            heroImg.style.opacity = '1';
          });
        });
      });
    };

    const onFullscreenChange = () => {
      const isFullscreen = isHeroFullscreen();
      fullscreenButton.classList.toggle('is-fullscreen', isFullscreen);
      fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen image' : 'View image fullscreen');
      applyHeroSlide(slides[currentIndex]);
      if (!isFullscreen) {
        unlockOrientation();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    const stopAutoAdvance = () => {
      if (timerId) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const startAutoAdvance = () => {
      stopAutoAdvance();
      if (slides.length < 2 || document.hidden) return;
      timerId = window.setInterval(() => {
        syncHero((currentIndex + 1) % slides.length);
      }, AUTO_ADVANCE_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopAutoAdvance();
        return;
      }
      startAutoAdvance();
    };

    const thumbHandlers = slides.map((slide, index) => {
      slide.thumb.style.cursor = 'pointer';
      slide.thumb.tabIndex = 0;

      const onClick = (event) => {
        event.preventDefault();
        stopAutoAdvance();
        syncHero(index);
        startAutoAdvance();
      };

      const onKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        stopAutoAdvance();
        syncHero(index);
        startAutoAdvance();
      };

      slide.thumb.addEventListener('click', onClick);
      slide.thumb.addEventListener('keydown', onKeyDown);
      return { thumb: slide.thumb, onClick, onKeyDown };
    });

    document.addEventListener('visibilitychange', onVisibilityChange);

    syncHero(currentIndex, { immediate: true });
    startAutoAdvance();

    return () => {
      stopAutoAdvance();
      transitionToken += 1;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      fullscreenButton.removeEventListener('click', onFullscreenClick);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      fullscreenButton.remove();
      thumbHandlers.forEach(({ thumb, onClick, onKeyDown }) => {
        thumb.removeEventListener('click', onClick);
        thumb.removeEventListener('keydown', onKeyDown);
      });
      delete root.dataset.galleryCardInitialized;
    };
  };

  window.HoganPoolsGalleryProjectCard = {
    init: initGalleryProjectCard,
  };

  const autoInit = () => {
    const localCard = document.querySelector('.gallery-project-card');
    if (localCard) {
      initGalleryProjectCard(localCard);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit, { once: true });
  } else {
    autoInit();
  }
})();
