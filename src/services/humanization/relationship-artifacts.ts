/**
 * Relationship Artifacts Service
 *
 * Tracks the SPECIFIC moments that make each relationship unique:
 * - Shared breakthroughs (moments of realization)
 * - Inside references (jokes, shared experiences)
 * - User vocabulary (their unique words/phrases)
 * - Communication rhythm (how THEY communicate)
 *
 * This transforms relationships from "number of conversations" into
 * a rich tapestry of shared history that Ferni can draw from.
 *
 * "Remember when you told me about your father?"
 * "The Tuesday thing" (inside reference)
 * "You said 'recalibrate' - I love that word"
 *
 * @module @ferni/relationship-artifacts
 */

import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from './humanization-signal-emitter.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const logger = createLogger({ module: 'RelationshipArtifacts' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A shared breakthrough moment - when something clicked for the user
 * These are GOLD for callbacks
 */
export interface SharedBreakthrough {
  id: string;
  turn: number;
  timestamp: number;

  /** What the user realized */
  whatHappened: string;

  /** What Ferni shared in response (if anything personal) */
  whatFerniShared?: string;

  /** How they reacted (for gauging emotional weight) */
  userReaction: 'quiet' | 'emotional' | 'aha' | 'relief' | 'tears';

  /** The topic that triggered this */
  topic: string;

  /** Natural callback phrase */
  callbackPhrase: string;

  /** Times this has been referenced */
  timesReferenced: number;

  /** Last time referenced */
  lastReferenced?: number;
}

/**
 * An inside reference - something only WE would understand
 */
export interface InsideReference {
  id: string;
  origin: string; // How it started
  phrase: string; // The shorthand reference
  fullContext: string; // What it actually means
  turnCreated: number;
  timestamp: number;

  /** Type of inside reference */
  type: 'joke' | 'shorthand' | 'callback' | 'nickname' | 'metaphor';

  /** How many times used */
  timesUsed: number;

  /** Last usage */
  lastUsed?: number;

  /** Whether the user has used it back (confirms it landed) */
  userUsedItBack: boolean;
}

/**
 * A word or phrase the user uniquely uses
 * Ferni can mirror these back naturally
 */
export interface UserVocabulary {
  word: string;
  frequency: number; // How often they use it
  firstHeard: number;
  lastHeard: number;

  /** Context where they use it */
  contexts: string[];

  /** Whether Ferni has mirrored it back */
  ferniHasMirrored: boolean;

  /** Category of vocabulary */
  category:
    | 'emotional' // "I feel overwhelmed"
    | 'descriptor' // "It's like..."
    | 'filler' // "you know", "basically"
    | 'technical' // Domain-specific jargon
    | 'unique'; // Distinctly theirs
}

/**
 * Their communication rhythm - how THEY talk
 */
export interface CommunicationRhythm {
  /** How they typically greet */
  typicalGreeting?: string;

  /** Average response length (words) */
  avgResponseLength: number;

  /** When they tend to open up */
  opensUpWhen: 'immediately' | 'after_warmup' | 'late_session' | 'late_night' | 'varies';

  /** How they signal they want to end */
  exitSignals: string[];

  /** Topics that make them go deep */
  depthTriggers: string[];

  /** Topics they deflect from */
  deflectionTopics: string[];

  /** Their energy pattern */
  energyPattern: 'builds_up' | 'starts_high' | 'consistent' | 'peaks_and_valleys';

  /** How they express agreement */
  agreementStyle: string[];

  /** How they express disagreement */
  disagreementStyle: string[];
}

/**
 * Full relationship artifacts for a user-persona pair
 */
export interface RelationshipArtifacts {
  personaId: string;
  userId: string;

  // Our shared history
  breakthroughs: SharedBreakthrough[];
  insideReferences: InsideReference[];
  userVocabulary: UserVocabulary[];
  communicationRhythm: CommunicationRhythm;

  // Metadata
  firstInteraction: number;
  lastInteraction: number;
  totalTurns: number;

  // Emotional high watermarks
  deepestMomentTurn?: number;
  deepestMomentTopic?: string;
  mostJoyfulMomentTurn?: number;
}

/**
 * Context for analyzing a turn for artifacts
 */
export interface TurnAnalysisContext {
  userMessage: string;
  ferniResponse: string;
  turn: number;
  topic?: string;
  emotion?: string;
  emotionalIntensity?: number;
  isBreakthrough?: boolean;
  isVulnerable?: boolean;
}

// ============================================================================
// ARTIFACT EXTRACTION
// ============================================================================

/**
 * Patterns that indicate a breakthrough moment
 */
const BREAKTHROUGH_PATTERNS = [
  /i never thought of it that way/i,
  /that makes sense now/i,
  /oh\s*(my\s*god|wow)/i,
  /i just realized/i,
  /you('re| are) right/i,
  /i've been/i, // Often precedes realization
  /i think i('ve| have) been/i,
  /wait[,.]* (so|that means)/i,
  /holy shit/i,
  /that hit (different|hard|me)/i,
  /i need to think about that/i,
  /i('ve| have) never (told|said) (anyone|that)/i,
];

/**
 * Patterns that could become inside references
 */
const REFERENCE_CANDIDATE_PATTERNS = [
  /we('ll| will) call (it|that|this) ["']?(\w+)/i,
  /let's call (it|that|this) ["']?(\w+)/i,
  /that's (so|very|totally) (us|you|me)/i,
  /our (thing|word|code)/i,
  /like (we|you) always say/i,
];

/**
 * Unique vocabulary patterns to track
 */
const VOCABULARY_PATTERNS = {
  emotional: /i feel (like |)(\w+)/gi,
  descriptor: /it's (like|kind of|sort of) (\w+)/gi,
  filler: /(you know|basically|literally|honestly|actually)/gi,
  unique: /[\w-]{4,}(?:ing|ness|tion|ment|ful|less)/gi,
};

/**
 * Analyze a turn for potential artifacts
 */
export function analyzeTurnForArtifacts(
  context: TurnAnalysisContext,
  existingArtifacts: RelationshipArtifacts
): {
  newBreakthrough?: Partial<SharedBreakthrough>;
  newReference?: Partial<InsideReference>;
  vocabularyUpdates: Array<{ word: string; category: UserVocabulary['category'] }>;
  rhythmUpdates: Partial<CommunicationRhythm>;
} {
  const { userMessage, ferniResponse, turn, topic, emotion, emotionalIntensity } = context;
  const result: ReturnType<typeof analyzeTurnForArtifacts> = {
    vocabularyUpdates: [],
    rhythmUpdates: {},
  };

  // =========================================================================
  // CHECK FOR BREAKTHROUGH
  // =========================================================================
  if (
    context.isBreakthrough ||
    BREAKTHROUGH_PATTERNS.some((p) => p.test(userMessage)) ||
    (emotionalIntensity && emotionalIntensity > 0.7 && emotion === 'relief')
  ) {
    const reaction = determineReaction(userMessage, emotionalIntensity);

    result.newBreakthrough = {
      turn,
      timestamp: Date.now(),
      whatHappened: extractBreakthroughContent(userMessage),
      userReaction: reaction,
      topic: topic || 'general',
      callbackPhrase: generateCallbackPhrase(userMessage, topic),
      timesReferenced: 0,
    };

    // Check if Ferni shared something personal
    if (
      ferniResponse.toLowerCase().includes('i ') &&
      (ferniResponse.includes('remember') ||
        ferniResponse.includes('struggled') ||
        ferniResponse.includes('learned'))
    ) {
      result.newBreakthrough.whatFerniShared = extractFerniShare(ferniResponse);
    }

    logger.debug({ turn, topic }, 'Breakthrough moment detected');
  }

  // =========================================================================
  // CHECK FOR INSIDE REFERENCE CANDIDATE
  // =========================================================================
  for (const pattern of REFERENCE_CANDIDATE_PATTERNS) {
    const match = pattern.exec(userMessage) || pattern.exec(ferniResponse);
    if (match) {
      result.newReference = {
        origin: `Turn ${turn}: ${match[0]}`,
        phrase: extractReferenceName(match),
        fullContext: userMessage.slice(0, 100),
        turnCreated: turn,
        timestamp: Date.now(),
        type: 'shorthand',
        timesUsed: 1,
        userUsedItBack: false,
      };
      break;
    }
  }

  // =========================================================================
  // EXTRACT VOCABULARY
  // =========================================================================
  for (const [category, pattern] of Object.entries(VOCABULARY_PATTERNS)) {
    const matches = userMessage.matchAll(pattern);
    for (const match of matches) {
      const word = match[2] || match[1] || match[0];
      if (word && word.length >= 3 && !isCommonWord(word)) {
        result.vocabularyUpdates.push({
          word: word.toLowerCase(),
          category: category as UserVocabulary['category'],
        });
      }
    }
  }

  // =========================================================================
  // UPDATE RHYTHM OBSERVATIONS
  // =========================================================================
  const wordCount = userMessage.split(/\s+/).length;

  // Track response length
  const currentAvg = existingArtifacts.communicationRhythm.avgResponseLength || 0;
  const turnCount = existingArtifacts.totalTurns || 1;
  result.rhythmUpdates.avgResponseLength = (currentAvg * turnCount + wordCount) / (turnCount + 1);

  // Track greeting patterns (first turn of session)
  if (turn === 1) {
    const greeting = extractGreeting(userMessage);
    if (greeting) {
      result.rhythmUpdates.typicalGreeting = greeting;
    }
  }

  // Track depth triggers
  if (emotionalIntensity && emotionalIntensity > 0.6 && topic) {
    const existingTriggers = existingArtifacts.communicationRhythm.depthTriggers || [];
    if (!existingTriggers.includes(topic)) {
      result.rhythmUpdates.depthTriggers = [...existingTriggers, topic];
    }
  }

  return result;
}

// ============================================================================
// CALLBACK GENERATION
// ============================================================================

/**
 * Get the best callback opportunity from artifacts
 * Returns the most impactful, least-recently-used callback
 */
export function getBestCallback(
  artifacts: RelationshipArtifacts,
  currentContext: {
    topic?: string;
    emotion?: string;
    turn: number;
  }
): {
  type: 'breakthrough' | 'reference' | 'vocabulary';
  content: string;
  artifactId: string;
} | null {
  const { topic, turn } = currentContext;
  const candidates: Array<{
    type: 'breakthrough' | 'reference' | 'vocabulary';
    content: string;
    artifactId: string;
    score: number;
  }> = [];

  // Score breakthroughs
  for (const bt of artifacts.breakthroughs) {
    // Skip if referenced too recently
    if (bt.lastReferenced && turn - bt.lastReferenced < 10) continue;

    let score = 0;

    // Topic match boost
    if (topic && bt.topic.toLowerCase().includes(topic.toLowerCase())) {
      score += 3;
    }

    // Recency penalty (older = better for callbacks)
    const turnsSince = turn - bt.turn;
    if (turnsSince > 20) score += 2;
    if (turnsSince > 50) score += 1;

    // Never referenced = high value
    if (bt.timesReferenced === 0) score += 2;

    // Emotional weight boost
    if (bt.userReaction === 'tears' || bt.userReaction === 'emotional') {
      score += 1;
    }

    if (score > 0) {
      candidates.push({
        type: 'breakthrough',
        content: bt.callbackPhrase,
        artifactId: bt.id,
        score,
      });
    }
  }

  // Score inside references
  for (const ref of artifacts.insideReferences) {
    // Skip if used very recently
    if (ref.lastUsed && turn - ref.lastUsed < 5) continue;

    let score = 0;

    // User used it back = confirmed it landed
    if (ref.userUsedItBack) score += 2;

    // Usage count sweet spot (2-5 uses is the sweet spot)
    if (ref.timesUsed >= 2 && ref.timesUsed <= 5) score += 2;

    if (score > 0) {
      candidates.push({
        type: 'reference',
        content: ref.phrase,
        artifactId: ref.id,
        score,
      });
    }
  }

  // Sort by score and return best
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

/**
 * Get vocabulary to mirror in response
 * Returns words the user has used that Ferni can naturally echo
 */
export function getVocabularyToMirror(artifacts: RelationshipArtifacts, maxWords = 2): string[] {
  // Prioritize:
  // 1. Words Ferni hasn't mirrored yet
  // 2. High frequency words
  // 3. Emotional or unique categories

  return artifacts.userVocabulary
    .filter((v) => !v.ferniHasMirrored)
    .sort((a, b) => {
      // Priority scoring
      let scoreA = a.frequency;
      let scoreB = b.frequency;

      if (a.category === 'emotional') scoreA += 3;
      if (b.category === 'emotional') scoreB += 3;
      if (a.category === 'unique') scoreA += 2;
      if (b.category === 'unique') scoreB += 2;

      return scoreB - scoreA;
    })
    .slice(0, maxWords)
    .map((v) => v.word);
}

/**
 * Generate a natural callback phrase for a breakthrough
 */
function generateCallbackPhrase(userMessage: string, topic?: string): string {
  const phrases = [
    'Remember when you realized',
    'You said something once that stuck with me—about',
    'You mentioned something about',
    'There was that moment when you said',
    'I keep thinking about when you told me',
  ];

  const base = phrases[Math.floor(Math.random() * phrases.length)];
  const fragment = extractKeyFragment(userMessage);

  return `${base} ${fragment || topic || 'that'}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determineReaction(
  message: string,
  intensity?: number
): SharedBreakthrough['userReaction'] {
  const lower = message.toLowerCase();

  if (intensity && intensity > 0.8) {
    if (lower.includes('cry') || lower.includes('tear')) return 'tears';
    return 'emotional';
  }

  if (/oh\s*(my\s*god|wow)|holy|damn/i.test(lower)) return 'aha';
  if (/relief|finally|weight.*off/i.test(lower)) return 'relief';

  return 'quiet';
}

function extractBreakthroughContent(message: string): string {
  // Take the core insight, removing filler
  const cleaned = message
    .replace(/^(i mean|like|so|well|um|uh)[,.]?\s*/gi, '')
    .replace(/[.!?]+$/, '');

  return cleaned.length > 100 ? cleaned.slice(0, 97) + '...' : cleaned;
}

function extractFerniShare(response: string): string {
  // Extract the personal sharing portion
  const sentences = response.split(/[.!?]+/);
  const personalSentence = sentences.find(
    (s) =>
      s.toLowerCase().includes('i ') &&
      (s.includes('remember') || s.includes('feel') || s.includes('think'))
  );

  return personalSentence?.trim().slice(0, 100) || '';
}

function extractReferenceName(match: RegExpMatchArray): string {
  // Get the actual reference name from the match
  return match[3] || match[2] || match[1] || 'our thing';
}

function extractGreeting(message: string): string | undefined {
  const greetingPatterns = [
    /^(hey|hi|hello|yo|sup|what'?s up|howdy)/i,
    /^good (morning|afternoon|evening)/i,
  ];

  for (const pattern of greetingPatterns) {
    const match = pattern.exec(message);
    if (match) return match[0].toLowerCase();
  }

  return undefined;
}

function extractKeyFragment(message: string): string | null {
  // Try to extract the key insight from the message
  const patterns = [
    /i('ve| have) been (\w+ \w+ \w+)/i,
    /i (just |)realized? (that |)(\w+ \w+ \w+)/i,
    /it('s| is) (about|really) (\w+ \w+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match) {
      return match[match.length - 1];
    }
  }

  return null;
}

const COMMON_WORDS = new Set([
  'the',
  'and',
  'that',
  'have',
  'for',
  'not',
  'with',
  'you',
  'this',
  'but',
  'his',
  'from',
  'they',
  'say',
  'she',
  'will',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'out',
  'about',
  'who',
  'get',
  'which',
  'when',
  'make',
  'can',
  'like',
  'time',
  'just',
  'him',
  'know',
  'take',
  'people',
  'into',
  'year',
  'your',
  'good',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'two',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'new',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'been',
  'really',
  'thing',
  'things',
  'yeah',
  'okay',
  'much',
  'being',
  'going',
  'doing',
  'something',
  'nothing',
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase());
}

// ============================================================================
// ARTIFACT MANAGER
// ============================================================================

/**
 * In-memory artifact storage per session
 * Note: Should be persisted to Firestore for cross-session memory
 */
const sessionArtifacts = new Map<string, RelationshipArtifacts>();

/**
 * Get or create artifacts for a user-persona pair
 */
export function getOrCreateArtifacts(userId: string, personaId: string): RelationshipArtifacts {
  const key = `${userId}:${personaId}`;

  if (!sessionArtifacts.has(key)) {
    sessionArtifacts.set(key, {
      personaId,
      userId,
      breakthroughs: [],
      insideReferences: [],
      userVocabulary: [],
      communicationRhythm: {
        avgResponseLength: 0,
        opensUpWhen: 'varies',
        exitSignals: [],
        depthTriggers: [],
        deflectionTopics: [],
        energyPattern: 'consistent',
        agreementStyle: [],
        disagreementStyle: [],
      },
      firstInteraction: Date.now(),
      lastInteraction: Date.now(),
      totalTurns: 0,
    });
  }

  return sessionArtifacts.get(key)!;
}

/**
 * Record a new breakthrough
 */
export function recordBreakthrough(
  userId: string,
  personaId: string,
  breakthrough: Omit<SharedBreakthrough, 'id'>
): SharedBreakthrough {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  const bt: SharedBreakthrough = {
    ...breakthrough,
    id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  artifacts.breakthroughs.push(bt);

  // Cap at 50 breakthroughs (keep most impactful)
  if (artifacts.breakthroughs.length > 50) {
    artifacts.breakthroughs.sort((a, b) => {
      // Sort by impact: emotional weight + recency
      const scoreA =
        (a.userReaction === 'tears' ? 3 : a.userReaction === 'emotional' ? 2 : 1) +
        (a.timesReferenced === 0 ? 1 : 0);
      const scoreB =
        (b.userReaction === 'tears' ? 3 : b.userReaction === 'emotional' ? 2 : 1) +
        (b.timesReferenced === 0 ? 1 : 0);
      return scoreB - scoreA;
    });
    artifacts.breakthroughs = artifacts.breakthroughs.slice(0, 50);
  }

  // Emit signal to frontend
  void humanizationSignalEmitter.breakthrough(0.8);

  logger.info(
    { userId, personaId, breakthroughId: bt.id, topic: bt.topic },
    'Recorded relationship breakthrough'
  );

  return bt;
}

/**
 * Record an inside reference
 */
export function recordInsideReference(
  userId: string,
  personaId: string,
  reference: Omit<InsideReference, 'id'>
): InsideReference {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  const ref: InsideReference = {
    ...reference,
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  artifacts.insideReferences.push(ref);

  // Cap at 30 references
  if (artifacts.insideReferences.length > 30) {
    // Keep most-used and user-confirmed ones
    artifacts.insideReferences.sort((a, b) => {
      if (a.userUsedItBack && !b.userUsedItBack) return -1;
      if (b.userUsedItBack && !a.userUsedItBack) return 1;
      return b.timesUsed - a.timesUsed;
    });
    artifacts.insideReferences = artifacts.insideReferences.slice(0, 30);
  }

  logger.debug({ userId, personaId, phrase: ref.phrase }, 'Recorded inside reference');

  return ref;
}

/**
 * Update vocabulary tracking
 */
export function updateVocabulary(
  userId: string,
  personaId: string,
  word: string,
  category: UserVocabulary['category'],
  context?: string
): void {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  const existing = artifacts.userVocabulary.find(
    (v) => v.word.toLowerCase() === word.toLowerCase()
  );

  if (existing) {
    existing.frequency++;
    existing.lastHeard = Date.now();
    if (context && !existing.contexts.includes(context)) {
      existing.contexts.push(context);
      if (existing.contexts.length > 5) {
        existing.contexts = existing.contexts.slice(-5);
      }
    }
  } else {
    artifacts.userVocabulary.push({
      word: word.toLowerCase(),
      frequency: 1,
      firstHeard: Date.now(),
      lastHeard: Date.now(),
      contexts: context ? [context] : [],
      ferniHasMirrored: false,
      category,
    });

    // Cap at 100 words
    if (artifacts.userVocabulary.length > 100) {
      // Keep highest frequency
      artifacts.userVocabulary.sort((a, b) => b.frequency - a.frequency);
      artifacts.userVocabulary = artifacts.userVocabulary.slice(0, 100);
    }
  }
}

/**
 * Mark that Ferni used a callback
 */
export function markCallbackUsed(
  userId: string,
  personaId: string,
  type: 'breakthrough' | 'reference',
  artifactId: string,
  turn: number
): void {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  if (type === 'breakthrough') {
    const bt = artifacts.breakthroughs.find((b) => b.id === artifactId);
    if (bt) {
      bt.timesReferenced++;
      bt.lastReferenced = turn;
    }
  } else {
    const ref = artifacts.insideReferences.find((r) => r.id === artifactId);
    if (ref) {
      ref.timesUsed++;
      ref.lastUsed = turn;
    }
  }
}

/**
 * Mark that Ferni mirrored a vocabulary word
 */
export function markVocabularyMirrored(userId: string, personaId: string, word: string): void {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  const vocab = artifacts.userVocabulary.find((v) => v.word.toLowerCase() === word.toLowerCase());

  if (vocab) {
    vocab.ferniHasMirrored = true;
  }
}

/**
 * Mark that user used an inside reference back (confirms it landed!)
 */
export function markUserUsedReferenceBack(
  userId: string,
  personaId: string,
  referenceId: string
): void {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  const ref = artifacts.insideReferences.find((r) => r.id === referenceId);
  if (ref) {
    ref.userUsedItBack = true;
    void humanizationSignalEmitter.runningJoke(ref.phrase);
  }
}

/**
 * Increment turn count
 */
export function incrementTurns(userId: string, personaId: string): void {
  const artifacts = getOrCreateArtifacts(userId, personaId);
  artifacts.totalTurns++;
  artifacts.lastInteraction = Date.now();
}

/**
 * Get artifacts summary for context injection
 */
export function getArtifactsSummary(
  userId: string,
  personaId: string
): {
  hasBreakthroughs: boolean;
  breakthroughCount: number;
  hasInsideReferences: boolean;
  referenceCount: number;
  topVocabulary: string[];
  communicationStyle: string;
} {
  const artifacts = getOrCreateArtifacts(userId, personaId);

  return {
    hasBreakthroughs: artifacts.breakthroughs.length > 0,
    breakthroughCount: artifacts.breakthroughs.length,
    hasInsideReferences: artifacts.insideReferences.length > 0,
    referenceCount: artifacts.insideReferences.length,
    topVocabulary: artifacts.userVocabulary
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)
      .map((v) => v.word),
    communicationStyle: describeCommunicationStyle(artifacts.communicationRhythm),
  };
}

function describeCommunicationStyle(rhythm: CommunicationRhythm): string {
  const parts: string[] = [];

  if (rhythm.avgResponseLength > 50) {
    parts.push('verbose');
  } else if (rhythm.avgResponseLength < 20) {
    parts.push('concise');
  }

  if (rhythm.opensUpWhen === 'late_night') {
    parts.push('opens up late');
  } else if (rhythm.opensUpWhen === 'immediately') {
    parts.push('direct');
  }

  if (rhythm.energyPattern === 'builds_up') {
    parts.push('builds momentum');
  }

  return parts.join(', ') || 'balanced';
}

/**
 * Clear session artifacts (for testing)
 */
export function clearSessionArtifacts(): void {
  sessionArtifacts.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipArtifacts = {
  // Core operations
  getOrCreate: getOrCreateArtifacts,
  analyze: analyzeTurnForArtifacts,
  getBestCallback,
  getVocabularyToMirror,

  // Recording
  recordBreakthrough,
  recordInsideReference,
  updateVocabulary,
  incrementTurns,

  // Marking usage
  markCallbackUsed,
  markVocabularyMirrored,
  markUserUsedReferenceBack,

  // Queries
  getSummary: getArtifactsSummary,

  // Testing
  clearAll: clearSessionArtifacts,
};

export default relationshipArtifacts;
