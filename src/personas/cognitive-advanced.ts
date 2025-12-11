/**
 * Advanced Cognitive Intelligence System
 *
 * Extends the base cognitive system with:
 * - User cognitive style detection
 * - Cognitive handoff transfer
 * - Multi-step reasoning chains
 * - Cognitive conflict resolution
 * - Cognitive learning and growth
 * - Knowledge state persistence
 */

import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import type {
  CognitiveProfile,
  ReasoningStyle,
  AttentionFocus,
  CognitiveContext,
} from './cognitive-types.js';
import { getCognitiveProfile } from './cognitive-profiles.js';

const log = getLogger();

// ============================================================================
// COGNITIVE STYLE CACHE
// ============================================================================

interface CognitiveStyleCacheEntry {
  result: {
    primary: UserCognitiveStyle;
    secondary?: UserCognitiveStyle;
    confidence: number;
    signals: CognitiveSignals;
  };
  createdAt: number;
  messageCount: number;
}

const COGNITIVE_CACHE_CONFIG = {
  /** Maximum entries */
  maxEntries: 200,
  /** TTL in milliseconds (1 hour) */
  ttlMs: 60 * 60 * 1000,
  /** Minimum message count change to invalidate */
  messageCountThreshold: 3,
};

const cognitiveStyleCache = new Map<string, CognitiveStyleCacheEntry>();

const cognitiveCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

/**
 * Generate cache key from messages
 */
function generateCognitiveStyleCacheKey(messages: string[]): string {
  // Use first and last message plus count for key
  const keyData = {
    first: messages[0]?.slice(0, 50) || '',
    last: messages[messages.length - 1]?.slice(0, 50) || '',
    count: messages.length,
  };
  return createHash('md5').update(JSON.stringify(keyData)).digest('hex').slice(0, 16);
}

/**
 * Get cached cognitive style if valid
 */
function getCachedCognitiveStyle(
  messages: string[],
  cacheKey: string
): CognitiveStyleCacheEntry['result'] | null {
  const entry = cognitiveStyleCache.get(cacheKey);

  if (!entry) {
    cognitiveCacheStats.misses++;
    return null;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > COGNITIVE_CACHE_CONFIG.ttlMs) {
    cognitiveStyleCache.delete(cacheKey);
    cognitiveCacheStats.misses++;
    return null;
  }

  // Check if message count changed significantly
  if (
    Math.abs(messages.length - entry.messageCount) >= COGNITIVE_CACHE_CONFIG.messageCountThreshold
  ) {
    cognitiveStyleCache.delete(cacheKey);
    cognitiveCacheStats.misses++;
    return null;
  }

  cognitiveCacheStats.hits++;
  log.debug({ cacheKey, confidence: entry.result.confidence }, 'Cognitive style cache hit');
  return entry.result;
}

/**
 * Cache cognitive style result
 */
function cacheCognitiveStyle(
  cacheKey: string,
  result: CognitiveStyleCacheEntry['result'],
  messageCount: number
): void {
  // Evict LRU if at capacity
  if (cognitiveStyleCache.size >= COGNITIVE_CACHE_CONFIG.maxEntries) {
    const firstKey = cognitiveStyleCache.keys().next().value;
    if (firstKey) {
      cognitiveStyleCache.delete(firstKey);
      cognitiveCacheStats.evictions++;
    }
  }

  cognitiveStyleCache.set(cacheKey, {
    result,
    createdAt: Date.now(),
    messageCount,
  });
}

/**
 * Get cognitive style cache statistics
 */
export function getCognitiveStyleCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
} {
  const total = cognitiveCacheStats.hits + cognitiveCacheStats.misses;
  return {
    size: cognitiveStyleCache.size,
    hits: cognitiveCacheStats.hits,
    misses: cognitiveCacheStats.misses,
    evictions: cognitiveCacheStats.evictions,
    hitRate: total > 0 ? cognitiveCacheStats.hits / total : 0,
  };
}

/**
 * Clear cognitive style cache (for testing)
 */
export function clearCognitiveStyleCache(): void {
  cognitiveStyleCache.clear();
  cognitiveCacheStats.hits = 0;
  cognitiveCacheStats.misses = 0;
  cognitiveCacheStats.evictions = 0;
}

// ============================================================================
// USER COGNITIVE STYLE DETECTION
// ============================================================================

/**
 * User's cognitive style - how THEY think
 */
export type UserCognitiveStyle =
  | 'analytical' // Asks data questions, uses numbers, wants evidence
  | 'emotional' // Leads with feelings, uses emotional language
  | 'practical' // Focuses on actions, what to do, outcomes
  | 'narrative' // Tells stories, uses metaphors, asks "why"
  | 'systematic' // Wants step-by-step, process-oriented
  | 'intuitive' // Goes with gut, big picture, abstract
  | 'unknown';

/**
 * Signals that indicate cognitive style
 */
interface CognitiveSignals {
  analyticalScore: number;
  emotionalScore: number;
  practicalScore: number;
  narrativeScore: number;
  systematicScore: number;
  intuitiveScore: number;
  totalSignals: number;
}

/**
 * Detect user's cognitive style from their messages
 */
export function detectUserCognitiveStyle(messages: string[]): {
  primary: UserCognitiveStyle;
  secondary?: UserCognitiveStyle;
  confidence: number;
  signals: CognitiveSignals;
} {
  if (messages.length < 2) {
    return {
      primary: 'unknown',
      confidence: 0,
      signals: {
        analyticalScore: 0,
        emotionalScore: 0,
        practicalScore: 0,
        narrativeScore: 0,
        systematicScore: 0,
        intuitiveScore: 0,
        totalSignals: 0,
      },
    };
  }

  // Check cache first
  const cacheKey = generateCognitiveStyleCacheKey(messages);
  const cached = getCachedCognitiveStyle(messages, cacheKey);
  if (cached) {
    return cached;
  }

  const allText = messages.join(' ').toLowerCase();
  const signals: CognitiveSignals = {
    analyticalScore: 0,
    emotionalScore: 0,
    practicalScore: 0,
    narrativeScore: 0,
    systematicScore: 0,
    intuitiveScore: 0,
    totalSignals: 0,
  };

  // Analytical signals
  const analyticalPatterns = [
    /\b(data|numbers|statistics|percent|evidence|research|study|analysis)\b/gi,
    /\b(compared to|versus|ratio|rate|average|trend)\b/gi,
    /\b(prove|evidence|logical|reason|calculate|measure)\b/gi,
    /\b(how much|how many|what percentage|specifically)\b/gi,
  ];

  // Emotional signals
  const emotionalPatterns = [
    /\b(feel|feeling|felt|feelings|emotion|emotional)\b/gi,
    /\b(worried|scared|anxious|excited|happy|sad|frustrated|overwhelmed)\b/gi,
    /\b(heart|gut|instinct|sense|vibe)\b/gi,
    /\b(love|hate|fear|hope|afraid|joy)\b/gi,
  ];

  // Practical signals
  const practicalPatterns = [
    /\b(what should i|what do i|how do i|steps|action|do|doing)\b/gi,
    /\b(practical|concrete|specific|exactly|actually)\b/gi,
    /\b(result|outcome|goal|achieve|accomplish|done)\b/gi,
    /\b(next|then|after that|first|finally)\b/gi,
  ];

  // Narrative signals
  const narrativePatterns = [
    /\b(story|happened|remember when|back when|one time)\b/gi,
    /\b(why|meaning|purpose|matters|important because)\b/gi,
    /\b(like|as if|metaphor|imagine|picture)\b/gi,
    /\b(journey|path|chapter|life|experience)\b/gi,
  ];

  // Systematic signals
  const systematicPatterns = [
    /\b(step by step|process|system|order|organize|structure)\b/gi,
    /\b(first|second|third|next|then|finally|after)\b/gi,
    /\b(list|checklist|plan|schedule|timeline)\b/gi,
    /\b(method|approach|framework|procedure)\b/gi,
  ];

  // Intuitive signals
  const intuitivePatterns = [
    /\b(sense|feel like|seems|might|maybe|perhaps|could be)\b/gi,
    /\b(big picture|overall|general|whole|connected)\b/gi,
    /\b(intuition|hunch|gut feeling|instinct)\b/gi,
    /\b(wonder|curious|what if|imagine)\b/gi,
  ];

  // Count matches
  for (const pattern of analyticalPatterns) {
    signals.analyticalScore += (allText.match(pattern) || []).length;
  }
  for (const pattern of emotionalPatterns) {
    signals.emotionalScore += (allText.match(pattern) || []).length;
  }
  for (const pattern of practicalPatterns) {
    signals.practicalScore += (allText.match(pattern) || []).length;
  }
  for (const pattern of narrativePatterns) {
    signals.narrativeScore += (allText.match(pattern) || []).length;
  }
  for (const pattern of systematicPatterns) {
    signals.systematicScore += (allText.match(pattern) || []).length;
  }
  for (const pattern of intuitivePatterns) {
    signals.intuitiveScore += (allText.match(pattern) || []).length;
  }

  signals.totalSignals =
    signals.analyticalScore +
    signals.emotionalScore +
    signals.practicalScore +
    signals.narrativeScore +
    signals.systematicScore +
    signals.intuitiveScore;

  // Find primary and secondary
  const scores: Array<[UserCognitiveStyle, number]> = [
    ['analytical', signals.analyticalScore],
    ['emotional', signals.emotionalScore],
    ['practical', signals.practicalScore],
    ['narrative', signals.narrativeScore],
    ['systematic', signals.systematicScore],
    ['intuitive', signals.intuitiveScore],
  ];

  scores.sort((a, b) => b[1] - a[1]);

  const primary = scores[0][1] > 0 ? scores[0][0] : 'unknown';
  const secondary =
    scores[1][1] > 0 && scores[1][1] >= scores[0][1] * 0.5 ? scores[1][0] : undefined;

  // Calculate confidence
  const confidence =
    signals.totalSignals > 0
      ? Math.min(1.0, scores[0][1] / Math.max(1, signals.totalSignals) + messages.length * 0.05)
      : 0;

  const result = { primary, secondary, confidence, signals };

  // Cache the result
  cacheCognitiveStyle(cacheKey, result, messages.length);

  return result;
}

// ============================================================================
// COGNITIVE HANDOFF CONTEXT
// ============================================================================

/**
 * Cognitive context to transfer during handoffs
 */
export interface CognitiveHandoffContext {
  /** What the previous persona noticed */
  noticed: string[];

  /** What the previous persona might have missed (their blind spots) */
  potentialBlindSpots: AttentionFocus[];

  /** User's detected cognitive style */
  userCognitiveStyle: UserCognitiveStyle;

  /** Reasoning approaches that worked */
  effectiveApproaches: ReasoningStyle[];

  /** Topics where user showed expertise */
  userExpertiseTopics: string[];

  /** Topics that need more explanation */
  needsMoreExplanation: string[];

  /** Suggested approach for receiving persona */
  suggestedApproach?: string;

  /** Cognitive "handoff note" - natural language summary */
  handoffNote: string;
}

/**
 * Build cognitive handoff context from previous persona's session
 */
export function buildCognitiveHandoffContext(
  previousPersonaId: string,
  targetPersonaId: string,
  sessionData: {
    topics: string[];
    userMessages: string[];
    reasoningApproaches: ReasoningStyle[];
    userExpertiseTopics?: string[];
    needsExplanation?: string[];
  }
): CognitiveHandoffContext {
  const previousProfile = getCognitiveProfile(previousPersonaId);
  const targetProfile = getCognitiveProfile(targetPersonaId);

  // Detect user's cognitive style
  const userStyle = detectUserCognitiveStyle(sessionData.userMessages);

  // What did previous persona naturally notice?
  const noticed: string[] = [];
  if (previousProfile) {
    for (const focus of previousProfile.attention.primaryFocus) {
      if (sessionData.topics.some((t) => topicMatchesFocus(t, focus))) {
        noticed.push(focusToNotice(focus, sessionData.topics));
      }
    }
  }

  // What might previous persona have missed?
  const potentialBlindSpots = previousProfile?.attention.blindSpots || [];

  // Build natural language handoff note
  const handoffNote = buildHandoffNote(
    previousPersonaId,
    targetPersonaId,
    previousProfile,
    targetProfile,
    userStyle.primary,
    noticed,
    potentialBlindSpots
  );

  // Suggest approach for target persona
  let suggestedApproach: string | undefined;
  if (targetProfile && userStyle.primary !== 'unknown') {
    suggestedApproach = buildApproachSuggestion(
      targetProfile,
      userStyle.primary,
      potentialBlindSpots
    );
  }

  return {
    noticed,
    potentialBlindSpots,
    userCognitiveStyle: userStyle.primary,
    effectiveApproaches: sessionData.reasoningApproaches,
    userExpertiseTopics: sessionData.userExpertiseTopics || [],
    needsMoreExplanation: sessionData.needsExplanation || [],
    suggestedApproach,
    handoffNote,
  };
}

function topicMatchesFocus(topic: string, focus: AttentionFocus): boolean {
  const focusKeywords: Record<AttentionFocus, string[]> = {
    emotions: ['feel', 'emotion', 'stress', 'worry', 'happy', 'sad'],
    patterns: ['pattern', 'trend', 'data', 'numbers', 'recurring'],
    relationships: ['family', 'friend', 'partner', 'spouse', 'parent', 'child'],
    systems: ['process', 'system', 'workflow', 'organization'],
    meaning: ['why', 'purpose', 'meaning', 'important', 'matters'],
    actions: ['do', 'action', 'step', 'plan', 'next'],
    possibilities: ['could', 'option', 'alternative', 'what if'],
    history: ['past', 'before', 'history', 'background'],
    details: ['specific', 'exactly', 'detail', 'number'],
    big_picture: ['overall', 'big picture', 'general', 'strategy'],
    risks: ['risk', 'danger', 'problem', 'issue', 'concern'],
    opportunities: ['opportunity', 'chance', 'potential', 'upside'],
  };

  const keywords = focusKeywords[focus] || [];
  return keywords.some((kw) => topic.toLowerCase().includes(kw));
}

function focusToNotice(focus: AttentionFocus, topics: string[]): string {
  const focusDescriptions: Record<AttentionFocus, string> = {
    emotions: 'emotional undertones in the conversation',
    patterns: 'patterns in the data they shared',
    relationships: 'relationship dynamics at play',
    systems: 'the systematic aspects',
    meaning: 'the deeper meaning behind their questions',
    actions: 'action items and next steps',
    possibilities: 'potential alternatives',
    history: 'historical context',
    details: 'specific details and numbers',
    big_picture: 'the overall strategy',
    risks: 'potential risks',
    opportunities: 'opportunities to explore',
  };
  return focusDescriptions[focus];
}

function buildHandoffNote(
  previousId: string,
  targetId: string,
  previousProfile: CognitiveProfile | undefined,
  targetProfile: CognitiveProfile | undefined,
  userStyle: UserCognitiveStyle,
  noticed: string[],
  blindSpots: AttentionFocus[]
): string {
  const notes: string[] = [];

  // What previous persona noticed
  if (noticed.length > 0) {
    notes.push(`I noticed ${noticed.slice(0, 2).join(' and ')}.`);
  }

  // What target might want to check
  if (blindSpots.length > 0 && targetProfile) {
    const targetStrengths = targetProfile.attention.primaryFocus;
    const overlap = blindSpots.filter((bs) => targetStrengths.includes(bs));
    if (overlap.length > 0) {
      notes.push(
        `You might want to check on ${focusToNotice(overlap[0], [])} - that's not my strong suit.`
      );
    }
  }

  // User's style hint
  if (userStyle !== 'unknown') {
    const styleHints: Record<UserCognitiveStyle, string> = {
      analytical: "They're pretty analytical - likes data and evidence.",
      emotional: 'They lead with feelings - emotional connection matters.',
      practical: "They're action-oriented - wants concrete next steps.",
      narrative: 'They think in stories - metaphors and meaning resonate.',
      systematic: 'They like structure - step-by-step works well.',
      intuitive: "They're intuitive - comfortable with big picture, less detail.",
      unknown: '',
    };
    if (styleHints[userStyle]) {
      notes.push(styleHints[userStyle]);
    }
  }

  return notes.join(' ');
}

function buildApproachSuggestion(
  targetProfile: CognitiveProfile,
  userStyle: UserCognitiveStyle,
  previousBlindSpots: AttentionFocus[]
): string {
  // Match or complement user style
  const complementary: Record<UserCognitiveStyle, ReasoningStyle> = {
    analytical: 'analytical',
    emotional: 'empathetic',
    practical: 'pragmatic',
    narrative: 'narrative',
    systematic: 'systematic',
    intuitive: 'intuitive',
    unknown: targetProfile.reasoningStyle,
  };

  const suggestedStyle = complementary[userStyle];

  // Check if target can do this style
  if (
    suggestedStyle === targetProfile.reasoningStyle ||
    suggestedStyle === targetProfile.secondaryReasoning
  ) {
    return `Your ${suggestedStyle} approach should work well with this user.`;
  }

  // If not natural fit, suggest adaptation
  return `User responds to ${suggestedStyle} thinking. You might lean on that aspect more than usual.`;
}

// ============================================================================
// MULTI-STEP REASONING CHAINS
// ============================================================================

export interface ReasoningStep {
  step: number;
  approach: ReasoningStyle;
  purpose: string;
  duration: 'brief' | 'moderate' | 'extended';
  showReasoning: boolean;
}

export interface ReasoningChain {
  id: string;
  steps: ReasoningStep[];
  totalSteps: number;
  currentStep: number;
  context: string;
}

/**
 * Build a multi-step reasoning chain for complex situations
 */
export function buildReasoningChain(
  personaProfile: CognitiveProfile,
  context: {
    topic: string;
    emotionalWeight: number;
    complexity: 'simple' | 'moderate' | 'complex' | 'ambiguous';
    userNeed: 'information' | 'support' | 'decision' | 'exploration';
  }
): ReasoningChain | null {
  // Only build chains for complex or ambiguous situations
  if (context.complexity === 'simple') {
    return null;
  }

  const steps: ReasoningStep[] = [];
  const primaryStyle = personaProfile.reasoningStyle;
  const secondaryStyle = personaProfile.secondaryReasoning;

  // High emotional weight → start with empathy
  if (context.emotionalWeight > 0.6 && primaryStyle !== 'empathetic') {
    steps.push({
      step: 1,
      approach: 'empathetic',
      purpose: 'Acknowledge feelings first',
      duration: 'brief',
      showReasoning: false,
    });
  }

  // User needs support → empathy throughout
  if (context.userNeed === 'support') {
    steps.push({
      step: steps.length + 1,
      approach: 'empathetic',
      purpose: 'Provide emotional support',
      duration: 'moderate',
      showReasoning: false,
    });

    // Then offer perspective with primary style
    if (primaryStyle !== 'empathetic') {
      steps.push({
        step: steps.length + 1,
        approach: primaryStyle,
        purpose: 'Offer perspective through your natural lens',
        duration: 'brief',
        showReasoning: true,
      });
    }
  }

  // User needs decision → analysis then action
  if (context.userNeed === 'decision') {
    // Analytical step
    steps.push({
      step: steps.length + 1,
      approach: primaryStyle === 'analytical' ? 'analytical' : secondaryStyle || 'analytical',
      purpose: 'Analyze the options',
      duration: 'moderate',
      showReasoning: true,
    });

    // Pragmatic step
    steps.push({
      step: steps.length + 1,
      approach: 'pragmatic',
      purpose: 'Focus on actionable outcomes',
      duration: 'brief',
      showReasoning: false,
    });
  }

  // User needs exploration → narrative then possibilities
  if (context.userNeed === 'exploration') {
    steps.push({
      step: steps.length + 1,
      approach: 'narrative',
      purpose: 'Explore the story and meaning',
      duration: 'extended',
      showReasoning: true,
    });

    steps.push({
      step: steps.length + 1,
      approach: 'intuitive',
      purpose: 'Open up possibilities',
      duration: 'moderate',
      showReasoning: true,
    });
  }

  // User needs information → analytical then clear
  if (context.userNeed === 'information') {
    steps.push({
      step: steps.length + 1,
      approach: 'analytical',
      purpose: 'Present the facts clearly',
      duration: 'moderate',
      showReasoning: personaProfile.informationProcessing.deliberationLevel > 0.6,
    });

    steps.push({
      step: steps.length + 1,
      approach: 'systematic',
      purpose: 'Structure the information',
      duration: 'brief',
      showReasoning: false,
    });
  }

  // Ensure at least 2 steps for chains
  if (steps.length < 2) {
    return null;
  }

  return {
    id: `chain_${Date.now()}`,
    steps,
    totalSteps: steps.length,
    currentStep: 1,
    context: context.topic,
  };
}

/**
 * Get the current step's guidance from a reasoning chain
 */
export function getReasoningChainGuidance(chain: ReasoningChain): string {
  if (chain.currentStep > chain.totalSteps) {
    return '';
  }

  const step = chain.steps[chain.currentStep - 1];
  const isLast = chain.currentStep === chain.totalSteps;

  let guidance = `[REASONING STEP ${chain.currentStep}/${chain.totalSteps}]\n`;
  guidance += `Approach: ${step.approach.toUpperCase()}\n`;
  guidance += `Purpose: ${step.purpose}\n`;
  guidance += `Duration: Keep this ${step.duration}\n`;

  if (step.showReasoning) {
    guidance += `Show your thinking process.\n`;
  }

  if (!isLast) {
    const nextStep = chain.steps[chain.currentStep];
    guidance += `Next: Will shift to ${nextStep.approach} approach.\n`;
  }

  return guidance;
}

// ============================================================================
// COGNITIVE CONFLICT RESOLUTION
// ============================================================================

export interface CognitiveConflict {
  detected: boolean;
  personaStyle: ReasoningStyle;
  userNeed:
    | 'emotional_support'
    | 'practical_action'
    | 'deep_analysis'
    | 'exploration'
    | 'validation';
  severity: 'mild' | 'moderate' | 'significant';
  resolution:
    | 'shift_to_secondary'
    | 'acknowledge_limitation'
    | 'offer_handoff'
    | 'blend_approaches';
  phrase: string;
}

/**
 * Detect and resolve cognitive style conflicts
 */
export function detectCognitiveConflict(
  personaProfile: CognitiveProfile,
  context: {
    userEmotion: string;
    emotionalIntensity: number;
    userCognitiveStyle: UserCognitiveStyle;
    currentTopic: string;
    requestType: 'question' | 'venting' | 'seeking_advice' | 'sharing' | 'celebrating';
  }
): CognitiveConflict | null {
  const personaStyle = personaProfile.reasoningStyle;

  // Detect user need
  let userNeed: CognitiveConflict['userNeed'] = 'validation';
  if (context.requestType === 'venting' || context.emotionalIntensity > 0.7) {
    userNeed = 'emotional_support';
  } else if (context.requestType === 'seeking_advice') {
    userNeed = 'practical_action';
  } else if (context.userCognitiveStyle === 'analytical') {
    userNeed = 'deep_analysis';
  } else if (context.requestType === 'sharing' || context.userCognitiveStyle === 'narrative') {
    userNeed = 'exploration';
  }

  // Check for conflict
  const conflicts: Array<{
    need: CognitiveConflict['userNeed'];
    style: ReasoningStyle;
    severity: 'mild' | 'moderate' | 'significant';
  }> = [
    { need: 'emotional_support', style: 'analytical', severity: 'significant' },
    { need: 'emotional_support', style: 'systematic', severity: 'moderate' },
    { need: 'practical_action', style: 'narrative', severity: 'mild' },
    { need: 'practical_action', style: 'intuitive', severity: 'moderate' },
    { need: 'deep_analysis', style: 'empathetic', severity: 'mild' },
    { need: 'deep_analysis', style: 'pragmatic', severity: 'mild' },
  ];

  const conflict = conflicts.find((c) => c.need === userNeed && c.style === personaStyle);
  if (!conflict) {
    return null;
  }

  // Determine resolution strategy
  let resolution: CognitiveConflict['resolution'] = 'blend_approaches';
  let phrase = '';

  if (conflict.severity === 'significant') {
    // Significant conflict - need to explicitly acknowledge
    if (personaProfile.secondaryReasoning) {
      resolution = 'shift_to_secondary';
      phrase = getConflictPhrase(personaStyle, userNeed, 'shift');
    } else {
      resolution = 'acknowledge_limitation';
      phrase = getConflictPhrase(personaStyle, userNeed, 'acknowledge');
    }
  } else if (conflict.severity === 'moderate') {
    resolution = 'blend_approaches';
    phrase = getConflictPhrase(personaStyle, userNeed, 'blend');
  } else {
    // Mild - just be aware
    resolution = 'blend_approaches';
    phrase = '';
  }

  return {
    detected: true,
    personaStyle,
    userNeed,
    severity: conflict.severity,
    resolution,
    phrase,
  };
}

function getConflictPhrase(
  style: ReasoningStyle,
  need: CognitiveConflict['userNeed'],
  resolution: 'shift' | 'acknowledge' | 'blend'
): string {
  const phrases: Record<string, Record<string, string>> = {
    analytical: {
      emotional_support_shift:
        "I know I tend to jump to analysis, but let me just sit with what you're feeling first...",
      emotional_support_acknowledge:
        "I notice I want to analyze this, but right now that's not what you need. Tell me more about how you're feeling.",
      emotional_support_blend:
        "I hear that this is hard. Let me understand both what's happening and how it's affecting you.",
    },
    systematic: {
      emotional_support_shift:
        'Before I start breaking this down into steps, I want to acknowledge how overwhelming this must feel.',
      emotional_support_acknowledge:
        'My instinct is to organize this, but I sense you need me to just listen first.',
      emotional_support_blend: "This is a lot. Let's take it one piece at a time, but no rush.",
    },
    narrative: {
      practical_action_shift:
        'I could share a story about this, but I think you need something more concrete right now.',
      practical_action_acknowledge:
        "I'm tempted to explore the meaning here, but you need action steps. Let me focus on that.",
      practical_action_blend:
        "Here's what I'd suggest doing - and I'll share a quick story about why this works.",
    },
    intuitive: {
      practical_action_shift:
        'My sense is pointing me somewhere, but let me give you something more concrete to work with.',
      practical_action_acknowledge:
        "I'm seeing the big picture, but you need specifics. Let me try to be more practical.",
      practical_action_blend: "Here's what my instinct says, and here's the practical first step.",
    },
  };

  const key = `${need}_${resolution}`;
  return phrases[style]?.[key] || '';
}

// ============================================================================
// COGNITIVE LEARNING TRACKER
// ============================================================================

export interface CognitiveEffectiveness {
  approach: ReasoningStyle;
  context: string;
  userResponse: 'engaged' | 'neutral' | 'disengaged' | 'breakthrough';
  userCognitiveStyle: UserCognitiveStyle;
  timestamp: Date;
}

export interface CognitiveLearning {
  userId: string;
  personaId: string;

  /** Which approaches work best with this user */
  effectiveApproaches: Map<ReasoningStyle, number>;

  /** User's preferred cognitive style */
  userPreferredStyle: UserCognitiveStyle;

  /** Approaches that led to breakthroughs */
  breakthroughApproaches: ReasoningStyle[];

  /** Approaches to avoid */
  ineffectiveApproaches: ReasoningStyle[];

  /** Topics where user has expertise (skip basics) */
  expertiseTopics: string[];

  /** Topics that need more explanation */
  noviceTopics: string[];

  /** Total interactions for confidence */
  totalInteractions: number;
}

/**
 * Track cognitive approach effectiveness
 */
export class CognitiveLearningTracker {
  private learnings = new Map<string, CognitiveLearning>();
  private recentEffectiveness: CognitiveEffectiveness[] = [];

  /**
   * Record a cognitive approach and user response
   */
  recordApproachEffectiveness(
    userId: string,
    personaId: string,
    approach: ReasoningStyle,
    context: string,
    userResponse: CognitiveEffectiveness['userResponse'],
    userCognitiveStyle: UserCognitiveStyle
  ): void {
    // Record the interaction
    this.recentEffectiveness.push({
      approach,
      context,
      userResponse,
      userCognitiveStyle,
      timestamp: new Date(),
    });

    // Keep only last 100
    if (this.recentEffectiveness.length > 100) {
      this.recentEffectiveness.shift();
    }

    // Update learning for this user-persona pair
    const key = `${userId}_${personaId}`;
    let learning = this.learnings.get(key);

    if (!learning) {
      learning = {
        userId,
        personaId,
        effectiveApproaches: new Map(),
        userPreferredStyle: 'unknown',
        breakthroughApproaches: [],
        ineffectiveApproaches: [],
        expertiseTopics: [],
        noviceTopics: [],
        totalInteractions: 0,
      };
      this.learnings.set(key, learning);
    }

    learning.totalInteractions++;

    // Update approach effectiveness
    const currentScore = learning.effectiveApproaches.get(approach) || 0.5;
    const adjustment =
      userResponse === 'breakthrough'
        ? 0.3
        : userResponse === 'engaged'
          ? 0.1
          : userResponse === 'disengaged'
            ? -0.15
            : 0;

    learning.effectiveApproaches.set(approach, Math.max(0, Math.min(1, currentScore + adjustment)));

    // Track breakthroughs
    if (userResponse === 'breakthrough' && !learning.breakthroughApproaches.includes(approach)) {
      learning.breakthroughApproaches.push(approach);
    }

    // Track ineffective approaches
    if (userResponse === 'disengaged') {
      const score = learning.effectiveApproaches.get(approach) || 0.5;
      if (score < 0.3 && !learning.ineffectiveApproaches.includes(approach)) {
        learning.ineffectiveApproaches.push(approach);
      }
    }

    // Update user's preferred style
    if (userCognitiveStyle !== 'unknown') {
      learning.userPreferredStyle = userCognitiveStyle;
    }

    getLogger().debug(
      {
        userId,
        personaId,
        approach,
        userResponse,
        newScore: learning.effectiveApproaches.get(approach),
      },
      'Cognitive approach effectiveness recorded'
    );
  }

  /**
   * Record expertise level for a topic
   */
  recordTopicExpertise(
    userId: string,
    personaId: string,
    topic: string,
    level: 'expert' | 'novice'
  ): void {
    const key = `${userId}_${personaId}`;
    const learning = this.learnings.get(key);
    if (!learning) return;

    if (level === 'expert' && !learning.expertiseTopics.includes(topic)) {
      learning.expertiseTopics.push(topic);
      // Remove from novice if present
      learning.noviceTopics = learning.noviceTopics.filter((t) => t !== topic);
    } else if (level === 'novice' && !learning.noviceTopics.includes(topic)) {
      learning.noviceTopics.push(topic);
    }
  }

  /**
   * Get learning for a user-persona pair
   */
  getLearning(userId: string, personaId: string): CognitiveLearning | null {
    return this.learnings.get(`${userId}_${personaId}`) || null;
  }

  /**
   * Get recommended approach based on learning
   */
  getRecommendedApproach(
    userId: string,
    personaId: string,
    defaultApproach: ReasoningStyle
  ): { approach: ReasoningStyle; confidence: number; reason: string } {
    const learning = this.learnings.get(`${userId}_${personaId}`);

    if (!learning || learning.totalInteractions < 3) {
      return {
        approach: defaultApproach,
        confidence: 0.5,
        reason: 'Using default - not enough data',
      };
    }

    // Find best scoring approach
    let bestApproach = defaultApproach;
    let bestScore = learning.effectiveApproaches.get(defaultApproach) || 0.5;

    for (const [approach, score] of learning.effectiveApproaches) {
      if (score > bestScore) {
        bestApproach = approach;
        bestScore = score;
      }
    }

    // Check if any breakthrough approaches
    if (learning.breakthroughApproaches.length > 0) {
      const recentBreakthrough =
        learning.breakthroughApproaches[learning.breakthroughApproaches.length - 1];
      const breakthroughScore = learning.effectiveApproaches.get(recentBreakthrough) || 0.5;
      if (breakthroughScore >= bestScore) {
        bestApproach = recentBreakthrough;
        bestScore = breakthroughScore;
      }
    }

    // Avoid ineffective approaches
    if (learning.ineffectiveApproaches.includes(bestApproach)) {
      // Fall back to default if best is ineffective
      bestApproach = defaultApproach;
      bestScore = 0.5;
    }

    const confidence = Math.min(1.0, 0.5 + learning.totalInteractions * 0.02);
    const reason =
      bestApproach === defaultApproach
        ? 'Using default approach'
        : `${bestApproach} has worked well with this user (score: ${bestScore.toFixed(2)})`;

    return { approach: bestApproach, confidence, reason };
  }

  /**
   * Export learnings for persistence
   */
  exportLearnings(): Record<string, CognitiveLearning> {
    const result: Record<string, CognitiveLearning> = {};
    for (const [key, learning] of this.learnings) {
      result[key] = {
        ...learning,
        effectiveApproaches: new Map(learning.effectiveApproaches),
      };
    }
    return result;
  }

  /**
   * Import learnings from persistence
   */
  importLearnings(
    data: Record<
      string,
      Omit<CognitiveLearning, 'effectiveApproaches'> & {
        effectiveApproaches: Record<string, number>;
      }
    >
  ): void {
    for (const [key, learning] of Object.entries(data)) {
      this.learnings.set(key, {
        ...learning,
        effectiveApproaches: new Map(Object.entries(learning.effectiveApproaches)) as Map<
          ReasoningStyle,
          number
        >,
      });
    }
  }
}

// Singleton
let cognitiveLearningTracker: CognitiveLearningTracker | null = null;

export function getCognitiveLearningTracker(): CognitiveLearningTracker {
  if (!cognitiveLearningTracker) {
    cognitiveLearningTracker = new CognitiveLearningTracker();
  }
  return cognitiveLearningTracker;
}

// ============================================================================
// KNOWLEDGE STATE PERSISTENCE
// ============================================================================

export interface UserKnowledgeState {
  userId: string;

  /** Topics we've explained to this user */
  topicsExplained: Map<
    string,
    {
      firstExplained: Date;
      timesRevisited: number;
      understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
      lastAssessedConfidence: number;
      personaWhoExplained: string;
    }
  >;

  /** Don't re-explain these */
  skipExplanationFor: string[];

  /** User has asked about these multiple times - might need different approach */
  confusionTopics: string[];
}

/**
 * Track what we've explained to users
 */
export class KnowledgeStateTracker {
  private states = new Map<string, UserKnowledgeState>();

  /**
   * Record that we explained a topic
   */
  recordExplanation(
    userId: string,
    topic: string,
    personaId: string,
    userResponse: 'understood' | 'confused' | 'already_knew' | 'asked_more'
  ): void {
    let state = this.states.get(userId);
    if (!state) {
      state = {
        userId,
        topicsExplained: new Map(),
        skipExplanationFor: [],
        confusionTopics: [],
      };
      this.states.set(userId, state);
    }

    const existing = state.topicsExplained.get(topic);

    if (userResponse === 'already_knew') {
      // User already knows this - skip in future
      if (!state.skipExplanationFor.includes(topic)) {
        state.skipExplanationFor.push(topic);
      }
      if (!existing) {
        state.topicsExplained.set(topic, {
          firstExplained: new Date(),
          timesRevisited: 0,
          understandingLevel: 'expert',
          lastAssessedConfidence: 1.0,
          personaWhoExplained: personaId,
        });
      }
      return;
    }

    if (existing) {
      existing.timesRevisited++;

      if (userResponse === 'understood') {
        // Progress understanding level
        if (existing.understandingLevel === 'introduced') {
          existing.understandingLevel = 'learning';
        } else if (existing.understandingLevel === 'learning' && existing.timesRevisited >= 2) {
          existing.understandingLevel = 'comfortable';
        }
        existing.lastAssessedConfidence = Math.min(1.0, existing.lastAssessedConfidence + 0.2);
      } else if (userResponse === 'confused') {
        // Track confusion
        if (!state.confusionTopics.includes(topic)) {
          state.confusionTopics.push(topic);
        }
        existing.lastAssessedConfidence = Math.max(0, existing.lastAssessedConfidence - 0.3);
      } else if (userResponse === 'asked_more') {
        // Good sign - engaged but learning
        existing.lastAssessedConfidence = Math.min(1.0, existing.lastAssessedConfidence + 0.1);
      }
    } else {
      // First time explaining
      state.topicsExplained.set(topic, {
        firstExplained: new Date(),
        timesRevisited: 0,
        understandingLevel: 'introduced',
        lastAssessedConfidence: userResponse === 'understood' ? 0.6 : 0.3,
        personaWhoExplained: personaId,
      });

      if (userResponse === 'confused') {
        state.confusionTopics.push(topic);
      }
    }
  }

  /**
   * Get explanation guidance for a topic
   */
  getExplanationGuidance(
    userId: string,
    topic: string
  ): {
    shouldExplain: boolean;
    depth: 'skip' | 'brief_reminder' | 'moderate' | 'full';
    note: string;
  } {
    const state = this.states.get(userId);

    if (!state) {
      return {
        shouldExplain: true,
        depth: 'moderate',
        note: 'First time discussing with this user.',
      };
    }

    // Check if we should skip
    if (state.skipExplanationFor.includes(topic)) {
      return {
        shouldExplain: false,
        depth: 'skip',
        note: `User already knows about ${topic} - skip the basics.`,
      };
    }

    const topicState = state.topicsExplained.get(topic);
    if (!topicState) {
      return { shouldExplain: true, depth: 'moderate', note: `New topic for this user.` };
    }

    // Check understanding level
    switch (topicState.understandingLevel) {
      case 'expert':
        return { shouldExplain: false, depth: 'skip', note: `User is comfortable with ${topic}.` };
      case 'comfortable':
        return {
          shouldExplain: true,
          depth: 'brief_reminder',
          note: `User knows ${topic} - just a quick reference.`,
        };
      case 'learning':
        return {
          shouldExplain: true,
          depth: 'moderate',
          note: `User is learning ${topic} - reinforce key points.`,
        };
      case 'introduced':
        if (state.confusionTopics.includes(topic)) {
          return {
            shouldExplain: true,
            depth: 'full',
            note: `User has struggled with ${topic} - try a different approach.`,
          };
        }
        return {
          shouldExplain: true,
          depth: 'full',
          note: `User is new to ${topic} - explain thoroughly.`,
        };
    }
  }

  /**
   * Get state for persistence
   */
  getState(userId: string): UserKnowledgeState | null {
    return this.states.get(userId) || null;
  }

  /**
   * Load state from persistence
   */
  loadState(
    userId: string,
    data: Omit<UserKnowledgeState, 'topicsExplained'> & {
      topicsExplained: Record<
        string,
        UserKnowledgeState['topicsExplained'] extends Map<string, infer V> ? V : never
      >;
    }
  ): void {
    this.states.set(userId, {
      ...data,
      topicsExplained: new Map(
        Object.entries(data.topicsExplained).map(([k, v]) => [
          k,
          {
            ...v,
            firstExplained: new Date(v.firstExplained),
          },
        ])
      ),
    });
  }
}

// Singleton
let knowledgeStateTracker: KnowledgeStateTracker | null = null;

export function getKnowledgeStateTracker(): KnowledgeStateTracker {
  if (!knowledgeStateTracker) {
    knowledgeStateTracker = new KnowledgeStateTracker();
  }
  return knowledgeStateTracker;
}

// ============================================================================
// COGNITIVE GROWTH ARC
// ============================================================================

export interface CognitiveGrowthProfile {
  /** Relationship stage affects cognitive approach */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** How much to show reasoning (decreases with trust) */
  showReasoningLevel: number;

  /** How much to adapt to user (increases with familiarity) */
  adaptationLevel: number;

  /** Cognitive shortcuts allowed (increases with trust) */
  shortcutsAllowed: boolean;

  /** Can reference past cognitive patterns */
  canReferenceHistory: boolean;
}

/**
 * Get cognitive growth adjustments based on relationship stage
 */
export function getCognitiveGrowthProfile(
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor',
  sessionCount: number
): CognitiveGrowthProfile {
  switch (relationshipStage) {
    case 'stranger':
      return {
        relationshipStage,
        showReasoningLevel: 0.8, // Show thinking to build trust
        adaptationLevel: 0.3, // Not much data to adapt
        shortcutsAllowed: false, // Be thorough
        canReferenceHistory: false,
      };

    case 'acquaintance':
      return {
        relationshipStage,
        showReasoningLevel: 0.6,
        adaptationLevel: 0.5,
        shortcutsAllowed: false,
        canReferenceHistory: sessionCount > 2,
      };

    case 'friend':
      return {
        relationshipStage,
        showReasoningLevel: 0.4, // They trust your conclusions
        adaptationLevel: 0.7,
        shortcutsAllowed: true, // Can skip some basics
        canReferenceHistory: true,
      };

    case 'trusted_advisor':
      return {
        relationshipStage,
        showReasoningLevel: 0.2, // Only show reasoning for complex things
        adaptationLevel: 0.9, // Highly personalized
        shortcutsAllowed: true,
        canReferenceHistory: true,
      };
  }
}

/**
 * Build cognitive growth context for prompt
 */
export function buildCognitiveGrowthContext(
  profile: CognitiveGrowthProfile,
  cognitivelearning: CognitiveLearning | null
): string {
  const sections: string[] = [];

  // Relationship stage guidance
  sections.push(`[RELATIONSHIP: ${profile.relationshipStage.toUpperCase()}]`);

  if (profile.showReasoningLevel > 0.6) {
    sections.push('Show your thinking process to build trust.');
  } else if (profile.showReasoningLevel < 0.3) {
    sections.push('You can skip showing all your reasoning - they trust you.');
  }

  if (profile.shortcutsAllowed) {
    sections.push('You can use shorthand and skip basics they already know.');
  }

  if (profile.canReferenceHistory && cognitivelearning) {
    // Reference what has worked
    if (cognitivelearning.breakthroughApproaches.length > 0) {
      sections.push(
        `Past breakthroughs with ${cognitivelearning.breakthroughApproaches.join(', ')} approach.`
      );
    }
    if (cognitivelearning.expertiseTopics.length > 0) {
      sections.push(
        `They're knowledgeable about: ${cognitivelearning.expertiseTopics.slice(0, 3).join(', ')}.`
      );
    }
  }

  if (profile.adaptationLevel > 0.7 && cognitivelearning?.userPreferredStyle !== 'unknown') {
    sections.push(`Adapt to their ${cognitivelearning?.userPreferredStyle} thinking style.`);
  }

  return sections.join('\n');
}

export default {
  detectUserCognitiveStyle,
  buildCognitiveHandoffContext,
  buildReasoningChain,
  getReasoningChainGuidance,
  detectCognitiveConflict,
  getCognitiveLearningTracker,
  getKnowledgeStateTracker,
  getCognitiveGrowthProfile,
  buildCognitiveGrowthContext,
};
