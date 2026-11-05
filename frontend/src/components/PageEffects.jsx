import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Resets the viewport on route changes and adds subtle, motion-aware reveals. */
export function PageEffects() {
  const location = useLocation();

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';

    if (location.hash) {
      let targetId = location.hash.slice(1);
      try { targetId = decodeURIComponent(targetId); } catch { /* Keep the literal hash when it is malformed. */ }
      const target = document.getElementById(targetId);
      if (target) target.scrollIntoView({ behavior, block: 'start' });
      else window.scrollTo({ top: 0, left: 0, behavior });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior });
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.focus({ preventScroll: true });
  }, [location.key, location.hash]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return undefined;

    const selector = [
      '.marketing-section', '.marketing-benefit-card', '.marketing-audience-grid > article',
      '.marketing-process-section', '.marketing-final-cta', '.marketing-story-panel',
      '.marketing-values-grid > article', '.marketing-feature-row', '.marketing-step',
      '.marketing-contact-card', '.marketing-faq-item', '.workspace-hero',
      '.workspace-widget', '.next-step-strip', '.course-card', '.upload-form-card',
      '.guidelines-card', '.permission-card', '.page-lead',
    ].join(',');
    const elements = [...document.querySelectorAll(selector)];
    if (!elements.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });

    elements.forEach((element) => {
      element.classList.add('reveal-on-scroll');
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove('reveal-on-scroll', 'is-visible'));
    };
  }, [location.pathname]);

  return null;
}

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 420);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  function scrollToTop() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      className={`scroll-to-top ${visible ? 'scroll-to-top-visible' : ''}`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
      tabIndex={visible ? 0 : -1}
    >
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
