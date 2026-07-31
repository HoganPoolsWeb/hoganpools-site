(() => {
  const AUTO_ADVANCE_MS = 4600;
  const FADE_MS = 900;

  const initGalleryProjectCard = (root) => {
    if (!root || root.dataset.galleryCardInitialized === 'true') {
      return () => {};
    }

    const heroImg = root.querySelector('.gallery-project-card__hero img');
    const thumbs = Array.from(root.querySelectorAll('.gallery-project-card__grid img'));
    if (!heroImg || thumbs.length === 0) {
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

    const applyHeroSlide = (slide) => {
      if (slide.sizes) heroImg.setAttribute('sizes', slide.sizes);
      if (slide.srcset) heroImg.setAttribute('srcset', slide.srcset);
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
        heroImg.setAttribute('alt', slide.alt);
        setHeroOrientation(slide.orientation);
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
