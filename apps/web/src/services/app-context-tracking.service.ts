/**
 * App Context Tracking Service
 *
 * 🧠 BETTER THAN HUMAN: Voice ↔ App Sync
 *
 * Tracks user activity in the app and sends it to the backend so that
 * the voice agent knows what the user was just doing. This creates a
 * seamless experience where Ferni "remembers" what you were looking at.
 *
 * Example: User browses Goals dashboard → starts voice call →
 *          Ferni says "I see you were looking at your goals. Want to talk about them?"
 *
 * Privacy: Only tracks screen names and high-level interactions.
 * No keystroke logging, no content capture.
 */

import { apiPost, getUserId } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AppContextTracking');

/**
 * Get user ID for context tracking.
 * Returns null if not authenticated (events will be skipped).
 */
function getTrackingUserId(): string | null {
  return getUserId();
}

// ============================================================================
// TYPES
// ============================================================================

export type ScreenName =
  | 'home'
  | 'conversation'
  | 'your-story'
  | 'goals'
  | 'habits'
  | 'calendar'
  | 'relationships'
  | 'insights'
  | 'settings'
  | 'team'
  | 'marketplace'
  | 'profile'
  | 'engagement'
  | 'rituals'
  | 'predictions'
  | 'journal'
  | 'voice-journal'
  | 'trust-dashboard'
  | 'cognitive-insights'
  | 'life-context'
  | 'digital-twin'
  | 'other';

export interface Interaction {
  element: string;
  action: 'tap' | 'click' | 'swipe' | 'long-press' | 'scroll' | 'expand' | 'collapse';
  value?: string;
}

interface QueuedEvent {
  type: 'screen_view' | 'interaction' | 'browsing_batch';
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// STATE
// ============================================================================

// Queue events for batching (reduce API calls)
let eventQueue: QueuedEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let currentScreen: ScreenName = 'home';
let currentSessionId: string | null = null;

// Debounce config
const FLUSH_DELAY_MS = 5000; // Batch events every 5 seconds
const MAX_QUEUE_SIZE = 20;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the app context tracking service.
 * Call this once at app startup.
 */
export function initAppContextTracking(sessionId?: string): void {
  currentSessionId = sessionId || null;
  log.debug('App context tracking initialized', { sessionId });

  // Set up page visibility tracking
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Flush remaining events before page unload
  window.addEventListener('beforeunload', () => flushEvents());
}

/**
 * Set the current voice session ID.
 * Events will be associated with this session for context bridging.
 */
export function setSessionId(sessionId: string | null): void {
  currentSessionId = sessionId;
  log.debug('Session ID updated', { sessionId });
}

/**
 * Track a screen view.
 * Call this when the user navigates to a new screen/view.
 */
export function trackScreenView(screenName: ScreenName): void {
  if (screenName === currentScreen) return; // Skip duplicate
  currentScreen = screenName;

  queueEvent({
    type: 'screen_view',
    payload: { screenName },
    timestamp: Date.now(),
  });

  log.debug('Screen view tracked', { screenName });
}

/**
 * Track a user interaction.
 * Call this for significant interactions (button taps, card expansions, etc.)
 */
export function trackInteraction(interaction: Interaction): void {
  queueEvent({
    type: 'interaction',
    payload: {
      element: interaction.element,
      action: interaction.action,
      value: interaction.value,
    },
    timestamp: Date.now(),
  });

  log.debug('Interaction tracked', interaction);
}

/**
 * Track a browsing summary.
 * Use this for summarizing a browsing session (e.g., "user looked at 3 goals").
 */
export function trackBrowsingSummary(summary: string, details?: Record<string, unknown>): void {
  queueEvent({
    type: 'browsing_batch',
    payload: {
      summary,
      ...details,
    },
    timestamp: Date.now(),
  });

  log.debug('Browsing summary tracked', { summary });
}

/**
 * Force flush all queued events immediately.
 * Call this before starting a voice call to ensure context is available.
 */
export async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return;

  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  const events = [...eventQueue];
  eventQueue = [];

  await sendBatchedEvents(events);
}

/**
 * Get the current screen name.
 */
export function getCurrentScreen(): ScreenName {
  return currentScreen;
}

/**
 * Clean up and stop tracking.
 */
export function disposeAppContextTracking(): void {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  void flushEvents();
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

function queueEvent(event: QueuedEvent): void {
  eventQueue.push(event);

  // Flush immediately if queue is full
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    void flushEvents();
    return;
  }

  // Schedule a delayed flush
  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      void flushEvents();
    }, FLUSH_DELAY_MS);
  }
}

async function sendBatchedEvents(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Get user ID - skip if not authenticated
  const userId = getTrackingUserId();
  if (!userId) {
    log.debug('Skipping context events - user not authenticated');
    return;
  }

  // Group by type for efficient API calls
  const screenViews = events.filter((e) => e.type === 'screen_view');
  const interactions = events.filter((e) => e.type === 'interaction');
  const browsing = events.filter((e) => e.type === 'browsing_batch');

  try {
    // Send screen views (last one is most relevant)
    // Backend expects: { userId, screenName, durationSeconds }
    if (screenViews.length > 0) {
      const lastView = screenViews[screenViews.length - 1];
      const firstView = screenViews[0];
      if (lastView && firstView) {
        const durationSeconds = Math.round((lastView.timestamp - firstView.timestamp) / 1000);
        
        await apiPost('/api/context/screen-view', {
          userId,
          screenName: lastView.payload.screenName as string,
          durationSeconds: Math.max(1, durationSeconds), // At least 1 second
        });
      }
    }

    // Send interactions as browsing context
    // Backend expects: { userId, screens, interactions }
    if (interactions.length > 0) {
      // Convert interactions to the format backend expects
      const interactionStrings = interactions
        .slice(-10) // Last 10 interactions
        .map((i) => `${i.payload.action} on ${i.payload.element}${i.payload.value ? `: ${i.payload.value}` : ''}`);

      await apiPost('/api/context/browsing', {
        userId,
        screens: [], // No screen data in this batch
        interactions: interactionStrings,
      });
    }

    // Send browsing batches
    // Backend expects: { userId, screens, interactions }
    for (const batch of browsing) {
      await apiPost('/api/context/browsing', {
        userId,
        screens: [], // Browsing summaries don't have screen data
        interactions: [batch.payload.summary as string], // Summary as an interaction
      });
    }

    log.debug('Events flushed successfully', {
      screenViews: screenViews.length,
      interactions: interactions.length,
      browsing: browsing.length,
    });
  } catch (err) {
    log.warn('Failed to send context events', { error: String(err) });
    // Don't re-queue - events are best-effort
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    // User is leaving - flush immediately
    void flushEvents();
  }
}

// ============================================================================
// AUTO-TRACKING HELPERS
// ============================================================================

/**
 * Create a click handler that tracks interactions.
 * Use with UI elements that should be tracked.
 *
 * @example
 * button.addEventListener('click', withTracking('goal-card', 'tap', 'career-goal'));
 */
export function withTracking(
  element: string,
  action: Interaction['action'],
  value?: string
): (event: Event) => void {
  return () => {
    trackInteraction({ element, action, value });
  };
}

/**
 * Higher-order function to wrap a callback with tracking.
 *
 * @example
 * const handleClick = trackAndCall('goal-card', 'tap', () => openGoalDetail());
 */
export function trackAndCall<T extends (...args: unknown[]) => unknown>(
  element: string,
  action: Interaction['action'],
  callback: T,
  value?: string
): T {
  return ((...args: unknown[]) => {
    trackInteraction({ element, action, value });
    return callback(...args);
  }) as T;
}

export default {
  init: initAppContextTracking,
  setSessionId,
  trackScreenView,
  trackInteraction,
  trackBrowsingSummary,
  flushEvents,
  getCurrentScreen,
  dispose: disposeAppContextTracking,
  withTracking,
  trackAndCall,
};
