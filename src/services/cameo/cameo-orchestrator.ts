/**
 * Cameo Orchestrator - The Heart of the Team Cameo System
 *
 * Coordinates all aspects of a cameo:
 * 1. State management (who's speaking, cooldowns, history)
 * 2. Voice switching (via PersonaAwareTTS)
 * 3. Event emission (for frontend synchronization)
 * 4. Timing and transitions
 * 5. Safety (max duration, rate limiting)
 *
 * A cameo flow:
 * 1. Request received → validate → emit cameo_starting
 * 2. Play arrival sound → wait
 * 3. Switch voice → emit cameo_started
 * 4. Persona speaks their insight
 * 5. Persona says handback → emit cameo_ending
 * 6. Play return sound → wait
 * 7. Switch voice back → emit cameo_complete
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getUserPreferences, type CameoPreferences } from './cameo-analytics.js';
import { getCameoGreeting, getCameoHandback, getPersonaColor } from './cameo-content.js';
import {
  CAMEO_CONFIG,
  CAMEO_TIMING,
  getPersonaCameoConfig,
  getRemainingCooldown,
  isCooldownExpired,
} from './cameo-timing.js';
import type {
  CameoDataMessage,
  CameoEvent,
  CameoPersonaId,
  CameoRequest,
  CameoResult,
  CameoSessionState,
  CanonicalPersonaId,
} from './types.js';

const log = getLogger();

// Cache user preferences per session to avoid repeated lookups
const sessionPreferencesCache = new Map<string, CameoPreferences>();

// ============================================================================
// EVENT EMITTER
// ============================================================================

/**
 * Event emitter for cameo lifecycle events.
 * Voice agent and frontend subscribe to these events.
 *
 * Events:
 * - 'cameo_starting': Fired when cameo is about to start (frontend visual prep)
 * - 'cameo_started': Fired when cameo has started (voice switch)
 * - 'cameo_ending': Fired when cameo is about to end
 * - 'cameo_complete': Fired when cameo has ended
 * - 'cameo_cancelled': Fired if cameo was cancelled
 * - 'cameoHandlerComplete': Fired by handler when greeting is spoken (for sync waiting)
 */
export const cameoEvents = new EventEmitter();

// Increase max listeners to avoid warnings
cameoEvents.setMaxListeners(20);

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

/**
 * Per-session cameo state storage
 */
const sessionStates = new Map<string, CameoSessionState>();

/**
 * Get or create session state
 */
function getSessionState(sessionId: string): CameoSessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = createInitialSessionState();
    sessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Create initial session state
 */
function createInitialSessionState(): CameoSessionState {
  return {
    isInCameo: false,
    currentCameoPersona: null,
    currentCameoId: null,
    cameoStartTime: null,
    lastCameoEndTime: 0,
    personasWhoCameoed: new Set(),
    totalCameosThisSession: 0,
    cameoHistory: [],
  };
}

/**
 * Reset session state (call on session end)
 * FIX ISSUE #2: Clear maxDurationTimer to prevent timer firing after session cleanup
 */
export function resetSessionState(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    // FIX ISSUE #2: Clear any pending timers before deleting state
    // This prevents the timeout from firing on a cleaned-up session
    const timerState = state as CameoSessionState & { maxDurationTimer?: NodeJS.Timeout };
    if (timerState.maxDurationTimer) {
      clearTimeout(timerState.maxDurationTimer);
      log.debug('Cleared pending cameo maxDurationTimer', { sessionId });
    }
  }
  sessionStates.delete(sessionId);
  sessionPreferencesCache.delete(sessionId); // Clear preferences cache
  log.debug('Cameo session state reset', { sessionId });
}

/**
 * Get current session state (for external inspection)
 */
export function getCameoSessionState(sessionId: string): CameoSessionState | null {
  return sessionStates.get(sessionId) || null;
}

// ============================================================================
// CAMEO EXECUTION
// ============================================================================

/**
 * Execute a team member cameo
 *
 * @param request - The cameo request details
 * @param options - Session context
 * @returns Result of the cameo attempt
 */
export async function executeCameo(
  request: CameoRequest,
  options: {
    sessionId: string;
    userId?: string;
    returnToPersona?: CanonicalPersonaId;
  }
): Promise<CameoResult> {
  const { sessionId, userId, returnToPersona = 'ferni' } = options;
  const state = getSessionState(sessionId);

  log.info('Cameo requested', {
    personaId: request.personaId,
    triggerType: request.triggerType,
    sessionId,
  });

  // ========================================
  // Load user preferences (for frequency adaptation)
  // ========================================

  let userPrefs: CameoPreferences | null = null;
  if (userId) {
    // Check session cache first
    userPrefs = sessionPreferencesCache.get(sessionId) || null;
    if (!userPrefs) {
      try {
        userPrefs = await getUserPreferences(userId);
        sessionPreferencesCache.set(sessionId, userPrefs);
      } catch (e) {
        log.debug({ error: String(e) }, 'Could not load user preferences');
      }
    }
  }

  // ========================================
  // Validation
  // ========================================

  // Check if cameos are enabled
  if (!CAMEO_CONFIG.enabled) {
    return {
      success: false,
      error: 'Cameos are currently disabled',
    };
  }

  // Check if already in a cameo
  if (state.isInCameo) {
    return {
      success: false,
      error: 'A cameo is already in progress',
      personaId: state.currentCameoPersona!,
    };
  }

  // Check session limit (use user preference if available)
  const maxCameos = userPrefs?.maxCameosPerSession ?? CAMEO_CONFIG.maxCameosPerSession;
  if (state.totalCameosThisSession >= maxCameos) {
    return {
      success: false,
      error: 'Maximum cameos reached for this session',
    };
  }

  // Check if user wants to avoid this persona
  if (userPrefs?.avoidPersonas.includes(request.personaId)) {
    log.debug(
      { personaId: request.personaId, userId },
      'Skipping cameo - user prefers to avoid this persona'
    );
    return {
      success: false,
      error: 'User preference: avoiding this persona',
    };
  }

  // Check cooldown (use user preference if available)
  const priority = request.priority || 'normal';
  const minCooldown = userPrefs?.minCooldownMs ?? undefined;
  if (!isCooldownExpired(state.lastCameoEndTime, priority, minCooldown)) {
    const remaining = getRemainingCooldown(state.lastCameoEndTime, priority, minCooldown);
    return {
      success: false,
      error: 'Cameo cooldown active',
      blockedByCooldown: true,
      cooldownRemaining: remaining,
    };
  }

  // ========================================
  // Prepare cameo
  // ========================================

  const cameoId = uuidv4();
  const isFirstCameo = !state.personasWhoCameoed.has(request.personaId);
  const personaConfig = getPersonaCameoConfig(request.personaId);

  // Get greeting and handback
  const greeting = getCameoGreeting(request.personaId, {
    isFirstCameo,
    triggerType: request.triggerType,
    customGreeting: request.customGreeting,
  });

  const handback = getCameoHandback(request.personaId, {
    triggerType: request.triggerType,
    customHandback: request.customHandback,
  });

  // Get voice ID
  const voiceId = getVoiceId(request.personaId);
  const personaName = getPersonaDisplayName(request.personaId);
  const personaColor = getPersonaColor(request.personaId);

  // ========================================
  // Update state
  // ========================================

  state.isInCameo = true;
  state.currentCameoPersona = request.personaId;
  state.currentCameoId = cameoId;
  state.cameoStartTime = Date.now();
  state.personasWhoCameoed.add(request.personaId);
  state.totalCameosThisSession++;

  // Add to history
  state.cameoHistory.push({
    cameoId,
    personaId: request.personaId,
    triggerType: request.triggerType,
    startTime: Date.now(),
    wasFirstCameo: isFirstCameo,
    insight: request.insight,
  });

  // ========================================
  // Emit starting event
  // ========================================

  const startingEvent: CameoEvent = {
    type: 'cameo_starting',
    personaId: request.personaId,
    returnToPersonaId: returnToPersona,
    cameoId,
    sessionId,
    timestamp: Date.now(),
    voiceId,
    greeting,
    insight: request.insight,
    handback,
    triggerType: request.triggerType,
  };

  cameoEvents.emit('cameo_starting', startingEvent);

  log.info('Cameo starting', {
    cameoId,
    personaId: request.personaId,
    isFirstCameo,
    voiceId,
  });

  // ========================================
  // Wait for arrival delay (sound + visual)
  // ========================================

  await sleep(CAMEO_TIMING.ARRIVAL_DELAY);

  // ========================================
  // Emit started event (voice switch happens now)
  // ========================================

  const startedEvent: CameoEvent = {
    ...startingEvent,
    type: 'cameo_started',
    timestamp: Date.now(),
  };

  // FIX: Wait for handler to complete before returning to LLM
  // This prevents race conditions where LLM responds before greeting is spoken
  const CAMEO_HANDLER_TIMEOUT_MS = CAMEO_TIMING.HANDLER_TIMEOUT;

  const handlerCompletePromise = new Promise<{
    success: boolean;
    greetingSpoken: boolean;
    instructionsUpdated: boolean;
    error?: string;
  }>((resolve) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      log.warn(
        { cameoId, personaId: request.personaId },
        '⚠️ Cameo handler timeout - proceeding without confirmation'
      );
      resolve({ success: true, greetingSpoken: false, instructionsUpdated: false });
    }, CAMEO_HANDLER_TIMEOUT_MS);

    // Listen for handler completion
    const onComplete = (completionData: {
      cameoId: string;
      success: boolean;
      greetingSpoken: boolean;
      instructionsUpdated: boolean;
      error?: string;
    }) => {
      if (completionData.cameoId === cameoId) {
        clearTimeout(timeoutId);
        cameoEvents.off('cameoHandlerComplete', onComplete);
        resolve(completionData);
      }
    };

    cameoEvents.on('cameoHandlerComplete', onComplete);
  });

  // Emit the event to trigger the handler
  cameoEvents.emit('cameo_started', startedEvent);

  // Also emit data message for frontend
  const dataMessage: CameoDataMessage = {
    type: 'cameo_start',
    personaId: request.personaId,
    personaName,
    personaColor,
    greeting,
    isFirstCameo,
    voiceId,
    cameoId,
  };

  cameoEvents.emit('cameo_data_message', dataMessage);

  log.info('Cameo started - waiting for handler...', {
    cameoId,
    personaId: request.personaId,
  });

  // Wait for handler to complete
  const handlerResult = await handlerCompletePromise;

  log.info('Cameo handler completed', {
    cameoId,
    personaId: request.personaId,
    handlerResult,
  });

  // ========================================
  // Set up max duration timeout
  // ========================================

  const maxDurationTimer = setTimeout(() => {
    if (state.isInCameo && state.currentCameoId === cameoId) {
      log.warn('Cameo max duration exceeded, forcing end', { cameoId });
      void endCameo(sessionId, cameoId);
    }
  }, CAMEO_CONFIG.maxDurationMs);

  // Store timer reference for cleanup
  (state as CameoSessionState & { maxDurationTimer?: NodeJS.Timeout }).maxDurationTimer =
    maxDurationTimer;

  return {
    success: true,
    personaId: request.personaId,
    greeting,
    insight: request.insight,
    handback,
    // FIX: Include handler result so LLM knows greeting was spoken
    greetingSpoken: handlerResult.greetingSpoken,
    instructionsUpdated: handlerResult.instructionsUpdated,
  };
}

/**
 * End the current cameo and return to host persona
 */
export async function endCameo(sessionId: string, cameoId?: string): Promise<CameoResult> {
  const state = getSessionState(sessionId);

  // Validate
  if (!state.isInCameo) {
    return {
      success: false,
      error: 'No cameo in progress',
    };
  }

  // If cameoId provided, make sure it matches
  if (cameoId && state.currentCameoId !== cameoId) {
    return {
      success: false,
      error: 'Cameo ID mismatch',
    };
  }

  const personaId = state.currentCameoPersona!;
  const actualCameoId = state.currentCameoId!;
  const startTime = state.cameoStartTime!;
  const duration = Date.now() - startTime;

  // Clear max duration timer
  const timerState = state as CameoSessionState & { maxDurationTimer?: NodeJS.Timeout };
  if (timerState.maxDurationTimer) {
    clearTimeout(timerState.maxDurationTimer);
    timerState.maxDurationTimer = undefined;
  }

  log.info('Cameo ending', {
    cameoId: actualCameoId,
    personaId,
    duration,
  });

  // ========================================
  // Emit ending event
  // ========================================

  const endingEvent: CameoEvent = {
    type: 'cameo_ending',
    personaId,
    returnToPersonaId: 'ferni',
    cameoId: actualCameoId,
    sessionId,
    timestamp: Date.now(),
    duration,
  };

  cameoEvents.emit('cameo_ending', endingEvent);

  // ========================================
  // Wait for return delay (sound)
  // ========================================

  await sleep(CAMEO_TIMING.RETURN_DELAY);

  // ========================================
  // Update state
  // ========================================

  state.isInCameo = false;
  state.currentCameoPersona = null;
  state.currentCameoId = null;
  state.cameoStartTime = null;
  state.lastCameoEndTime = Date.now();

  // Update history entry
  const historyEntry = state.cameoHistory.find((h) => h.cameoId === actualCameoId);
  if (historyEntry) {
    historyEntry.endTime = Date.now();
    historyEntry.duration = duration;
  }

  // ========================================
  // Emit complete event
  // ========================================

  const completeEvent: CameoEvent = {
    type: 'cameo_complete',
    personaId,
    returnToPersonaId: 'ferni',
    cameoId: actualCameoId,
    sessionId,
    timestamp: Date.now(),
    duration,
  };

  cameoEvents.emit('cameo_complete', completeEvent);

  // Emit data message for frontend
  const dataMessage: CameoDataMessage = {
    type: 'cameo_complete',
    personaId,
    personaName: getPersonaDisplayName(personaId),
    personaColor: getPersonaColor(personaId),
    cameoId: actualCameoId,
  };

  cameoEvents.emit('cameo_data_message', dataMessage);

  log.info('Cameo complete', {
    cameoId: actualCameoId,
    personaId,
    duration,
  });

  return {
    success: true,
    personaId,
    duration,
  };
}

/**
 * Cancel a cameo in progress
 */
export async function cancelCameo(sessionId: string, reason?: string): Promise<CameoResult> {
  const state = getSessionState(sessionId);

  if (!state.isInCameo) {
    return {
      success: false,
      error: 'No cameo in progress',
    };
  }

  const personaId = state.currentCameoPersona!;
  const cameoId = state.currentCameoId!;
  const duration = state.cameoStartTime ? Date.now() - state.cameoStartTime : 0;

  // Clear max duration timer
  const timerState = state as CameoSessionState & { maxDurationTimer?: NodeJS.Timeout };
  if (timerState.maxDurationTimer) {
    clearTimeout(timerState.maxDurationTimer);
    timerState.maxDurationTimer = undefined;
  }

  // Update state
  state.isInCameo = false;
  state.currentCameoPersona = null;
  state.currentCameoId = null;
  state.cameoStartTime = null;
  state.lastCameoEndTime = Date.now();

  // Emit cancelled event
  const cancelledEvent: CameoEvent = {
    type: 'cameo_cancelled',
    personaId,
    returnToPersonaId: 'ferni',
    cameoId,
    sessionId,
    timestamp: Date.now(),
    duration,
    error: reason,
  };

  cameoEvents.emit('cameo_cancelled', cancelledEvent);

  // Emit data message for frontend
  const dataMessage: CameoDataMessage = {
    type: 'cameo_cancelled',
    personaId,
    personaName: getPersonaDisplayName(personaId),
    personaColor: getPersonaColor(personaId),
    cameoId,
    error: reason,
  };

  cameoEvents.emit('cameo_data_message', dataMessage);

  log.info('Cameo cancelled', {
    cameoId,
    personaId,
    reason,
  });

  return {
    success: true,
    personaId,
    duration,
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Check if a cameo is currently in progress
 */
export function isInCameo(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  return state?.isInCameo || false;
}

/**
 * Get the current cameo persona (if in cameo)
 */
export function getCurrentCameoPersona(sessionId: string): CameoPersonaId | null {
  const state = sessionStates.get(sessionId);
  return state?.currentCameoPersona || null;
}

/**
 * Check if a persona has done a cameo this session
 */
export function hasPersonaCameoed(sessionId: string, personaId: CameoPersonaId): boolean {
  const state = sessionStates.get(sessionId);
  return state?.personasWhoCameoed.has(personaId) || false;
}

/**
 * Get cooldown status
 */
export function getCooldownStatus(
  sessionId: string,
  priority: 'normal' | 'high' | 'celebration' = 'normal'
): {
  isOnCooldown: boolean;
  remainingMs: number;
} {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return { isOnCooldown: false, remainingMs: 0 };
  }

  const expired = isCooldownExpired(state.lastCameoEndTime, priority);
  const remaining = getRemainingCooldown(state.lastCameoEndTime, priority);

  return {
    isOnCooldown: !expired,
    remainingMs: remaining,
  };
}

/**
 * Get cameo statistics for a session
 */
export function getCameoStats(sessionId: string): {
  totalCameos: number;
  personasCameoed: CameoPersonaId[];
  averageDuration: number;
  lastCameoTime: number;
} {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return {
      totalCameos: 0,
      personasCameoed: [],
      averageDuration: 0,
      lastCameoTime: 0,
    };
  }

  const completedCameos = state.cameoHistory.filter((h) => h.duration);
  const avgDuration =
    completedCameos.length > 0
      ? completedCameos.reduce((sum, h) => sum + (h.duration || 0), 0) / completedCameos.length
      : 0;

  return {
    totalCameos: state.totalCameosThisSession,
    personasCameoed: Array.from(state.personasWhoCameoed),
    averageDuration: avgDuration,
    lastCameoTime: state.lastCameoEndTime,
  };
}

// ============================================================================
// UTILITY
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  executeCameo,
  endCameo,
  cancelCameo,
  resetSessionState,
  getCameoSessionState,
  isInCameo,
  getCurrentCameoPersona,
  hasPersonaCameoed,
  getCooldownStatus,
  getCameoStats,
  cameoEvents,
};
