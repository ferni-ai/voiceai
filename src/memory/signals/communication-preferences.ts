/**
 * Communication Preferences Tracker
 *
 * Learns HOW users prefer to be approached, not just WHAT they talk about.
 * Tracks response patterns to different communication styles.
 *
 * Philosophy: The best friends know that Sarah needs to vent before advice,
 * that Mike responds better to humor when stressed, and that Alex finds
 * surprise memory callbacks delightful while Jordan finds them intrusive.
 * This module learns these preferences organically.
 *
 * @module memory/communication-preferences
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  CommunicationPreferencesService,
  InteractionPreference,
  ApproachGuidance,
  PreferenceDimension,
} from '../interfaces/index.js';

const log = createLogger({ module: 'CommunicationPreferences' });

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

/**
 * Get Firestore instance (lazy load to avoid circular deps)
 */
async function getFirestoreDb() {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore();
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

/**
 * Save user preferences to Firestore
 */
export async function saveUserPreferences(
  userId: string,
  preferences: InteractionPreference[]
): Promise<boolean> {
  const db = await getFirestoreDb();
  if (!db) return false;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc('communication')
      .set(
        cleanForFirestore({
          preferences,
          updatedAt: new Date(),
        })
      );
    log.debug({ userId }, 'Saved communication preferences to Firestore');
    return true;
  } catch (err) {
    log.warn({ error: String(err), userId }, 'Failed to save preferences to Firestore');
    return false;
  }
}

/**
 * Load user preferences from Firestore
 */
export async function loadUserPreferences(userId: string): Promise<InteractionPreference[] | null> {
  const db = await getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc('communication')
      .get();

    if (!doc.exists) {
      log.debug({ userId }, 'No saved preferences found');
      return null;
    }

    const data = doc.data();
    if (!data?.preferences) return null;

    // Convert Firestore timestamps back to Dates
    const preferences = (data.preferences as InteractionPreference[]).map((p) => ({
      ...p,
      lastUpdated:
        p.lastUpdated instanceof Date
          ? p.lastUpdated
          : new Date((p.lastUpdated as { toDate?: () => Date })?.toDate?.() || Date.now()),
      evidence: (p.evidence || []).map((e) => ({
        ...e,
        timestamp:
          e.timestamp instanceof Date
            ? e.timestamp
            : new Date((e.timestamp as { toDate?: () => Date })?.toDate?.() || Date.now()),
      })),
    }));

    log.debug({ userId, count: preferences.length }, 'Loaded preferences from Firestore');
    return preferences;
  } catch (err) {
    log.warn({ error: String(err), userId }, 'Failed to load preferences from Firestore');
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface PreferencesConfig {
  /** Minimum observations before confident (default: 3) */
  minObservationsForConfidence: number;
  /** Decay factor for old observations (default: 0.95 per week) */
  observationDecay: number;
  /** Maximum evidence items to keep (default: 20) */
  maxEvidenceItems: number;
}

const DEFAULT_CONFIG: PreferencesConfig = {
  minObservationsForConfidence: 3,
  observationDecay: 0.95,
  maxEvidenceItems: 20,
};

// ============================================================================
// DIMENSION DESCRIPTIONS
// ============================================================================

interface DimensionInfo {
  dimension: PreferenceDimension;
  description: string;
  lowEnd: string;
  highEnd: string;
  defaultValue: number;
  detectPatterns: string[];
}

const DIMENSION_INFO: DimensionInfo[] = [
  {
    dimension: 'depth',
    description: 'Preference for deep vs light conversation',
    lowEnd: 'Prefers lighter topics, surface-level chat',
    highEnd: 'Loves diving deep into meaningful topics',
    defaultValue: 0,
    detectPatterns: ['deep', 'meaningful', 'philosophical', 'light', 'casual', 'fun'],
  },
  {
    dimension: 'pace',
    description: 'Conversation pace preference',
    lowEnd: 'Prefers slow, thoughtful exchanges',
    highEnd: 'Prefers quick, energetic back-and-forth',
    defaultValue: 0,
    detectPatterns: ['quick', 'fast', 'slow', 'think', 'pause', 'wait'],
  },
  {
    dimension: 'directness',
    description: 'How direct questions and feedback should be',
    lowEnd: 'Prefers gentle, indirect approaches',
    highEnd: 'Appreciates direct, straightforward communication',
    defaultValue: 0,
    detectPatterns: ['direct', 'honest', 'gentle', 'careful', 'blunt', 'straight'],
  },
  {
    dimension: 'humor',
    description: 'Use of humor especially in difficult moments',
    lowEnd: 'Prefers seriousness when stressed',
    highEnd: 'Humor helps lighten heavy moments',
    defaultValue: 0,
    detectPatterns: ['haha', 'lol', 'funny', 'joke', 'laugh', 'serious'],
  },
  {
    dimension: 'memory_callbacks',
    description: 'How they respond to surprise memory references',
    lowEnd: 'Finds memory callbacks intrusive or uncomfortable',
    highEnd: 'Delighted when past conversations are remembered',
    defaultValue: 0.2, // Slightly positive default - most people like being remembered
    detectPatterns: ['remember', 'forgot', 'recalled', 'mentioned'],
  },
  {
    dimension: 'advice_timing',
    description: 'When they want advice vs validation',
    lowEnd: 'Needs to vent/process before solutions',
    highEnd: 'Wants solutions immediately',
    defaultValue: -0.2, // Slightly toward venting first - safer default
    detectPatterns: ['advice', 'solution', 'help', 'vent', 'listen', 'hear'],
  },
  {
    dimension: 'emotional_expression',
    description: 'Explicit vs implicit emotional communication',
    lowEnd: 'Prefers implicit emotional acknowledgment',
    highEnd: 'Comfortable with explicit emotional conversation',
    defaultValue: 0,
    detectPatterns: ['feel', 'emotion', 'heart', 'soul', 'logical', 'practical'],
  },
  {
    dimension: 'structure',
    description: 'Structured vs flowing conversation',
    lowEnd: 'Prefers natural, flowing conversation',
    highEnd: 'Appreciates structured, organized guidance',
    defaultValue: 0,
    detectPatterns: ['step', 'plan', 'list', 'structure', 'flow', 'natural'],
  },
  {
    dimension: 'validation_first',
    description: 'Need for validation before problem-solving',
    lowEnd: 'Ready to jump into solutions',
    highEnd: 'Needs feelings acknowledged first',
    defaultValue: 0.3, // Slightly toward validation - safer default
    detectPatterns: ['understand', 'valid', 'right', 'make sense', 'hear you'],
  },
  {
    dimension: 'check_in_frequency',
    description: 'How often they want emotional check-ins',
    lowEnd: 'Prefers space, less frequent check-ins',
    highEnd: 'Appreciates frequent emotional check-ins',
    defaultValue: 0,
    detectPatterns: ['how are you', 'check in', 'doing okay', 'space', 'alone'],
  },
];

// ============================================================================
// RESPONSE SENTIMENT ANALYSIS
// ============================================================================

interface ResponseSignal {
  signal: 'positive' | 'negative' | 'neutral';
  confidence: number;
  indicators: string[];
}

/**
 * Analyze user response to detect positive/negative/neutral reaction
 */
function analyzeResponseSentiment(response: string): ResponseSignal {
  const lower = response.toLowerCase();
  const indicators: string[] = [];
  let score = 0;

  // Positive indicators
  const positivePatterns = [
    { pattern: /\b(yes|yeah|yep|exactly|definitely|absolutely)\b/i, weight: 0.3 },
    { pattern: /\b(thank|thanks|appreciate|helpful|helped)\b/i, weight: 0.4 },
    { pattern: /\b(love|great|amazing|perfect|wonderful)\b/i, weight: 0.4 },
    { pattern: /\b(that('s| is) (it|right|true|exactly))\b/i, weight: 0.3 },
    { pattern: /\b(makes sense|good point|you('re| are) right)\b/i, weight: 0.3 },
    { pattern: /!+/g, weight: 0.1 }, // Enthusiasm
    { pattern: /\b(haha|lol|😊|😄|❤️)\b/i, weight: 0.2 },
  ];

  // Negative indicators
  const negativePatterns = [
    { pattern: /\b(no|nope|not really|i don't think)\b/i, weight: -0.3 },
    { pattern: /\b(but|however|although|actually)\b/i, weight: -0.1 },
    { pattern: /\b(uncomfortable|weird|awkward|strange)\b/i, weight: -0.4 },
    { pattern: /\b(don't|can't|won't|shouldn't)\b/i, weight: -0.1 },
    { pattern: /\b(i('d| would) (rather|prefer))\b/i, weight: -0.2 },
    { pattern: /\b(not now|maybe later|let's not)\b/i, weight: -0.3 },
    { pattern: /\.{3}|…/g, weight: -0.1 }, // Trailing off / hesitation
  ];

  for (const { pattern, weight } of positivePatterns) {
    if (pattern.test(lower)) {
      score += weight;
      indicators.push(pattern.source);
    }
  }

  for (const { pattern, weight } of negativePatterns) {
    if (pattern.test(lower)) {
      score += weight;
      indicators.push(pattern.source);
    }
  }

  // Engagement length as a signal (longer = more engaged, generally positive)
  if (response.length > 100) score += 0.1;
  if (response.length > 200) score += 0.1;
  if (response.length < 20) score -= 0.1; // Very short might be disengagement

  // Determine signal
  let signal: 'positive' | 'negative' | 'neutral';
  if (score > 0.2) signal = 'positive';
  else if (score < -0.2) signal = 'negative';
  else signal = 'neutral';

  return {
    signal,
    confidence: Math.min(1, Math.abs(score)),
    indicators,
  };
}

// ============================================================================
// COMMUNICATION PREFERENCES IMPLEMENTATION
// ============================================================================

export class CommunicationPreferences implements CommunicationPreferencesService {
  private config: PreferencesConfig;
  private preferences = new Map<string, InteractionPreference[]>(); // userId -> preferences (in-memory cache)
  private loadingPromises = new Map<string, Promise<InteractionPreference[]>>(); // Prevent duplicate loads

  constructor(config?: Partial<PreferencesConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ensure preferences are loaded from Firestore (with caching)
   */
  private async ensureLoaded(userId: string): Promise<InteractionPreference[]> {
    // Return from cache if available
    if (this.preferences.has(userId)) {
      return this.preferences.get(userId)!;
    }

    // Prevent duplicate concurrent loads
    if (this.loadingPromises.has(userId)) {
      return this.loadingPromises.get(userId)!;
    }

    // Load from Firestore
    const loadPromise = (async () => {
      const loaded = await loadUserPreferences(userId);
      if (loaded) {
        this.preferences.set(userId, loaded);
        return loaded;
      }
      // Initialize fresh preferences if not found
      const fresh = this.initializePreferences();
      this.preferences.set(userId, fresh);
      return fresh;
    })();

    this.loadingPromises.set(userId, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(userId);
    }
  }

  /**
   * Observe an interaction and update preferences
   * Now persists to Firestore after each update
   */
  async observeInteraction(observation: {
    userId: string;
    dimension: PreferenceDimension;
    ourApproach: string;
    userResponse: string;
    situation: string;
  }): Promise<void> {
    const { userId, dimension, ourApproach, userResponse, situation } = observation;

    // Analyze response sentiment
    const sentiment = analyzeResponseSentiment(userResponse);

    // Get or create user preferences (loads from Firestore if needed)
    const userPrefs = await this.ensureLoaded(userId);

    // Find the dimension
    const pref = userPrefs.find((p) => p.dimension === dimension);
    if (!pref) return;

    // Add evidence
    pref.evidence.push({
      situation,
      ourApproach,
      userResponse: sentiment.signal,
      timestamp: new Date(),
    });

    // Trim old evidence
    if (pref.evidence.length > this.config.maxEvidenceItems) {
      pref.evidence = pref.evidence.slice(-this.config.maxEvidenceItems);
    }

    // Recalculate preference
    this.recalculatePreference(pref);
    pref.lastUpdated = new Date();

    this.preferences.set(userId, userPrefs);

    log.debug(
      {
        userId,
        dimension,
        response: sentiment.signal,
        newValue: pref.observedPreference,
        confidence: pref.confidence,
      },
      'Updated communication preference'
    );

    // Persist to Firestore (fire-and-forget, don't block)
    saveUserPreferences(userId, userPrefs).catch((err) => {
      log.warn({ error: String(err), userId }, 'Failed to persist preferences');
    });
  }

  /**
   * Get all preferences for a user (loads from Firestore if needed)
   */
  async getPreferences(userId: string): Promise<InteractionPreference[]> {
    return this.ensureLoaded(userId);
  }

  /**
   * Get approach guidance based on preferences and current context
   */
  async getApproachGuidance(
    userId: string,
    context: { emotion?: string; topic?: string }
  ): Promise<ApproachGuidance> {
    const prefs = await this.getPreferences(userId);
    const prefMap = new Map(prefs.map((p) => [p.dimension, p]));

    // Determine overall approach based on preferences
    const approach = this.determineOverallApproach(prefs, context);

    // Build dimension guidance
    const dimensions: ApproachGuidance['dimensions'] = {} as ApproachGuidance['dimensions'];
    const avoid: string[] = [];
    const embrace: string[] = [];

    for (const pref of prefs) {
      const info = DIMENSION_INFO.find((d) => d.dimension === pref.dimension);
      if (!info) continue;

      let suggestion = '';
      if (pref.observedPreference < -0.3) {
        suggestion = info.lowEnd;
        // Add to avoid if we have negative evidence
        const negatives = pref.evidence.filter((e) => e.userResponse === 'negative');
        if (negatives.length > 0) {
          avoid.push(`${info.highEnd} (they've responded negatively)`);
        }
      } else if (pref.observedPreference > 0.3) {
        suggestion = info.highEnd;
        // Add to embrace if we have positive evidence
        const positives = pref.evidence.filter((e) => e.userResponse === 'positive');
        if (positives.length > 0) {
          embrace.push(`${info.highEnd} (they've responded well)`);
        }
      } else {
        suggestion = 'No strong preference detected - go with your instinct';
      }

      dimensions[pref.dimension] = {
        suggestion,
        confidence: pref.confidence,
      };
    }

    // Context-specific adjustments
    if (context.emotion) {
      const emotionLower = context.emotion.toLowerCase();
      if (['sad', 'anxious', 'worried', 'stressed', 'overwhelmed'].includes(emotionLower)) {
        // When distressed, lean toward gentler approaches unless they explicitly prefer direct
        const directness = prefMap.get('directness');
        if (!directness || directness.observedPreference < 0.5) {
          dimensions['directness'] = {
            suggestion: 'Be gentler than usual - they seem distressed',
            confidence: 0.7,
          };
        }

        const validation = prefMap.get('validation_first');
        if (!validation || validation.observedPreference > -0.3) {
          dimensions['validation_first'] = {
            suggestion: 'Prioritize validation before any problem-solving',
            confidence: 0.8,
          };
        }
      }
    }

    return {
      approach,
      dimensions,
      avoid: avoid.slice(0, 3),
      embrace: embrace.slice(0, 3),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Initialize default preferences for a new user
   */
  private initializePreferences(): InteractionPreference[] {
    return DIMENSION_INFO.map((info) => ({
      dimension: info.dimension,
      observedPreference: info.defaultValue,
      confidence: 0, // No confidence until we have observations
      evidence: [],
      lastUpdated: new Date(),
    }));
  }

  /**
   * Recalculate preference based on evidence
   */
  private recalculatePreference(pref: InteractionPreference): void {
    if (pref.evidence.length === 0) return;

    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const evidence of pref.evidence) {
      // Apply time decay
      const weeksOld = (now - evidence.timestamp.getTime()) / (1000 * 60 * 60 * 24 * 7);
      const weight = Math.pow(this.config.observationDecay, weeksOld);

      // Convert response to value
      let value: number;
      switch (evidence.userResponse) {
        case 'positive':
          value = 0.5;
          break;
        case 'negative':
          value = -0.5;
          break;
        default:
          value = 0;
      }

      weightedSum += value * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      pref.observedPreference = weightedSum / totalWeight;
    }

    // Calculate confidence based on number and recency of observations
    const recentEvidence = pref.evidence.filter((e) => {
      const daysOld = (now - e.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      return daysOld < 30;
    });

    pref.confidence = Math.min(1, recentEvidence.length / this.config.minObservationsForConfidence);
  }

  /**
   * Determine overall approach based on preferences and context
   */
  private determineOverallApproach(
    prefs: InteractionPreference[],
    context: { emotion?: string; topic?: string }
  ): ApproachGuidance['approach'] {
    const prefMap = new Map(prefs.map((p) => [p.dimension, p]));

    // Context overrides
    if (context.emotion) {
      const emotionLower = context.emotion.toLowerCase();
      if (['sad', 'anxious', 'worried', 'scared'].includes(emotionLower)) {
        return 'gentle';
      }
      if (['excited', 'happy', 'energetic'].includes(emotionLower)) {
        return 'energetic';
      }
    }

    // Preference-based
    const directness = prefMap.get('directness')?.observedPreference || 0;
    const depth = prefMap.get('depth')?.observedPreference || 0;
    const humor = prefMap.get('humor')?.observedPreference || 0;
    const pace = prefMap.get('pace')?.observedPreference || 0;

    if (directness > 0.3 && pace > 0) return 'direct';
    if (humor > 0.3) return 'playful';
    if (depth > 0.3) return 'curious';
    if (directness < -0.3) return 'gentle';

    return 'supportive'; // Safe default
  }

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  export(): Array<[string, InteractionPreference[]]> {
    return Array.from(this.preferences.entries());
  }

  import(data: Array<[string, InteractionPreference[]]>): void {
    this.preferences = new Map(data);
  }

  /**
   * Get stats
   */
  getStats(userId: string): {
    dimensionsTracked: number;
    totalObservations: number;
    avgConfidence: number;
    strongPreferences: string[];
  } {
    const prefs = this.preferences.get(userId) || [];
    let totalObs = 0;
    let totalConf = 0;
    const strong: string[] = [];

    for (const pref of prefs) {
      totalObs += pref.evidence.length;
      totalConf += pref.confidence;
      if (Math.abs(pref.observedPreference) > 0.4 && pref.confidence > 0.5) {
        const info = DIMENSION_INFO.find((d) => d.dimension === pref.dimension);
        if (info) {
          strong.push(pref.observedPreference > 0 ? info.highEnd : info.lowEnd);
        }
      }
    }

    return {
      dimensionsTracked: prefs.length,
      totalObservations: totalObs,
      avgConfidence: prefs.length > 0 ? totalConf / prefs.length : 0,
      strongPreferences: strong,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultPreferences: CommunicationPreferences | null = null;

export function getCommunicationPreferences(): CommunicationPreferences {
  if (!defaultPreferences) {
    defaultPreferences = new CommunicationPreferences();
  }
  return defaultPreferences;
}

export function resetCommunicationPreferences(): void {
  defaultPreferences = null;
}

export default {
  CommunicationPreferences,
  getCommunicationPreferences,
  resetCommunicationPreferences,
  analyzeResponseSentiment,
};
