/**
 * Contradiction Comfort
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Hold space for contradictory emotions without trying to fix them.
 * "You can be excited about the new job AND sad to leave the old one."
 *
 * Friends try to resolve contradictions. Ferni holds space for both truths.
 *
 * @module ContradictionComfort
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'ContradictionComfort' });

// ============================================================================
// TYPES
// ============================================================================

export type EmotionPair = [string, string];

export interface ContradictionDetection {
  /** Was a contradiction detected? */
  detected: boolean;

  /** The conflicting emotions */
  emotions: EmotionPair;

  /** Topic or situation the contradiction relates to */
  topic: string;

  /** Validation phrase to offer */
  validationPhrase: string;

  /** Confidence in detection (0-1) */
  confidence: number;

  /** Context that led to detection */
  context: {
    userMessage: string;
    recentEmotions: string[];
    markers: string[];
  };
}

export interface ContradictionPattern {
  emotions: EmotionPair;
  validations: string[];
  examples: string[];
}

export interface ContradictionHistory {
  timestamp: Date;
  emotions: EmotionPair;
  topic: string;
  validationUsed: string;
  userResponse?: 'felt_understood' | 'continued_sharing' | 'changed_topic' | 'unknown';
}

export interface ContradictionProfile {
  userId: string;

  /** History of detected contradictions */
  history: ContradictionHistory[];

  /** Common contradiction patterns for this user */
  frequentPatterns: Array<{
    emotions: EmotionPair;
    count: number;
    lastSeen: Date;
  }>;

  updatedAt: Date;
}

// ============================================================================
// CONTRADICTION PATTERNS & VALIDATIONS
// ============================================================================

const CONTRADICTION_PATTERNS: ContradictionPattern[] = [
  {
    emotions: ['excited', 'sad'],
    validations: [
      "You can be excited about what's ahead AND grieve what you're leaving behind.",
      "Both are true - the excitement and the sadness. You don't have to pick one.",
      'It makes sense to feel both. New beginnings always carry goodbyes.',
    ],
    examples: ['new job', 'moving', 'graduation', 'promotion', 'new relationship'],
  },
  {
    emotions: ['happy', 'sad'],
    validations: [
      'Joy and sadness often travel together. Both are real.',
      "You can hold happiness and sadness at the same time. That's very human.",
      'Bittersweet is a real feeling. Both the bitter and the sweet.',
    ],
    examples: ['wedding', 'birth', 'achievement', 'milestone'],
  },
  {
    emotions: ['love', 'angry'],
    validations: [
      'You can love someone AND be furious with them. Both are real.',
      "Anger doesn't cancel out love. They can coexist.",
      "Loving someone and being angry with them isn't a contradiction - it's human.",
    ],
    examples: ['family', 'partner', 'friend', 'parent', 'child'],
  },
  {
    emotions: ['relieved', 'guilty'],
    validations: [
      "Being relieved doesn't mean you didn't care. You can feel both.",
      'Relief and guilt can exist together. Neither cancels the other.',
      "It's okay to feel relieved. Guilt doesn't have to come with it, but if it does, that's okay too.",
    ],
    examples: ['death', 'breakup', 'ending', 'leaving'],
  },
  {
    emotions: ['happy', 'scared'],
    validations: [
      "Joy and fear often travel together. You don't have to pick one.",
      'Being happy about something AND scared of it makes complete sense.',
      "Good things can be scary. That doesn't make the happiness less real.",
    ],
    examples: ['pregnancy', 'new job', 'marriage', 'big decision'],
  },
  {
    emotions: ['grateful', 'resentful'],
    validations: [
      'You can appreciate what you have AND wish it were different.',
      "Gratitude doesn't mean you can't also feel resentment. Both are valid.",
      'Being grateful for something while resenting aspects of it is very human.',
    ],
    examples: ['job', 'relationship', 'family', 'situation'],
  },
  {
    emotions: ['hope', 'despair'],
    validations: [
      "Hope and despair aren't opposites. They can coexist.",
      'You can feel hopeless AND hold onto a tiny thread of hope. Both are true.',
      "Despair doesn't mean hope is gone. They can share the same moment.",
    ],
    examples: ['illness', 'difficult situation', 'waiting', 'uncertainty'],
  },
  {
    emotions: ['proud', 'ashamed'],
    validations: [
      "You can be proud of how far you've come AND wish you'd done things differently.",
      'Pride and shame about the same thing is more common than you think.',
      "Both feelings are valid. Being proud doesn't erase the shame, and shame doesn't erase what you've accomplished.",
    ],
    examples: ['past', 'achievement', 'journey', 'growth'],
  },
  {
    emotions: ['want', 'fear'],
    validations: [
      'Wanting something and being afraid of it can happen at the same time.',
      "The things we want most are often the scariest. That's okay.",
      "Fear doesn't mean you don't want it. Both feelings are telling you something.",
    ],
    examples: ['change', 'opportunity', 'relationship', 'risk'],
  },
  {
    emotions: ['miss', 'glad'],
    validations: [
      "You can miss someone AND be glad they're gone. Both things can be true.",
      "Missing what was doesn't mean you want it back. You can feel both.",
      'Being glad something ended AND missing it is a very human contradiction.',
    ],
    examples: ['ex', 'old job', 'past life', 'person'],
  },
  {
    emotions: ['angry', 'understanding'],
    validations: [
      "Understanding why someone did something doesn't mean you can't still be angry.",
      "You can get it AND still be mad. Those aren't mutually exclusive.",
      "Empathy doesn't require you to stop being angry. Both can coexist.",
    ],
    examples: ['betrayal', 'hurt', 'disappointment'],
  },
  {
    emotions: ['strong', 'broken'],
    validations: [
      "You can be strong AND broken at the same time. Strength isn't the absence of brokenness.",
      "Feeling broken doesn't mean you're not also strong. You can be both.",
      'The strongest people often carry the deepest cracks. Both are true.',
    ],
    examples: ['struggle', 'hardship', 'challenge'],
  },
];

// Markers that suggest contradiction
const CONTRADICTION_MARKERS = [
  /but\s+(also|I\s+also|at\s+the\s+same\s+time)/i,
  /and\s+also/i,
  /at\s+the\s+same\s+time/i,
  /part\s+of\s+me/i,
  /on\s+one\s+hand.*on\s+the\s+other/i,
  /I\s+feel\s+both/i,
  /mixed\s+(feelings|emotions)/i,
  /conflicted/i,
  /torn\s+between/i,
  /I\s+don['']t\s+know\s+(if|whether)\s+I['']m/i,
  /I['']m\s+happy\s+but/i,
  /I['']m\s+sad\s+but/i,
  /it['']s\s+weird\s+(because|but)/i,
  /is\s+it\s+bad\s+that\s+I/i,
];

// Emotion synonyms for better detection
const EMOTION_SYNONYMS: Record<string, string[]> = {
  excited: ['thrilled', 'pumped', 'stoked', 'eager', 'looking forward'],
  sad: ['upset', 'down', 'heartbroken', 'grieving', 'mourning', 'melancholy'],
  happy: ['glad', 'joyful', 'pleased', 'content', 'delighted'],
  angry: ['mad', 'furious', 'pissed', 'frustrated', 'irritated', 'livid'],
  scared: ['afraid', 'terrified', 'anxious', 'worried', 'nervous', 'frightened'],
  relieved: ['free', 'lighter', 'unburdened'],
  guilty: ['ashamed', 'bad about', 'wrong for'],
  grateful: ['thankful', 'appreciative', 'blessed'],
  resentful: ['bitter', 'resentment', 'begrudge'],
  hope: ['hopeful', 'optimistic'],
  despair: ['hopeless', 'desperate', 'despairing'],
  proud: ['accomplished', 'achievement'],
  ashamed: ['embarrassed', 'humiliated'],
  want: ['desire', 'wish', 'dream', 'yearn'],
  fear: ['afraid', 'scared', 'terrified'],
  miss: ['longing', 'nostalgic', 'yearning'],
  glad: ['happy', 'relieved', 'pleased'],
  strong: ['tough', 'resilient', 'powerful'],
  broken: ['shattered', 'destroyed', 'falling apart'],
  love: ['care about', 'adore', 'devoted'],
  understanding: ['understand', 'get it', 'see why', 'empathize'],
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect emotional contradictions in user message.
 */
export function detectContradiction(
  message: string,
  recentEmotions: string[],
  topic?: string
): ContradictionDetection | null {
  const lowerMessage = message.toLowerCase();
  const detectedMarkers: string[] = [];

  // Check for contradiction markers in text
  for (const pattern of CONTRADICTION_MARKERS) {
    if (pattern.test(message)) {
      detectedMarkers.push(pattern.source);
    }
  }

  // Find emotion pairs in message + recent emotions
  const allEmotions = [...recentEmotions];

  // Extract emotions from current message
  for (const [emotion, synonyms] of Object.entries(EMOTION_SYNONYMS)) {
    if (lowerMessage.includes(emotion) || synonyms.some((s) => lowerMessage.includes(s))) {
      if (!allEmotions.includes(emotion)) {
        allEmotions.push(emotion);
      }
    }
  }

  // Check against known contradiction patterns
  for (const pattern of CONTRADICTION_PATTERNS) {
    const [e1, e2] = pattern.emotions;
    const hasE1 =
      allEmotions.includes(e1) ||
      EMOTION_SYNONYMS[e1]?.some((s) => lowerMessage.includes(s)) ||
      lowerMessage.includes(e1);
    const hasE2 =
      allEmotions.includes(e2) ||
      EMOTION_SYNONYMS[e2]?.some((s) => lowerMessage.includes(s)) ||
      lowerMessage.includes(e2);

    if (hasE1 && hasE2) {
      // Calculate confidence
      const confidence = calculateConfidence(detectedMarkers, hasE1, hasE2);

      // Select validation phrase
      const validation =
        pattern.validations[Math.floor(Math.random() * pattern.validations.length)];

      // Extract or infer topic
      const detectedTopic = topic || inferTopicFromMessage(message, pattern.examples);

      const result: ContradictionDetection = {
        detected: true,
        emotions: [e1, e2],
        topic: detectedTopic,
        validationPhrase: validation,
        confidence,
        context: {
          userMessage: message,
          recentEmotions,
          markers: detectedMarkers,
        },
      };

      log.debug(
        {
          emotions: [e1, e2],
          topic: detectedTopic,
          confidence,
          markerCount: detectedMarkers.length,
        },
        '💫 Contradiction detected'
      );

      return result;
    }
  }

  // No contradiction found
  return null;
}

/**
 * Calculate confidence based on evidence.
 */
function calculateConfidence(
  markers: string[],
  emotion1InMessage: boolean,
  emotion2InMessage: boolean
): number {
  let confidence = 0.4; // Base confidence

  // More markers = more confidence
  confidence += Math.min(0.3, markers.length * 0.1);

  // Both emotions in same message = higher confidence
  if (emotion1InMessage && emotion2InMessage) {
    confidence += 0.2;
  }

  // Cap at 0.95
  return Math.min(0.95, confidence);
}

/**
 * Infer topic from message based on pattern examples.
 */
function inferTopicFromMessage(message: string, examples: string[]): string {
  const lowerMessage = message.toLowerCase();

  for (const example of examples) {
    if (lowerMessage.includes(example)) {
      return example;
    }
  }

  // Try to extract from common patterns
  const topicPatterns = [
    /about\s+(my\s+)?(\w+)/i,
    /regarding\s+(the\s+)?(\w+)/i,
    /with\s+(my\s+)?(\w+)/i,
  ];

  for (const pattern of topicPatterns) {
    const match = message.match(pattern);
    if (match && match[2]) {
      return match[2];
    }
  }

  return 'this situation';
}

// ============================================================================
// RECORDING & LEARNING
// ============================================================================

/**
 * Record a contradiction that was detected and addressed.
 */
export async function recordContradiction(
  userId: string,
  detection: ContradictionDetection,
  validationUsed: string,
  userResponse?: 'felt_understood' | 'continued_sharing' | 'changed_topic'
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const ref = db
      .collection('bogle_users')
      .doc(userId)
      .collection('contradiction_comfort')
      .doc('profile');

    const doc = await ref.get();
    let profile: ContradictionProfile;

    if (doc.exists) {
      profile = doc.data() as ContradictionProfile;
    } else {
      profile = {
        userId,
        history: [],
        frequentPatterns: [],
        updatedAt: new Date(),
      };
    }

    // Add to history
    profile.history.push({
      timestamp: new Date(),
      emotions: detection.emotions,
      topic: detection.topic,
      validationUsed,
      userResponse,
    });

    // Keep last 50 entries
    if (profile.history.length > 50) {
      profile.history = profile.history.slice(-50);
    }

    // Update frequent patterns
    const patternKey = detection.emotions.sort().join('-');
    const existingPattern = profile.frequentPatterns.find(
      (p) => p.emotions.sort().join('-') === patternKey
    );

    if (existingPattern) {
      existingPattern.count++;
      existingPattern.lastSeen = new Date();
    } else {
      profile.frequentPatterns.push({
        emotions: detection.emotions,
        count: 1,
        lastSeen: new Date(),
      });
    }

    profile.updatedAt = new Date();
    await ref.set(cleanForFirestore(profile));

    log.debug({ userId, emotions: detection.emotions }, 'Recorded contradiction');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to record contradiction');
  }
}

/**
 * Load user's contradiction profile.
 */
export async function loadContradictionProfile(
  userId: string
): Promise<ContradictionProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contradiction_comfort')
      .doc('profile')
      .get();

    if (doc.exists) {
      return doc.data() as ContradictionProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load contradiction profile');
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM when contradiction is detected.
 */
export function buildContradictionContext(detection: ContradictionDetection): string {
  if (!detection || !detection.detected) return '';

  const sections: string[] = [
    '[CONTRADICTION COMFORT]',
    '',
    `User is expressing contradictory emotions: ${detection.emotions[0]} AND ${detection.emotions[1]}`,
    `Topic: ${detection.topic}`,
    `Confidence: ${(detection.confidence * 100).toFixed(0)}%`,
    '',
    'IMPORTANT: Do NOT try to resolve this contradiction. Both feelings are valid.',
    '',
    `Validation to offer: "${detection.validationPhrase}"`,
    '',
    'Hold space for complexity. Resist the urge to simplify.',
    'Don\'t say "but" - say "AND". Both emotions are real.',
  ];

  return sections.join('\n');
}

/**
 * Build general contradiction awareness context.
 */
export async function buildContradictionAwarenessContext(userId: string): Promise<string> {
  const profile = await loadContradictionProfile(userId);
  if (!profile || profile.history.length === 0) return '';

  const sections: string[] = ['[CONTRADICTION AWARENESS]'];

  // Common patterns for this user
  if (profile.frequentPatterns.length > 0) {
    const topPatterns = profile.frequentPatterns.sort((a, b) => b.count - a.count).slice(0, 3);

    sections.push('This user often holds space for contradictory emotions:');
    for (const pattern of topPatterns) {
      sections.push(`- ${pattern.emotions[0]} AND ${pattern.emotions[1]} (${pattern.count} times)`);
    }
    sections.push('');
    sections.push("When you detect these emotions together, validate both. Don't try to resolve.");
  }

  return sections.join('\n');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a validation phrase for specific emotion pair.
 */
export function getValidationPhrase(emotion1: string, emotion2: string): string | null {
  for (const pattern of CONTRADICTION_PATTERNS) {
    const [e1, e2] = pattern.emotions;
    if ((emotion1 === e1 && emotion2 === e2) || (emotion1 === e2 && emotion2 === e1)) {
      return pattern.validations[Math.floor(Math.random() * pattern.validations.length)];
    }
  }
  return null;
}

/**
 * Check if two emotions are known to commonly coexist.
 */
export function areCommonlyCoexisting(emotion1: string, emotion2: string): boolean {
  for (const pattern of CONTRADICTION_PATTERNS) {
    const [e1, e2] = pattern.emotions;
    if ((emotion1 === e1 && emotion2 === e2) || (emotion1 === e2 && emotion2 === e1)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const contradictionComfort = {
  detectContradiction,
  recordContradiction,
  loadContradictionProfile,
  buildContradictionContext,
  buildContradictionAwarenessContext,
  getValidationPhrase,
  areCommonlyCoexisting,
};

export default contradictionComfort;
