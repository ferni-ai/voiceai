/**
 * Learning Style Adaptation
 *
 * Detects and adapts to individual learning and processing styles
 * for more effective advice and support delivery.
 *
 * Philosophy: People absorb information differently. Some need
 * metaphors, some need steps, some need space to process.
 * Meeting them where they are makes advice land.
 *
 * Style Dimensions:
 * - Processing (analytical vs intuitive)
 * - Pacing (fast vs slow)
 * - Structure (detailed vs big-picture)
 * - Examples (concrete vs abstract)
 * - Validation (direct vs exploring)
 *
 * @module LearningStyle
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LearningStyle' });

// ============================================================================
// TYPES
// ============================================================================

export type ProcessingStyle = 'analytical' | 'intuitive' | 'balanced';
export type PacingStyle = 'fast' | 'moderate' | 'slow' | 'adaptive';
export type StructureStyle = 'detailed' | 'big_picture' | 'flexible';
export type ExampleStyle = 'concrete' | 'abstract' | 'metaphorical' | 'mixed';
export type ValidationStyle = 'direct' | 'exploratory' | 'supportive';

export interface LearningProfile {
  userId: string;

  // Core dimensions
  processing: ProcessingDimension;
  pacing: PacingDimension;
  structure: StructureDimension;
  examples: ExampleDimension;
  validation: ValidationDimension;

  // Detected patterns
  patterns: LearningPattern[];

  // Adaptations made
  adaptations: AdaptationRecord[];

  confidence: number;
  lastUpdated: Date;
}

export interface ProcessingDimension {
  style: ProcessingStyle;
  indicators: {
    asksForData: number;
    asksForFeelings: number;
    prefersLogic: number;
    prefersIntuition: number;
  };
  confidence: number;
}

export interface PacingDimension {
  style: PacingStyle;
  avgResponseTime: number; // seconds before they respond
  prefersBreaks: boolean;
  processesOutLoud: boolean;
  confidence: number;
}

export interface StructureDimension {
  style: StructureStyle;
  prefersSteps: boolean;
  prefersOverview: boolean;
  toleratesAmbiguity: number; // 0-1
  confidence: number;
}

export interface ExampleDimension {
  style: ExampleStyle;
  respondsBestTo: Array<'stories' | 'data' | 'metaphors' | 'analogies' | 'real_examples'>;
  confidence: number;
}

export interface ValidationDimension {
  style: ValidationStyle;
  needsReassurance: number; // 0-1
  prefersChallenge: number; // 0-1
  wantsExploration: number; // 0-1
  confidence: number;
}

export interface LearningPattern {
  id: string;
  pattern: string;
  observation: string;
  strength: number;
  detectedAt: Date;
}

export interface AdaptationRecord {
  timestamp: Date;
  adaptation: string;
  reception: 'positive' | 'neutral' | 'negative';
  context: string;
}

export interface StyleSignal {
  type: 'processing' | 'pacing' | 'structure' | 'examples' | 'validation';
  signal: string;
  strength: number;
}

export interface DeliveryGuidance {
  format: DeliveryFormat;
  pacing: string;
  structure: string;
  examples: string;
  tone: string;
  suggestions: string[];
  avoidances: string[];
}

export interface DeliveryFormat {
  useSteps: boolean;
  useBullets: boolean;
  useMetaphors: boolean;
  useData: boolean;
  lengthPreference: 'brief' | 'moderate' | 'detailed';
}

// ============================================================================
// SIGNAL PATTERNS
// ============================================================================

const PROCESSING_SIGNALS = {
  analytical: [
    /\bwhy\s+does\b/i,
    /\bhow\s+does\s+that\s+work\b/i,
    /\bwhat's\s+the\s+logic\b/i,
    /\bdata|statistics|research\b/i,
    /\bstep\s+by\s+step\b/i,
    /\bspecifically\b/i,
  ],
  intuitive: [
    /\bfeels?\s+(like|right|wrong)\b/i,
    /\bmy\s+gut\s+says\b/i,
    /\bsomething\s+about\s+this\b/i,
    /\bi\s+just\s+know\b/i,
    /\bsense\s+that\b/i,
    /\bvibe\b/i,
  ],
};

const STRUCTURE_SIGNALS = {
  detailed: [
    /\btell\s+me\s+more\b/i,
    /\bwhat\s+exactly\b/i,
    /\bcan\s+you\s+explain\b/i,
    /\bwalk\s+me\s+through\b/i,
    /\bspecifically\b/i,
  ],
  big_picture: [
    /\bbottom\s+line\b/i,
    /\bin\s+summary\b/i,
    /\boverall\b/i,
    /\bbig\s+picture\b/i,
    /\bmain\s+(point|thing|idea)\b/i,
  ],
};

const EXAMPLE_SIGNALS = {
  concrete: [
    /\bfor\s+example\b/i,
    /\blike\s+what\b/i,
    /\bgive\s+me\s+an?\s+example\b/i,
    /\bsuch\s+as\b/i,
  ],
  metaphorical: [
    /\bit's\s+like\b/i,
    /\bkind\s+of\s+like\b/i,
    /\bsimilar\s+to\b/i,
    /\bremind(s)?\s+me\s+of\b/i,
  ],
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const learningProfiles = new Map<string, LearningProfile>();

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create learning profile
 */
function getOrCreateProfile(userId: string): LearningProfile {
  let profile = learningProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      processing: {
        style: 'balanced',
        indicators: { asksForData: 0, asksForFeelings: 0, prefersLogic: 0, prefersIntuition: 0 },
        confidence: 0,
      },
      pacing: {
        style: 'adaptive',
        avgResponseTime: 0,
        prefersBreaks: false,
        processesOutLoud: false,
        confidence: 0,
      },
      structure: {
        style: 'flexible',
        prefersSteps: false,
        prefersOverview: false,
        toleratesAmbiguity: 0.5,
        confidence: 0,
      },
      examples: {
        style: 'mixed',
        respondsBestTo: [],
        confidence: 0,
      },
      validation: {
        style: 'supportive',
        needsReassurance: 0.5,
        prefersChallenge: 0.5,
        wantsExploration: 0.5,
        confidence: 0,
      },
      patterns: [],
      adaptations: [],
      confidence: 0,
      lastUpdated: new Date(),
    };
    learningProfiles.set(userId, profile);
  }

  return profile;
}

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

/**
 * Detect learning style signals from user text
 */
export function detectStyleSignals(text: string): StyleSignal[] {
  const signals: StyleSignal[] = [];

  // Processing signals
  for (const pattern of PROCESSING_SIGNALS.analytical) {
    if (pattern.test(text)) {
      signals.push({ type: 'processing', signal: 'analytical', strength: 0.7 });
    }
  }
  for (const pattern of PROCESSING_SIGNALS.intuitive) {
    if (pattern.test(text)) {
      signals.push({ type: 'processing', signal: 'intuitive', strength: 0.7 });
    }
  }

  // Structure signals
  for (const pattern of STRUCTURE_SIGNALS.detailed) {
    if (pattern.test(text)) {
      signals.push({ type: 'structure', signal: 'detailed', strength: 0.7 });
    }
  }
  for (const pattern of STRUCTURE_SIGNALS.big_picture) {
    if (pattern.test(text)) {
      signals.push({ type: 'structure', signal: 'big_picture', strength: 0.7 });
    }
  }

  // Example signals
  for (const pattern of EXAMPLE_SIGNALS.concrete) {
    if (pattern.test(text)) {
      signals.push({ type: 'examples', signal: 'concrete', strength: 0.7 });
    }
  }
  for (const pattern of EXAMPLE_SIGNALS.metaphorical) {
    if (pattern.test(text)) {
      signals.push({ type: 'examples', signal: 'metaphorical', strength: 0.7 });
    }
  }

  // Validation signals
  if (/\bam\s+i\s+(right|wrong|crazy)\b/i.test(text)) {
    signals.push({ type: 'validation', signal: 'needs_reassurance', strength: 0.8 });
  }
  if (/\bchallenge\s+me\b/i.test(text) || /\bpush\s+me\b/i.test(text)) {
    signals.push({ type: 'validation', signal: 'prefers_challenge', strength: 0.8 });
  }

  return signals;
}

/**
 * Record learning signals and update profile
 */
export function recordLearningSignals(
  userId: string,
  text: string,
  context?: {
    responseTime?: number;
    askedFollowUp?: boolean;
    requestedExamples?: boolean;
    requestedClarification?: boolean;
  }
): void {
  const profile = getOrCreateProfile(userId);
  const signals = detectStyleSignals(text);

  // Update processing dimension
  for (const signal of signals.filter((s) => s.type === 'processing')) {
    if (signal.signal === 'analytical') {
      profile.processing.indicators.asksForData++;
      profile.processing.indicators.prefersLogic++;
    } else if (signal.signal === 'intuitive') {
      profile.processing.indicators.asksForFeelings++;
      profile.processing.indicators.prefersIntuition++;
    }
  }

  // Update processing style
  const proc = profile.processing.indicators;
  const analyticalScore = proc.asksForData + proc.prefersLogic;
  const intuitiveScore = proc.asksForFeelings + proc.prefersIntuition;

  if (analyticalScore > intuitiveScore * 1.5) {
    profile.processing.style = 'analytical';
  } else if (intuitiveScore > analyticalScore * 1.5) {
    profile.processing.style = 'intuitive';
  } else {
    profile.processing.style = 'balanced';
  }

  profile.processing.confidence = Math.min(1, (analyticalScore + intuitiveScore) / 20);

  // Update structure dimension
  for (const signal of signals.filter((s) => s.type === 'structure')) {
    if (signal.signal === 'detailed') {
      profile.structure.prefersSteps = true;
      profile.structure.style = 'detailed';
    } else if (signal.signal === 'big_picture') {
      profile.structure.prefersOverview = true;
      profile.structure.style = 'big_picture';
    }
  }

  // Update examples dimension
  for (const signal of signals.filter((s) => s.type === 'examples')) {
    if (signal.signal === 'concrete') {
      if (!profile.examples.respondsBestTo.includes('real_examples')) {
        profile.examples.respondsBestTo.push('real_examples');
      }
      profile.examples.style = 'concrete';
    } else if (signal.signal === 'metaphorical') {
      if (!profile.examples.respondsBestTo.includes('metaphors')) {
        profile.examples.respondsBestTo.push('metaphors');
      }
      profile.examples.style = 'metaphorical';
    }
  }

  // Update validation dimension
  for (const signal of signals.filter((s) => s.type === 'validation')) {
    if (signal.signal === 'needs_reassurance') {
      profile.validation.needsReassurance = Math.min(1, profile.validation.needsReassurance + 0.1);
    } else if (signal.signal === 'prefers_challenge') {
      profile.validation.prefersChallenge = Math.min(1, profile.validation.prefersChallenge + 0.1);
    }
  }

  // Update pacing from context
  if (context?.responseTime) {
    const alpha = 0.3;
    profile.pacing.avgResponseTime =
      profile.pacing.avgResponseTime * (1 - alpha) + context.responseTime * alpha;

    if (profile.pacing.avgResponseTime > 10) {
      profile.pacing.style = 'slow';
    } else if (profile.pacing.avgResponseTime < 3) {
      profile.pacing.style = 'fast';
    } else {
      profile.pacing.style = 'moderate';
    }
  }

  // Detect patterns
  detectLearningPatterns(profile);

  // Update overall confidence
  profile.confidence = average([
    profile.processing.confidence,
    profile.pacing.confidence,
    profile.structure.confidence || 0.5,
    profile.examples.confidence || 0.5,
    profile.validation.confidence || 0.5,
  ]);

  profile.lastUpdated = new Date();

  log.debug(
    {
      userId,
      signalCount: signals.length,
      confidence: profile.confidence,
    },
    '🧠 Learning signals recorded'
  );
}

/**
 * Detect patterns in learning style
 */
function detectLearningPatterns(profile: LearningProfile): void {
  const patterns: LearningPattern[] = [];

  // Processing pattern
  if (profile.processing.style === 'analytical' && profile.processing.confidence > 0.6) {
    patterns.push({
      id: 'proc-analytical',
      pattern: 'analytical_thinker',
      observation: 'Prefers logic and data-driven explanations',
      strength: profile.processing.confidence,
      detectedAt: new Date(),
    });
  }

  if (profile.processing.style === 'intuitive' && profile.processing.confidence > 0.6) {
    patterns.push({
      id: 'proc-intuitive',
      pattern: 'intuitive_processor',
      observation: 'Trusts gut feelings and emotional intelligence',
      strength: profile.processing.confidence,
      detectedAt: new Date(),
    });
  }

  // Pacing pattern
  if (profile.pacing.style === 'slow') {
    patterns.push({
      id: 'pace-reflective',
      pattern: 'reflective_processor',
      observation: 'Takes time to think before responding - needs space',
      strength: 0.7,
      detectedAt: new Date(),
    });
  }

  // Structure pattern
  if (profile.structure.prefersSteps) {
    patterns.push({
      id: 'struct-sequential',
      pattern: 'sequential_learner',
      observation: 'Prefers step-by-step explanations and clear structure',
      strength: 0.8,
      detectedAt: new Date(),
    });
  }

  profile.patterns = patterns;
}

// ============================================================================
// DELIVERY GUIDANCE
// ============================================================================

/**
 * Generate delivery guidance based on learning profile
 */
export function generateDeliveryGuidance(userId: string): DeliveryGuidance {
  const profile = getOrCreateProfile(userId);

  // Format guidance
  const format: DeliveryFormat = {
    useSteps: profile.structure.prefersSteps || profile.structure.style === 'detailed',
    useBullets: profile.processing.style === 'analytical',
    useMetaphors:
      profile.examples.style === 'metaphorical' ||
      profile.examples.respondsBestTo.includes('metaphors'),
    useData: profile.processing.style === 'analytical',
    lengthPreference:
      profile.structure.style === 'detailed'
        ? 'detailed'
        : profile.structure.style === 'big_picture'
          ? 'brief'
          : 'moderate',
  };

  // Pacing guidance
  let pacing = 'Standard pacing';
  if (profile.pacing.style === 'slow') {
    pacing = "Allow pauses, give space to process, don't rush";
  } else if (profile.pacing.style === 'fast') {
    pacing = 'Can be more direct and efficient';
  }

  // Structure guidance
  let structure = 'Flexible structure';
  if (profile.structure.style === 'detailed') {
    structure = 'Use numbered steps, clear transitions, thorough explanations';
  } else if (profile.structure.style === 'big_picture') {
    structure = 'Lead with the main point, keep details minimal';
  }

  // Examples guidance
  let examples = 'Use varied examples';
  if (profile.examples.style === 'concrete') {
    examples = 'Use specific, real-world examples';
  } else if (profile.examples.style === 'metaphorical') {
    examples = 'Use analogies and metaphors to explain concepts';
  }

  // Tone guidance
  let tone = 'Warm and supportive';
  if (profile.validation.prefersChallenge > 0.7) {
    tone = 'Can be more challenging and direct';
  } else if (profile.validation.needsReassurance > 0.7) {
    tone = 'Extra validation and reassurance';
  }

  // Generate suggestions
  const suggestions: string[] = [];
  const avoidances: string[] = [];

  if (profile.processing.style === 'analytical') {
    suggestions.push('Support points with reasoning');
    suggestions.push('Explain the "why" behind suggestions');
    avoidances.push('Avoid purely emotional appeals');
  }

  if (profile.processing.style === 'intuitive') {
    suggestions.push('Check in with how things feel');
    suggestions.push('Honor gut reactions');
    avoidances.push('Avoid over-explaining with logic');
  }

  if (profile.pacing.style === 'slow') {
    suggestions.push('Use pauses and silence');
    suggestions.push('Ask "what comes up for you?"');
    avoidances.push('Avoid rapid-fire questions');
  }

  if (profile.structure.prefersSteps) {
    suggestions.push('Number your suggestions');
    suggestions.push('Provide clear action items');
  }

  if (profile.validation.needsReassurance > 0.6) {
    suggestions.push('Validate before challenging');
    suggestions.push('Acknowledge their perspective first');
  }

  return {
    format,
    pacing,
    structure,
    examples,
    tone,
    suggestions,
    avoidances,
  };
}

/**
 * Format guidance for LLM injection
 */
export function formatGuidanceForLLM(userId: string): string | null {
  const profile = learningProfiles.get(userId);

  if (!profile || profile.confidence < 0.3) {
    return null;
  }

  const guidance = generateDeliveryGuidance(userId);
  const sections: string[] = [];

  sections.push('[LEARNING STYLE ADAPTATION]');

  // Processing
  if (profile.processing.confidence > 0.5) {
    sections.push(`Processing: ${profile.processing.style}`);
  }

  // Key adaptations
  if (guidance.format.useSteps) {
    sections.push('Use: Numbered steps, clear structure');
  }
  if (guidance.format.useMetaphors) {
    sections.push('Use: Analogies and metaphors');
  }
  if (guidance.format.useData) {
    sections.push('Use: Logic and reasoning');
  }

  sections.push(`Pacing: ${guidance.pacing}`);
  sections.push(`Tone: ${guidance.tone}`);

  if (guidance.suggestions.length > 0) {
    sections.push('');
    sections.push('Suggestions:');
    for (const s of guidance.suggestions.slice(0, 3)) {
      sections.push(`• ${s}`);
    }
  }

  if (guidance.avoidances.length > 0) {
    sections.push('');
    sections.push('Avoid:');
    for (const a of guidance.avoidances.slice(0, 2)) {
      sections.push(`• ${a}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// ADAPTATION TRACKING
// ============================================================================

/**
 * Record how an adaptation was received
 */
export function recordAdaptationReception(
  userId: string,
  adaptation: string,
  reception: 'positive' | 'neutral' | 'negative',
  context: string
): void {
  const profile = getOrCreateProfile(userId);

  profile.adaptations.push({
    timestamp: new Date(),
    adaptation,
    reception,
    context,
  });

  // Keep last 50
  if (profile.adaptations.length > 50) {
    profile.adaptations.shift();
  }

  // Adjust confidence based on reception
  if (reception === 'positive') {
    profile.confidence = Math.min(1, profile.confidence + 0.05);
  } else if (reception === 'negative') {
    profile.confidence = Math.max(0, profile.confidence - 0.1);
  }

  log.debug({ userId, adaptation, reception }, '📊 Adaptation reception recorded');
}

// ============================================================================
// HELPERS
// ============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get learning profile
 */
export function getLearningProfile(userId: string): LearningProfile | null {
  return learningProfiles.get(userId) || null;
}

/**
 * Get quick style summary
 */
export function getStyleSummary(userId: string): string | null {
  const profile = learningProfiles.get(userId);
  if (!profile || profile.confidence < 0.3) return null;

  const parts: string[] = [];

  if (profile.processing.confidence > 0.5) {
    parts.push(profile.processing.style);
  }
  if (profile.pacing.style !== 'adaptive') {
    parts.push(`${profile.pacing.style} paced`);
  }
  if (profile.structure.style !== 'flexible') {
    parts.push(profile.structure.style === 'detailed' ? 'detail-oriented' : 'big-picture');
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectStyleSignals,
  recordLearningSignals,
  generateDeliveryGuidance,
  formatGuidanceForLLM,
  recordAdaptationReception,
  getLearningProfile,
  getStyleSummary,
};
