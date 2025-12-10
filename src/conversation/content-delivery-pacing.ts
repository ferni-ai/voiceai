/**
 * Content Delivery Pacing
 *
 * Makes reading longer content feel human and "better than human."
 *
 * When Ferni reads from the web, summarizes research, or delivers
 * informational content, we need MORE than just sentence pauses.
 * Humans naturally:
 * - Slow down for important points
 * - Speed up through transitions
 * - Add "breathing room" between topics
 * - Use signposting phrases
 * - Vary their rhythm to maintain interest
 *
 * This module transforms robotic content delivery into engaging storytelling.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'ContentDeliveryPacing' });

// ============================================================================
// TYPES
// ============================================================================

export type ContentType =
  | 'web_result' // Search results, URLs, external content
  | 'list' // Enumerated items, bullet points
  | 'factual' // Statistics, data, definitions
  | 'narrative' // Story-like, sequential events
  | 'instructions' // How-to, steps
  | 'mixed' // Combination of types
  | 'conversational'; // Normal conversation (minimal pacing)

export interface ContentAnalysis {
  type: ContentType;
  complexity: 'simple' | 'moderate' | 'complex';
  wordCount: number;
  sentenceCount: number;
  hasNumbers: boolean;
  hasList: boolean;
  hasQuotes: boolean;
  estimatedReadTimeMs: number;
  segments: ContentSegment[];
}

export interface ContentSegment {
  text: string;
  type: 'opening' | 'main_point' | 'supporting' | 'transition' | 'list_item' | 'conclusion';
  importance: 'high' | 'medium' | 'low';
  ssmlPacing: SegmentPacing;
}

export interface SegmentPacing {
  /** Speed ratio (0.8 = slow, 1.0 = normal, 1.1 = faster) */
  speed: number;
  /** Pause before this segment in ms */
  pauseBefore: number;
  /** Pause after this segment in ms */
  pauseAfter: number;
  /** Volume adjustment (0.9 = softer, 1.0 = normal) */
  volume: number;
}

export interface DeliveryOptions {
  /** Force a specific content type */
  forceContentType?: ContentType;
  /** Persona affects delivery style */
  personaId?: string;
  /** User's current energy level */
  userEnergy?: 'high' | 'medium' | 'low';
  /** Is this responding to a direct question? */
  isDirectResponse?: boolean;
}

// ============================================================================
// CONTENT DETECTION PATTERNS
// ============================================================================

/** Patterns that indicate web/external content */
const WEB_CONTENT_PATTERNS = [
  /according to/i,
  /based on (the|my) (search|research)/i,
  /I found (that|some|a few)/i,
  /the (article|website|page|source) (says|mentions|states)/i,
  /from what I (can see|read|found)/i,
  /here's what I found/i,
  /the search (results|shows)/i,
  /looking at (the|this)/i,
  /(recent|latest) (news|reports|studies)/i,
  /https?:\/\//i,
];

/** Patterns that indicate list content */
const LIST_PATTERNS = [
  /^\s*(first|second|third|fourth|finally)/im,
  /^\s*(\d+[\.\):]|\•|\-|\*)\s/m,
  /here are (some|a few|the)/i,
  /there are (several|multiple|a few)/i,
  /(one|another|also|additionally|furthermore)/i,
  /on one hand.*on the other/i,
];

/** Patterns that indicate factual/data content */
const FACTUAL_PATTERNS = [
  /\d+\s*(percent|%|million|billion|thousand)/i,
  /studies (show|indicate|suggest)/i,
  /research (shows|indicates|suggests)/i,
  /statistics|data shows|survey/i,
  /average|median|typically|usually/i,
  /defined as|meaning|refers to/i,
  /in \d{4}/i, // Years like "in 2024"
];

/** Patterns that indicate narrative content */
const NARRATIVE_PATTERNS = [
  /once upon|there was|it all started/i,
  /so basically|here's the thing|let me explain/i,
  /what happened was|the story is/i,
  /imagine|picture this|think about/i,
];

/** Patterns that indicate instructions */
const INSTRUCTION_PATTERNS = [
  /first you|then you|next|after that/i,
  /step \d|to do this|here's how/i,
  /you'll need to|make sure to|don't forget/i,
  /start by|begin with|finish by/i,
];

// ============================================================================
// SIGNPOSTING PHRASES - Makes delivery feel guided
// ============================================================================

const SIGNPOSTING = {
  /** Opening phrases for multi-part content */
  opening: [
    'So,',
    'Okay, so',
    "Here's what I found.",
    "Alright, so here's the thing.",
    'Let me share what I learned.',
  ],

  /** Transition phrases between points */
  transitions: [
    'Also,',
    'And -',
    'Plus,',
    'On top of that,',
    'Another thing:',
    "Here's the interesting part:",
    'Now,',
    'And then,',
  ],

  /** Emphasis phrases for important points */
  emphasis: [
    'This is important:',
    'Key thing here:',
    'Worth noting:',
    'The main takeaway:',
    "Here's what matters:",
  ],

  /** Closing/summary phrases */
  closing: [
    'So basically,',
    'The bottom line is,',
    'In short,',
    'What this means is,',
    "So yeah, that's the gist.",
  ],
};

// ============================================================================
// PACING PROFILES - Different styles for different content
// ============================================================================

const PACING_PROFILES: Record<ContentType, { baseSpeed: number; pauseMultiplier: number }> = {
  web_result: { baseSpeed: 0.92, pauseMultiplier: 1.3 }, // Slower, more pauses
  list: { baseSpeed: 0.95, pauseMultiplier: 1.4 }, // Moderate, clear pauses between items
  factual: { baseSpeed: 0.9, pauseMultiplier: 1.2 }, // Slowest for data/stats
  narrative: { baseSpeed: 1.0, pauseMultiplier: 1.0 }, // Natural storytelling pace
  instructions: { baseSpeed: 0.93, pauseMultiplier: 1.3 }, // Clear and deliberate
  mixed: { baseSpeed: 0.95, pauseMultiplier: 1.2 }, // Balanced
  conversational: { baseSpeed: 1.0, pauseMultiplier: 1.0 }, // Normal
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect the type of content being delivered
 */
export function detectContentType(text: string): ContentType {
  const scores: Record<ContentType, number> = {
    web_result: 0,
    list: 0,
    factual: 0,
    narrative: 0,
    instructions: 0,
    mixed: 0,
    conversational: 0,
  };

  // Score each pattern type
  for (const pattern of WEB_CONTENT_PATTERNS) {
    if (pattern.test(text)) scores.web_result += 2;
  }

  for (const pattern of LIST_PATTERNS) {
    if (pattern.test(text)) scores.list += 2;
  }

  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.test(text)) scores.factual += 2;
  }

  for (const pattern of NARRATIVE_PATTERNS) {
    if (pattern.test(text)) scores.narrative += 2;
  }

  for (const pattern of INSTRUCTION_PATTERNS) {
    if (pattern.test(text)) scores.instructions += 2;
  }

  // Find highest score
  let maxScore = 0;
  let detectedType: ContentType = 'conversational';

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type as ContentType;
    }
  }

  // Check for mixed content
  const nonZeroCount = Object.values(scores).filter((s) => s > 0).length;
  if (nonZeroCount >= 3 && maxScore < 6) {
    detectedType = 'mixed';
  }

  // Default to conversational if no strong signals
  if (maxScore === 0) {
    detectedType = 'conversational';
  }

  return detectedType;
}

/**
 * Analyze content for optimal delivery pacing
 */
export function analyzeContent(text: string, options?: DeliveryOptions): ContentAnalysis {
  const type = options?.forceContentType || detectContentType(text);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Determine complexity
  let complexity: ContentAnalysis['complexity'] = 'simple';
  if (wordCount > 100 || sentenceCount > 6) {
    complexity = 'complex';
  } else if (wordCount > 50 || sentenceCount > 3) {
    complexity = 'moderate';
  }

  // Estimate read time (average speaking rate ~150 words/min)
  // Add extra time for complex content and pauses
  const baseReadTimeMs = (wordCount / 150) * 60 * 1000;
  const complexityMultiplier =
    complexity === 'complex' ? 1.3 : complexity === 'moderate' ? 1.15 : 1;
  const estimatedReadTimeMs = baseReadTimeMs * complexityMultiplier;

  // Segment the content
  const segments = segmentContent(text, type);

  return {
    type,
    complexity,
    wordCount,
    sentenceCount,
    hasNumbers: /\d+/.test(text),
    hasList: LIST_PATTERNS.some((p) => p.test(text)),
    hasQuotes: /"[^"]+"/.test(text),
    estimatedReadTimeMs: Math.round(estimatedReadTimeMs),
    segments,
  };
}

/**
 * Segment content into logical chunks for pacing
 */
function segmentContent(text: string, type: ContentType): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);

  if (sentences.length === 0) {
    return [createSegment(text, 'main_point', 'medium', type)];
  }

  // Single sentence - simple delivery
  if (sentences.length === 1) {
    return [createSegment(text, 'main_point', 'high', type)];
  }

  // Multiple sentences - create structured segments
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const isFirst = i === 0;
    const isLast = i === sentences.length - 1;
    const isTransition =
      /^(also|and|plus|additionally|furthermore|however|but|on the other hand)/i.test(sentence);
    const isListItem = /^(\d+[\.\)]|\•|\-|\*|first|second|third|finally)/i.test(sentence);

    let segmentType: ContentSegment['type'];
    let importance: ContentSegment['importance'];

    if (isFirst) {
      segmentType = 'opening';
      importance = 'high';
    } else if (isLast) {
      segmentType = 'conclusion';
      importance = 'high';
    } else if (isListItem) {
      segmentType = 'list_item';
      importance = 'medium';
    } else if (isTransition) {
      segmentType = 'transition';
      importance = 'low';
    } else if (detectImportantContent(sentence)) {
      segmentType = 'main_point';
      importance = 'high';
    } else {
      segmentType = 'supporting';
      importance = 'medium';
    }

    segments.push(createSegment(sentence, segmentType, importance, type));
  }

  return segments;
}

/**
 * Detect if a sentence contains important content
 */
function detectImportantContent(text: string): boolean {
  const importantPatterns = [
    /key|important|critical|essential|main|primary/i,
    /\d+\s*(percent|%|million|billion)/i,
    /remember|note that|keep in mind/i,
    /the (best|worst|most|least)/i,
    /crucial|vital|significant/i,
  ];

  return importantPatterns.some((p) => p.test(text));
}

/**
 * Create a content segment with appropriate pacing
 */
function createSegment(
  text: string,
  type: ContentSegment['type'],
  importance: ContentSegment['importance'],
  contentType: ContentType
): ContentSegment {
  const profile = PACING_PROFILES[contentType];

  // Base pacing
  let speed = profile.baseSpeed;
  let pauseBefore = 0;
  let pauseAfter = 200 * profile.pauseMultiplier;
  let volume = 1.0;

  // Adjust based on segment type
  switch (type) {
    case 'opening':
      speed *= 0.95; // Slightly slower for opening
      pauseAfter = 400 * profile.pauseMultiplier; // Longer pause after intro
      break;

    case 'main_point':
      speed *= 0.9; // Slower for key points
      pauseBefore = 300 * profile.pauseMultiplier;
      pauseAfter = 400 * profile.pauseMultiplier;
      break;

    case 'supporting':
      // Keep base pacing
      pauseBefore = 150 * profile.pauseMultiplier;
      pauseAfter = 200 * profile.pauseMultiplier;
      break;

    case 'transition':
      speed *= 1.05; // Slightly faster through transitions
      pauseBefore = 250 * profile.pauseMultiplier;
      pauseAfter = 200 * profile.pauseMultiplier;
      volume = 0.95; // Slightly softer
      break;

    case 'list_item':
      pauseBefore = 350 * profile.pauseMultiplier; // Clear pause before each item
      pauseAfter = 300 * profile.pauseMultiplier;
      break;

    case 'conclusion':
      speed *= 0.92; // Slow down for emphasis
      pauseBefore = 400 * profile.pauseMultiplier;
      volume = 1.02; // Slightly louder for emphasis
      break;
  }

  // Adjust for importance
  if (importance === 'high') {
    speed *= 0.95;
    pauseAfter *= 1.2;
  } else if (importance === 'low') {
    speed *= 1.02;
  }

  // Clamp values to safe ranges
  speed = Math.max(0.75, Math.min(1.15, speed));
  pauseBefore = Math.round(Math.max(0, Math.min(600, pauseBefore)));
  pauseAfter = Math.round(Math.max(100, Math.min(800, pauseAfter)));
  volume = Math.max(0.8, Math.min(1.1, volume));

  return {
    text,
    type,
    importance,
    ssmlPacing: {
      speed,
      pauseBefore,
      pauseAfter,
      volume,
    },
  };
}

/**
 * Apply delivery pacing to text, returning SSML-enhanced version
 */
export function applyDeliveryPacing(text: string, options?: DeliveryOptions): string {
  const analysis = analyzeContent(text, options);

  // Short conversational content - minimal enhancement
  if (analysis.type === 'conversational' && analysis.wordCount < 30) {
    log.debug({ wordCount: analysis.wordCount }, 'Short conversational content - minimal pacing');
    return text;
  }

  // Very short content - no pacing needed
  if (analysis.segments.length <= 1 && analysis.wordCount < 20) {
    return text;
  }

  log.debug(
    {
      type: analysis.type,
      wordCount: analysis.wordCount,
      segments: analysis.segments.length,
      complexity: analysis.complexity,
    },
    'Applying delivery pacing'
  );

  // Build SSML with pacing
  let result = '';

  for (let i = 0; i < analysis.segments.length; i++) {
    const segment = analysis.segments[i];
    const pacing = segment.ssmlPacing;
    const isFirst = i === 0;

    // Add pause before (except for first segment)
    if (!isFirst && pacing.pauseBefore > 0) {
      result += `<break time="${pacing.pauseBefore}ms"/>`;
    }

    // Apply speed and volume
    const speedTag = pacing.speed !== 1.0 ? `<speed ratio="${pacing.speed.toFixed(2)}"/>` : '';
    const volumeTag = pacing.volume !== 1.0 ? `<volume ratio="${pacing.volume.toFixed(2)}"/>` : '';

    result += speedTag + volumeTag + segment.text;

    // Add pause after
    if (pacing.pauseAfter > 0 && i < analysis.segments.length - 1) {
      result += `<break time="${pacing.pauseAfter}ms"/>`;
    }
  }

  // Add breathing room at the end for longer content
  if (analysis.complexity === 'complex' || analysis.wordCount > 80) {
    result += '<break time="300ms"/>';
  }

  return result;
}

/**
 * Check if content should use delivery pacing
 */
export function shouldApplyDeliveryPacing(text: string): boolean {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

  // Always apply for longer content
  if (wordCount > 60) return true;

  // Check for content type indicators
  const type = detectContentType(text);
  if (type !== 'conversational') return true;

  // Check for multiple sentences
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  if (sentenceCount > 3) return true;

  return false;
}

/**
 * Add signposting to multi-part content (optional enhancement)
 */
export function addSignposting(
  text: string,
  options?: { addOpening?: boolean; addTransitions?: boolean }
): string {
  const addOpening = options?.addOpening ?? false;
  const addTransitions = options?.addTransitions ?? false;

  let result = text;

  // Add opening phrase if requested and not already present
  if (
    addOpening &&
    !SIGNPOSTING.opening.some((p) => text.toLowerCase().startsWith(p.toLowerCase()))
  ) {
    const opener = SIGNPOSTING.opening[Math.floor(Math.random() * SIGNPOSTING.opening.length)];
    result = `${opener} ${result}`;
  }

  // Add transitions between points if requested
  // This is more complex and should be done selectively
  if (addTransitions) {
    // Look for sentences that could use transitions
    const sentences = result.split(/(?<=[.!?])\s+/);
    if (sentences.length > 2) {
      // Add transition to second sentence if it doesn't have one
      const secondSentence = sentences[1];
      if (secondSentence && !/^(also|and|plus|but|however|additionally)/i.test(secondSentence)) {
        const transition =
          SIGNPOSTING.transitions[Math.floor(Math.random() * SIGNPOSTING.transitions.length)];
        sentences[1] = `${transition} ${secondSentence}`;
        result = sentences.join(' ');
      }
    }
  }

  return result;
}

/**
 * Get a summary phrase for very long content
 */
export function getSummaryIntro(contentType: ContentType): string {
  const intros: Record<ContentType, string[]> = {
    web_result: [
      "Okay, so here's what I found.",
      "Here's what came up.",
      'So I looked into it, and -',
    ],
    list: ['So there are a few things here.', "Here's the rundown.", "Okay, so here's the list."],
    factual: ["Here's what the data shows.", 'So the numbers are interesting.', 'The facts are...'],
    narrative: ["So here's the story.", 'Let me tell you what happened.', 'So basically...'],
    instructions: ["Here's how to do it.", 'So the process is...', 'Let me walk you through it.'],
    mixed: ["Okay, so here's the thing.", "So there's a few things.", 'Let me break this down.'],
    conversational: ['So...', "Here's the thing...", 'Well...'],
  };

  const options = intros[contentType] || intros.conversational;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectContentType,
  analyzeContent,
  applyDeliveryPacing,
  shouldApplyDeliveryPacing,
  addSignposting,
  getSummaryIntro,
};
