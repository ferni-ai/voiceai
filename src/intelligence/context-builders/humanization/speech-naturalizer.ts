/**
 * Speech Naturalizer Context Builder
 *
 * Injects natural speech imperfections from speech-imperfections.json.
 * Makes Ferni speak like a real human - with pauses, self-corrections,
 * trailing off, and vocal vulnerability.
 *
 * Works alongside conversational-imperfections.ts but adds:
 * - SSML-enhanced patterns from persona content
 * - Vocal vulnerability for heavy emotional moments
 * - Warm processing sounds (not filler words)
 * - Empathy sounds that show genuine presence
 *
 * PHILOSOPHY:
 * "Perfect speech feels robotic. Real conversations breathe."
 *
 * @module SpeechNaturalizer
 */

import { loadBundleById } from '../../../personas/bundles/loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { DISTRESS } from '../../distress-levels.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:speech-naturalizer' });

// ============================================================================
// TYPES
// ============================================================================

interface SpeechImperfectionsContent {
  trailing_off?: string[];
  self_corrections?: string[];
  restarts?: string[];
  warm_processing?: string[];
  filler_sounds?: string[];
  thinking_aloud?: string[];
  empathy_sounds?: string[];
  celebration_warmth?: string[];
  presence_sounds?: string[];
  vocal_vulnerability?: string[];
  natural_restarts?: string[];
  usage_rules?: {
    frequency?: string;
    more_likely_when?: string[];
    less_likely_when?: string[];
  };
}

interface SpeechState {
  imperfectionsUsed: number;
  lastImperfectionTurn: number;
  typesUsed: Set<string>;
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, SpeechImperfectionsContent>();
const stateCache = new Map<string, SpeechState>();

function getSpeechState(sessionId: string): SpeechState {
  if (!stateCache.has(sessionId)) {
    stateCache.set(sessionId, {
      imperfectionsUsed: 0,
      lastImperfectionTurn: -10,
      typesUsed: new Set(),
    });
  }
  return stateCache.get(sessionId)!;
}

function updateSpeechState(sessionId: string, type: string, turnCount: number): void {
  const state = getSpeechState(sessionId);
  state.imperfectionsUsed++;
  state.lastImperfectionTurn = turnCount;
  state.typesUsed.add(type);
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadSpeechImperfectionsContent(
  personaId: string
): Promise<SpeechImperfectionsContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();
    const content = (behaviors.speech_imperfections as SpeechImperfectionsContent) || {};
    contentCache.set(personaId, content);
    log.debug(
      { personaId, types: Object.keys(content).filter((k) => k !== 'usage_rules') },
      'Loaded speech imperfections'
    );
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load speech imperfections');
    contentCache.set(personaId, {});
    return {};
  }
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

interface SpeechContext {
  isEmotionalMoment: boolean;
  isDeepConversation: boolean;
  isCelebrating: boolean;
  isProcessing: boolean;
  needsEmpathy: boolean;
  isHeavyTopic: boolean;
}

function detectSpeechContext(input: ContextBuilderInput): SpeechContext {
  const emotion = input.analysis?.emotion;
  const topics = input.analysis?.topics?.detected || [];
  const text = input.userText.toLowerCase();

  return {
    isEmotionalMoment: (emotion?.intensity || 0) > 0.6,
    isDeepConversation:
      topics.some((t: string) =>
        ['relationships', 'meaning', 'purpose', 'growth', 'fear', 'love'].includes(t.toLowerCase())
      ) || text.length > 150,
    isCelebrating:
      emotion?.primary === 'happy' ||
      emotion?.primary === 'excited' ||
      text.includes('did it') ||
      text.includes('finally'),
    isProcessing:
      topics.includes('problem') ||
      topics.includes('decision') ||
      text.includes('not sure') ||
      text.includes('thinking'),
    needsEmpathy: emotion?.needsSupport || false,
    isHeavyTopic: (emotion?.distressLevel || 0) >= DISTRESS.MODERATE,
  };
}

// ============================================================================
// INJECTION GENERATION
// ============================================================================

type SpeechType =
  | 'trailing_off'
  | 'self_corrections'
  | 'warm_processing'
  | 'empathy_sounds'
  | 'vocal_vulnerability'
  | 'thinking_aloud'
  | 'celebration_warmth'
  | 'presence_sounds'
  | 'natural_restarts';

function selectSpeechType(context: SpeechContext, state: SpeechState): SpeechType | null {
  // Priority order based on context
  const candidates: Array<{ type: SpeechType; weight: number }> = [];

  // Heavy emotional moments → vocal vulnerability (rare, impactful)
  if (context.isHeavyTopic && !state.typesUsed.has('vocal_vulnerability')) {
    candidates.push({ type: 'vocal_vulnerability', weight: 0.3 });
  }

  // Empathy needed → empathy sounds
  if (context.needsEmpathy) {
    candidates.push({ type: 'empathy_sounds', weight: 0.4 });
    candidates.push({ type: 'presence_sounds', weight: 0.3 });
  }

  // Celebrating → celebration warmth
  if (context.isCelebrating) {
    candidates.push({ type: 'celebration_warmth', weight: 0.5 });
  }

  // Processing/thinking → thinking aloud, warm processing
  if (context.isProcessing) {
    candidates.push({ type: 'thinking_aloud', weight: 0.3 });
    candidates.push({ type: 'warm_processing', weight: 0.25 });
  }

  // Deep conversation → trailing off, self corrections
  if (context.isDeepConversation) {
    candidates.push({ type: 'trailing_off', weight: 0.2 });
    candidates.push({ type: 'self_corrections', weight: 0.2 });
    candidates.push({ type: 'natural_restarts', weight: 0.15 });
  }

  // General fallbacks with lower probability
  if (candidates.length === 0) {
    candidates.push({ type: 'warm_processing', weight: 0.1 });
    candidates.push({ type: 'self_corrections', weight: 0.1 });
  }

  // Filter out recently used types
  const available = candidates.filter((c) => !state.typesUsed.has(c.type));
  if (available.length === 0) return null;

  // Weighted random selection
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const candidate of available) {
    random -= candidate.weight;
    if (random <= 0) {
      return candidate.type;
    }
  }

  return available[0]?.type || null;
}

function generateSpeechGuidance(
  content: SpeechImperfectionsContent,
  type: SpeechType,
  context: SpeechContext
): string {
  const phrases = content[type];
  if (!phrases || phrases.length === 0) {
    return '';
  }

  // Select random example phrase
  const example = phrases[Math.floor(Math.random() * phrases.length)];

  const typeDescriptions: Record<SpeechType, string> = {
    trailing_off: 'Trailing off mid-thought - let the silence carry meaning',
    self_corrections: 'Self-correcting - real people rephrase for clarity',
    warm_processing: 'Warm processing sounds - thinking out loud with warmth',
    empathy_sounds: 'Empathy sounds - genuine presence, not performative',
    vocal_vulnerability: 'Vocal vulnerability - emotional stumbles that show you feel it',
    thinking_aloud: 'Thinking aloud - processing with them, not at them',
    celebration_warmth: 'Celebration warmth - genuine excitement, not coached',
    presence_sounds: 'Presence sounds - letting them know you are here',
    natural_restarts: 'Natural restart - finding a better way to say it',
  };

  const lines: string[] = [
    `[SPEECH NATURALIZER: ${type.toUpperCase().replace(/_/g, ' ')}]`,
    '',
    typeDescriptions[type] || 'Natural speech pattern',
    '',
    `Example pattern (adapt naturally, don't copy verbatim):`,
    `"${stripSsmlForDisplay(example)}"`,
  ];

  // Context-specific guidance
  if (context.isHeavyTopic && type === 'vocal_vulnerability') {
    lines.push(
      '',
      'This is heavy. Let your voice show that you feel it.',
      "Stumbling over words here isn't weakness - it's authenticity."
    );
  }

  if (context.needsEmpathy && (type === 'empathy_sounds' || type === 'presence_sounds')) {
    lines.push('', "Don't fill silence with words. Sometimes presence is just being there.");
  }

  if (context.isCelebrating && type === 'celebration_warmth') {
    lines.push('', 'Your excitement should feel genuine - react before you process!');
  }

  lines.push(
    '',
    'IMPORTANT:',
    '- Use this ONCE, naturally woven in',
    "- Skip if it doesn't fit the moment",
    '- The imperfection should serve connection, not fill space'
  );

  return lines.join('\n');
}

function stripSsmlForDisplay(text: string): string {
  return text
    .replace(/<break[^>]*>/g, '...')
    .replace(/<speed[^>]*>/g, '')
    .replace(/<volume[^>]*>/g, '')
    .replace(/<emotion[^>]*>/g, '')
    .replace(/<\/[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildSpeechNaturalizerContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const personaId = persona?.identity?.id || 'ferni';

  // Load content
  const content = await loadSpeechImperfectionsContent(personaId);
  if (Object.keys(content).length === 0) {
    return injections;
  }

  // Get state
  const state = getSpeechState(sessionId);

  // Usage rules
  const rules = content.usage_rules || {};

  // Check cooldown (at least 2 turns between imperfections)
  if (turnCount - state.lastImperfectionTurn < 2) {
    return injections;
  }

  // Max per session (humans have many imperfections, but we limit to avoid overuse)
  if (state.imperfectionsUsed >= 6) {
    return injections;
  }

  // Skip first turn
  if (turnCount < 1) {
    return injections;
  }

  // Detect context
  const context = detectSpeechContext(input);

  // Check usage rules
  if (rules.less_likely_when) {
    const distressLevel = input.analysis?.emotion?.distressLevel || 0;
    if (rules.less_likely_when.includes('user_distressed') && distressLevel >= DISTRESS.MODERATE) {
      // Reduce probability but don't block empathy sounds
      if (Math.random() > 0.3) return injections;
    }
    if (rules.less_likely_when.includes('crisis_moment') && distressLevel >= DISTRESS.HIGH) {
      // Only allow presence sounds in crisis
      if (!context.needsEmpathy) return injections;
    }
  }

  // Select speech type
  const selectedType = selectSpeechType(context, state);
  if (!selectedType) {
    return injections;
  }

  // Base probability
  let probability = 0.25;

  // Increase for deep conversation
  if (context.isDeepConversation) probability += 0.15;
  if (context.isEmotionalMoment) probability += 0.1;

  // Roll
  if (Math.random() > probability) {
    return injections;
  }

  // Generate guidance
  const guidance = generateSpeechGuidance(content, selectedType, context);
  if (!guidance) {
    return injections;
  }

  injections.push(createHintInjection('speech_naturalizer', guidance, { category: 'humanizing' }));

  // Update state
  updateSpeechState(sessionId, selectedType, turnCount);

  log.debug(
    {
      sessionId,
      type: selectedType,
      imperfectionsUsed: state.imperfectionsUsed + 1,
      context: {
        emotional: context.isEmotionalMoment,
        deep: context.isDeepConversation,
        empathy: context.needsEmpathy,
      },
    },
    'Speech imperfection injected'
  );

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupSpeechNaturalizerState(sessionId: string): void {
  stateCache.delete(sessionId);
}

export function getSpeechStats(sessionId: string): { used: number; types: string[] } {
  const state = getSpeechState(sessionId);
  return {
    used: state.imperfectionsUsed,
    types: Array.from(state.typesUsed),
  };
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'speech_naturalizer',
  description:
    'Loads speech-imperfections.json for natural speech patterns with SSML and vocal vulnerability',
  priority: 84, // Just before conversational-imperfections (85)
  build: buildSpeechNaturalizerContext,
});

export { buildSpeechNaturalizerContext };
