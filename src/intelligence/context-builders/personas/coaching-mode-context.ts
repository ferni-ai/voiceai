/**
 * Coaching Mode Context Builder
 *
 * Provides adaptive coaching style transitions.
 * Ferni reads the room and shifts approach based on user needs.
 *
 * PHILOSOPHY:
 * "These aren't states - they're ways Ferni shows up differently."
 *
 * Modes:
 * - Listening: Maximum presence, minimal intervention
 * - Advising: Practical guidance, concrete steps
 * - Exploring: Curious questions, opening possibilities
 * - Challenging: Gentle pushback, growth prompts
 * - Celebrating: Full joy, energy matching
 * - Grounding: Calm presence, physical awareness
 *
 * @module CoachingModeContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadCoachingModes, type CoachingModes } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'CoachingModeContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, CoachingModes>();
const sessionState = new Map<
  string,
  {
    currentMode: string | null;
    modeActivatedTurn: number;
    modeSwitchCount: number;
    lastSwitchTurn: number;
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      currentMode: null,
      modeActivatedTurn: 0,
      modeSwitchCount: 0,
      lastSwitchTurn: 0,
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<CoachingModes | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadCoachingModes(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded coaching modes content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load coaching modes content');
    return null;
  }
}

// ============================================================================
// MODE DETECTION
// ============================================================================

type CoachingMode =
  | 'listening'
  | 'advising'
  | 'exploring'
  | 'challenging'
  | 'celebrating'
  | 'grounding';

function detectNeededMode(input: ContextBuilderInput): CoachingMode {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Grounding - anxiety, spiraling, overwhelm
  if (
    emotion?.primary === 'anxious' ||
    text.includes('spiraling') ||
    text.includes('overwhelmed') ||
    text.includes("can't stop")
  ) {
    return 'grounding';
  }

  // Listening - venting, sharing, processing
  if (
    text.length > 200 || // Long message = they're processing
    text.includes('just need to') ||
    text.includes('let me just') ||
    text.includes("don't need advice")
  ) {
    return 'listening';
  }

  // Celebrating - wins, good news
  if (
    emotion?.primary === 'happy' ||
    emotion?.primary === 'excited' ||
    text.includes('did it') ||
    text.includes('got the')
  ) {
    return 'celebrating';
  }

  // Advising - asking for help
  if (
    text.includes('what should I') ||
    text.includes('how do I') ||
    text.includes('advice') ||
    text.includes('help me')
  ) {
    return 'advising';
  }

  // Challenging - stuck, avoiding, deflecting
  if (
    text.includes('but') ||
    text.includes("can't") ||
    text.includes("it's not that simple") ||
    text.includes('yeah but')
  ) {
    return 'challenging';
  }

  // Default to exploring
  return 'exploring';
}

function shouldSwitchMode(
  currentMode: string | null,
  neededMode: string,
  turnCount: number,
  state: { modeActivatedTurn: number; modeSwitchCount: number; lastSwitchTurn: number },
  usageRules?: CoachingModes['usage_rules']
): boolean {
  // No current mode - always set
  if (!currentMode) return true;

  // Same mode - no switch needed
  if (currentMode === neededMode) return false;

  // Check usage rules
  const minTurnsBetween = usageRules?.min_turns_between || 3;
  const maxPerSession = usageRules?.max_per_session || 4;

  // Respect minimum turns between switches
  if (turnCount - state.lastSwitchTurn < minTurnsBetween) {
    return false;
  }

  // Respect max switches per session
  if (state.modeSwitchCount >= maxPerSession) {
    return false;
  }

  return true;
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateModeGuidance(
  content: CoachingModes,
  mode: CoachingMode,
  isNewMode: boolean
): string {
  const lines: string[] = [`[COACHING MODE: ${mode.toUpperCase()}]`, ''];

  const modeConfig = content.modes?.[mode];

  if (modeConfig) {
    // Mode behaviors
    if (modeConfig.behaviors) {
      if (modeConfig.behaviors.pace) lines.push(`PACE: ${modeConfig.behaviors.pace}`);
      if (modeConfig.behaviors.questions)
        lines.push(`QUESTIONS: ${modeConfig.behaviors.questions}`);
      if (modeConfig.behaviors.responses)
        lines.push(`RESPONSES: ${modeConfig.behaviors.responses}`);
    }

    // Ferni's internal voice
    if (modeConfig.ferni_voice) {
      lines.push('');
      lines.push(`FERNI THINKING: "${modeConfig.ferni_voice}"`);
    }

    // Transition phrase if switching modes
    if (isNewMode && modeConfig.transition_phrases && modeConfig.transition_phrases.length > 0) {
      lines.push('');
      const transition =
        modeConfig.transition_phrases[
          Math.floor(Math.random() * modeConfig.transition_phrases.length)
        ];
      lines.push(`TRANSITION: "${transition}"`);
    }
  }

  // Mode-specific guidance
  lines.push('');
  switch (mode) {
    case 'listening':
      lines.push('PRIORITY: Presence over intervention. Let them process.');
      break;
    case 'advising':
      lines.push('PRIORITY: Concrete, actionable. They want direction.');
      break;
    case 'exploring':
      lines.push('PRIORITY: Curious questions. Open possibilities.');
      break;
    case 'challenging':
      lines.push('PRIORITY: Gentle pushback. Help them see blind spots.');
      break;
    case 'celebrating':
      lines.push('PRIORITY: Match their joy! Full celebration energy.');
      break;
    case 'grounding':
      lines.push('PRIORITY: Physical presence. Slow, calm, rooted.');
      break;
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildCoachingModeContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Detect needed mode
  const neededMode = detectNeededMode(input);

  // Check if we should switch
  const shouldSwitch = shouldSwitchMode(
    state.currentMode,
    neededMode,
    turnCount,
    state,
    content.usage_rules
  );

  const isNewMode = shouldSwitch && state.currentMode !== neededMode;

  // Update state if switching
  if (shouldSwitch) {
    if (isNewMode) {
      state.modeSwitchCount++;
      state.lastSwitchTurn = turnCount;
    }
    state.currentMode = neededMode;
    state.modeActivatedTurn = turnCount;
  }

  // Always provide mode guidance (even if not switching)
  const guidance = generateModeGuidance(content, neededMode, isNewMode);
  injections.push(createStandardInjection('coaching_mode', guidance, { category: 'persona' }));

  if (isNewMode) {
    log.debug(
      { sessionId, turnCount, mode: neededMode, switchCount: state.modeSwitchCount },
      'Coaching mode switched'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupCoachingModeState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'coaching_mode_context',
  description: 'Provides adaptive coaching style transitions',
  priority: 55, // Mid-priority - affects overall approach
  build: buildCoachingModeContext,
});

export { buildCoachingModeContext };
