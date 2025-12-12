/**
 * Resistance Pattern Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting what users are AVOIDING - not just what they're saying.
 * Understanding deflection, intellectualization, humor as defense,
 * and other self-protective patterns.
 *
 * "I notice you change the subject when we get close to talking about your dad."
 *
 * This is superhuman because it requires tracking patterns over time
 * that even therapists might miss in session.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ResistanceDetection' });

// ============================================================================
// TYPES
// ============================================================================

export type DefensePattern =
  | 'intellectualization' // Using logic to avoid feeling
  | 'humor' // Joking when serious
  | 'externalizing' // Blaming others
  | 'minimizing' // "It's not that bad"
  | 'catastrophizing' // Making it worse than it is
  | 'deflection' // Changing subject
  | 'rationalization' // Explaining away feelings
  | 'denial' // "I'm fine"
  | 'projection' // Attributing own feelings to others
  | 'splitting' // All good or all bad thinking
  | 'sarcasm' // Using irony to distance
  | 'vagueness' // Being non-specific when specifics would help
  | 'whataboutism'; // Redirecting to others' issues

export interface AvoidedTopic {
  /** Topic or theme being avoided */
  topic: string;

  /** First detected */
  firstDetected: Date;

  /** Last time they came close to it */
  lastApproached: Date;

  /** How they typically deflect */
  deflectionPatterns: DefensePattern[];

  /** Snippets showing avoidance */
  evidence: Array<{
    text: string;
    timestamp: Date;
    defenseUsed: DefensePattern;
  }>;

  /** Emotional charge (how much energy around this) */
  emotionalCharge: 'high' | 'medium' | 'low';

  /** Are there signs they're ready to explore? */
  readinessSignals: string[];

  /** Estimated readiness to explore (0-1) */
  readiness: number;
}

export interface SelfProtectiveProfile {
  /** Overall defense tendency (0-1) */
  overallDefensiveness: number;

  /** Individual pattern scores */
  patterns: Record<DefensePattern, {
    frequency: number; // How often used (0-1)
    contexts: string[]; // What triggers it
    effectiveness: number; // How well it works for them (0-1)
    lastObserved: Date | null;
  }>;

  /** Primary defense mechanisms (top 3) */
  primaryDefenses: DefensePattern[];
}

export interface GrowthEdge {
  /** Topic or area */
  topic: string;

  /** Current openness level (0-1) */
  openness: number;

  /** Is now a good time to explore? */
  timing: 'now' | 'soon' | 'not_yet';

  /** Why we think they might be ready */
  readinessIndicators: string[];

  /** Gentle entry point */
  entryPoint: string;

  /** What to avoid saying */
  avoidPhrases: string[];
}

export interface ResistanceProfile {
  userId: string;

  /** Topics being avoided */
  avoidedTopics: AvoidedTopic[];

  /** Self-protective patterns */
  selfProtection: SelfProtectiveProfile;

  /** Areas where they're ready to grow */
  growthEdges: GrowthEdge[];

  /** Overall insight */
  summary: {
    mostAvoidedTopic: string | null;
    mostUsedDefense: DefensePattern | null;
    readiestGrowthArea: string | null;
    overallOpenness: number;
  };

  /** Metadata */
  metadata: {
    totalObservations: number;
    lastUpdated: Date;
    confidence: number;
  };
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const DEFENSE_PATTERNS: Record<DefensePattern, {
  patterns: RegExp[];
  indicators: string[];
}> = {
  intellectualization: {
    patterns: [
      /\b(logically|technically|objectively|rationally)\b/i,
      /the\s+(research|data|studies)\s+(show|say)/i,
      /statistically(\s+speaking)?/i,
      /if\s+you\s+think\s+about\s+it\s+(logically|rationally)/i,
    ],
    indicators: ['Using facts to avoid feelings', 'Over-analyzing emotional situations'],
  },
  humor: {
    patterns: [
      /haha|lol|😂|🤣/i,
      /just\s+kidding/i,
      /i('m| am)\s+joking/i,
      /on\s+a\s+(lighter|brighter)\s+note/i,
    ],
    indicators: ['Joking during serious topics', 'Deflecting with laughter'],
  },
  externalizing: {
    patterns: [
      /\b(they|he|she)\s+(made|forced|caused)\s+me/i,
      /it's\s+(their|his|her|not\s+my)\s+fault/i,
      /\b(blame|blaming)\b/i,
      /if\s+(they|he|she)\s+(hadn't|would|could)/i,
    ],
    indicators: ['Attributing responsibility to others', 'Not owning feelings'],
  },
  minimizing: {
    patterns: [
      /it's\s+(not\s+that|no)\s+big\s+deal/i,
      /it's\s+(fine|okay|whatever)/i,
      /could\s+be\s+worse/i,
      /it's\s+not\s+(really|that)\s+(important|serious)/i,
      /i'm\s+(fine|okay|good|alright)/i,
    ],
    indicators: ['Downplaying significance', 'Dismissing own feelings'],
  },
  catastrophizing: {
    patterns: [
      /\b(always|never|everyone|no\s+one)\b/i,
      /everything\s+is\s+(ruined|over|terrible)/i,
      /i\s+can't\s+(ever|anymore)/i,
      /nothing\s+(works|matters|will\s+change)/i,
    ],
    indicators: ['All-or-nothing language', 'Exaggerating negative outcomes'],
  },
  deflection: {
    patterns: [
      /anyway,?\s+(back|let's|so|what)/i,
      /but\s+(enough|let's\s+talk)\s+about/i,
      /speaking\s+of/i,
      /that\s+reminds\s+me/i,
      /on\s+another\s+(note|topic)/i,
    ],
    indicators: ['Abrupt topic changes', 'Redirecting conversation'],
  },
  rationalization: {
    patterns: [
      /\b(makes\s+sense|reasonable|understandable)\s+(because|since)/i,
      /i\s+had\s+to\s+(because|since)/i,
      /it's\s+(only\s+)?natural\s+(to|that)/i,
      /anyone\s+would\s+(have|do)/i,
    ],
    indicators: ['Logical explanations for emotional reactions'],
  },
  denial: {
    patterns: [
      /i('m| am)\s+(not|never)\s+(upset|angry|sad|hurt)/i,
      /that\s+doesn't\s+(bother|affect)\s+me/i,
      /i\s+don't\s+(care|mind)/i,
      /it\s+doesn't\s+matter/i,
    ],
    indicators: ['Refusing to acknowledge feelings', 'Contradicting visible emotions'],
  },
  projection: {
    patterns: [
      /\b(they|you)'re\s+(the\s+one\s+who|probably)\s+(feeling|thinking)/i,
      /everyone\s+(else\s+)?(thinks|feels)/i,
      /people\s+always/i,
    ],
    indicators: ['Attributing own feelings to others'],
  },
  splitting: {
    patterns: [
      /\b(always|never|completely|totally|absolutely)\b/i,
      /(the\s+best|the\s+worst)/i,
      /(perfect|terrible)/i,
      /\b(all|none)\s+of\s+(them|it)/i,
    ],
    indicators: ['Black-and-white thinking', 'No middle ground'],
  },
  sarcasm: {
    patterns: [
      /oh,?\s+(great|wonderful|perfect|sure)/i,
      /yeah,?\s+(right|sure)/i,
      /as\s+if/i,
      /obviously\s*\//i,
    ],
    indicators: ['Using irony to create distance'],
  },
  vagueness: {
    patterns: [
      /\b(stuff|things|whatever|something)\b/i,
      /i\s+(dunno|don't\s+know)/i,
      /it's\s+(complicated|hard\s+to\s+explain)/i,
      /you\s+know(\.\.\.|,)/i,
    ],
    indicators: ['Avoiding specifics', 'Trailing off'],
  },
  whataboutism: {
    patterns: [
      /\b(what|how)\s+about\s+(them|him|her|you)/i,
      /but\s+(they|he|she)\s+(also|too)/i,
      /at\s+least\s+i\s+(don't|didn't)/i,
    ],
    indicators: ['Redirecting to others\' issues'],
  },
};

const AVOIDANCE_TRIGGERS: Array<{
  pattern: RegExp;
  topic: string;
}> = [
  { pattern: /\b(dad|father|daddy)\b/i, topic: 'father' },
  { pattern: /\b(mom|mother|mommy)\b/i, topic: 'mother' },
  { pattern: /\b(childhood|growing\s+up|when\s+i\s+was\s+(young|little|a\s+kid))\b/i, topic: 'childhood' },
  { pattern: /\b(ex|divorce|breakup|past\s+relationship)\b/i, topic: 'past relationships' },
  { pattern: /\b(money|finances|debt|bills)\b/i, topic: 'finances' },
  { pattern: /\b(weight|body|eating|diet)\b/i, topic: 'body image' },
  { pattern: /\b(career|job|work|boss)\b/i, topic: 'career' },
  { pattern: /\b(death|dying|loss|grief)\b/i, topic: 'mortality' },
  { pattern: /\b(sex|intimacy|attraction)\b/i, topic: 'intimacy' },
  { pattern: /\b(fail|failure|failing|failed)\b/i, topic: 'failure' },
  { pattern: /\b(alone|lonely|loneliness)\b/i, topic: 'loneliness' },
  { pattern: /\b(future|what\s+if|worry\s+about)\b/i, topic: 'future anxiety' },
];

// ============================================================================
// PROFILE STORAGE
// ============================================================================

const profiles = new Map<string, ResistanceProfile>();

/**
 * Get or create resistance profile
 */
export function getResistanceProfile(userId: string): ResistanceProfile {
  let profile = profiles.get(userId);

  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  return profile;
}

function createEmptyProfile(userId: string): ResistanceProfile {
  const patterns: ResistanceProfile['selfProtection']['patterns'] = {} as any;

  for (const pattern of Object.keys(DEFENSE_PATTERNS) as DefensePattern[]) {
    patterns[pattern] = {
      frequency: 0,
      contexts: [],
      effectiveness: 0.5,
      lastObserved: null,
    };
  }

  return {
    userId,
    avoidedTopics: [],
    selfProtection: {
      overallDefensiveness: 0.3,
      patterns,
      primaryDefenses: [],
    },
    growthEdges: [],
    summary: {
      mostAvoidedTopic: null,
      mostUsedDefense: null,
      readiestGrowthArea: null,
      overallOpenness: 0.5,
    },
    metadata: {
      totalObservations: 0,
      lastUpdated: new Date(),
      confidence: 0,
    },
  };
}

// ============================================================================
// DETECTION ENGINE
// ============================================================================

export interface ResistanceAnalysis {
  /** Defenses detected in this message */
  defensesDetected: Array<{
    pattern: DefensePattern;
    evidence: string;
    confidence: number;
  }>;

  /** Topic being avoided (if any) */
  avoidedTopic: AvoidedTopic | null;

  /** Is this a deflection from something? */
  isDeflecting: boolean;

  /** What they might be deflecting from */
  deflectingFrom: string | null;

  /** Overall resistance level in this message (0-1) */
  resistanceLevel: number;

  /** Growth readiness signals */
  readinessSignals: string[];

  /** Suggested approach */
  approach: {
    strategy: 'honor' | 'gentle_invite' | 'reflect_back' | 'wait' | 'challenge';
    guidance: string;
    avoidPhrases: string[];
  };
}

/**
 * Analyze a message for resistance patterns
 */
export function analyzeResistance(
  userId: string,
  text: string,
  emotion: string,
  emotionIntensity: number,
  currentTopics: string[],
  previousTopic?: string
): ResistanceAnalysis {
  const profile = getResistanceProfile(userId);
  const defensesDetected: ResistanceAnalysis['defensesDetected'] = [];
  const readinessSignals: string[] = [];
  let resistanceLevel = 0;

  // Detect defense patterns
  for (const [pattern, config] of Object.entries(DEFENSE_PATTERNS)) {
    for (const regex of config.patterns) {
      const match = text.match(regex);
      if (match) {
        defensesDetected.push({
          pattern: pattern as DefensePattern,
          evidence: match[0],
          confidence: 0.6 + Math.random() * 0.2,
        });
        resistanceLevel += 0.1;
        break; // Only count each pattern once
      }
    }
  }

  // Check for topic avoidance
  let avoidedTopic: AvoidedTopic | null = null;
  let isDeflecting = false;
  let deflectingFrom: string | null = null;

  // Detect if we're deflecting
  const deflectionDefense = defensesDetected.find((d) => d.pattern === 'deflection');
  if (deflectionDefense && previousTopic) {
    isDeflecting = true;
    deflectingFrom = previousTopic;

    // Check if this topic is being avoided
    avoidedTopic = findOrCreateAvoidedTopic(profile, previousTopic);
    avoidedTopic.deflectionPatterns = [
      ...new Set([
        ...avoidedTopic.deflectionPatterns,
        ...defensesDetected.map((d) => d.pattern),
      ]),
    ];
    avoidedTopic.evidence.push({
      text: text.substring(0, 200),
      timestamp: new Date(),
      defenseUsed: deflectionDefense.pattern,
    });
    avoidedTopic.lastApproached = new Date();
    resistanceLevel += 0.2;
  }

  // Check for approach to sensitive topics
  for (const trigger of AVOIDANCE_TRIGGERS) {
    if (trigger.pattern.test(text)) {
      const topic = trigger.topic;
      const existing = profile.avoidedTopics.find((t) =>
        t.topic.toLowerCase().includes(topic.toLowerCase())
      );

      // If they're bringing it up voluntarily, that's a readiness signal
      if (!isDeflecting && emotionIntensity > 0.3) {
        readinessSignals.push(`Voluntarily mentioning ${topic}`);

        if (existing) {
          existing.readiness = Math.min(1, existing.readiness + 0.15);
          existing.readinessSignals.push(`Brought up ${topic} (${new Date().toISOString().split('T')[0]})`);
        }
      }
    }
  }

  // Detect readiness signals
  const readinessPatterns = [
    { pattern: /i('ve)?\s+been\s+thinking\s+about/i, signal: 'Active reflection' },
    { pattern: /i\s+(want|need)\s+to\s+talk\s+about/i, signal: 'Direct request' },
    { pattern: /i('m| am)\s+ready\s+to/i, signal: 'Stated readiness' },
    { pattern: /i\s+(should|need\s+to)\s+(probably|finally)/i, signal: 'Acknowledgment of need' },
    { pattern: /this\s+is\s+hard\s+(to\s+say|for\s+me)/i, signal: 'Vulnerability despite difficulty' },
  ];

  for (const { pattern, signal } of readinessPatterns) {
    if (pattern.test(text)) {
      readinessSignals.push(signal);
      resistanceLevel = Math.max(0, resistanceLevel - 0.1);
    }
  }

  // Update profile with observations
  updateProfile(profile, defensesDetected, currentTopics, resistanceLevel);

  // Determine approach
  const approach = determineApproach(
    resistanceLevel,
    defensesDetected.map((d) => d.pattern),
    readinessSignals.length > 0,
    emotionIntensity
  );

  // Update metadata
  profile.metadata.totalObservations++;
  profile.metadata.lastUpdated = new Date();
  profile.metadata.confidence = Math.min(0.9, profile.metadata.totalObservations / 30);

  return {
    defensesDetected,
    avoidedTopic,
    isDeflecting,
    deflectingFrom,
    resistanceLevel: Math.min(1, resistanceLevel),
    readinessSignals,
    approach,
  };
}

/**
 * Find or create an avoided topic
 */
function findOrCreateAvoidedTopic(profile: ResistanceProfile, topic: string): AvoidedTopic {
  let existing = profile.avoidedTopics.find((t) =>
    t.topic.toLowerCase().includes(topic.toLowerCase()) ||
    topic.toLowerCase().includes(t.topic.toLowerCase())
  );

  if (!existing) {
    existing = {
      topic,
      firstDetected: new Date(),
      lastApproached: new Date(),
      deflectionPatterns: [],
      evidence: [],
      emotionalCharge: 'medium',
      readinessSignals: [],
      readiness: 0.2,
    };
    profile.avoidedTopics.push(existing);
  }

  return existing;
}

/**
 * Update profile with new observations
 */
function updateProfile(
  profile: ResistanceProfile,
  defenses: ResistanceAnalysis['defensesDetected'],
  contexts: string[],
  resistanceLevel: number
): void {
  const alpha = 0.15;

  for (const { pattern, confidence } of defenses) {
    const patternData = profile.selfProtection.patterns[pattern];
    patternData.frequency = alpha * confidence + (1 - alpha) * patternData.frequency;
    patternData.lastObserved = new Date();

    // Add context if not already present
    for (const context of contexts) {
      if (!patternData.contexts.includes(context) && patternData.contexts.length < 10) {
        patternData.contexts.push(context);
      }
    }
  }

  // Update overall defensiveness
  profile.selfProtection.overallDefensiveness =
    alpha * resistanceLevel + (1 - alpha) * profile.selfProtection.overallDefensiveness;

  // Update primary defenses (top 3)
  const sortedPatterns = Object.entries(profile.selfProtection.patterns)
    .sort(([, a], [, b]) => b.frequency - a.frequency)
    .slice(0, 3)
    .map(([pattern]) => pattern as DefensePattern);

  profile.selfProtection.primaryDefenses = sortedPatterns;

  // Update summary
  updateProfileSummary(profile);
}

/**
 * Update profile summary
 */
function updateProfileSummary(profile: ResistanceProfile): void {
  // Most avoided topic
  const mostAvoided = profile.avoidedTopics
    .filter((t) => t.evidence.length > 0)
    .sort((a, b) => {
      const scoreA = a.evidence.length * (a.emotionalCharge === 'high' ? 2 : 1);
      const scoreB = b.evidence.length * (b.emotionalCharge === 'high' ? 2 : 1);
      return scoreB - scoreA;
    })[0];

  profile.summary.mostAvoidedTopic = mostAvoided?.topic || null;

  // Most used defense
  profile.summary.mostUsedDefense = profile.selfProtection.primaryDefenses[0] || null;

  // Readiest growth area
  const readiest = profile.avoidedTopics
    .filter((t) => t.readiness > 0.5)
    .sort((a, b) => b.readiness - a.readiness)[0];

  profile.summary.readiestGrowthArea = readiest?.topic || null;

  // Overall openness (inverse of defensiveness)
  profile.summary.overallOpenness = 1 - profile.selfProtection.overallDefensiveness;
}

/**
 * Determine approach based on resistance analysis
 */
function determineApproach(
  resistanceLevel: number,
  defenses: DefensePattern[],
  hasReadinessSignals: boolean,
  emotionIntensity: number
): ResistanceAnalysis['approach'] {
  // High resistance + no readiness = honor the defense
  if (resistanceLevel > 0.6 && !hasReadinessSignals) {
    return {
      strategy: 'honor',
      guidance: "They're not ready. Respect their pace. Don't push.",
      avoidPhrases: [
        "Let's dig deeper",
        "What are you really feeling",
        "It sounds like you're avoiding",
        "Why don't you want to talk about",
      ],
    };
  }

  // Moderate resistance + readiness signals = gentle invite
  if (resistanceLevel > 0.3 && hasReadinessSignals) {
    return {
      strategy: 'gentle_invite',
      guidance: "They're circling something. Create space but don't force entry.",
      avoidPhrases: [
        "You should talk about",
        "It's important to discuss",
        "You can't avoid this forever",
      ],
    };
  }

  // Humor as defense = reflect back gently
  if (defenses.includes('humor') && emotionIntensity > 0.5) {
    return {
      strategy: 'reflect_back',
      guidance: "Acknowledge both the humor and what might be underneath. Don't dismiss either.",
      avoidPhrases: [
        "Be serious",
        "This isn't funny",
        "Stop joking",
      ],
    };
  }

  // Intellectualization = meet them where they are, then bridge
  if (defenses.includes('intellectualization')) {
    return {
      strategy: 'gentle_invite',
      guidance: "Honor their analytical mind, then gently invite feelings. 'And how does that land for you emotionally?'",
      avoidPhrases: [
        "Stop analyzing",
        "How do you FEEL",
        "Get out of your head",
      ],
    };
  }

  // Low resistance = proceed naturally
  return {
    strategy: 'wait',
    guidance: 'They seem open. Follow their lead.',
    avoidPhrases: [],
  };
}

// ============================================================================
// GROWTH EDGE DETECTION
// ============================================================================

/**
 * Identify current growth edges
 */
export function identifyGrowthEdges(userId: string): GrowthEdge[] {
  const profile = getResistanceProfile(userId);
  const edges: GrowthEdge[] = [];

  for (const topic of profile.avoidedTopics) {
    if (topic.readiness > 0.4) {
      edges.push({
        topic: topic.topic,
        openness: topic.readiness,
        timing:
          topic.readiness > 0.7 ? 'now' : topic.readiness > 0.5 ? 'soon' : 'not_yet',
        readinessIndicators: topic.readinessSignals.slice(-3),
        entryPoint: generateEntryPoint(topic),
        avoidPhrases: generateAvoidPhrases(topic),
      });
    }
  }

  // Sort by readiness
  edges.sort((a, b) => b.openness - a.openness);

  profile.growthEdges = edges;
  return edges;
}

/**
 * Generate a gentle entry point for a topic
 */
function generateEntryPoint(topic: AvoidedTopic): string {
  const entryPoints: Record<string, string> = {
    father: "You've mentioned your dad a few times. I'm here if you ever want to explore that more.",
    mother: "It sounds like your relationship with your mom is complex. No rush, but I'm curious.",
    childhood: "The past has a way of staying with us. What's one memory that still feels alive?",
    'past relationships': "Old relationships leave marks. What did you learn about yourself from that time?",
    finances: "Money stuff can carry so much weight. What would feel lighter if it were resolved?",
    'body image': "How we relate to our bodies is so personal. What feels true for you right now?",
    career: "Work takes up so much of life. What would make it feel more meaningful?",
    mortality: "The big questions aren't easy. What helps you make sense of it all?",
    failure: "What we call failure often teaches the most. What did yours teach you?",
    loneliness: "Loneliness is one of those feelings people rarely admit. Thank you for being honest about it.",
    'future anxiety': "Uncertainty is hard. What would help you feel more grounded right now?",
  };

  for (const [key, entry] of Object.entries(entryPoints)) {
    if (topic.topic.toLowerCase().includes(key)) {
      return entry;
    }
  }

  return `You've touched on ${topic.topic} before. I'm here when you're ready to explore it.`;
}

/**
 * Generate phrases to avoid for sensitive topics
 */
function generateAvoidPhrases(topic: AvoidedTopic): string[] {
  const baseAvoid = [
    "You need to deal with",
    "You're clearly avoiding",
    "This is obviously about",
    "You should talk about",
    "Why won't you",
  ];

  // Add topic-specific avoids
  if (topic.deflectionPatterns.includes('humor')) {
    baseAvoid.push("Stop joking about this");
  }
  if (topic.deflectionPatterns.includes('minimizing')) {
    baseAvoid.push("This IS a big deal");
  }

  return baseAvoid;
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format resistance analysis for prompt injection
 */
export function formatResistanceForPrompt(analysis: ResistanceAnalysis): string {
  const lines = ['[RESISTANCE AWARENESS]'];

  if (analysis.defensesDetected.length > 0) {
    const defenseNames = [...new Set(analysis.defensesDetected.map((d) => d.pattern))];
    lines.push(`Defense patterns detected: ${defenseNames.join(', ')}`);
  }

  if (analysis.isDeflecting && analysis.deflectingFrom) {
    lines.push(`Possible deflection from: ${analysis.deflectingFrom}`);
  }

  if (analysis.readinessSignals.length > 0) {
    lines.push(`Readiness signals: ${analysis.readinessSignals.join(', ')}`);
  }

  lines.push(`Strategy: ${analysis.approach.strategy}`);
  lines.push(analysis.approach.guidance);

  if (analysis.approach.avoidPhrases.length > 0) {
    lines.push(`AVOID saying: "${analysis.approach.avoidPhrases[0]}"`);
  }

  return lines.join('\n');
}

/**
 * Get summary for a user
 */
export function getResistanceSummary(userId: string): string | null {
  const profile = getResistanceProfile(userId);

  if (profile.metadata.totalObservations < 5) {
    return null;
  }

  const lines = [];

  if (profile.summary.mostUsedDefense) {
    lines.push(`Primary defense style: ${profile.summary.mostUsedDefense}`);
  }

  if (profile.summary.mostAvoidedTopic) {
    lines.push(`Most avoided area: ${profile.summary.mostAvoidedTopic}`);
  }

  if (profile.summary.readiestGrowthArea) {
    lines.push(`Ready to explore: ${profile.summary.readiestGrowthArea}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all resistance detection state (for testing)
 */
export function resetResistanceDetection(): void {
  profiles.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getResistanceProfile,
  analyzeResistance,
  identifyGrowthEdges,
  formatResistanceForPrompt,
  getResistanceSummary,
  resetResistanceDetection,
};

