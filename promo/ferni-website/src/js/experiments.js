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
      console.warn('[Experiments] Failed to cache:', e);
    }
  }

  // ============================================================================
  // VARIANT ASSIGNMENT
  // ============================================================================

  async function getVariant(experimentId, options) {
    options = options || {};
    const userId = getUserId();

    // Check cache
    const cache = getCache();
    if (cache[experimentId]) {
      const variantId = cache[experimentId].variantId;
      console.log('[Experiments] Using cached variant:', experimentId, '->', variantId);

      if (!options.skipExposure) {
        queueEvent(experimentId, variantId, userId, 'exposure');
      }

      return variantId;
    }

    // Fetch from API
    try {
      const device =
        window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';

      const params = new URLSearchParams({
        userId: userId,
        isNewUser: Object.keys(cache).length === 0 ? 'true' : 'false',
        device: device,
      });

      // Get UTM source if available
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('utm_source');
      if (source) params.set('source', source);

      const response = await fetch(API_BASE + '/' + experimentId + '/variant?' + params);

      if (!response.ok) {
        console.warn('[Experiments] Failed to get variant:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.variantId) {
        console.log('[Experiments] User not in experiment:', experimentId);
        return null;
      }

      // Cache assignment
      setCache(experimentId, data.variantId);
      console.log('[Experiments] Assigned to:', experimentId, '->', data.variantId);

      // Track exposure
      if (!options.skipExposure) {
        queueEvent(experimentId, data.variantId, userId, 'exposure');
      }

      return data.variantId;
    } catch (error) {
      console.error('[Experiments] Error getting variant:', error);
      return null;
    }
  }

  // ============================================================================
  // TRACKING
  // ============================================================================

  function queueEvent(experimentId, variantId, userId, eventType, goalId, value) {
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
    })
      .then(function (response) {
        if (!response.ok) {
          console.warn('[Experiments] Failed to flush events');
          eventQueue = events.concat(eventQueue);
        } else {
          console.log('[Experiments] Flushed', events.length, 'events');
        }
      })
      .catch(function (error) {
        console.warn('[Experiments] Error flushing:', error);
        eventQueue = events.concat(eventQueue);
      });
  }

  function trackConversion(experimentId, goalId, value) {
    const cache = getCache();
    const assignment = cache[experimentId];

    if (!assignment) {
      console.warn('[Experiments] No assignment for:', experimentId);
      return;
    }

    queueEvent(experimentId, assignment.variantId, getUserId(), 'conversion', goalId, value);

    console.log('[Experiments] Tracked conversion:', experimentId, goalId);
  }

  function trackConversionForAll(goalId, value) {
    const cache = getCache();
    const userId = getUserId();

    Object.keys(cache).forEach(function (experimentId) {
      queueEvent(experimentId, cache[experimentId].variantId, userId, 'conversion', goalId, value);
    });

    console.log('[Experiments] Tracked conversion for all:', goalId);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

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
    isInVariant: isInVariant,
    getCurrentVariant: getCurrentVariant,
    getUserId: getUserId,
    flushEvents: flushEvents,
  };

  console.log('%c🧪 Ferni Experiments loaded', 'color: #4a6741; font-weight: bold;');
})();
