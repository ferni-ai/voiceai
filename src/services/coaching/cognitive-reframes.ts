/**
 * Cognitive Reframe Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Offers multiple ways to reframe unhelpful thought patterns.
 * Not about positive thinking - about accurate thinking.
 *
 * Philosophy:
 * - Thoughts aren't facts
 * - Multiple perspectives exist
 * - Reframing is skill-building, not dismissing
 *
 * @module CognitiveReframes
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CognitiveReframes' });

// ============================================================================
// TYPES
// ============================================================================

export type DistortionType =
  | 'all_or_nothing' // Black and white thinking
  | 'catastrophizing' // Assuming worst case
  | 'mind_reading' // Assuming what others think
  | 'fortune_telling' // Predicting negative future
  | 'should_statements' // Rigid expectations
  | 'emotional_reasoning' // Feelings = facts
  | 'personalization' // Taking excess blame
  | 'overgeneralization' // One instance = pattern
  | 'mental_filter' // Focus only on negative
  | 'disqualifying_positive' // Dismissing good things
  | 'labeling'; // I AM this, not I DID this

export interface CognitiveReframe {
  id: string;
  distortionType: DistortionType;
  originalThought: string;
  reframes: ReframeOption[];
  selectedReframe?: string;
  helpful: boolean | null;
}

export interface ReframeOption {
  reframe: string;
  technique: string;
  rationale: string;
}

export interface ReframeProfile {
  userId: string;
  reframes: CognitiveReframe[];
  distortionFrequency: Map<DistortionType, number>;
  helpfulReframes: string[]; // Techniques that resonated
}

// ============================================================================
// DISTORTION PATTERNS
// ============================================================================

const DISTORTION_PATTERNS: Record<DistortionType, RegExp[]> = {
  all_or_nothing: [
    /\b(always|never|every time|nothing ever)\b/i,
    /\b(completely|totally|absolutely) (failed|ruined|wrong)\b/i,
    /\bif i can't .+, (then|i might as well)\b/i,
    /\beither .+ or .+ (nothing|fail)\b/i,
  ],
  catastrophizing: [
    /\bwhat if .+ (terrible|awful|disaster|worst)\b/i,
    /\bi('ll| will) (probably|definitely) .+ (fail|lose|die)\b/i,
    /\bthis is going to (ruin|destroy|end)\b/i,
    /\beverything (is|will be) (ruined|over|destroyed)\b/i,
  ],
  mind_reading: [
    /\bthey (think|probably think|must think)\b/i,
    /\beveryone (thinks|knows|sees)\b/i,
    /\bi know (they|he|she) (thinks|feels|wants)\b/i,
    /\bthey('re| are) (judging|laughing at|looking at) me\b/i,
  ],
  fortune_telling: [
    /\bit('s| is) (never going|not going) to (work|change|get better)\b/i,
    /\bi know .+ (won't|will never)\b/i,
    /\bthere('s| is) no (way|point|chance)\b/i,
    /\bi('ll| will) never\b/i,
  ],
  should_statements: [
    /\bi (should|shouldn't|must|have to|need to)\b/i,
    /\bi (ought to|supposed to)\b/i,
    /\bthey (should|shouldn't|need to)\b/i,
    /\b(have to|must) be (perfect|better|more)\b/i,
  ],
  emotional_reasoning: [
    /\bi feel (like a|like|so) .+ so i (must be|am)\b/i,
    /\bi feel .+ (therefore|so it must)\b/i,
    /\bbecause i feel\b/i,
    /\bif i feel .+ (it must be|it is)\b/i,
  ],
  personalization: [
    /\bit('s| is) (all )?(my fault|because of me)\b/i,
    /\bi (caused|made|ruined)\b/i,
    /\bif (i had|only i)\b/i,
    /\bthey .+ because (of me|i)\b/i,
  ],
  overgeneralization: [
    /\bthis always happens\b/i,
    /\beveryone (always|does this)\b/i,
    /\bnothing (ever|good ever)\b/i,
    /\bsee\? .+ (always|just like)\b/i,
  ],
  mental_filter: [
    /\bbut .+ (negative|bad|wrong)\b/i,
    /\beven though .+ still (bad|wrong|terrible)\b/i,
    /\bdoesn't matter .+ because\b/i,
  ],
  disqualifying_positive: [
    /\bthat (doesn't count|was just|was only)\b/i,
    /\byes but\b/i,
    /\bthey('re| are) just (being nice|saying that)\b/i,
    /\banyone (could|would) (do that|have done)\b/i,
  ],
  labeling: [
    /\bi('m| am) (such )?(a|an) (idiot|failure|loser|mess)\b/i,
    /\bi('m| am) just (bad at|terrible at|not good)\b/i,
    /\bi('m| am) the (worst|problem|issue)\b/i,
    /\bthey('re| are) (such )?(a|an) (jerk|idiot)\b/i,
  ],
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const reframeProfiles = new Map<string, ReframeProfile>();

function getOrCreateProfile(userId: string): ReframeProfile {
  let profile = reframeProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      reframes: [],
      distortionFrequency: new Map(),
      helpfulReframes: [],
    };
    reframeProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// DISTORTION DETECTION
// ============================================================================

/**
 * Detect cognitive distortions in text
 */
export function detectDistortions(
  text: string
): Array<{ type: DistortionType; confidence: number; trigger: string }> {
  const detected: Array<{ type: DistortionType; confidence: number; trigger: string }> = [];

  for (const [type, patterns] of Object.entries(DISTORTION_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        detected.push({
          type: type as DistortionType,
          confidence: 0.7,
          trigger: match[0],
        });
        break; // One match per type
      }
    }
  }

  return detected;
}

// ============================================================================
// REFRAME GENERATION
// ============================================================================

const REFRAME_TECHNIQUES: Record<DistortionType, Array<{ technique: string; template: string }>> = {
  all_or_nothing: [
    {
      technique: 'spectrum thinking',
      template: "What if there's a middle ground between '{negative}' and success?",
    },
    {
      technique: 'partial credit',
      template: "Even if it's not perfect, what parts of this are working?",
    },
    {
      technique: 'shades of gray',
      template: "On a scale of 1-10, how accurate is '{original}'?",
    },
  ],
  catastrophizing: [
    {
      technique: 'realistic probability',
      template: "What's the actual likelihood of the worst case? What's more likely?",
    },
    {
      technique: 'coping preview',
      template: 'Even if the worst happened, how would you cope?',
    },
    {
      technique: 'best/worst/likely',
      template: "What's the best case? Worst case? Most likely case?",
    },
  ],
  mind_reading: [
    {
      technique: 'evidence check',
      template: 'What evidence do you actually have that they think that?',
    },
    {
      technique: 'alternative explanations',
      template: 'What are three other reasons they might have acted that way?',
    },
    {
      technique: 'assumption surfacing',
      template: 'What would you need to assume for that to be true?',
    },
  ],
  fortune_telling: [
    {
      technique: 'past prediction accuracy',
      template: "When you've predicted this before, how often were you right?",
    },
    {
      technique: 'openness to surprise',
      template: 'What would have to happen for things to go differently than you expect?',
    },
    {
      technique: 'present focus',
      template: 'What do you actually know for sure right now?',
    },
  ],
  should_statements: [
    {
      technique: 'preference vs requirement',
      template: "What if 'should' became 'prefer to' or 'would like to'?",
    },
    {
      technique: 'source questioning',
      template: "Whose 'should' is this? Yours, or someone else's?",
    },
    {
      technique: 'consequences check',
      template: "What happens if you don't do what you 'should'?",
    },
  ],
  emotional_reasoning: [
    {
      technique: 'feelings vs facts',
      template: "What's the evidence outside of how you're feeling?",
    },
    {
      technique: 'emotion as data',
      template: 'Your feeling is valid, but what else might explain the situation?',
    },
    {
      technique: 'time travel',
      template: "How would you see this if you weren't feeling '{emotion}' right now?",
    },
  ],
  personalization: [
    {
      technique: 'contribution chart',
      template: 'What other factors contributed to this? What percentage is actually you?',
    },
    {
      technique: 'blame pie',
      template: 'If you had to divide responsibility, what would each person/factor get?',
    },
    {
      technique: 'reverse role',
      template: 'If a friend caused this same outcome, would you blame them completely?',
    },
  ],
  overgeneralization: [
    {
      technique: 'exception finding',
      template: 'When has this NOT happened? Even once?',
    },
    {
      technique: 'specificity',
      template: "What's specific about THIS situation that makes it different?",
    },
    {
      technique: 'sample size',
      template: 'How many times has this actually happened vs. felt like it happened?',
    },
  ],
  mental_filter: [
    {
      technique: 'full picture',
      template: 'What else happened that you might be overlooking?',
    },
    {
      technique: 'balanced view',
      template: 'What would someone who saw the whole picture say?',
    },
    {
      technique: 'positive scan',
      template: 'If you had to find one good thing about this, what would it be?',
    },
  ],
  disqualifying_positive: [
    {
      technique: 'counting it',
      template: 'What if that positive thing DID count? What would that mean?',
    },
    {
      technique: 'evidence weighing',
      template: 'Why does the negative evidence count more than the positive?',
    },
    {
      technique: 'friend perspective',
      template: 'Would you dismiss this if it happened to a friend?',
    },
  ],
  labeling: [
    {
      technique: 'behavior vs identity',
      template: "What if you DID '{action}' rather than you ARE '{label}'?",
    },
    {
      technique: 'whole person',
      template: "What else are you besides '{label}'?",
    },
    {
      technique: 'temporary vs permanent',
      template: "Is this who you always are, or how you're being right now?",
    },
  ],
};

/**
 * Generate multiple reframe options for a thought
 */
export function generateReframes(
  userId: string,
  originalThought: string,
  distortionType: DistortionType
): CognitiveReframe {
  const profile = getOrCreateProfile(userId);

  // Track frequency
  const count = profile.distortionFrequency.get(distortionType) || 0;
  profile.distortionFrequency.set(distortionType, count + 1);

  // Get techniques for this distortion
  const techniques = REFRAME_TECHNIQUES[distortionType] || REFRAME_TECHNIQUES.all_or_nothing;

  // Generate options, prioritizing techniques that have helped before
  const reframes: ReframeOption[] = techniques.map(({ technique, template }) => {
    const reframe = template
      .replace('{original}', originalThought.slice(0, 50))
      .replace('{negative}', extractNegative(originalThought))
      .replace('{emotion}', 'this way')
      .replace('{action}', 'that')
      .replace('{label}', extractLabel(originalThought));

    return {
      reframe,
      technique,
      rationale: getReframRationale(technique),
    };
  });

  const cogReframe: CognitiveReframe = {
    id: `reframe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    distortionType,
    originalThought,
    reframes,
    helpful: null,
  };

  profile.reframes.push(cogReframe);

  log.debug({ userId, distortionType }, '🔄 Reframes generated');

  return cogReframe;
}

function extractNegative(text: string): string {
  const negatives = ['failure', 'terrible', 'awful', 'wrong', 'bad', 'ruined', 'never'];
  const lower = text.toLowerCase();
  for (const neg of negatives) {
    if (lower.includes(neg)) return neg;
  }
  return 'this';
}

function extractLabel(text: string): string {
  const match = text.match(/i('m| am) (a |an |the |such a )?(\w+)/i);
  return match ? match[3] : 'that';
}

function getReframRationale(technique: string): string {
  const rationales: Record<string, string> = {
    'spectrum thinking': 'Most situations exist on a spectrum, not as extremes.',
    'realistic probability': "Our brains overestimate danger. Let's check the math.",
    'evidence check': "Thoughts aren't facts. Let's see what we actually know.",
    'preference vs requirement': '"Should" creates pressure. "Prefer" creates choice.',
    'feelings vs facts': "Feelings are real, but they don't always match reality.",
    'contribution chart': 'We rarely cause things alone. Context matters.',
    'exception finding': "If there's even one exception, the rule isn't universal.",
    'full picture': "Our attention shapes our reality. Let's widen the lens.",
    'counting it': "Good things count even when we don't feel they should.",
    'behavior vs identity': 'Actions are changeable. Identity feels permanent.',
  };
  return rationales[technique] || 'A different angle might reveal something useful.';
}

// ============================================================================
// FEEDBACK TRACKING
// ============================================================================

/**
 * Record whether a reframe was helpful
 */
export function recordReframeFeedback(
  userId: string,
  reframeId: string,
  helpful: boolean,
  selectedTechnique?: string
): void {
  const profile = reframeProfiles.get(userId);
  if (!profile) return;

  const reframe = profile.reframes.find((r) => r.id === reframeId);
  if (reframe) {
    reframe.helpful = helpful;
    reframe.selectedReframe = selectedTechnique;

    if (helpful && selectedTechnique && !profile.helpfulReframes.includes(selectedTechnique)) {
      profile.helpfulReframes.push(selectedTechnique);
    }

    log.debug({ userId, reframeId, helpful }, '📝 Reframe feedback recorded');
  }
}

/**
 * Get most common distortions for a user
 */
export function getCommonDistortions(
  userId: string
): Array<{ type: DistortionType; count: number }> {
  const profile = reframeProfiles.get(userId);
  if (!profile) return [];

  return Array.from(profile.distortionFrequency.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for cognitive reframing
 */
export function buildReframeContext(
  userId: string,
  detectedDistortions?: Array<{ type: DistortionType; trigger: string }>
): string | null {
  if (!detectedDistortions || detectedDistortions.length === 0) return null;

  const profile = reframeProfiles.get(userId);
  const helpfulTechniques = profile?.helpfulReframes || [];

  const lines: string[] = ['[🔄 COGNITIVE REFRAME OPPORTUNITY]'];

  for (const { type, trigger } of detectedDistortions) {
    lines.push(`Detected: ${type.replace('_', ' ')} ("${trigger}")`);

    const techniques = REFRAME_TECHNIQUES[type] || [];
    lines.push('Reframe options:');
    for (const { technique, template } of techniques.slice(0, 2)) {
      const isPreferred = helpfulTechniques.includes(technique);
      lines.push(`• ${technique}${isPreferred ? ' ⭐' : ''}: "${template}"`);
    }
  }

  lines.push('');
  lines.push('Offer ONE reframe gently, not as correction but as curiosity.');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectDistortions,
  generateReframes,
  recordReframeFeedback,
  getCommonDistortions,
  buildReframeContext,
};
