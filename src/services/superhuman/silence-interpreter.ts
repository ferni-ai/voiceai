/**
 * Silence Interpreter
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Classifies different types of silence and responds appropriately.
 * Because sometimes silence IS the conversation.
 *
 * Your friend talks to fill every silence. Ferni knows when silence means:
 * - Processing: Let them think
 * - Emotional: Words are too hard
 * - Uncomfortable: Something unspoken
 * - Invitational: They want you to go deeper
 * - Exhausted: They need rest, not words
 * - Contemplative: They're somewhere beautiful
 *
 * @module SilenceInterpreter
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onEmotionalPatternChange } from '../data-layer/hooks/wisdom-hooks.js';

const log = createLogger({ module: 'SilenceInterpreter' });

// ============================================================================
// TYPES
// ============================================================================

export type SilenceType =
  | 'processing' // Let them think
  | 'emotional' // Words are hard
  | 'uncomfortable' // Something unspoken
  | 'invitational' // They want you to go deeper
  | 'exhausted' // They need rest, not words
  | 'contemplative'; // They're somewhere beautiful

export type SilenceResponse =
  | 'hold_space' // Say nothing, just be present
  | 'gentle_presence' // Soft acknowledgment ("I'm here")
  | 'soft_prompt' // "What's coming up for you?"
  | 'offer_rest' // "We don't have to talk"
  | 'honor_moment'; // "That's a beautiful place to be"

export type BreathPattern = 'held' | 'sighing' | 'normal' | 'quickening' | 'deep';
export type MicroSound = 'hmm' | 'um' | 'sigh' | 'sniff' | 'throat_clear' | 'none';

export interface VoiceMarkers {
  breathPattern: BreathPattern;
  microSounds: MicroSound[];
  energyJustBefore: number; // 0-1 scale
  emotionJustBefore?: string;
}

export interface SilenceAnalysis {
  /** Classified silence type */
  type: SilenceType;

  /** Confidence in classification (0-1) */
  confidence: number;

  /** Duration of silence in ms */
  duration: number;

  /** Voice markers that informed classification */
  voiceMarkers: VoiceMarkers;

  /** Recommended response type */
  recommendedResponse: SilenceResponse;

  /** SSML phrase to use (may be empty for hold_space) */
  responsePhrase: string;

  /** Should Ferni stay silent too? */
  shouldWait: boolean;

  /** How long to wait before responding (ms) */
  waitDurationMs: number;
}

export interface SilenceSignature {
  typicalDuration: { min: number; max: number };
  voiceMarkersBefore: string[];
  breathPatternDuring: BreathPattern[];
  confidenceThreshold: number;
  bestResponse: SilenceResponse;
}

export interface SilenceHistoryEntry {
  timestamp: Date;
  type: SilenceType;
  duration: number;
  precedingTopic?: string;
  precedingEmotion?: string;
  ferniResponse: string;
  wasHelpful?: boolean;
  voiceMarkers: VoiceMarkers;
}

export interface SilenceProfile {
  userId: string;

  /** Learned silence signatures for this user */
  silenceSignatures: Record<SilenceType, SilenceSignature>;

  /** Historical patterns */
  silenceHistory: SilenceHistoryEntry[];

  /** User's baseline silence tolerance (ms before they feel awkward) */
  baselinePauseTolerance: number;

  /** Response effectiveness by type (for learning) */
  responseEffectiveness: ResponseEffectiveness;

  /** Topics that trigger certain silence types */
  topicTriggers: TopicSilenceTrigger[];

  updatedAt: Date;
}

/**
 * Track effectiveness of responses per silence type
 */
export interface ResponseEffectiveness {
  /** Per-type tracking */
  byType: Record<
    SilenceType,
    {
      totalResponses: number;
      helpfulResponses: number;
      /** Which phrases worked best */
      topPhrases: Array<{ phrase: string; score: number }>;
      /** Average wait time that worked */
      optimalWaitMs: number;
    }
  >;
  /** Overall effectiveness score (0-1) */
  overallScore: number;
  /** Last updated */
  lastUpdated: Date;
}

/**
 * Track which topics trigger which silence types
 */
export interface TopicSilenceTrigger {
  topic: string;
  silenceType: SilenceType;
  frequency: number; // How often this topic → silence type
  avgDuration: number;
  avgEffectiveness: number;
}

/**
 * Learning result from pattern analysis
 */
export interface SilenceLearningResult {
  /** Was signature updated */
  signatureUpdated: boolean;
  /** Suggested adjustments */
  adjustments: {
    type: SilenceType;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    reason: string;
  }[];
  /** New topic triggers discovered */
  newTriggers: TopicSilenceTrigger[];
}

// ============================================================================
// RESPONSE PHRASES BY SILENCE TYPE
// ============================================================================

const SILENCE_RESPONSES: Record<SilenceType, string[]> = {
  processing: [
    // Say nothing - let them think
    '',
  ],
  emotional: [
    '<break time="500ms"/>I\'m here.',
    '<break time="500ms"/>Take your time.',
    '<break time="500ms"/>I\'m not going anywhere.',
    '<break time="500ms"/>It\'s okay.',
  ],
  uncomfortable: [
    '<break time="300ms"/>Is there something you want to say but aren\'t sure how?',
    '<break time="300ms"/>You can tell me.',
    '<break time="300ms"/>What\'s coming up for you right now?',
    '<break time="300ms"/>I\'m listening. No rush.',
  ],
  invitational: [
    '<break time="200ms"/>Tell me more about that.',
    '<break time="200ms"/>Go on...',
    '<break time="200ms"/>I\'m listening.',
    '<break time="200ms"/>Mmhmm...',
  ],
  exhausted: [
    '<break time="400ms"/>We don\'t have to talk. I can just be here with you.',
    '<break time="400ms"/>It\'s okay to just rest.',
    '<break time="400ms"/>You don\'t have to say anything.',
    '<break time="400ms"/>Sometimes being together is enough.',
  ],
  contemplative: [
    '<break time="600ms"/>That\'s a beautiful place to be.',
    '<break time="600ms"/>', // Honor it with matching silence
    '<break time="600ms"/>Mmm.',
    '<break time="600ms"/>I feel that too.',
  ],
};

// Wait times before responding (ms)
const WAIT_BEFORE_RESPONDING: Record<SilenceType, number> = {
  processing: 3000, // Give them plenty of time
  emotional: 2000, // Gentle pause, then presence
  uncomfortable: 1500, // Don't let it get too awkward
  invitational: 1000, // They're waiting for you
  exhausted: 2500, // Honor the tiredness
  contemplative: 4000, // Let the moment breathe
};

// Response type mapping
const SILENCE_TO_RESPONSE: Record<SilenceType, SilenceResponse> = {
  processing: 'hold_space',
  emotional: 'gentle_presence',
  uncomfortable: 'soft_prompt',
  invitational: 'soft_prompt',
  exhausted: 'offer_rest',
  contemplative: 'honor_moment',
};

// ============================================================================
// DEFAULT SIGNATURES (baseline before learning)
// ============================================================================

const DEFAULT_SIGNATURES: Record<SilenceType, SilenceSignature> = {
  processing: {
    typicalDuration: { min: 1000, max: 5000 },
    voiceMarkersBefore: ['normal'],
    breathPatternDuring: ['normal', 'held'],
    confidenceThreshold: 0.5,
    bestResponse: 'hold_space',
  },
  emotional: {
    typicalDuration: { min: 2000, max: 10000 },
    voiceMarkersBefore: ['heavy_topic', 'sad'],
    breathPatternDuring: ['held', 'sighing'],
    confidenceThreshold: 0.6,
    bestResponse: 'gentle_presence',
  },
  uncomfortable: {
    typicalDuration: { min: 1500, max: 4000 },
    voiceMarkersBefore: ['um', 'hesitation'],
    breathPatternDuring: ['quickening', 'held'],
    confidenceThreshold: 0.55,
    bestResponse: 'soft_prompt',
  },
  invitational: {
    typicalDuration: { min: 800, max: 2500 },
    voiceMarkersBefore: ['rising_energy'],
    breathPatternDuring: ['normal'],
    confidenceThreshold: 0.5,
    bestResponse: 'soft_prompt',
  },
  exhausted: {
    typicalDuration: { min: 2000, max: 8000 },
    voiceMarkersBefore: ['low_energy', 'sighing'],
    breathPatternDuring: ['sighing', 'deep'],
    confidenceThreshold: 0.6,
    bestResponse: 'offer_rest',
  },
  contemplative: {
    typicalDuration: { min: 3000, max: 15000 },
    voiceMarkersBefore: ['calm', 'reflective'],
    breathPatternDuring: ['normal', 'deep'],
    confidenceThreshold: 0.5,
    bestResponse: 'honor_moment',
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Analyze a silence to determine its meaning.
 * Call this when user has been silent for > 1 second.
 */
export function analyzeSilence(
  durationMs: number,
  context: {
    precedingTopic?: string;
    precedingEmotion?: string;
    precedingUserMessage?: string;
    voiceMarkersBefore: VoiceMarkers;
    conversationPhase: 'opening' | 'middle' | 'deep' | 'closing';
    recentHeavyTopics?: string[];
    userProfile?: SilenceProfile;
  }
): SilenceAnalysis {
  const { voiceMarkersBefore, conversationPhase, precedingEmotion, precedingUserMessage } = context;

  // Use user-specific patterns if available, otherwise defaults
  const signatures = context.userProfile?.silenceSignatures || DEFAULT_SIGNATURES;

  // Calculate scores for each silence type
  const scores: Record<SilenceType, number> = {
    processing: 0,
    emotional: 0,
    uncomfortable: 0,
    invitational: 0,
    exhausted: 0,
    contemplative: 0,
  };

  // RULE 1: Short silences after questions = processing
  if (durationMs < 2000 && precedingUserMessage?.endsWith('?')) {
    scores.processing += 0.4;
  }

  // RULE 2: Held breath + heavy topic = emotional
  if (voiceMarkersBefore.breathPattern === 'held') {
    scores.emotional += 0.3;
    scores.uncomfortable += 0.2;
  }

  // Heavy emotion context
  if (precedingEmotion === 'sad' || precedingEmotion === 'fearful') {
    scores.emotional += 0.3;
  }

  if (context.recentHeavyTopics?.length) {
    scores.emotional += 0.2;
  }

  // RULE 3: Sighing + low energy = exhausted
  if (voiceMarkersBefore.breathPattern === 'sighing') {
    scores.exhausted += 0.3;
    scores.emotional += 0.1;
  }

  if (voiceMarkersBefore.energyJustBefore < 0.4) {
    scores.exhausted += 0.25;
  }

  // RULE 4: "um" or "hmm" sounds = uncomfortable/searching
  if (voiceMarkersBefore.microSounds.includes('um')) {
    scores.uncomfortable += 0.35;
    scores.processing += 0.1;
  }

  if (voiceMarkersBefore.microSounds.includes('hmm')) {
    scores.processing += 0.2;
    scores.uncomfortable += 0.1;
  }

  // RULE 5: Deep phase + calm breath = contemplative
  if (conversationPhase === 'deep') {
    scores.contemplative += 0.2;
    scores.emotional += 0.1;
  }

  if (voiceMarkersBefore.breathPattern === 'normal' && durationMs > 3000) {
    scores.contemplative += 0.2;
  }

  if (voiceMarkersBefore.breathPattern === 'deep') {
    scores.contemplative += 0.25;
    scores.exhausted += 0.1;
  }

  // RULE 6: Rising energy before silence = invitational
  if (voiceMarkersBefore.energyJustBefore > 0.7) {
    scores.invitational += 0.3;
  }

  // RULE 7: Throat clear or sniff = uncomfortable
  if (voiceMarkersBefore.microSounds.includes('throat_clear')) {
    scores.uncomfortable += 0.2;
  }

  if (voiceMarkersBefore.microSounds.includes('sniff')) {
    scores.emotional += 0.25;
  }

  // RULE 8: Duration-based adjustments
  if (durationMs > 5000) {
    scores.contemplative += 0.15;
    scores.emotional += 0.1;
    scores.exhausted += 0.1;
  }

  if (durationMs < 1500) {
    scores.processing += 0.2;
    scores.invitational += 0.15;
  }

  // RULE 9: Opening phase = usually processing
  if (conversationPhase === 'opening') {
    scores.processing += 0.15;
  }

  // Find highest scoring type
  let maxScore = 0;
  let detectedType: SilenceType = 'processing';

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type as SilenceType;
    }
  }

  // Calculate confidence (normalize score)
  const confidence = Math.min(0.95, maxScore + 0.3); // Base confidence + score

  return buildSilenceResponse(detectedType, durationMs, voiceMarkersBefore, confidence);
}

function buildSilenceResponse(
  type: SilenceType,
  duration: number,
  voiceMarkers: VoiceMarkers,
  confidence: number
): SilenceAnalysis {
  const phrases = SILENCE_RESPONSES[type];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];

  return {
    type,
    confidence,
    duration,
    voiceMarkers,
    recommendedResponse: SILENCE_TO_RESPONSE[type],
    responsePhrase: phrase,
    shouldWait: type === 'processing' || type === 'contemplative',
    waitDurationMs: WAIT_BEFORE_RESPONDING[type],
  };
}

// ============================================================================
// LEARNING & PERSISTENCE
// ============================================================================

/**
 * Record a silence and user's response for learning.
 */
export async function recordSilenceOutcome(
  userId: string,
  analysis: SilenceAnalysis,
  outcome: {
    ferniResponse: string;
    wasHelpful?: boolean;
    userContinued: boolean;
    topic?: string;
    emotion?: string;
  }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const entry: SilenceHistoryEntry = {
      timestamp: new Date(),
      type: analysis.type,
      duration: analysis.duration,
      precedingTopic: outcome.topic,
      precedingEmotion: outcome.emotion,
      ferniResponse: outcome.ferniResponse,
      wasHelpful: outcome.wasHelpful,
      voiceMarkers: analysis.voiceMarkers,
    };

    // Add to history
    const ref = db
      .collection('bogle_users')
      .doc(userId)
      .collection('silence_patterns')
      .doc('profile');

    const doc = await ref.get();

    if (doc.exists) {
      const profile = doc.data() as SilenceProfile;
      profile.silenceHistory.push(entry);

      // Keep last 100 entries
      if (profile.silenceHistory.length > 100) {
        profile.silenceHistory = profile.silenceHistory.slice(-100);
      }

      profile.updatedAt = new Date();
      await ref.set(cleanForFirestore(profile)); // Use set instead of update for type safety

      // Index silence pattern to semantic memory
      void onEmotionalPatternChange(
        userId,
        `silence_${Date.now()}`,
        {
          pattern: `${analysis.type} silence detected (${analysis.duration}ms)`,
          triggers: [],
          frequency: 'occasional',
          impact: 'mixed',
          awareness: 'high',
        },
        'create'
      );
    } else {
      // Create new profile
      const newProfile: SilenceProfile = {
        userId,
        silenceSignatures: DEFAULT_SIGNATURES,
        silenceHistory: [entry],
        baselinePauseTolerance: 2000,
        responseEffectiveness: {
          byType: {
            processing: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 3000,
            },
            emotional: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 5000,
            },
            uncomfortable: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 4000,
            },
            invitational: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 3000,
            },
            exhausted: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 6000,
            },
            contemplative: {
              totalResponses: 0,
              helpfulResponses: 0,
              topPhrases: [],
              optimalWaitMs: 5000,
            },
          },
          overallScore: 0.5,
          lastUpdated: new Date(),
        },
        topicTriggers: [],
        updatedAt: new Date(),
      };
      await ref.set(cleanForFirestore(newProfile));
    }

    log.debug({ userId, type: analysis.type }, 'Recorded silence outcome');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to record silence outcome');
  }
}

/**
 * Load user's silence profile.
 */
export async function loadSilenceProfile(userId: string): Promise<SilenceProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('silence_patterns')
      .doc('profile')
      .get();

    if (doc.exists) {
      return doc.data() as SilenceProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load silence profile');
    return null;
  }
}

/**
 * Update user's baseline pause tolerance based on their patterns.
 */
export async function updateBaselineTolerance(userId: string): Promise<void> {
  const profile = await loadSilenceProfile(userId);
  if (!profile || profile.silenceHistory.length < 10) return;

  // Calculate average duration where user seemed comfortable
  const comfortableSilences = profile.silenceHistory.filter(
    (s) => s.wasHelpful !== false && s.type !== 'uncomfortable'
  );

  if (comfortableSilences.length < 5) return;

  const avgDuration =
    comfortableSilences.reduce((sum, s) => sum + s.duration, 0) / comfortableSilences.length;

  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('silence_patterns')
      .doc('profile')
      .update(
        cleanForFirestore({
          baselinePauseTolerance: avgDuration,
          updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to update baseline tolerance');
  }
}

// ============================================================================
// ENHANCED LEARNING
// ============================================================================

/**
 * Learn from silence patterns and update user signatures.
 * Call this periodically (e.g., end of session) to refine patterns.
 */
export async function learnFromPatterns(userId: string): Promise<SilenceLearningResult> {
  const result: SilenceLearningResult = {
    signatureUpdated: false,
    adjustments: [],
    newTriggers: [],
  };

  const profile = await loadSilenceProfile(userId);
  if (!profile || profile.silenceHistory.length < 10) {
    return result;
  }

  const db = getFirestoreDb();
  if (!db) return result;

  // Group history by type
  const byType = new Map<SilenceType, SilenceHistoryEntry[]>();
  for (const entry of profile.silenceHistory) {
    const existing = byType.get(entry.type) || [];
    existing.push(entry);
    byType.set(entry.type, existing);
  }

  // Update signatures based on patterns
  const updatedSignatures = { ...profile.silenceSignatures };
  let hasChanges = false;

  for (const [type, entries] of byType) {
    if (entries.length < 5) continue;

    const helpfulEntries = entries.filter((e) => e.wasHelpful === true);
    const unhelpfulEntries = entries.filter((e) => e.wasHelpful === false);

    // Adjust confidence threshold
    if (helpfulEntries.length + unhelpfulEntries.length >= 5) {
      const successRate = helpfulEntries.length / (helpfulEntries.length + unhelpfulEntries.length);
      const currentThreshold = updatedSignatures[type].confidenceThreshold;
      const newThreshold = Math.max(0.4, Math.min(0.8, successRate));

      if (Math.abs(newThreshold - currentThreshold) > 0.1) {
        result.adjustments.push({
          type,
          field: 'confidenceThreshold',
          oldValue: currentThreshold,
          newValue: newThreshold,
          reason: `Success rate ${(successRate * 100).toFixed(0)}%`,
        });
        updatedSignatures[type].confidenceThreshold = newThreshold;
        hasChanges = true;
      }
    }

    // Learn optimal duration range from successful interactions
    if (helpfulEntries.length >= 5) {
      const durations = helpfulEntries.map((e) => e.duration).sort((a, b) => a - b);
      const p25 = durations[Math.floor(durations.length * 0.25)];
      const p75 = durations[Math.floor(durations.length * 0.75)];

      const currentRange = updatedSignatures[type].typicalDuration;
      if (Math.abs(p25 - currentRange.min) > 500 || Math.abs(p75 - currentRange.max) > 500) {
        result.adjustments.push({
          type,
          field: 'typicalDuration',
          oldValue: currentRange,
          newValue: { min: p25, max: p75 },
          reason: 'Learned from successful responses',
        });
        updatedSignatures[type].typicalDuration = { min: p25, max: p75 };
        hasChanges = true;
      }
    }
  }

  // Discover topic triggers
  const topicCounts = new Map<string, Map<SilenceType, number[]>>();
  for (const entry of profile.silenceHistory) {
    if (!entry.precedingTopic) continue;
    const topic = entry.precedingTopic.toLowerCase();
    if (!topicCounts.has(topic)) {
      topicCounts.set(topic, new Map());
    }
    const typeMap = topicCounts.get(topic)!;
    const durations = typeMap.get(entry.type) || [];
    durations.push(entry.duration);
    typeMap.set(entry.type, durations);
  }

  for (const [topic, typeMap] of topicCounts) {
    for (const [silenceType, durations] of typeMap) {
      if (durations.length >= 3) {
        // Check if this is a new or stronger trigger
        const existingTrigger = profile.topicTriggers?.find(
          (t) => t.topic === topic && t.silenceType === silenceType
        );

        if (!existingTrigger || durations.length > existingTrigger.frequency) {
          const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
          const trigger: TopicSilenceTrigger = {
            topic,
            silenceType,
            frequency: durations.length,
            avgDuration,
            avgEffectiveness: 0.5, // Will be updated with outcome data
          };
          result.newTriggers.push(trigger);
          hasChanges = true;
        }
      }
    }
  }

  // Save updated profile
  if (hasChanges) {
    try {
      const updatedProfile = {
        ...profile,
        silenceSignatures: updatedSignatures,
        topicTriggers: [
          ...(profile.topicTriggers || []).filter(
            (t) =>
              !result.newTriggers.some(
                (nt) => nt.topic === t.topic && nt.silenceType === t.silenceType
              )
          ),
          ...result.newTriggers,
        ],
        updatedAt: new Date(),
      };

      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('silence_patterns')
        .doc('profile')
        .set(cleanForFirestore(updatedProfile));

      result.signatureUpdated = true;
      log.debug(
        { userId, adjustments: result.adjustments.length, newTriggers: result.newTriggers.length },
        'Learned from silence patterns'
      );
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Failed to save learned patterns');
    }
  }

  return result;
}

/**
 * Update response effectiveness tracking after a response.
 */
export async function updateResponseEffectiveness(
  userId: string,
  silenceType: SilenceType,
  phrase: string,
  wasHelpful: boolean,
  waitTimeMs: number
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const ref = db
      .collection('bogle_users')
      .doc(userId)
      .collection('silence_patterns')
      .doc('profile');

    const doc = await ref.get();
    if (!doc.exists) return;

    const profile = doc.data() as SilenceProfile;

    // Initialize if needed
    if (!profile.responseEffectiveness) {
      profile.responseEffectiveness = createDefaultEffectiveness();
    }

    const typeData = profile.responseEffectiveness.byType[silenceType];
    typeData.totalResponses++;
    if (wasHelpful) {
      typeData.helpfulResponses++;
    }

    // Update phrase ranking
    const phraseClean = phrase.replace(/<[^>]*>/g, '').trim();
    if (phraseClean) {
      const existingPhrase = typeData.topPhrases.find((p) => p.phrase === phraseClean);
      if (existingPhrase) {
        existingPhrase.score = existingPhrase.score * 0.9 + (wasHelpful ? 0.1 : 0);
      } else {
        typeData.topPhrases.push({ phrase: phraseClean, score: wasHelpful ? 0.8 : 0.3 });
      }
      // Keep top 10 phrases
      typeData.topPhrases.sort((a, b) => b.score - a.score);
      typeData.topPhrases = typeData.topPhrases.slice(0, 10);
    }

    // Update optimal wait time (exponential moving average)
    if (wasHelpful) {
      typeData.optimalWaitMs = typeData.optimalWaitMs * 0.8 + waitTimeMs * 0.2;
    }

    // Update overall score
    let totalResponses = 0;
    let totalHelpful = 0;
    for (const data of Object.values(profile.responseEffectiveness.byType)) {
      totalResponses += data.totalResponses;
      totalHelpful += data.helpfulResponses;
    }
    profile.responseEffectiveness.overallScore =
      totalResponses > 0 ? totalHelpful / totalResponses : 0.5;
    profile.responseEffectiveness.lastUpdated = new Date();

    await ref.set(cleanForFirestore(profile));
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to update response effectiveness');
  }
}

/**
 * Get the best response phrase for a silence type based on learned effectiveness.
 */
export async function getBestResponsePhrase(
  userId: string,
  silenceType: SilenceType
): Promise<string> {
  const profile = await loadSilenceProfile(userId);

  // Check learned effectiveness
  if (profile?.responseEffectiveness?.byType[silenceType]) {
    const typeData = profile.responseEffectiveness.byType[silenceType];
    if (typeData.topPhrases.length > 0 && typeData.topPhrases[0].score > 0.6) {
      // Use learned best phrase
      return typeData.topPhrases[0].phrase;
    }
  }

  // Fall back to default
  return getResponsePhrase(silenceType);
}

/**
 * Get optimal wait time for a silence type based on learned patterns.
 */
export async function getOptimalWaitTime(
  userId: string,
  silenceType: SilenceType
): Promise<number> {
  const profile = await loadSilenceProfile(userId);

  if (profile?.responseEffectiveness?.byType[silenceType]) {
    const typeData = profile.responseEffectiveness.byType[silenceType];
    if (typeData.totalResponses >= 5) {
      return Math.round(typeData.optimalWaitMs);
    }
  }

  // Fall back to default
  return WAIT_BEFORE_RESPONDING[silenceType];
}

/**
 * Create default response effectiveness tracking
 */
function createDefaultEffectiveness(): ResponseEffectiveness {
  const byType: ResponseEffectiveness['byType'] = {} as ResponseEffectiveness['byType'];
  const silenceTypes: SilenceType[] = [
    'processing',
    'emotional',
    'uncomfortable',
    'invitational',
    'exhausted',
    'contemplative',
  ];

  for (const type of silenceTypes) {
    byType[type] = {
      totalResponses: 0,
      helpfulResponses: 0,
      topPhrases: [],
      optimalWaitMs: WAIT_BEFORE_RESPONDING[type],
    };
  }

  return {
    byType,
    overallScore: 0.5,
    lastUpdated: new Date(),
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build guidance string for LLM injection.
 */
export function buildSilenceGuidance(analysis: SilenceAnalysis): string {
  if (!analysis) return '';

  const guidance: Record<SilenceType, string> = {
    processing:
      'SILENCE DETECTED: Processing type. Give them time to think. Do NOT fill this silence.',
    emotional:
      'SILENCE DETECTED: Emotional type. Words may be hard right now. Simply acknowledge presence.',
    uncomfortable:
      'SILENCE DETECTED: Something unspoken. Gently create space for sharing without pressure.',
    invitational: 'SILENCE DETECTED: They want you to go deeper. Follow their lead.',
    exhausted:
      'SILENCE DETECTED: They need rest, not more words. Offer to just be present quietly.',
    contemplative:
      "SILENCE DETECTED: Contemplative moment. Honor it. Don't rush. Let the moment breathe.",
  };

  const sections: string[] = [
    '[SILENCE INTERPRETER]',
    guidance[analysis.type],
    `Confidence: ${(analysis.confidence * 100).toFixed(0)}%`,
    `Duration: ${(analysis.duration / 1000).toFixed(1)}s`,
  ];

  if (analysis.responsePhrase) {
    sections.push(`Suggested response: "${analysis.responsePhrase.replace(/<[^>]*>/g, '')}"`);
  }

  if (analysis.shouldWait) {
    sections.push(`Wait ${(analysis.waitDurationMs / 1000).toFixed(1)}s before responding.`);
  }

  return sections.join('\n');
}

/**
 * Build context for ongoing conversation.
 */
export async function buildSilenceContext(userId: string): Promise<string> {
  const profile = await loadSilenceProfile(userId);
  if (!profile) return '';

  const sections: string[] = ['[SILENCE AWARENESS]'];

  // User's typical tolerance
  sections.push(
    `This user's comfortable pause threshold: ${(profile.baselinePauseTolerance / 1000).toFixed(1)}s`
  );

  // Recent patterns
  const recentEmotional = profile.silenceHistory.filter(
    (s) =>
      s.type === 'emotional' &&
      Date.now() - new Date(s.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

  if (recentEmotional > 3) {
    sections.push('Note: User has had several emotional silences recently. Be gentle.');
  }

  return sections.join('\n');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if we should analyze a silence (duration threshold).
 */
export function shouldAnalyzeSilence(durationMs: number): boolean {
  return durationMs >= 1000; // Only analyze silences >= 1 second
}

/**
 * Get a random response phrase for a silence type.
 */
export function getResponsePhrase(type: SilenceType): string {
  const phrases = SILENCE_RESPONSES[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const silenceInterpreter = {
  analyzeSilence,
  recordSilenceOutcome,
  loadSilenceProfile,
  updateBaselineTolerance,
  buildSilenceGuidance,
  buildSilenceContext,
  shouldAnalyzeSilence,
  getResponsePhrase,
  // Enhanced learning
  learnFromPatterns,
  updateResponseEffectiveness,
  getBestResponsePhrase,
  getOptimalWaitTime,
};

export default silenceInterpreter;
