import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

let activeScrollFrame = null;
let activeScrollCleanup = null;

function stopAnimatedScroll() {
    if (activeScrollFrame !== null) cancelAnimationFrame(activeScrollFrame);
    activeScrollFrame = null;
    activeScrollCleanup?.();
    activeScrollCleanup = null;
}

/**
 * Animates the document scroll position with a predictable easing curve.
 * This avoids browser-dependent behavior from CSSOM's native smooth scrolling.
 */
function animateWindowScroll(targetY, requestedDuration) {
    stopAnimatedScroll();

    const root = document.documentElement;
    const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    const destination = Math.min(maxScroll, Math.max(0, targetY));
    const startY = window.scrollY || root.scrollTop || 0;
    const distance = destination - startY;

    if (Math.abs(distance) < 1) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        && document.documentElement.dataset.motion !== 'full';
    const duration = requestedDuration ?? (reducedMotion
        ? 220
        : Math.min(1250, Math.max(620, Math.abs(distance) * 0.62)));
    const startTime = performance.now();

    const cancelOnUserInput = (event) => {
        if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
        stopAnimatedScroll();
    };

    window.addEventListener('wheel', cancelOnUserInput, { passive: true });
    window.addEventListener('touchstart', cancelOnUserInput, { passive: true });
    window.addEventListener('pointerdown', cancelOnUserInput, { passive: true });
    window.addEventListener('keydown', cancelOnUserInput);

    activeScrollCleanup = () => {
        window.removeEventListener('wheel', cancelOnUserInput);
        window.removeEventListener('touchstart', cancelOnUserInput);
        window.removeEventListener('pointerdown', cancelOnUserInput);
        window.removeEventListener('keydown', cancelOnUserInput);
    };

    const easeInOutCubic = (progress) => (progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2);

    const step = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = easeInOutCubic(progress);
        const nextY = startY + distance * eased;

        // The document uses scroll-behavior:auto; this frame-by-frame update is
        // the sole animation, avoiding nested native smooth-scroll animations.
        window.scrollTo(0, nextY);

        if (progress < 1) {
            activeScrollFrame = requestAnimationFrame(step);
        } else {
            activeScrollFrame = null;
            activeScrollCleanup?.();
            activeScrollCleanup = null;
        }
    };

    activeScrollFrame = requestAnimationFrame(step);
}

/** Resets the viewport on route changes and adds motion-aware content reveals. */
export function PageEffects() {
    const location = useLocation();

    useEffect(() => {
        const previousRestoration = window.history.scrollRestoration;
        window.history.scrollRestoration = 'manual';
        return () => { window.history.scrollRestoration = previousRestoration; };
    }, []);

    useLayoutEffect(() => {
        if (location.hash) {
            let targetId = location.hash.slice(1);
            try { targetId = decodeURIComponent(targetId); } catch { /* Keep malformed hash literal. */ }
            const target = document.getElementById(targetId);
            if (target) {
                const top = window.scrollY + target.getBoundingClientRect().top - 88;
                animateWindowScroll(top);
            } else {
                animateWindowScroll(0);
            }
        } else {
            animateWindowScroll(0);
        }

        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.focus({ preventScroll: true });
    }, [location.pathname, location.hash]);

    useEffect(() => {
        const handleAnchorClick = (event) => {
            const link = event.target.closest?.('a[href^="#"]');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            let targetId = href.slice(1);
            try { targetId = decodeURIComponent(targetId); } catch { /* Keep malformed hash literal. */ }
            const target = document.getElementById(targetId);
            if (!target) return;

            event.preventDefault();
            window.history.pushState(null, '', `#${encodeURIComponent(targetId)}`);
            const top = window.scrollY + target.getBoundingClientRect().top - 88;
            animateWindowScroll(top);
        };

        document.addEventListener('click', handleAnchorClick);
        return () => document.removeEventListener('click', handleAnchorClick);
    }, []);

    useEffect(() => {
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            && document.documentElement.dataset.motion !== 'full';
        if (reducedMotion || !('IntersectionObserver' in window)) return undefined;

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

    return (
        <button
            type="button"
            className={`scroll-to-top ${visible ? 'scroll-to-top-visible' : ''}`}
            onClick={() => animateWindowScroll(0)}
            aria-label="Scroll smoothly to top"
            title="Scroll to top"
            tabIndex={visible ? 0 : -1}
        >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
        </button>
    );
}


/**
 * A lightweight progress indicator for the public homepage. It reflects the
 * actual document scroll position and does not take control of scrolling.
 */
export function ScrollProgressIndicator() {
    const location = useLocation();
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (location.pathname !== '/') {
            setProgress(0);
            return undefined;
        }

        let frame = null;
        const update = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                const root = document.documentElement;
                const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
                const current = window.scrollY || root.scrollTop || 0;
                setProgress(maxScroll > 0 ? Math.min(1, Math.max(0, current / maxScroll)) : 0);
                frame = null;
            });
        };

        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });
        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [location.pathname]);

    if (location.pathname !== '/') return null;

    return (
        <div
            className="scroll-progress-track"
            role="progressbar"
            aria-label="Homepage scroll progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
        >
            <span className="scroll-progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
    );
}
