/**
 * Energy Matcher Context Builder
 *
 * Enhanced energy matching that loads from energy-matching.json.
 * Provides SSML-enhanced energy-matched phrases and voice pacing guidance.
 *
 * Works alongside energy-mirroring.ts but adds:
 * - SSML-enhanced phrases from persona content
 * - Specific pacing multipliers for TTS
 * - Energy-specific voice tone guidance
 *
 * PHILOSOPHY:
 * "Meeting someone where they are. When they're low, we're present.
 *  When they're high, we celebrate with them."
 *
 * @module EnergyMatcher
 */

import { loadBundleById } from '../../../personas/bundles/loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:energy-matcher' });

// ============================================================================
// TYPES
// ============================================================================

interface EnergyLevelConfig {
  description?: string;
  pacing?: {
    speed_multiplier?: number;
    pause_multiplier?: number;
    energy_reduction?: number;
  };
  voice_tone?: string;
  phrases?: string[];
}

interface EnergyMatchingContent {
  philosophy?: string;
  energy_levels?: Record<string, EnergyLevelConfig>;
  transitions?: {
    description?: string;
    gradual_shift?: boolean;
    max_jump_levels?: number;
    transition_time_ms?: number;
  };
  usage_rules?: {
    detect_from?: string[];
    update_frequency?: string;
    never_override_when?: string[];
    always_match_down?: boolean;
    cautious_match_up?: boolean;
  };
}

type EnergyLevel = 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';

interface EnergyState {
  previousLevel: EnergyLevel;
  currentLevel: EnergyLevel;
  lastUpdateTurn: number;
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, EnergyMatchingContent>();
const stateCache = new Map<string, EnergyState>();

function getEnergyState(sessionId: string): EnergyState {
  if (!stateCache.has(sessionId)) {
    stateCache.set(sessionId, {
      previousLevel: 'neutral',
      currentLevel: 'neutral',
      lastUpdateTurn: -1,
    });
  }
  return stateCache.get(sessionId)!;
}

function updateEnergyState(sessionId: string, level: EnergyLevel, turnCount: number): void {
  const state = getEnergyState(sessionId);
  state.previousLevel = state.currentLevel;
  state.currentLevel = level;
  state.lastUpdateTurn = turnCount;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadEnergyMatchingContent(personaId: string): Promise<EnergyMatchingContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();
    const content = (behaviors.energy_matching as EnergyMatchingContent) || {};
    contentCache.set(personaId, content);
    log.debug({ personaId, hasContent: !!content.energy_levels }, 'Loaded energy matching content');
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load energy matching content');
    contentCache.set(personaId, {});
    return {};
  }
}

// ============================================================================
// ENERGY DETECTION
// ============================================================================

function detectEnergyFromText(text: string): EnergyLevel {
  const lower = text.toLowerCase();

  // Very low - exhaustion, crisis
  if (
    lower.includes('exhausted') ||
    lower.includes('drained') ||
    lower.includes("can't do this") ||
    lower.includes('falling apart') ||
    lower.includes('breaking down') ||
    lower.includes('so tired')
  ) {
    return 'very_low';
  }

  // Low - tired, deflated
  if (
    lower.includes('tired') ||
    lower.includes('meh') ||
    lower.includes('blah') ||
    lower.includes('whatever') ||
    lower.includes('i guess') ||
    lower.includes("don't care")
  ) {
    return 'low';
  }

  // High - excited, energized
  if (
    lower.includes('!!!') ||
    lower.includes('amazing') ||
    lower.includes('so excited') ||
    lower.includes('incredible') ||
    lower.includes("can't believe") ||
    lower.includes('guess what') ||
    lower.includes('omg')
  ) {
    return 'high';
  }

  // Elevated - engaged, interested
  if (
    lower.includes('really') ||
    lower.includes('actually') ||
    text.includes('!') ||
    lower.includes('love that') ||
    lower.includes('great idea')
  ) {
    return 'elevated';
  }

  return 'neutral';
}

function detectEnergyFromEmotion(
  emotion: string | undefined,
  intensity: number | undefined
): EnergyLevel {
  if (!emotion) return 'neutral';

  const lowArousalEmotions = ['sad', 'tired', 'melancholy', 'disappointed', 'hopeless'];
  const highArousalEmotions = ['excited', 'happy', 'joyful', 'enthusiastic', 'ecstatic'];

  const emotionLower = emotion.toLowerCase();
  const actualIntensity = intensity || 0.5;

  if (lowArousalEmotions.some((e) => emotionLower.includes(e))) {
    return actualIntensity > 0.7 ? 'very_low' : 'low';
  }

  if (highArousalEmotions.some((e) => emotionLower.includes(e))) {
    return actualIntensity > 0.7 ? 'high' : 'elevated';
  }

  return 'neutral';
}

function combineEnergySignals(textEnergy: EnergyLevel, emotionEnergy: EnergyLevel): EnergyLevel {
  // Priority: very_low always wins (safety)
  if (textEnergy === 'very_low' || emotionEnergy === 'very_low') return 'very_low';

  // High wins if text confirms
  if (textEnergy === 'high' && emotionEnergy !== 'low') return 'high';
  if (emotionEnergy === 'high' && textEnergy !== 'low') return 'high';

  // Low states
  if (textEnergy === 'low' || emotionEnergy === 'low') return 'low';

  // Elevated
  if (textEnergy === 'elevated' || emotionEnergy === 'elevated') return 'elevated';

  return 'neutral';
}

// ============================================================================
// INJECTION GENERATION
// ============================================================================

function generateEnergyGuidance(
  content: EnergyMatchingContent,
  level: EnergyLevel,
  previousLevel: EnergyLevel
): string {
  const levelConfig = content.energy_levels?.[level];
  const lines: string[] = [`[ENERGY MATCHING: ${level.toUpperCase().replace('_', ' ')}]`];

  if (levelConfig?.description) {
    lines.push('', levelConfig.description);
  }

  if (levelConfig?.voice_tone) {
    lines.push('', `Voice tone: ${levelConfig.voice_tone}`);
  }

  if (levelConfig?.pacing) {
    const pacing = levelConfig.pacing;
    const pacingNotes: string[] = [];
    if (pacing.speed_multiplier && pacing.speed_multiplier !== 1.0) {
      const speedDesc = pacing.speed_multiplier < 1 ? 'slower' : 'faster';
      pacingNotes.push(`Speak ${speedDesc} (${Math.round(pacing.speed_multiplier * 100)}% speed)`);
    }
    if (pacing.pause_multiplier && pacing.pause_multiplier !== 1.0) {
      const pauseDesc = pacing.pause_multiplier > 1 ? 'longer' : 'shorter';
      pacingNotes.push(`${pauseDesc} pauses`);
    }
    if (pacingNotes.length > 0) {
      lines.push('', `Pacing: ${pacingNotes.join(', ')}`);
    }
  }

  // Add transition awareness
  if (previousLevel !== level) {
    const levelOrder: EnergyLevel[] = ['very_low', 'low', 'neutral', 'elevated', 'high'];
    const prevIndex = levelOrder.indexOf(previousLevel);
    const currIndex = levelOrder.indexOf(level);
    const direction = currIndex > prevIndex ? 'rising' : 'falling';

    if (content.transitions?.gradual_shift) {
      lines.push('', `[Energy ${direction} - transition gradually, don't jump too quickly]`);
    }
  }

  // Level-specific guidance
  switch (level) {
    case 'very_low':
      lines.push(
        '',
        'BE PRESENT, NOT PERFORMATIVE:',
        '- Minimal words, maximum presence',
        '- Long pauses are okay',
        '- No fixing, just holding space',
        '- Speak as if physically sitting with them in the quiet'
      );
      break;
    case 'low':
      lines.push(
        '',
        'WARM AND STEADY:',
        '- Patient, no rush',
        "- Don't try to cheer them up",
        '- Match their subdued energy',
        '- Leave room for silence'
      );
      break;
    case 'elevated':
      lines.push(
        '',
        'MATCH THEIR ENGAGEMENT:',
        '- Be animated and curious',
        '- Quick responses welcome',
        "- Don't dampen their energy",
        '- Share their interest'
      );
      break;
    case 'high':
      lines.push(
        '',
        'CELEBRATE WITH THEM:',
        '- Enthusiasm is welcome!',
        '- Exclamation points allowed',
        '- Share the joy, amplify the excitement',
        "- Don't immediately move to practicalities"
      );
      break;
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildEnergyMatcherContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, persona, analysis, services, userData } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const personaId = persona?.identity?.id || 'ferni';

  // Load content
  const content = await loadEnergyMatchingContent(personaId);

  // Get state
  const state = getEnergyState(sessionId);

  // Detect energy
  const textEnergy = detectEnergyFromText(userText);
  const emotionEnergy = detectEnergyFromEmotion(
    analysis?.emotion?.primary,
    analysis?.emotion?.intensity
  );
  const detectedLevel = combineEnergySignals(textEnergy, emotionEnergy);

  // Check usage rules
  const rules = content.usage_rules || {};

  // Never override during certain states
  if (rules.never_override_when) {
    const activeSecretMode = userData.systemState?.lastToolExecuted?.toolId;
    if (activeSecretMode && rules.never_override_when.includes(activeSecretMode)) {
      return injections;
    }
  }

  // Apply always_match_down rule
  let finalLevel = detectedLevel;
  if (rules.always_match_down && state.currentLevel !== 'neutral') {
    const levelOrder: EnergyLevel[] = ['very_low', 'low', 'neutral', 'elevated', 'high'];
    const currentIndex = levelOrder.indexOf(state.currentLevel);
    const detectedIndex = levelOrder.indexOf(detectedLevel);

    // If detected is lower, match down immediately
    if (detectedIndex < currentIndex) {
      finalLevel = detectedLevel;
    }
    // If detected is higher, be cautious (gradual rise)
    else if (detectedIndex > currentIndex && rules.cautious_match_up) {
      // Only move up one level at a time
      const maxJump = content.transitions?.max_jump_levels || 1;
      finalLevel = levelOrder[Math.min(currentIndex + maxJump, detectedIndex)] as EnergyLevel;
    }
  }

  // Update state
  updateEnergyState(sessionId, finalLevel, turnCount);

  // Only inject for non-neutral energy
  if (finalLevel === 'neutral') {
    return injections;
  }

  // Generate guidance
  const guidance = generateEnergyGuidance(content, finalLevel, state.previousLevel);
  injections.push(createHintInjection('energy_matcher', guidance, { category: 'humanizing' }));

  log.debug(
    {
      sessionId,
      textEnergy,
      emotionEnergy,
      detectedLevel,
      finalLevel,
      previousLevel: state.previousLevel,
    },
    'Energy matched'
  );

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupEnergyMatcherState(sessionId: string): void {
  stateCache.delete(sessionId);
}

export function getCurrentEnergy(sessionId: string): EnergyLevel {
  return getEnergyState(sessionId).currentLevel;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'energy_matcher',
  description: 'Loads energy-matching.json for rich energy mirroring with SSML pacing',
  priority: 74, // Just before energy_mirroring (75) to provide JSON content
  build: buildEnergyMatcherContext,
});

export { buildEnergyMatcherContext };
