/**
 * Experiments Service (Frontend)
 *
 * Client-side A/B testing service for web experiments.
 * Handles variant assignment, exposure tracking, and conversion tracking.
 *
 * Usage:
 * ```typescript
 * import { experiments } from './services/experiments.service.js';
 *
 * // Get variant for an experiment
 * const variant = await experiments.getVariant('hero-test-2024');
 * if (variant === 'treatment') {
 *   showNewHero();
 * } else {
 *   showOriginalHero();
 * }
 *
 * // Track conversion
 * experiments.trackConversion('hero-test-2024', 'cta_click');
 * ```
 *
 * @module services/experiments
 */

import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('Experiments');

// ============================================================================
// TYPES
// ============================================================================

interface CachedAssignment {
  experimentId: string;
  variantId: string;
  assignedAt: number;
}

interface TrackingEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  eventType: 'exposure' | 'conversion';
  goalId?: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = '/api/v1/public/experiments';
const STORAGE_KEY = 'ferni_experiments';
const USER_ID_KEY = 'ferni_user_id';

// Event queue for batch sending
let eventQueue: TrackingEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_QUEUE_SIZE = 20;

// ============================================================================
// USER ID MANAGEMENT
// ============================================================================

/**
 * Get or create a persistent user ID for experiment tracking
 */
function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    // Generate a random ID
    userId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

/**
 * Set a known user ID (e.g., after authentication)
 */
function setUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

// ============================================================================
// ASSIGNMENT CACHE
// ============================================================================

/**
 * Get cached assignments from localStorage
 */
function getCachedAssignments(): Map<string, CachedAssignment> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    log.warn('Failed to parse cached experiments', e);
  }
  return new Map();
}

/**
 * Save assignment to cache
 */
function cacheAssignment(assignment: CachedAssignment): void {
  try {
    const cache = getCachedAssignments();
    cache.set(assignment.experimentId, assignment);

    const obj: Record<string, CachedAssignment> = {};
    cache.forEach((value, key) => {
      obj[key] = value;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    log.warn('Failed to cache experiment assignment', e);
  }
}

// ============================================================================
// VARIANT ASSIGNMENT
// ============================================================================

/**
 * Get variant for an experiment
 * Returns null if user is not in the experiment
 */
async function getVariant(
  experimentId: string,
  options?: {
    skipExposure?: boolean; // Don't auto-track exposure
    context?: {
      device?: 'mobile' | 'tablet' | 'desktop';
      source?: string;
      country?: string;
    };
  }
): Promise<string | null> {
  const userId = getUserId();

  // Check cache first
  const cache = getCachedAssignments();
  const cached = cache.get(experimentId);

  if (cached) {
    log.debug(`Using cached variant for ${experimentId}: ${cached.variantId}`);

    // Track exposure (unless skipped)
    if (!options?.skipExposure) {
      queueEvent({
        experimentId,
        variantId: cached.variantId,
        userId,
        eventType: 'exposure',
      });
    }

    return cached.variantId;
  }

  // Fetch from API
  try {
    const params = new URLSearchParams({
      userId,
      isNewUser: cache.size === 0 ? 'true' : 'false',
    });

    if (options?.context?.device) {
      params.set('device', options.context.device);
    }
    if (options?.context?.source) {
      params.set('source', options.context.source);
    }
    if (options?.context?.country) {
      params.set('country', options.context.country);
    }

    const response = await apiGet<{ variantId?: string }>(
      `${API_BASE}/${experimentId}/variant?${params}`
    );

    if (!response.ok || !response.data) {
      log.warn(`Failed to get variant for ${experimentId}:`, response.status);
      return null;
    }

    if (!response.data.variantId) {
      log.debug(`User not in experiment ${experimentId}`);
      return null;
    }

    const data = response.data;

    const variantId = data.variantId ?? '';
    
    // Cache the assignment
    cacheAssignment({
      experimentId,
      variantId,
      assignedAt: Date.now(),
    });

    log.debug(`Assigned to ${experimentId}: ${variantId}`);

    // Track exposure (unless skipped)
    if (!options?.skipExposure) {
      queueEvent({
        experimentId,
        variantId,
        userId,
        eventType: 'exposure',
      });
    }

    return variantId || null;
  } catch (error) {
    log.error(`Error getting variant for ${experimentId}:`, error);
    return null;
  }
}

/**
 * Get multiple variants at once (for pages with multiple experiments)
 */
async function getVariants(
  experimentIds: string[],
  options?: {
    skipExposure?: boolean;
  }
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Fetch all in parallel
  await Promise.all(
    experimentIds.map(async (id) => {
      const variant = await getVariant(id, options);
      results.set(id, variant);
    })
  );

  return results;
}

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Queue an event for batch sending
 */
function queueEvent(event: TrackingEvent): void {
  eventQueue.push(event);

  // Flush if queue is full
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    flushEvents();
  } else if (!flushTimeout) {
    // Schedule flush
    flushTimeout = setTimeout(flushEvents, FLUSH_INTERVAL);
  }
}

/**
 * Flush queued events to server
 */
async function flushEvents(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    const response = await apiPost(`${API_BASE}/track/batch`, { events });

    if (!response.ok) {
      log.warn('Failed to flush events:', response.status);
      // Put events back in queue
      eventQueue = [...events, ...eventQueue];
    } else {
      log.debug(`Flushed ${events.length} experiment events`);
    }
  } catch (error) {
    log.warn('Error flushing events:', error);
    // Put events back in queue
    eventQueue = [...events, ...eventQueue];
  }
}

/**
 * Track an exposure event (user saw the variant)
 * Usually called automatically by getVariant()
 */
function trackExposure(experimentId: string, metadata?: Record<string, unknown>): void {
  const cache = getCachedAssignments();
  const assignment = cache.get(experimentId);

  if (!assignment) {
    log.warn(`Cannot track exposure for ${experimentId}: no assignment found`);
    return;
  }

  queueEvent({
    experimentId,
    variantId: assignment.variantId,
    userId: getUserId(),
    eventType: 'exposure',
    metadata,
  });
}

/**
 * Track a conversion event
 */
function trackConversion(
  experimentId: string,
  goalId: string,
  value?: number,
  metadata?: Record<string, unknown>
): void {
  const cache = getCachedAssignments();
  const assignment = cache.get(experimentId);

  if (!assignment) {
    log.warn(`Cannot track conversion for ${experimentId}: no assignment found`);
    return;
  }

  queueEvent({
    experimentId,
    variantId: assignment.variantId,
    userId: getUserId(),
    eventType: 'conversion',
    goalId,
    value,
    metadata,
  });

  log.debug(`Tracked conversion: ${experimentId} / ${goalId}`);
}

/**
 * Track conversion for all active experiments
 * Useful for global conversion events like signup
 */
function trackConversionForAll(
  goalId: string,
  value?: number,
  metadata?: Record<string, unknown>
): void {
  const cache = getCachedAssignments();

  cache.forEach((assignment) => {
    queueEvent({
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      userId: getUserId(),
      eventType: 'conversion',
      goalId,
      value,
      metadata,
    });
  });

  log.debug(`Tracked conversion "${goalId}" for ${cache.size} experiments`);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if user is in a specific variant
 * Returns false if not in experiment or different variant
 */
function isInVariant(experimentId: string, variantId: string): boolean {
  const cache = getCachedAssignments();
  const assignment = cache.get(experimentId);
  return assignment?.variantId === variantId;
}

/**
 * Get current variant for an experiment (sync, from cache only)
 */
function getCurrentVariant(experimentId: string): string | null {
  const cache = getCachedAssignments();
  const assignment = cache.get(experimentId);
  return assignment?.variantId || null;
}

/**
 * Clear all experiment data (for testing/debugging)
 */
function clearExperiments(): void {
  localStorage.removeItem(STORAGE_KEY);
  eventQueue = [];
  log.info('Cleared experiment data');
}

/**
 * Get device type for targeting
 */
function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Flush events before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0) {
      // Use sendBeacon for reliable delivery
      const data = JSON.stringify({ events: eventQueue });
      navigator.sendBeacon(`${API_BASE}/track/batch`, data);
    }
  });

  // Flush events when page becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && eventQueue.length > 0) {
      flushEvents();
    }
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const experiments = {
  getVariant,
  getVariants,
  trackExposure,
  trackConversion,
  trackConversionForAll,
  isInVariant,
  getCurrentVariant,
  clearExperiments,
  setUserId,
  getUserId,
  getDeviceType,
  flushEvents,
};

export default experiments;
