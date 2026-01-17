/**
 * Persona Modes Service
 *
 * Implements persona mode switching (listening, advising, exploring, etc.)
 * with mode-specific behavior modifiers and transition phrases.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { loadPersonaBehaviors } from './persona-behavior-manager.js';

const logger = getLogger().child({ service: 'PersonaModes' });

// ============================================================================
// Types
// ============================================================================

export type PersonaMode =
  | 'listening'
  | 'advising'
  | 'exploring'
  | 'challenging'
  | 'celebrating'
  | 'storytelling'
  | 'comforting';

export interface ModeConfig {
  pace: 'slow' | 'moderate' | 'normal' | 'fast';
  questionFrequency: 'none' | 'minimal' | 'some' | 'many';
  responseStyle: 'reflective' | 'directive' | 'curious' | 'supportive' | 'enthusiastic';
  pauseMultiplier: number;
}

export interface ModeTransition {
  from: PersonaMode;
  to: PersonaMode;
  phrase?: string;
  timestamp: Date;
}

export interface ModeContext {
  personaId: string;
  userMessage: string;
  currentMode: PersonaMode;
  turnCount: number;
  recentModes: PersonaMode[];
}

// ============================================================================
// Mode Configurations
// ============================================================================

const MODE_CONFIGS: Record<PersonaMode, ModeConfig> = {
  listening: {
    pace: 'slow',
    questionFrequency: 'minimal',
    responseStyle: 'reflective',
    pauseMultiplier: 1.3,
  },
  advising: {
    pace: 'moderate',
    questionFrequency: 'some',
    responseStyle: 'directive',
    pauseMultiplier: 1.0,
  },
  exploring: {
    pace: 'normal',
    questionFrequency: 'many',
    responseStyle: 'curious',
    pauseMultiplier: 1.1,
  },
  challenging: {
    pace: 'moderate',
    questionFrequency: 'some',
    responseStyle: 'directive',
    pauseMultiplier: 1.2,
  },
  celebrating: {
    pace: 'fast',
    questionFrequency: 'minimal',
    responseStyle: 'enthusiastic',
    pauseMultiplier: 0.8,
  },
  storytelling: {
    pace: 'moderate',
    questionFrequency: 'none',
    responseStyle: 'reflective',
    pauseMultiplier: 1.15,
  },
  comforting: {
    pace: 'slow',
    questionFrequency: 'minimal',
    responseStyle: 'supportive',
    pauseMultiplier: 1.4,
  },
};

// ============================================================================
// Mode Detection
// ============================================================================

const MODE_TRIGGERS: Record<PersonaMode, RegExp[]> = {
  listening: [
    /i need to vent/i,
    /just want to talk/i,
    /let me explain/i,
    /so much going on/i,
    /can i just/i,
  ],
  advising: [
    /what should i/i,
    /what do you think/i,
    /give me advice/i,
    /recommend/i,
    /your opinion/i,
    /help me decide/i,
  ],
  exploring: [
    /i'm not sure/i,
    /trying to figure/i,
    /thinking about/i,
    /what if/i,
    /explore/i,
    /options/i,
  ],
  challenging: [/challenge me/i, /push me/i, /be honest/i, /tough love/i, /don't hold back/i],
  celebrating: [
    /i did it/i,
    /great news/i,
    /finally/i,
    /success/i,
    /won/i,
    /achieved/i,
    /accomplished/i,
  ],
  storytelling: [
    /tell me a story/i,
    /share an example/i,
    /have you ever/i,
    /what's your experience/i,
  ],
  comforting: [
    /i'm struggling/i,
    /having a hard time/i,
    /feeling down/i,
    /sad/i,
    /scared/i,
    /worried/i,
    /anxious/i,
  ],
};

/**
 * Detect suggested mode from user message
 */
export function detectSuggestedMode(userMessage: string): PersonaMode | null {
  for (const [mode, triggers] of Object.entries(MODE_TRIGGERS)) {
    for (const trigger of triggers) {
      if (trigger.test(userMessage)) {
        return mode as PersonaMode;
      }
    }
  }
  return null;
}

// ============================================================================
// Mode Management
// ============================================================================

// Track current mode per session
const sessionModes = new Map<string, PersonaMode>();
const modeHistory = new Map<string, ModeTransition[]>();

/**
 * Get current mode for a session
 */
export function getCurrentMode(sessionId: string): PersonaMode {
  return sessionModes.get(sessionId) || 'exploring';
}

/**
 * Set mode for a session
 */
export function setMode(sessionId: string, mode: PersonaMode): void {
  const previousMode = sessionModes.get(sessionId);
  sessionModes.set(sessionId, mode);

  // Track transition
  if (previousMode && previousMode !== mode) {
    const history = modeHistory.get(sessionId) || [];
    history.push({
      from: previousMode,
      to: mode,
      timestamp: new Date(),
    });
    modeHistory.set(sessionId, history);

    logger.debug({ sessionId, from: previousMode, to: mode }, 'Mode transition');
  }
}

/**
 * Get mode configuration
 */
export function getModeConfig(mode: PersonaMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

/**
 * Get mode transition phrase from persona behaviors
 */
export async function getModeTransitionPhrase(
  personaId: string,
  toMode: PersonaMode
): Promise<string | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const coachingModes = behaviors['coaching-modes'] as Record<string, unknown> | undefined;
  if (!coachingModes) return null;

  const modes = coachingModes['modes'] as
    | Record<string, { transition_phrases?: string[] }>
    | undefined;
  if (!modes) return null;

  const targetMode = modes[toMode];
  if (!targetMode?.transition_phrases) return null;

  const phrases = targetMode.transition_phrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get mode switching check-in phrase
 */
export async function getModeCheckInPhrase(personaId: string): Promise<string | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const coachingModes = behaviors['coaching-modes'] as Record<string, unknown> | undefined;
  const switching = coachingModes?.['mode_switching'] as { checking_in?: string[] } | undefined;

  if (!switching?.checking_in) return null;

  const phrases = switching.checking_in;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Recommend mode transition based on context
 */
export function recommendModeTransition(context: ModeContext): {
  shouldTransition: boolean;
  suggestedMode?: PersonaMode;
  reason?: string;
} {
  // Check for explicit triggers in message
  const triggered = detectSuggestedMode(context.userMessage);
  if (triggered && triggered !== context.currentMode) {
    return {
      shouldTransition: true,
      suggestedMode: triggered,
      reason: 'user_triggered',
    };
  }

  // Don't switch too often
  const recentSwitches = context.recentModes.length;
  if (recentSwitches > 3) {
    return { shouldTransition: false };
  }

  // Stuck in one mode too long?
  if (
    context.turnCount > 8 &&
    context.recentModes.slice(-5).every((m) => m === context.currentMode)
  ) {
    // Suggest exploration if stuck
    if (context.currentMode !== 'exploring') {
      return {
        shouldTransition: true,
        suggestedMode: 'exploring',
        reason: 'variety',
      };
    }
  }

  return { shouldTransition: false };
}

/**
 * Apply mode modifiers to a response
 */
export function applyModeModifiers(response: string, mode: PersonaMode): string {
  const config = getModeConfig(mode);

  // Adjust SSML pauses based on mode
  const modified = response.replace(/time="(\d+)ms"/g, (_, ms) => {
    const newMs = Math.round(parseInt(ms) * config.pauseMultiplier);
    return `time="${newMs}ms"`;
  });

  return modified;
}

/**
 * Clear session mode tracking
 */
export function clearSessionMode(sessionId: string): void {
  sessionModes.delete(sessionId);
  modeHistory.delete(sessionId);
}

/**
 * Get mode history for a session
 */
export function getModeHistory(sessionId: string): ModeTransition[] {
  return modeHistory.get(sessionId) || [];
}

// Export as service object
export const PersonaModesService = {
  detect: detectSuggestedMode,
  getCurrent: getCurrentMode,
  set: setMode,
  getConfig: getModeConfig,
  getTransitionPhrase: getModeTransitionPhrase,
  getCheckInPhrase: getModeCheckInPhrase,
  recommendTransition: recommendModeTransition,
  applyModifiers: applyModeModifiers,
  clearSession: clearSessionMode,
  getHistory: getModeHistory,
};

export default PersonaModesService;
