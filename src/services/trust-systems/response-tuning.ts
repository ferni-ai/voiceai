/**
 * Trust-Aware Response Tuning
 *
 * Dynamically adjusts AI response style based on relationship depth,
 * emotional context, and trust signals.
 *
 * Philosophy: As trust deepens, we can be more direct, more vulnerable,
 * and more real. Early on, we're more careful and gentle.
 *
 * Tuning Dimensions:
 * - Directness (gentle vs. straightforward)
 * - Vulnerability (reserved vs. open)
 * - Challenge (supportive vs. challenging)
 * - Humor (serious vs. playful)
 * - Depth (surface vs. deep)
 *
 * @module ResponseTuning
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ResponseTuning' });

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipStage = 'new' | 'building' | 'established' | 'deep' | 'flourishing';

export interface ResponseStyle {
  /** How directly to communicate (0 = gentle, 1 = straightforward) */
  directness: number;

  /** How much vulnerability to show (0 = reserved, 1 = open) */
  vulnerability: number;

  /** How much to challenge vs support (0 = supportive, 1 = challenging) */
  challenge: number;

  /** How playful vs serious (0 = serious, 1 = playful) */
  humor: number;

  /** How deep to go (0 = surface, 1 = deep) */
  depth: number;

  /** Overall emotional warmth (0 = professional, 1 = warm) */
  warmth: number;
}

export interface TuningContext {
  userId: string;
  relationshipStage: RelationshipStage;
  currentEmotion?: string;
  emotionIntensity?: number;
  topic?: string;
  isVulnerableShare?: boolean;
  isAskingForAdvice?: boolean;
  isCrisis?: boolean;
  recentBoundaryRespected?: boolean;
  trustScore?: number;
  sessionCount?: number;
  /** User's preferred learning style for response adaptation */
  preferredLearningStyle?: string;
  /** Number of recent topics discussed for context depth */
  recentTopicCount?: number;
}

export interface TunedGuidance {
  style: ResponseStyle;
  suggestions: string[];
  avoidances: string[];
  toneWords: string[];
  examplePhrases: string[];
}

// ============================================================================
// STAGE-BASED DEFAULTS
// ============================================================================

const STAGE_DEFAULTS: Record<RelationshipStage, ResponseStyle> = {
  new: {
    directness: 0.3,
    vulnerability: 0.2,
    challenge: 0.1,
    humor: 0.4,
    depth: 0.3,
    warmth: 0.7,
  },
  building: {
    directness: 0.4,
    vulnerability: 0.3,
    challenge: 0.2,
    humor: 0.5,
    depth: 0.5,
    warmth: 0.8,
  },
  established: {
    directness: 0.6,
    vulnerability: 0.5,
    challenge: 0.4,
    humor: 0.6,
    depth: 0.6,
    warmth: 0.85,
  },
  deep: {
    directness: 0.7,
    vulnerability: 0.7,
    challenge: 0.6,
    humor: 0.6,
    depth: 0.8,
    warmth: 0.9,
  },
  flourishing: {
    directness: 0.8,
    vulnerability: 0.8,
    challenge: 0.7,
    humor: 0.7,
    depth: 0.9,
    warmth: 0.95,
  },
};

// ============================================================================
// EMOTIONAL ADJUSTMENTS
// ============================================================================

const EMOTION_ADJUSTMENTS: Record<string, Partial<ResponseStyle>> = {
  sad: {
    directness: -0.2,
    challenge: -0.3,
    warmth: +0.15,
    depth: +0.1,
  },
  anxious: {
    directness: -0.1,
    challenge: -0.2,
    humor: -0.2,
    warmth: +0.1,
  },
  angry: {
    directness: -0.15,
    challenge: -0.2,
    humor: -0.3,
    depth: +0.1,
  },
  happy: {
    humor: +0.2,
    warmth: +0.1,
    challenge: +0.1,
  },
  excited: {
    humor: +0.15,
    warmth: +0.1,
    directness: +0.1,
  },
  overwhelmed: {
    directness: -0.2,
    challenge: -0.4,
    depth: -0.2,
    warmth: +0.15,
  },
  vulnerable: {
    directness: -0.15,
    challenge: -0.3,
    warmth: +0.2,
    vulnerability: +0.2,
  },
};

// ============================================================================
// TUNING LOGIC
// ============================================================================

/**
 * Calculate tuned response style based on context
 */
export function calculateResponseStyle(context: TuningContext): ResponseStyle {
  // Start with stage defaults
  const baseStyle = { ...STAGE_DEFAULTS[context.relationshipStage] };

  // Apply emotional adjustments
  if (context.currentEmotion) {
    const emotionAdj = EMOTION_ADJUSTMENTS[context.currentEmotion.toLowerCase()];
    if (emotionAdj) {
      applyAdjustments(baseStyle, emotionAdj, context.emotionIntensity || 0.5);
    }
  }

  // Crisis mode: maximum gentleness
  if (context.isCrisis) {
    baseStyle.directness = Math.min(baseStyle.directness, 0.3);
    baseStyle.challenge = 0;
    baseStyle.warmth = 1;
    baseStyle.depth = 0.5; // Don't go too deep during crisis
  }

  // Vulnerable share: match their openness
  if (context.isVulnerableShare) {
    baseStyle.vulnerability = Math.min(baseStyle.vulnerability + 0.2, 1);
    baseStyle.warmth = Math.min(baseStyle.warmth + 0.1, 1);
    baseStyle.challenge = Math.max(baseStyle.challenge - 0.2, 0);
  }

  // Asking for advice: can be slightly more direct
  if (context.isAskingForAdvice && !context.isCrisis) {
    baseStyle.directness = Math.min(baseStyle.directness + 0.15, 0.85);
    baseStyle.challenge = Math.min(baseStyle.challenge + 0.1, 0.7);
  }

  // Trust score adjustment
  if (context.trustScore !== undefined) {
    const trustMultiplier = context.trustScore / 100;
    baseStyle.directness *= 0.8 + trustMultiplier * 0.4;
    baseStyle.vulnerability *= 0.7 + trustMultiplier * 0.6;
    baseStyle.challenge *= 0.5 + trustMultiplier * 1;
  }

  // Clamp all values to 0-1
  for (const key of Object.keys(baseStyle) as Array<keyof ResponseStyle>) {
    baseStyle[key] = Math.max(0, Math.min(1, baseStyle[key]));
  }

  return baseStyle;
}

/**
 * Apply adjustments with intensity
 */
function applyAdjustments(
  style: ResponseStyle,
  adjustments: Partial<ResponseStyle>,
  intensity: number
): void {
  for (const [key, value] of Object.entries(adjustments)) {
    if (value !== undefined) {
      const styleKey = key as keyof ResponseStyle;
      style[styleKey] += value * intensity;
    }
  }
}

/**
 * Generate complete tuning guidance
 */
export function generateTuningGuidance(context: TuningContext): TunedGuidance {
  const style = calculateResponseStyle(context);

  return {
    style,
    suggestions: generateSuggestions(style, context),
    avoidances: generateAvoidances(style, context),
    toneWords: generateToneWords(style),
    examplePhrases: generateExamplePhrases(style, context),
  };
}

/**
 * Generate suggestions based on style
 */
function generateSuggestions(style: ResponseStyle, context: TuningContext): string[] {
  const suggestions: string[] = [];

  // Directness suggestions
  if (style.directness < 0.4) {
    suggestions.push('Use softer language and hedging');
    suggestions.push('Ask questions rather than make statements');
  } else if (style.directness > 0.7) {
    suggestions.push('Be clear and straightforward');
    suggestions.push('Get to the point kindly but directly');
  }

  // Vulnerability suggestions
  if (style.vulnerability > 0.6) {
    suggestions.push('Can share own experiences and feelings');
    suggestions.push('Show genuine emotional response');
  } else {
    suggestions.push('Keep focus on them, not self');
  }

  // Challenge suggestions
  if (style.challenge > 0.5 && !context.isCrisis) {
    suggestions.push('Can gently push back or offer different perspective');
    suggestions.push('Ask challenging questions');
  } else {
    suggestions.push('Focus on validation and support');
  }

  // Depth suggestions
  if (style.depth > 0.7) {
    suggestions.push('Can explore underlying patterns and deeper meanings');
    suggestions.push('Connect current topic to broader life themes');
  } else {
    suggestions.push('Stay present with immediate situation');
  }

  return suggestions;
}

/**
 * Generate things to avoid
 */
function generateAvoidances(style: ResponseStyle, context: TuningContext): string[] {
  const avoidances: string[] = [];

  if (style.directness < 0.4) {
    avoidances.push("Don't be too blunt or prescriptive");
  }

  if (style.challenge < 0.3) {
    avoidances.push("Don't challenge or push back right now");
  }

  if (style.humor < 0.3) {
    avoidances.push('Avoid jokes or light-hearted comments');
  }

  if (context.isCrisis) {
    avoidances.push('No advice-giving unless explicitly asked');
    avoidances.push('No silver-lining or positive reframing');
    avoidances.push("Don't rush to fix or solve");
  }

  if (context.relationshipStage === 'new') {
    avoidances.push("Don't assume familiarity");
    avoidances.push("Don't reference things not yet shared");
  }

  return avoidances;
}

/**
 * Generate tone words
 */
function generateToneWords(style: ResponseStyle): string[] {
  const words: string[] = [];

  // Warmth scale
  if (style.warmth > 0.7) {
    words.push('warm', 'caring', 'supportive');
  }
  if (style.warmth > 0.85) {
    words.push('affectionate', 'tender');
  }

  // Directness scale
  if (style.directness > 0.6) {
    words.push('clear', 'honest');
  }
  if (style.directness < 0.4) {
    words.push('gentle', 'tentative');
  }

  // Depth scale
  if (style.depth > 0.7) {
    words.push('thoughtful', 'reflective');
  }
  if (style.depth < 0.4) {
    words.push('light', 'present');
  }

  // Humor scale
  if (style.humor > 0.5) {
    words.push('playful', 'light-hearted');
  }

  return words;
}

/**
 * Generate example phrases based on style
 */
function generateExamplePhrases(style: ResponseStyle, context: TuningContext): string[] {
  const phrases: string[] = [];

  // Opening phrases
  if (style.warmth > 0.8) {
    phrases.push('I hear you.');
    phrases.push('That makes so much sense.');
  }
  if (style.directness > 0.6) {
    phrases.push("Here's what I'm noticing...");
    phrases.push('Let me be real with you...');
  }
  if (style.directness < 0.4) {
    phrases.push("I'm wondering if...");
    phrases.push('What comes up for me is...');
  }

  // Challenge phrases (only if appropriate)
  if (style.challenge > 0.5 && !context.isCrisis) {
    phrases.push('Have you considered...');
    phrases.push("I'm curious - what if...");
    phrases.push('Can I offer a different perspective?');
  }

  // Vulnerability phrases
  if (style.vulnerability > 0.6) {
    phrases.push('That really lands for me.');
    phrases.push('I feel that.');
  }

  return phrases;
}

/**
 * Format guidance for LLM injection
 */
export function formatGuidanceForLLM(guidance: TunedGuidance): string {
  const sections: string[] = [];

  sections.push('[RESPONSE STYLE GUIDANCE]');
  sections.push('');

  // Style summary
  sections.push(`Tone: ${guidance.toneWords.join(', ')}`);
  sections.push(`Directness: ${Math.round(guidance.style.directness * 100)}%`);
  sections.push(`Warmth: ${Math.round(guidance.style.warmth * 100)}%`);
  sections.push('');

  // Suggestions
  if (guidance.suggestions.length > 0) {
    sections.push('DO:');
    for (const suggestion of guidance.suggestions) {
      sections.push(`• ${suggestion}`);
    }
    sections.push('');
  }

  // Avoidances
  if (guidance.avoidances.length > 0) {
    sections.push("DON'T:");
    for (const avoidance of guidance.avoidances) {
      sections.push(`• ${avoidance}`);
    }
    sections.push('');
  }

  // Example phrases
  if (guidance.examplePhrases.length > 0) {
    sections.push('EXAMPLE PHRASES:');
    for (const phrase of guidance.examplePhrases.slice(0, 3)) {
      sections.push(`• "${phrase}"`);
    }
  }

  return sections.join('\n');
}

/**
 * Quick style check for a response
 */
export function checkResponseAlignment(
  response: string,
  guidance: TunedGuidance
): {
  aligned: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for challenge language when shouldn't challenge
  if (guidance.style.challenge < 0.3) {
    const challengePatterns = [
      /\bhave you tried\b/i,
      /\byou should\b/i,
      /\bwhy don't you\b/i,
      /\byou need to\b/i,
    ];
    for (const pattern of challengePatterns) {
      if (pattern.test(response)) {
        issues.push('Response may be too challenging for current context');
        break;
      }
    }
  }

  // Check for humor when should be serious
  if (guidance.style.humor < 0.3) {
    const humorPatterns = [/\bhaha\b/i, /\blol\b/i, /😂|😄|🤣/];
    for (const pattern of humorPatterns) {
      if (pattern.test(response)) {
        issues.push('Humor may not be appropriate right now');
        break;
      }
    }
  }

  // Check directness
  if (guidance.style.directness < 0.4) {
    const directPatterns = [/\byou must\b/i, /\byou have to\b/i, /\bthe answer is\b/i];
    for (const pattern of directPatterns) {
      if (pattern.test(response)) {
        issues.push('Response may be too direct');
        break;
      }
    }
  }

  return {
    aligned: issues.length === 0,
    issues,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateResponseStyle,
  generateTuningGuidance,
  formatGuidanceForLLM,
  checkResponseAlignment,
};
