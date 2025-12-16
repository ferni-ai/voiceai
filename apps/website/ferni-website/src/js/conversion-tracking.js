/**
 * Conversion Tracking
 *
 * Comprehensive event tracking for landing page experiments.
 * Tracks user interactions and behavior signals to measure
 * experiment success.
 *
 * Goals tracked:
 * - cta_click: Primary CTA button clicks
 * - scroll_50/75/90: Scroll depth milestones
 * - time_30s/60s/120s: Time on page milestones
 * - team_click: Team member card interactions
 * - pricing_click: Pricing section interactions
 * - phone_click: Phone number clicks
 * - signup: Form submissions
 *
 * @module conversion-tracking
 */

(function () {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let maxScrollDepth = 0;
  let scrollMilestones = { 50: false, 75: false, 90: false };
  let timeMilestones = { 30: false, 60: false, 120: false };
  let hasInteracted = false;
  let pageLoadTime = Date.now();

  // ============================================================================
  // TRACKING HELPERS
  // ============================================================================

  /**
   * Track a conversion event for all active experiments
   */
  function trackConversion(goalId, value) {
    if (typeof window.FerniExperiments === 'undefined') {
      console.warn('[Tracking] FerniExperiments not loaded');
      return;
    }

    window.FerniExperiments.trackConversionForAll(goalId, value);

    // Also send to Google Analytics if available
    if (typeof gtag === 'function') {
      gtag('event', goalId, {
        event_category: 'experiment',
        value: value,
      });
    }
  }

  /**
   * Track a single event (for specific experiment)
   */
  function trackEvent(experimentId, goalId, value) {
    if (typeof window.FerniExperiments === 'undefined') {
      console.warn('[Tracking] FerniExperiments not loaded');
      return;
    }

    window.FerniExperiments.trackConversion(experimentId, goalId, value);
  }

  // ============================================================================
  // CTA TRACKING
  // ============================================================================

  function initCTATracking() {
    // Primary CTA buttons
    document.querySelectorAll('.hero__cta a, .nav__cta, .btn--primary').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        const href = btn.getAttribute('href') || '';
        const isAppLink = href.includes('app.ferni.ai');
        const isPhoneLink = href.startsWith('tel:');

        if (isAppLink) {
          trackConversion('cta_click', 1);
          console.log('[Tracking] CTA click tracked');
        } else if (isPhoneLink) {
          trackConversion('phone_click', 1);
          console.log('[Tracking] Phone click tracked');
        }
      });
    });

    // Secondary CTAs
    document.querySelectorAll('.btn--secondary').forEach(function (btn) {
      btn.addEventListener('click', function () {
        trackConversion('secondary_cta_click', 1);
      });
    });

    // Mobile CTA
    var mobileCTA = document.querySelector('.mobile-cta a');
    if (mobileCTA) {
      mobileCTA.addEventListener('click', function () {
        trackConversion('mobile_cta_click', 1);
        trackConversion('cta_click', 1);
      });
    }
  }

  // ============================================================================
  // SCROLL TRACKING
  // ============================================================================

  function initScrollTracking() {
    var throttled = false;

    window.addEventListener(
      'scroll',
      function () {
        if (throttled) return;
        throttled = true;

        setTimeout(function () {
          throttled = false;
        }, 100);

        var scrollTop = window.scrollY || document.documentElement.scrollTop;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        var scrollPercent = Math.round((scrollTop / docHeight) * 100);

        if (scrollPercent > maxScrollDepth) {
          maxScrollDepth = scrollPercent;

          // Track milestones
          if (scrollPercent >= 50 && !scrollMilestones[50]) {
            scrollMilestones[50] = true;
            trackConversion('scroll_50', 1);
            console.log('[Tracking] Scroll 50% tracked');
          }

          if (scrollPercent >= 75 && !scrollMilestones[75]) {
            scrollMilestones[75] = true;
            trackConversion('scroll_75', 1);
            console.log('[Tracking] Scroll 75% tracked');
          }

          if (scrollPercent >= 90 && !scrollMilestones[90]) {
            scrollMilestones[90] = true;
            trackConversion('scroll_90', 1);
            console.log('[Tracking] Scroll 90% tracked');
          }
        }
      },
      { passive: true }
    );
  }

  // ============================================================================
  // TIME ON PAGE TRACKING
  // ============================================================================

  function initTimeTracking() {
    // 30 seconds
    setTimeout(function () {
      if (!timeMilestones[30]) {
        timeMilestones[30] = true;
        trackConversion('time_30s', 1);
        console.log('[Tracking] Time 30s tracked');
      }
    }, 30000);

    // 60 seconds
    setTimeout(function () {
      if (!timeMilestones[60]) {
        timeMilestones[60] = true;
        trackConversion('time_60s', 1);
        console.log('[Tracking] Time 60s tracked');
      }
    }, 60000);

    // 120 seconds (2 minutes)
    setTimeout(function () {
      if (!timeMilestones[120]) {
        timeMilestones[120] = true;
        trackConversion('time_120s', 1);
        console.log('[Tracking] Time 120s tracked');
      }
    }, 120000);
  }

  // ============================================================================
  // SECTION INTERACTION TRACKING
  // ============================================================================

  function initSectionTracking() {
    // Team section clicks
    document.querySelectorAll('.team-card, .persona-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var personaId = card.getAttribute('data-persona') || 'unknown';
        trackConversion('team_click', 1);
        trackEvent('team-showcase', 'team_click_' + personaId, 1);
        console.log('[Tracking] Team click:', personaId);
      });
    });

    // Pricing section clicks
    document.querySelectorAll('.pricing-card, .pricing-tier').forEach(function (card) {
      card.addEventListener('click', function () {
        var tier = card.getAttribute('data-tier') || 'unknown';
        trackConversion('pricing_click', 1);
        trackEvent('pricing', 'pricing_click_' + tier, 1);
        console.log('[Tracking] Pricing click:', tier);
      });
    });

    // FAQ interactions
    document.querySelectorAll('.faq-item, .accordion-item').forEach(function (item) {
      item.addEventListener('click', function () {
        trackConversion('faq_click', 1);
        console.log('[Tracking] FAQ click');
      });
    });

    // Testimonial interactions
    document.querySelectorAll('.testimonial-card').forEach(function (card) {
      card.addEventListener('click', function () {
        trackConversion('testimonial_click', 1);
      });
    });
  }

  // ============================================================================
  // ENGAGEMENT TRACKING
  // ============================================================================

  function initEngagementTracking() {
    // First interaction
    document.addEventListener(
      'click',
      function () {
        if (!hasInteracted) {
          hasInteracted = true;
          trackConversion('first_interaction', 1);
          console.log('[Tracking] First interaction');
        }
      },
      { once: true }
    );

    // Video plays
    document.querySelectorAll('video').forEach(function (video) {
      video.addEventListener('play', function () {
        trackConversion('video_play', 1);
      });
    });

    // External link clicks
    document.querySelectorAll('a[href^="http"]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (!href.includes('ferni.ai')) {
        link.addEventListener('click', function () {
          trackConversion('external_link_click', 1);
        });
      }
    });
  }

  // ============================================================================
  // FORM TRACKING
  // ============================================================================

  function initFormTracking() {
    // Newsletter signup
    document.querySelectorAll('form[data-form="newsletter"]').forEach(function (form) {
      form.addEventListener('submit', function () {
        trackConversion('newsletter_signup', 1);
        console.log('[Tracking] Newsletter signup');
      });
    });

    // Contact forms
    document.querySelectorAll('form[data-form="contact"]').forEach(function (form) {
      form.addEventListener('submit', function () {
        trackConversion('contact_form', 1);
      });
    });

    // Email input focus (intent signal)
    document.querySelectorAll('input[type="email"]').forEach(function (input) {
      input.addEventListener(
        'focus',
        function () {
          trackConversion('email_focus', 1);
          console.log('[Tracking] Email input focus');
        },
        { once: true }
      );
    });
  }

  // ============================================================================
  // VISIBILITY TRACKING
  // ============================================================================

  function initVisibilityTracking() {
    // Track when key sections become visible
    if ('IntersectionObserver' in window) {
      var sectionObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var sectionId = entry.target.id || entry.target.className.split(' ')[0];
              trackConversion('section_view_' + sectionId, 1);
              sectionObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );

      // Observe key sections
      ['#team', '#pricing', '#faq', '#testimonials', '.two-am'].forEach(function (selector) {
        var el = document.querySelector(selector);
        if (el) {
          sectionObserver.observe(el);
        }
      });
    }
  }

  // ============================================================================
  // PAGE EXIT TRACKING
  // ============================================================================

  function initExitTracking() {
    // Track time on page and scroll depth when leaving
    window.addEventListener('beforeunload', function () {
      var timeOnPage = Math.round((Date.now() - pageLoadTime) / 1000);

      // Final scroll depth
      if (typeof window.FerniExperiments !== 'undefined') {
        // Use sendBeacon for reliability
        var events = [
          {
            experimentId: 'all',
            eventType: 'engagement',
            goalId: 'final_scroll_depth',
            value: maxScrollDepth,
          },
          {
            experimentId: 'all',
            eventType: 'engagement',
            goalId: 'time_on_page',
            value: timeOnPage,
          },
        ];

        navigator.sendBeacon(
          'https://app.ferni.ai/api/v1/public/experiments/track/batch',
          JSON.stringify({ events: events })
        );
      }
    });

    // Track bounce (leaving within 10 seconds without interaction)
    setTimeout(function () {
      if (!hasInteracted) {
        trackConversion('potential_bounce', 1);
      }
    }, 10000);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    initCTATracking();
    initScrollTracking();
    initTimeTracking();
    initSectionTracking();
    initEngagementTracking();
    initFormTracking();
    initVisibilityTracking();
    initExitTracking();

    console.log('%c📊 Ferni Conversion Tracking loaded', 'color: #4a6741; font-weight: bold;');
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for debugging
  window.FerniTracking = {
    trackConversion: trackConversion,
    trackEvent: trackEvent,
    getStats: function () {
      return {
        maxScrollDepth: maxScrollDepth,
        scrollMilestones: scrollMilestones,
        timeMilestones: timeMilestones,
        hasInteracted: hasInteracted,
        timeOnPage: Math.round((Date.now() - pageLoadTime) / 1000),
      };
    },
  };
})();
