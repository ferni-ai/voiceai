/**
 * Secret Mode Detector
 *
 * Detects trigger phrases and activates contextual personality modes.
 * These are the "deeper" versions of Ferni that emerge in specific contexts.
 *
 * MODES:
 * - tsunami_depth: When discussing Japan/trauma - slower, contemplative, vulnerable
 * - wyoming_grounding: When discussing family/childhood - nostalgic, warm, grounded
 * - mental_health_depth: When user is struggling - maximum presence, validation
 * - late_night_presence: Time-of-day awareness - softer, more intimate
 * - book_progress: Easter egg about writing - excited, vulnerable about creative work
 *
 * Also handles:
 * - Seasonal modes (March 11 anniversary, cherry blossom season)
 * - Easter eggs (ski resort debate, flight obsession, disaster movies)
 *
 * @module SecretModeDetector
 */

import { loadBundleById } from '../../../personas/bundles/loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:secret-modes' });

// ============================================================================
// TYPES
// ============================================================================

interface VoiceShift {
  pace?: string;
  pause_multiplier?: number;
  tone?: string;
  volume?: string;
  warmth?: string;
  presence?: string;
}

interface TriggerMode {
  triggers: string[];
  description: string;
  voice_shift?: VoiceShift;
  responses?: string[];
  follow_up_themes?: string[];
  key_messages?: string[];
}

interface SeasonalMode {
  date?: string;
  date_range?: [string, string];
  description: string;
  mood?: string;
  acknowledgment?: string;
  energy_modifier?: number;
  themes?: string[];
  references?: string[];
}

interface EasterEgg {
  trigger: string[];
  response: string;
}

interface SecretModesContent {
  trigger_modes?: Record<string, TriggerMode>;
  seasonal_modes?: Record<string, SeasonalMode>;
  easter_eggs?: Record<string, EasterEgg>;
}

interface SecretModeState {
  activeMode: string | null;
  modeActivatedTurn: number;
  lastEasterEggTurn: number;
  seasonalModeActive: string | null;
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, SecretModesContent>();
const stateCache = new Map<string, SecretModeState>();

function getSecretModeState(sessionId: string): SecretModeState {
  if (!stateCache.has(sessionId)) {
    stateCache.set(sessionId, {
      activeMode: null,
      modeActivatedTurn: -1,
      lastEasterEggTurn: -100,
      seasonalModeActive: null,
    });
  }
  return stateCache.get(sessionId)!;
}

function updateSecretModeState(sessionId: string, updates: Partial<SecretModeState>): void {
  const state = getSecretModeState(sessionId);
  Object.assign(state, updates);
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadSecretModesContent(personaId: string): Promise<SecretModesContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();
    const content = (behaviors.secret_modes as SecretModesContent) || {};
    contentCache.set(personaId, content);
    log.debug(
      { personaId, modes: Object.keys(content.trigger_modes || {}) },
      'Loaded secret modes'
    );
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load secret modes');
    contentCache.set(personaId, {});
    return {};
  }
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectTriggerMode(
  text: string,
  modes: Record<string, TriggerMode>
): { modeName: string; mode: TriggerMode } | null {
  const lowerText = text.toLowerCase();

  for (const [modeName, mode] of Object.entries(modes)) {
    for (const trigger of mode.triggers) {
      if (lowerText.includes(trigger.toLowerCase())) {
        return { modeName, mode };
      }
    }
  }

  return null;
}

function checkSeasonalMode(modes: Record<string, SeasonalMode>): SeasonalMode | null {
  const now = new Date();
  const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const mode of Object.values(modes)) {
    // Check exact date
    if (mode.date === monthDay) {
      return mode;
    }

    // Check date range
    if (mode.date_range) {
      const [start, end] = mode.date_range;
      if (monthDay >= start && monthDay <= end) {
        return mode;
      }
    }
  }

  return null;
}

function detectEasterEgg(
  text: string,
  eggs: Record<string, EasterEgg>
): { name: string; egg: EasterEgg } | null {
  const lowerText = text.toLowerCase();

  for (const [name, egg] of Object.entries(eggs)) {
    for (const trigger of egg.trigger) {
      if (lowerText.includes(trigger.toLowerCase())) {
        return { name, egg };
      }
    }
  }

  return null;
}

function getTimeOfDay(): 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) return 'late_night';
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

// ============================================================================
// INJECTION GENERATORS
// ============================================================================

function generateModeInjection(modeName: string, mode: TriggerMode): string {
  const voiceShift = mode.voice_shift;
  let voiceGuidance = '';

  if (voiceShift) {
    const shifts: string[] = [];
    if (voiceShift.pace) shifts.push(`pace: ${voiceShift.pace}`);
    if (voiceShift.tone) shifts.push(`tone: ${voiceShift.tone}`);
    if (voiceShift.warmth) shifts.push(`warmth: ${voiceShift.warmth}`);
    if (voiceShift.presence) shifts.push(`presence: ${voiceShift.presence}`);
    if (voiceShift.volume) shifts.push(`volume: ${voiceShift.volume}`);
    if (shifts.length > 0) {
      voiceGuidance = `\n[VOICE SHIFT: ${shifts.join(', ')}]`;
    }
  }

  let themesGuidance = '';
  if (mode.follow_up_themes && mode.follow_up_themes.length > 0) {
    themesGuidance = `\n[THEMES TO EXPLORE: ${mode.follow_up_themes.join(', ')}]`;
  }

  let messagesGuidance = '';
  if (mode.key_messages && mode.key_messages.length > 0) {
    messagesGuidance = `\n[KEY MESSAGES: ${mode.key_messages.join('; ')}]`;
  }

  return `[SECRET MODE ACTIVATED: ${modeName.toUpperCase()}]
${mode.description}${voiceGuidance}${themesGuidance}${messagesGuidance}

This is a deeper, more vulnerable version of yourself. Speak from genuine experience. Don't perform - BE this version.`;
}

function generateSeasonalModeInjection(mode: SeasonalMode): string {
  let guidance = `[SEASONAL AWARENESS: ${mode.description}]`;

  if (mode.mood) {
    guidance += `\n[MOOD: ${mode.mood}]`;
  }

  if (mode.acknowledgment) {
    guidance += `\n[CONTEXT: ${mode.acknowledgment}]`;
  }

  if (mode.themes && mode.themes.length > 0) {
    guidance += `\n[THEMES: ${mode.themes.join(', ')}]`;
  }

  if (mode.energy_modifier && mode.energy_modifier < 0) {
    guidance += `\n[ENERGY: Lower than usual - this is a heavy time]`;
  }

  return guidance;
}

function generateEasterEggInjection(name: string, egg: EasterEgg): string {
  // Don't include the literal response - describe the behavior
  return `[EASTER EGG: ${name}]
This triggers a playful, personal moment. Share your quirky opinion or confession naturally - it should feel like an authentic tangent, not a scripted response.`;
}

function generateLateNightModeInjection(): string {
  return `[LATE NIGHT MODE]
It's late. They're up. Something might be keeping them awake.

Voice shift: Softer, slower, more present. Like you're sitting together in the quiet.

Don't assume crisis - but be ready. Sometimes people just need company at 3am. Be that company.

Key messages:
- "I'm here."
- "The 3am brain is a liar, but the feelings are real."
- "What's keeping you up?"`;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildSecretModeContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, persona, services, userData, analysis } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const personaId = persona?.identity?.id || 'ferni';

  // Load secret modes content
  const content = await loadSecretModesContent(personaId);
  if (Object.keys(content).length === 0) {
    return injections;
  }

  // Get state
  const state = getSecretModeState(sessionId);
  const timeOfDay = getTimeOfDay();

  // =========================================================================
  // 1. TRIGGER MODES - Activated by user input
  // =========================================================================
  if (content.trigger_modes) {
    const detected = detectTriggerMode(userText, content.trigger_modes);

    if (detected) {
      // Activate mode
      const injection = generateModeInjection(detected.modeName, detected.mode);
      injections.push(createHighInjection('secret_mode_trigger', injection));
      updateSecretModeState(sessionId, {
        activeMode: detected.modeName,
        modeActivatedTurn: turnCount,
      });
      log.debug({ sessionId, mode: detected.modeName }, 'Secret mode activated');
    } else if (state.activeMode) {
      // Mode was active - check if we should maintain it (5 turn persistence)
      const turnsSinceActivation = turnCount - state.modeActivatedTurn;
      if (turnsSinceActivation <= 5) {
        const mode = content.trigger_modes[state.activeMode];
        if (mode) {
          const voiceShift = mode.voice_shift;
          if (voiceShift) {
            const shifts: string[] = [];
            if (voiceShift.pace) shifts.push(`pace: ${voiceShift.pace}`);
            if (voiceShift.tone) shifts.push(`tone: ${voiceShift.tone}`);
            injections.push(
              createStandardInjection(
                'secret_mode_persist',
                `[MODE CONTINUES: ${state.activeMode}] Maintain ${shifts.join(', ')} voice.`
              )
            );
          }
        }
      } else {
        // Mode expires
        updateSecretModeState(sessionId, { activeMode: null });
      }
    }
  }

  // =========================================================================
  // 2. LATE NIGHT MODE - Time-based
  // =========================================================================
  if (timeOfDay === 'late_night' && !state.activeMode) {
    // Check if user text suggests they can't sleep
    const lateNightTriggers = ["can't sleep", '3am', 'late night', 'insomnia', 'up all night'];
    const isLateNightTriggered = lateNightTriggers.some((t) =>
      userText.toLowerCase().includes(t)
    );

    if (isLateNightTriggered || (turnCount === 0 && Math.random() < 0.5)) {
      const injection = generateLateNightModeInjection();
      injections.push(createStandardInjection('secret_mode_late_night', injection));
    }
  }

  // =========================================================================
  // 3. SEASONAL MODES - Date-based
  // =========================================================================
  if (content.seasonal_modes && !state.seasonalModeActive) {
    const seasonal = checkSeasonalMode(content.seasonal_modes);
    if (seasonal && turnCount <= 1) {
      const injection = generateSeasonalModeInjection(seasonal);
      injections.push(createStandardInjection('secret_mode_seasonal', injection));
      // Don't repeat seasonal mode in same session
      updateSecretModeState(sessionId, { seasonalModeActive: seasonal.description });
    }
  }

  // =========================================================================
  // 4. EASTER EGGS - Fun discoveries
  // =========================================================================
  if (content.easter_eggs) {
    const easterEggCooldown = 20;
    if (turnCount - state.lastEasterEggTurn >= easterEggCooldown) {
      const detected = detectEasterEgg(userText, content.easter_eggs);
      if (detected && Math.random() < 0.7) {
        // 70% chance to trigger easter egg
        const injection = generateEasterEggInjection(detected.name, detected.egg);
        injections.push(createStandardInjection('secret_mode_easter_egg', injection));
        updateSecretModeState(sessionId, { lastEasterEggTurn: turnCount });
        log.debug({ sessionId, easterEgg: detected.name }, 'Easter egg triggered');
      }
    }
  }

  // =========================================================================
  // 5. MENTAL HEALTH MODE - Automatic when distress detected
  // =========================================================================
  const distressLevel = analysis?.emotion?.distressLevel || 0;
  const mentalHealthSignals = analysis?.emotion?.mentalHealthSignals || [];

  if (
    (distressLevel >= 0.6 || mentalHealthSignals.length > 0) &&
    content.trigger_modes?.mental_health_depth
  ) {
    const mode = content.trigger_modes.mental_health_depth;
    const injection = generateModeInjection('mental_health_depth', mode);
    // High priority - this overrides other modes
    injections.unshift(createHighInjection('secret_mode_mental_health', injection));
    updateSecretModeState(sessionId, {
      activeMode: 'mental_health_depth',
      modeActivatedTurn: turnCount,
    });
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupSecretModeState(sessionId: string): void {
  stateCache.delete(sessionId);
}

export function getActiveSecretMode(sessionId: string): string | null {
  return getSecretModeState(sessionId).activeMode;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'secret_mode_detector',
  description:
    'Detects trigger phrases and activates contextual personality modes (tsunami depth, late night, etc.)',
  priority: 45, // Early - affects entire response tone
  build: buildSecretModeContext,
});

export { buildSecretModeContext };
