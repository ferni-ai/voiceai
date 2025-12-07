/**
 * Scroll Reveal Animations
 * Uses Intersection Observer for performant scroll-triggered animations
 */

(function() {
  'use strict';

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion) {
    // If user prefers reduced motion, show all elements immediately
    document.querySelectorAll('.reveal, .reveal-fade-up, .reveal-scale, .reveal-left, .reveal-right, .reveal-blur')
      .forEach(el => el.classList.add('revealed'));
    return;
  }

  // Intersection Observer configuration
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px', // Trigger slightly before element enters viewport
    threshold: 0.1
  };

  // Create observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Optionally unobserve after revealing (better performance)
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Initialize on DOM ready
  function init() {
    // Select all elements with reveal classes
    const revealElements = document.querySelectorAll(
      '.reveal, .reveal-fade-up, .reveal-scale, .reveal-left, .reveal-right, .reveal-blur, .hero-text-reveal'
    );

    revealElements.forEach(el => {
      observer.observe(el);
    });

    // Log initialization
    if (window.console && revealElements.length > 0) {
      console.log(`[Animations] Observing ${revealElements.length} elements for reveal`);
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-initialize if new content is added dynamically
  window.initRevealAnimations = init;

})();

