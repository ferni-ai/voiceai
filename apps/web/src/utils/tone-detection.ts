/**
 * Tone Detection Utilities
 * 
 * Text analysis for emotional tone detection.
 * Used by Ferni EQ to trigger micro-expressions and anticipate emotions.
 * 
 * @module @ferni/tone-detection
 */

// ============================================================================
// TONE PATTERNS
// ============================================================================

const POSITIVE_PATTERNS = [
  /\b(great|awesome|amazing|wonderful|fantastic|excellent|perfect|love|happy|excited|good|nice|thank|grateful|blessed|fortunate)\b/i,
  /\b(can't wait|looking forward|so glad|really happy|super excited)\b/i,
  /!{1,2}$/,  // Ends with 1-2 exclamation marks (not excessive)
];

const NEGATIVE_PATTERNS = [
  /\b(sad|hard|difficult|frustrated|angry|worried|scared|anxious|stressed|overwhelmed|tired|exhausted)\b/i,
  /\b(can't|cannot|won't|shouldn't|hate|terrible|awful|worst|bad|wrong)\b/i,
  /\b(sorry|apologize|regret|wish I hadn't)\b/i,
  /\b(struggling|fighting|dealing with|going through)\b/i,
];

const EMOTIONAL_PATTERNS = [
  /\b(can't believe|oh my|really|actually|honestly|seriously|literally)\b/i,
  /\b(you know what|here's the thing|the truth is|to be honest)\b/i,
  /\.{3,}$/,  // Ends with ellipsis (trailing off)
  /\?{2,}$/,  // Excessive question marks
  /!{3,}$/,  // Excessive exclamation marks
];

const MEMORY_PATTERNS = [
  /\b(remember when|last time|you said|we talked about|you mentioned|before we)\b/i,
  /\b(back when|that time|like you said|as we discussed)\b/i,
];

const TOPIC_CHANGE_PATTERNS = [
  /\b(anyway|so anyway|but anyway|speaking of|by the way|oh and)\b/i,
  /\b(i wanted to ask|i've been thinking|can we talk about|there's something)\b/i,
  /\b(changing the subject|different topic|something else)\b/i,
];

const POSITIVE_ACHIEVEMENT_PATTERNS = [
  /\b(i did it|i made it|i got|i finished|i completed|i achieved|i passed|i won)\b/i,
  /\b(finally|at last|after all this time)\b/i,
  /\b(promotion|raise|accepted|approved|hired|graduated)\b/i,
];

const DISTRESS_PATTERNS = [
  /\b(i can't|i don't know what to do|i give up|what's the point)\b/i,
  /\b(i'm so lost|i feel hopeless|nothing works|everything is wrong)\b/i,
  /\b(i'm breaking|falling apart|can't take it|too much)\b/i,
];

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect the primary tone of a text message
 */
export function detectToneFromText(text: string): 'positive' | 'negative' | 'neutral' | 'emotional' {
  // Check patterns in priority order
  
  // Distress is highest priority (emotional + negative)
  if (DISTRESS_PATTERNS.some(p => p.test(text))) {
    return 'emotional';
  }
  
  // Check for clear positive signals
  const positiveMatches = POSITIVE_PATTERNS.filter(p => p.test(text)).length;
  const negativeMatches = NEGATIVE_PATTERNS.filter(p => p.test(text)).length;
  const emotionalMatches = EMOTIONAL_PATTERNS.filter(p => p.test(text)).length;
  
  // Strong emotional markers override sentiment
  if (emotionalMatches >= 2 || DISTRESS_PATTERNS.some(p => p.test(text))) {
    return 'emotional';
  }
  
  // Clear sentiment
  if (positiveMatches > negativeMatches && positiveMatches >= 1) {
    return 'positive';
  }
  
  if (negativeMatches > positiveMatches && negativeMatches >= 1) {
    return 'negative';
  }
  
  // Slight emotional coloring
  if (emotionalMatches >= 1) {
    return 'emotional';
  }
  
  return 'neutral';
}

/**
 * Detect if text contains a memory reference (callback opportunity)
 */
export function containsMemoryReference(text: string): boolean {
  return MEMORY_PATTERNS.some(p => p.test(text));
}

/**
 * Detect if text indicates a topic change
 */
export function isTopicChange(text: string): boolean {
  return TOPIC_CHANGE_PATTERNS.some(p => p.test(text));
}

/**
 * Detect emotional intensity (0-1)
 */
export function detectIntensityFromText(text: string): number {
  let intensity = 0.5; // Default moderate
  
  // Achievement detection boosts intensity
  if (POSITIVE_ACHIEVEMENT_PATTERNS.some(p => p.test(text))) {
    intensity += 0.3;
  }
  
  // Distress detection boosts intensity
  if (DISTRESS_PATTERNS.some(p => p.test(text))) {
    intensity += 0.4;
  }
  
  // Multiple emotional markers boost intensity
  const emotionalMatches = EMOTIONAL_PATTERNS.filter(p => p.test(text)).length;
  intensity += emotionalMatches * 0.1;
  
  // Punctuation analysis
  if (/!{2,}/.test(text)) intensity += 0.15;
  if (/\?{2,}/.test(text)) intensity += 0.1;
  if (/\.{3,}/.test(text)) intensity += 0.05; // Trailing off
  
  // All caps words (shouting)
  const capsWords = text.match(/\b[A-Z]{3,}\b/g);
  if (capsWords && capsWords.length > 0) {
    intensity += Math.min(0.2, capsWords.length * 0.05);
  }
  
  return Math.min(1, Math.max(0, intensity));
}

/**
 * Analyze text for micro-expression triggers
 * Returns parameters for detectAndTriggerMicroExpression()
 */
export function analyzeForMicroExpression(text: string): {
  transcript: string;
  tone: 'positive' | 'negative' | 'neutral' | 'emotional';
  intensity: number;
  isNewTopic: boolean;
  mentionedMemory: boolean;
  hasAchievement: boolean;
  hasInsight: boolean;
  isVulnerable: boolean;
  isProcessingDeep: boolean;
} {
  return {
    transcript: text,
    tone: detectToneFromText(text),
    intensity: detectIntensityFromText(text),
    isNewTopic: isTopicChange(text),
    mentionedMemory: containsMemoryReference(text),
    hasAchievement: hasAchievementMarker(text),
    hasInsight: hasInsightMarker(text),
    isVulnerable: isVulnerableShare(text),
    isProcessingDeep: isDeepProcessing(text),
  };
}

// ============================================================================
// ENHANCED DETECTION FOR MICRO-EXPRESSIONS
// ============================================================================

/**
 * Detect if user is sharing an achievement
 */
function hasAchievementMarker(text: string): boolean {
  const patterns = [
    /\b(i did it|i made it|i got|i finished|i completed|i achieved|i passed|i won)\b/i,
    /\b(finally|at last|after all this time)\b/i,
    /\b(promotion|raise|accepted|approved|hired|graduated|finished)\b/i,
    /\b(proud of|accomplished|managed to|succeeded)\b/i,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect if user had an insight/realization
 */
function hasInsightMarker(text: string): boolean {
  const patterns = [
    /\b(i (just )?realized|it (just )?hit me|i (just )?understood|now i (get|see|understand))\b/i,
    /\b(that makes sense|oh! |aha|wow,? i|never thought of it)\b/i,
    /\b(i've been thinking|it occurred to me|maybe the reason)\b/i,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect if user is sharing something vulnerable
 */
function isVulnerableShare(text: string): boolean {
  const patterns = [
    /\b(i('ve)? never told|between us|honestly|the truth is|i'm scared)\b/i,
    /\b(vulnerable|embarrassed|ashamed|afraid to|hard to admit)\b/i,
    /\b(can i tell you|promise you won't|don't judge)\b/i,
    /\b(i struggle with|i've been dealing with|i'm not okay)\b/i,
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect if user is processing something deep/philosophical
 */
function isDeepProcessing(text: string): boolean {
  const patterns = [
    /\b(meaning of|purpose of|what's the point|why do we|life is)\b/i,
    /\b(i('ve)? been wondering|i keep thinking about|can't stop thinking)\b/i,
    /\b(what if|sometimes i wonder|do you think)\b/i,
    /\b(bigger picture|in the grand scheme|when i'm gone|legacy)\b/i,
  ];
  return patterns.some(p => p.test(text));
}

// ============================================================================
// ANTICIPATION HELPERS
// ============================================================================

/**
 * Detect anticipated emotion from partial transcript
 * Used for "reading the future" - responding before user finishes speaking
 */
export function detectAnticipatedTone(
  partialText: string
): 'rising' | 'falling' | 'flat' {
  const text = partialText.toLowerCase();
  
  // Rising tone indicators (excitement, question)
  const risingIndicators = [
    /\b(i'm so|i can't wait|guess what|you know what|oh my)\b/,
    /\b(excited|happy|great news|finally)\b/,
    /\?$/, // Ends with question
  ];
  
  // Falling tone indicators (sad, heavy, reflective)
  const fallingIndicators = [
    /\b(i've been thinking about|i need to tell you|there's something)\b/,
    /\b(sad|hard|difficult|worried|scared)\b/,
    /\b(remember when|back when|used to)\b/, // Nostalgia
    /\.{2,}$/, // Trailing off
  ];
  
  const risingScore = risingIndicators.filter(p => p.test(text)).length;
  const fallingScore = fallingIndicators.filter(p => p.test(text)).length;
  
  if (risingScore > fallingScore) return 'rising';
  if (fallingScore > risingScore) return 'falling';
  return 'flat';
}

/**
 * Estimate energy level from text (for anticipation)
 */
export function estimateEnergyFromText(text: string): number {
  let energy = 0.5;
  
  // Exclamation marks increase energy
  const exclamations = (text.match(/!/g) || []).length;
  energy += Math.min(0.3, exclamations * 0.1);
  
  // CAPS increase energy
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
  energy += capsRatio * 0.3;
  
  // Question marks slight decrease (reflective)
  const questions = (text.match(/\?/g) || []).length;
  energy -= Math.min(0.1, questions * 0.03);
  
  // Ellipsis decreases energy (trailing off)
  if (/\.{2,}/.test(text)) energy -= 0.15;
  
  return Math.min(1, Math.max(0, energy));
}

