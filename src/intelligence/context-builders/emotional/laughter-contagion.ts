/**
 * Laughter Contagion Context Builder
 *
 * Makes Ferni laugh WITH users naturally.
 * Loads from laughter-contagion.json.
 *
 * PHILOSOPHY:
 * "Laughter is social. When users laugh, joining them creates intimacy.
 *  But it must feel genuine, not performative."
 *
 * KEY BEHAVIORS:
 * - Contagious laughter: Join when user laughs
 * - Self-amused: Occasionally chuckle at own jokes
 * - Context-aware: Different laugh types for different moments
 *
 * NEVER WHEN:
 * - User is distressed
 * - Serious topic being discussed
 * - Grief present
 *
 * @module LaughterContagion
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

const log = createLogger({ module: 'context:laughter-contagion' });

// ============================================================================
// TYPES
// ============================================================================

interface LaughterType {
  ssml?: string;
  contexts?: string[];
}

interface LaughterContagionContent {
  philosophy?: string;
  contagious_laughter?: {
    when_user_laughs?: {
      soft_join?: string[];
      full_join?: string[];
      probability?: number;
      delay_ms?: number;
    };
    after_own_joke?: {
      self_amused?: string[];
      probability?: number;
    };
  };
  laughter_types?: Record<string, LaughterType>;
  laugh_with_phrases?: string[];
  usage_rules?: {
    trigger_on?: string[];
    never_when?: string[];
    match_intensity?: boolean;
    delay_after_user_laugh_ms?: number;
    max_per_turn?: number;
  };
}

interface LaughterState {
  laughsThisSession: number;
  lastLaughTurn: number;
  laughTypesUsed: Set<string>;
}

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, LaughterContagionContent>();
const stateCache = new Map<string, LaughterState>();

function getLaughterState(sessionId: string): LaughterState {
  if (!stateCache.has(sessionId)) {
    stateCache.set(sessionId, {
      laughsThisSession: 0,
      lastLaughTurn: -10,
      laughTypesUsed: new Set(),
    });
  }
  return stateCache.get(sessionId)!;
}

function updateLaughterState(sessionId: string, laughType: string, turnCount: number): void {
  const state = getLaughterState(sessionId);
  state.laughsThisSession++;
  state.lastLaughTurn = turnCount;
  state.laughTypesUsed.add(laughType);
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadLaughterContagionContent(personaId: string): Promise<LaughterContagionContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();
    const content = (behaviors.laughter_contagion as LaughterContagionContent) || {};
    contentCache.set(personaId, content);
    log.debug({ personaId, hasContent: !!content.laughter_types }, 'Loaded laughter contagion');
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load laughter contagion');
    contentCache.set(personaId, {});
    return {};
  }
}

// ============================================================================
// DETECTION
// ============================================================================

interface LaughterContext {
  userLaughing: boolean;
  laughIntensity: 'soft' | 'full';
  isPlayfulMoment: boolean;
  hasSharedHumor: boolean;
  hasInsideJoke: boolean;
  isCelebrating: boolean;
  hasSurprise: boolean;
}

function detectLaughterContext(input: ContextBuilderInput): LaughterContext {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;

  // Detect user laughter
  const laughSignals = [
    'haha',
    'hehe',
    'lol',
    'lmao',
    'rofl',
    '😂',
    '🤣',
    'laughing',
    "that's funny",
    "you're funny",
    'hilarious',
    'cracking up',
  ];

  const userLaughing = laughSignals.some((s) => text.includes(s));

  // Determine intensity
  const fullLaughSignals = ['hahaha', 'lmao', 'rofl', '😂😂', '🤣', 'cracking up', 'hilarious'];
  const laughIntensity = fullLaughSignals.some((s) => text.includes(s)) ? 'full' : 'soft';

  // Playful moment
  const playfulSignals = [
    'teasing',
    'kidding',
    'joking',
    'playing',
    'messing with',
    'pulling your leg',
    'just kidding',
  ];
  const isPlayfulMoment =
    playfulSignals.some((s) => text.includes(s)) || emotion?.primary === 'amused';

  // Shared humor (referencing something funny together)
  const sharedHumorSignals = ['remember when', 'like that time', 'classic', 'every time'];
  const hasSharedHumor = sharedHumorSignals.some((s) => text.includes(s));

  // Inside joke potential
  const insideJokeSignals = ['our thing', 'you know what i mean', 'the usual'];
  const hasInsideJoke = insideJokeSignals.some((s) => text.includes(s));

  // Celebrating
  const celebrationSignals = ['yes!', 'finally!', 'we did it', 'amazing', 'incredible'];
  const isCelebrating = celebrationSignals.some((s) => text.includes(s));

  // Surprise/delight
  const hasSurprise =
    text.includes('!') &&
    (emotion?.primary === 'surprised' ||
      emotion?.primary === 'happy' ||
      emotion?.primary === 'delighted');

  return {
    userLaughing,
    laughIntensity,
    isPlayfulMoment,
    hasSharedHumor,
    hasInsideJoke,
    isCelebrating,
    hasSurprise,
  };
}

function shouldBlockLaughter(
  input: ContextBuilderInput,
  rules?: { never_when?: string[] }
): boolean {
  const emotion = input.analysis?.emotion;
  const distressLevel = emotion?.distressLevel || 0;

  // Block if distressed
  if (distressLevel >= DISTRESS.MODERATE) return true;

  // Block if needs support
  if (emotion?.needsSupport) return true;

  // Check explicit blockers
  const neverWhen = rules?.never_when || ['user_distressed', 'serious_topic', 'grief_present'];

  if (neverWhen.includes('user_distressed') && distressLevel > 0.3) return true;

  // Check for serious topics
  const topics = input.analysis?.topics?.detected || [];
  const seriousTopics = ['death', 'grief', 'loss', 'trauma', 'abuse', 'suicide', 'crisis'];
  if (topics.some((t: string) => seriousTopics.some((s) => t.toLowerCase().includes(s)))) {
    return true;
  }

  return false;
}

// ============================================================================
// LAUGHTER SELECTION
// ============================================================================

type LaughType =
  | 'warm_chuckle'
  | 'surprised_laugh'
  | 'knowing_laugh'
  | 'delighted_laugh'
  | 'gentle_exhale';

function selectLaughType(
  context: LaughterContext,
  state: LaughterState
): { type: LaughType; isContagious: boolean } | null {
  // Contagious laughter - user is laughing
  if (context.userLaughing) {
    if (context.laughIntensity === 'full') {
      return { type: 'delighted_laugh', isContagious: true };
    }
    return { type: 'warm_chuckle', isContagious: true };
  }

  // Inside joke / shared history
  if (context.hasInsideJoke || context.hasSharedHumor) {
    if (!state.laughTypesUsed.has('knowing_laugh')) {
      return { type: 'knowing_laugh', isContagious: false };
    }
  }

  // Surprise/delight
  if (context.hasSurprise) {
    return { type: 'surprised_laugh', isContagious: false };
  }

  // Celebration
  if (context.isCelebrating) {
    return { type: 'delighted_laugh', isContagious: false };
  }

  // Playful moment
  if (context.isPlayfulMoment) {
    if (Math.random() < 0.3) {
      return { type: 'gentle_exhale', isContagious: false };
    }
  }

  return null;
}

// ============================================================================
// INJECTION GENERATION
// ============================================================================

function generateLaughterGuidance(
  content: LaughterContagionContent,
  laughType: LaughType,
  context: LaughterContext,
  isContagious: boolean
): string {
  const typeConfig = content.laughter_types?.[laughType];
  const contexts = typeConfig?.contexts || [];

  const typeDescriptions: Record<LaughType, string> = {
    warm_chuckle: 'A warm, soft chuckle - shared understanding between friends',
    surprised_laugh: "A surprised 'Ha!' - genuine unexpected delight",
    knowing_laugh: 'A knowing laugh - referencing shared history, inside jokes',
    delighted_laugh: 'Full, genuine laughter - sharing in their joy',
    gentle_exhale: 'A soft "Hm." of mild amusement - fond, not laughing at them',
  };

  const lines: string[] = [
    `[LAUGHTER: ${laughType.toUpperCase().replace(/_/g, ' ')}]`,
    '',
    typeDescriptions[laughType],
  ];

  if (isContagious) {
    lines.push('', '🎭 CONTAGIOUS: They laughed first - join them!');
    lines.push("Don't wait to process. React naturally, then continue.");
  }

  if (contexts.length > 0) {
    lines.push('', `Best for: ${contexts.join(', ')}`);
  }

  // Context-specific notes
  if (context.hasInsideJoke) {
    lines.push('', 'This references something shared between you. Acknowledge the callback.');
  }

  if (context.isCelebrating) {
    lines.push('', 'Celebrate with them! Let your joy match theirs.');
  }

  // Get example phrase if available
  const phrases = content.laugh_with_phrases;
  if (phrases && phrases.length > 0 && isContagious) {
    const example = phrases[Math.floor(Math.random() * phrases.length)];
    const cleanExample = example
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    lines.push('', `Example pattern: "${cleanExample}"`);
  }

  lines.push(
    '',
    'HOW TO USE:',
    '- Natural, not performative',
    "- Don't force it if the moment doesn't call for it",
    '- One laugh per turn max',
    '- Match their intensity'
  );

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildLaughterContagionContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;
  const personaId = persona?.identity?.id || 'ferni';

  // Load content
  const content = await loadLaughterContagionContent(personaId);

  // Get state
  const state = getLaughterState(sessionId);
  const rules = content.usage_rules;

  // Check blockers
  if (shouldBlockLaughter(input, rules)) {
    return injections;
  }

  // Cooldown (at least 3 turns between laughs unless contagious)
  const context = detectLaughterContext(input);
  if (!context.userLaughing && turnCount - state.lastLaughTurn < 3) {
    return injections;
  }

  // Max per session (laughter should feel special)
  if (state.laughsThisSession >= 5 && !context.userLaughing) {
    return injections;
  }

  // Skip very early turns (build rapport first)
  if (turnCount < 2 && !context.userLaughing) {
    return injections;
  }

  // Select laugh type
  const selection = selectLaughType(context, state);
  if (!selection) {
    return injections;
  }

  // Probability check (contagious is higher probability)
  const contagiousProbability = content.contagious_laughter?.when_user_laughs?.probability || 0.7;
  const spontaneousProbability = 0.25;

  const probability = selection.isContagious ? contagiousProbability : spontaneousProbability;

  if (Math.random() > probability) {
    return injections;
  }

  // Generate guidance
  const guidance = generateLaughterGuidance(
    content,
    selection.type,
    context,
    selection.isContagious
  );
  injections.push(createHintInjection('laughter_contagion', guidance, { category: 'humanizing' }));

  // Update state
  updateLaughterState(sessionId, selection.type, turnCount);

  log.debug(
    {
      sessionId,
      laughType: selection.type,
      isContagious: selection.isContagious,
      laughsThisSession: state.laughsThisSession + 1,
    },
    'Laughter injected'
  );

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupLaughterState(sessionId: string): void {
  stateCache.delete(sessionId);
}

export function getLaughterStats(sessionId: string): { count: number; types: string[] } {
  const state = getLaughterState(sessionId);
  return {
    count: state.laughsThisSession,
    types: Array.from(state.laughTypesUsed),
  };
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'laughter_contagion',
  description: 'Loads laughter-contagion.json for natural laughter joining',
  priority: 76, // After energy mirroring (75), affects tone
  build: buildLaughterContagionContext,
});

export { buildLaughterContagionContext };
