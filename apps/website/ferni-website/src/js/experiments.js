/**
 * Experiments Service (Landing Page)
 *
 * Lightweight A/B testing for the Ferni landing page.
 * No build step required - vanilla JS.
 *
 * Usage:
 * ```javascript
 * // Get variant
 * const variant = await FerniExperiments.getVariant('hero-test');
 *
 * // Track conversion
 * FerniExperiments.trackConversion('hero-test', 'cta_click');
 * ```
 */

(function () {
  'use strict';

  // Dynamic API base: use relative path for same-domain, full URL for cross-domain
  // On ferni.ai -> /api/landing/experiments (proxied to backend)
  // On app.ferni.ai -> /api/v1/public/experiments
  // On localhost -> /api/landing/experiments
  const getApiBase = () => {
    const hostname = window.location.hostname;
    if (hostname === 'app.ferni.ai') {
      return '/api/v1/public/experiments';
    }
    // For ferni.ai landing page and localhost, use landing API
    return '/api/landing/experiments';
  };
  
  const API_BASE = getApiBase();
  const STORAGE_KEY = 'ferni_experiments';
  const USER_ID_KEY = 'ferni_user_id';

  // Event queue
  let eventQueue = [];
  let flushTimeout = null;
  const FLUSH_INTERVAL = 5000;
  const MAX_QUEUE_SIZE = 20;

  // ============================================================================
  // CONSENT
  // ============================================================================

  // No anonymous ID is made or sent until the visitor accepts the cookie
  // banner (story-brand.njk stores the choice). Before that, getVariant still
  // asks the API so visitors see the same variants, but without a userId, and
  // nothing is cached or tracked.
  function hasConsent() {
    try {
      return localStorage.getItem('ferni_cookies') === 'accepted';
    } catch (e) {
      return false;
    }
  }

  // ============================================================================
  // USER ID
  // ============================================================================

  function getUserId() {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  }

  // ============================================================================
  // CACHE
  // ============================================================================

  function getCache() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  function setCache(experimentId, variantId) {
    try {
      const cache = getCache();
      cache[experimentId] = {
        variantId: variantId,
        assignedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      // eslint-disable-next-line no-console -- report failures in the browser console
      console.warn('[Experiments] Failed to cache:', e);
    }
  }

  // ============================================================================
  // NETWORK TIMING
  // ============================================================================

  // There is no batch variant endpoint, so a page view makes one request per
  // experiment or flag (about a dozen). Hold them until the page has loaded
  // and the main thread is idle, so they never compete with first paint.
  let idlePromise = null;

  function whenIdle() {
    if (idlePromise) return idlePromise;
    idlePromise = new Promise(function (resolve) {
      const schedule = function () {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(resolve, { timeout: 2000 });
        } else {
          setTimeout(resolve, 200);
        }
      };
      if (document.readyState === 'complete') {
        schedule();
      } else {
        window.addEventListener('load', schedule, { once: true });
      }
    });
    return idlePromise;
  }

  // One in-flight request per experiment, shared by every caller.
  const pending = {};

  // ============================================================================
  // VARIANT ASSIGNMENT
  // ============================================================================

  async function getVariant(experimentId, options) {
    options = options || {};
    const consented = hasConsent();
    const userId = consented ? getUserId() : null;

    // Check cache
    const cache = consented ? getCache() : {};
    if (cache[experimentId]) {
      const variantId = cache[experimentId].variantId;

      if (!options.skipExposure) {
        queueEvent(experimentId, variantId, userId, 'exposure');
      }

      return variantId;
    }

    if (!pending[experimentId]) {
      pending[experimentId] = whenIdle().then(function () {
        return fetchVariant(experimentId, userId, cache, consented);
      });
    }
    const variantId = await pending[experimentId];

    // Track exposure
    if (variantId && !options.skipExposure) {
      queueEvent(experimentId, variantId, userId, 'exposure');
    }

    return variantId;
  }

  // `consented` comes from getVariant: it decides whether the assignment is cached.
  async function fetchVariant(experimentId, userId, cache, consented) {
    // Fetch from API
    try {
      const device =
        window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';

      const params = new URLSearchParams({
        isNewUser: Object.keys(cache).length === 0 ? 'true' : 'false',
        device: device,
      });
      if (userId) params.set('userId', userId);

      // Get UTM source if available
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('utm_source');
      if (source) params.set('source', source);

      const response = await fetch(API_BASE + '/' + experimentId + '/variant?' + params);

      if (!response.ok) {
        // 404 is expected when experiment service isn't running - fail silently
        if (response.status !== 404) {
          // eslint-disable-next-line no-console -- report failures in the browser console
          console.warn('[Experiments] Failed to get variant:', response.status);
        }
        return null;
      }

      const data = await response.json();

      if (!data.variantId) {
        return null;
      }

      // Cache assignment
      if (consented) setCache(experimentId, data.variantId);

      return data.variantId;
    } catch (error) {
      // Fail soft: the visitor sees the control experience and the page keeps working.
      // eslint-disable-next-line no-console -- report failures in the browser console
      console.warn('[Experiments] Could not get variant, showing control:', experimentId, error);
      return null;
    }
  }

  // ============================================================================
  // TRACKING
  // ============================================================================

  function queueEvent(experimentId, variantId, userId, eventType, goalId, value) {
    if (!hasConsent()) return;
    eventQueue.push({
      experimentId: experimentId,
      variantId: variantId,
      userId: userId,
      eventType: eventType,
      goalId: goalId,
      value: value,
    });

    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      flushEvents();
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(flushEvents, FLUSH_INTERVAL);
    }
  }

  function flushEvents() {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    if (eventQueue.length === 0) return;

    const events = eventQueue.slice();
    eventQueue = [];

    fetch(API_BASE + '/track/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: events }),
      // Lets a flush started as the page unloads (conversion-tracking.js) finish.
      keepalive: true,
    })
      .then(function (response) {
        if (!response.ok) {
          // eslint-disable-next-line no-console -- report failures in the browser console
          console.warn('[Experiments] Failed to flush events');
          eventQueue = events.concat(eventQueue);
        }
      })
      .catch(function (error) {
        // eslint-disable-next-line no-console -- report failures in the browser console
        console.warn('[Experiments] Error flushing:', error);
        eventQueue = events.concat(eventQueue);
      });
  }

  function trackConversion(experimentId, goalId, value) {
    if (!hasConsent()) return;
    const cache = getCache();
    const assignment = cache[experimentId];

    if (!assignment) {
      // eslint-disable-next-line no-console -- report failures in the browser console
      console.warn('[Experiments] No assignment for:', experimentId);
      return;
    }

    queueEvent(experimentId, assignment.variantId, getUserId(), 'conversion', goalId, value);

  }

  function trackConversionForAll(goalId, value) {
    if (!hasConsent()) return;
    const cache = getCache();
    const userId = getUserId();

    Object.keys(cache).forEach(function (experimentId) {
      queueEvent(experimentId, cache[experimentId].variantId, userId, 'conversion', goalId, value);
    });

  }

  // A visitor's own engagement, outside any experiment (scroll depth, time on
  // page): an `engagement` event under the anonymous id, which the batch route
  // records with no experiment arm. Same consent gate as every other event.
  function trackEngagement(goalId, value) {
    if (!hasConsent()) return;
    queueEvent('all', undefined, getUserId(), 'engagement', goalId, value);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /** True when this visitor has an experiment assignment (kept only after consent). */
  function inAnyExperiment() {
    return Object.keys(getCache()).length > 0;
  }

  function isInVariant(experimentId, variantId) {
    const cache = getCache();
    return cache[experimentId] && cache[experimentId].variantId === variantId;
  }

  function getCurrentVariant(experimentId) {
    const cache = getCache();
    return cache[experimentId] ? cache[experimentId].variantId : null;
  }

  // ============================================================================
  // PAGE LIFECYCLE
  // ============================================================================

  // Flush on page unload
  window.addEventListener('beforeunload', function () {
    if (eventQueue.length > 0) {
      navigator.sendBeacon(API_BASE + '/track/batch', JSON.stringify({ events: eventQueue }));
    }
  });

  // Flush when hidden
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && eventQueue.length > 0) {
      flushEvents();
    }
  });

  // ============================================================================
  // EXPORT
  // ============================================================================

  window.FerniExperiments = {
    getVariant: getVariant,
    trackConversion: trackConversion,
    trackConversionForAll: trackConversionForAll,
    trackEngagement: trackEngagement,
    inAnyExperiment: inAnyExperiment,
    isInVariant: isInVariant,
    getCurrentVariant: getCurrentVariant,
    getUserId: getUserId,
    flushEvents: flushEvents,
  };

})();
