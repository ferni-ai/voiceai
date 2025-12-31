/**
 * Feedback Store for Semantic Router
 *
 * Collects and persists routing feedback to Firestore for active learning.
 * This enables the router to learn from corrections and improve over time.
 *
 * Storage structure:
 *   semantic_routing_feedback/{feedbackId}
 *   semantic_routing_corrections/{userId}/{correctionId}
 *   semantic_routing_vocabulary/{userId}
 *
 * @module semantic-router/advanced/feedback-store
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SemanticRouterResult } from '../types.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'SemanticRouter.FeedbackStore' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingFeedback {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  personaId: string;

  // Input
  inputText: string;
  inputLocale: string;

  // Routing result
  routingResult: {
    predictedTool: string | null;
    confidence: number;
    action: string;
    alternativeTools: string[];
  };

  // Outcome
  outcome: {
    actualToolUsed: string | null;
    userCorrection: boolean;
    success: boolean;
    userSatisfaction?: number; // 1-5 if collected
  };

  // Context
  context: {
    conversationLength: number;
    recentTools: string[];
    timeOfDay: string;
  };
}

export interface UserCorrection {
  id: string;
  userId: string;
  timestamp: Date;

  // What was wrong
  inputText: string;
  predictedTool: string | null;
  predictedConfidence: number;

  // What was right
  correctTool: string;

  // Learning signal
  signalStrength: number; // How confident we are this is a true correction
  learnedAt?: Date;
}

export interface UserVocabulary {
  userId: string;
  updatedAt: Date;

  // Learned phrase -> tool mappings
  phrases: Array<{
    phrase: string;
    toolId: string;
    confidence: number;
    usageCount: number;
    lastUsed: Date;
    source: 'explicit' | 'implicit'; // User said "always do X" vs learned from usage
  }>;

  // Tool preferences
  toolPreferences: Record<
    string,
    {
      boost: number; // -1 to 1
      usageCount: number;
    }
  >;

  // Time patterns
  timePatterns: Record<
    string,
    {
      toolId: string;
      timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
      dayOfWeek?: number;
      probability: number;
    }
  >;
}

export interface CalibrationData {
  // Binned confidence -> accuracy
  bins: Array<{
    confidenceMin: number;
    confidenceMax: number;
    totalPredictions: number;
    correctPredictions: number;
    accuracy: number;
  }>;

  // Temperature for calibration
  temperature: number;

  // Expected Calibration Error
  ece: number;

  updatedAt: Date;
}

// ============================================================================
// IN-MEMORY STORE (for development/testing)
// ============================================================================

const feedbackStore = new Map<string, RoutingFeedback>();
const correctionsStore = new Map<string, UserCorrection[]>();
const vocabularyStore = new Map<string, UserVocabulary>();
let calibrationData: CalibrationData | null = null;

// ============================================================================
// FEEDBACK COLLECTION
// ============================================================================

/**
 * Record routing feedback
 */
export async function recordFeedback(feedback: Omit<RoutingFeedback, 'id'>): Promise<string> {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullFeedback: RoutingFeedback = { ...feedback, id };

  // Store in memory
  feedbackStore.set(id, fullFeedback);

  // Persist to Firestore (async, don't block)
  persistFeedback(fullFeedback).catch((err) => {
    log.warn({ error: String(err) }, 'Failed to persist feedback');
  });

  // Check for correction
  if (feedback.outcome.userCorrection) {
    await recordCorrection({
      userId: feedback.userId,
      inputText: feedback.inputText,
      predictedTool: feedback.routingResult.predictedTool,
      predictedConfidence: feedback.routingResult.confidence,
      correctTool: feedback.outcome.actualToolUsed!,
      signalStrength: 0.9, // High confidence for explicit corrections
    });
  }

  log.debug(
    {
      id,
      userId: feedback.userId,
      predicted: feedback.routingResult.predictedTool,
      actual: feedback.outcome.actualToolUsed,
      correction: feedback.outcome.userCorrection,
    },
    'Feedback recorded'
  );

  return id;
}

/**
 * Record a user correction for learning
 */
export async function recordCorrection(
  correction: Omit<UserCorrection, 'id' | 'timestamp'>
): Promise<void> {
  const id = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullCorrection: UserCorrection = {
    ...correction,
    id,
    timestamp: new Date(),
  };

  // Store in memory
  const userCorrections = correctionsStore.get(correction.userId) || [];
  userCorrections.push(fullCorrection);
  correctionsStore.set(correction.userId, userCorrections);

  // Persist to Firestore
  persistCorrection(fullCorrection).catch((err) => {
    log.warn({ error: String(err) }, 'Failed to persist correction');
  });

  log.info(
    {
      userId: correction.userId,
      from: correction.predictedTool,
      to: correction.correctTool,
      input: correction.inputText.substring(0, 50),
    },
    'Correction recorded'
  );
}

// ============================================================================
// USER VOCABULARY
// ============================================================================

/**
 * Learn a user-specific phrase mapping
 */
export async function learnUserPhrase(
  userId: string,
  phrase: string,
  toolId: string,
  source: 'explicit' | 'implicit' = 'implicit'
): Promise<void> {
  let vocab = vocabularyStore.get(userId);

  if (!vocab) {
    vocab = {
      userId,
      updatedAt: new Date(),
      phrases: [],
      toolPreferences: {},
      timePatterns: {},
    };
  }

  // Check if phrase already exists
  const existingIndex = vocab.phrases.findIndex(
    (p) => p.phrase.toLowerCase() === phrase.toLowerCase()
  );

  if (existingIndex >= 0) {
    // Update existing
    const existing = vocab.phrases[existingIndex];
    existing.toolId = toolId;
    existing.usageCount++;
    existing.lastUsed = new Date();
    existing.confidence = Math.min(1, existing.confidence + 0.1);
  } else {
    // Add new
    vocab.phrases.push({
      phrase: phrase.toLowerCase(),
      toolId,
      confidence: source === 'explicit' ? 0.9 : 0.5,
      usageCount: 1,
      lastUsed: new Date(),
      source,
    });
  }

  vocab.updatedAt = new Date();
  vocabularyStore.set(userId, vocab);

  // Persist
  persistVocabulary(vocab).catch((err) => {
    log.warn({ error: String(err) }, 'Failed to persist vocabulary');
  });

  log.debug(
    {
      userId,
      phrase,
      toolId,
      source,
    },
    'User phrase learned'
  );
}

/**
 * Get user vocabulary for routing
 */
export async function getUserVocabulary(userId: string): Promise<UserVocabulary | undefined> {
  // Check memory first
  let vocab = vocabularyStore.get(userId);

  if (!vocab) {
    // Try loading from Firestore
    vocab = await loadVocabulary(userId);
    if (vocab) {
      vocabularyStore.set(userId, vocab);
    }
  }

  return vocab;
}

/**
 * Match user input against learned phrases
 */
export function matchUserPhrases(
  input: string,
  vocabulary: UserVocabulary
): { toolId: string; confidence: number } | null {
  const lowerInput = input.toLowerCase();

  // Sort phrases by confidence and recency
  const sortedPhrases = [...vocabulary.phrases].sort((a, b) => {
    const scoreA = a.confidence * 0.7 + (a.usageCount / 100) * 0.3;
    const scoreB = b.confidence * 0.7 + (b.usageCount / 100) * 0.3;
    return scoreB - scoreA;
  });

  for (const phrase of sortedPhrases) {
    if (lowerInput.includes(phrase.phrase)) {
      return {
        toolId: phrase.toolId,
        confidence: phrase.confidence,
      };
    }
  }

  return null;
}

// ============================================================================
// CALIBRATION DATA
// ============================================================================

/**
 * Update calibration data from collected feedback
 */
export async function updateCalibration(): Promise<CalibrationData> {
  // Collect all feedback
  const allFeedback = Array.from(feedbackStore.values());

  if (allFeedback.length < 50) {
    log.info({ count: allFeedback.length }, 'Not enough feedback for calibration');
    return calibrationData || createDefaultCalibration();
  }

  // Bin by confidence
  const bins: CalibrationData['bins'] = [];
  const binEdges = [0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0];

  for (let i = 0; i < binEdges.length - 1; i++) {
    const min = binEdges[i];
    const max = binEdges[i + 1];

    const binFeedback = allFeedback.filter(
      (f) => f.routingResult.confidence >= min && f.routingResult.confidence < max
    );

    const correct = binFeedback.filter(
      (f) => f.routingResult.predictedTool === f.outcome.actualToolUsed
    ).length;

    bins.push({
      confidenceMin: min,
      confidenceMax: max,
      totalPredictions: binFeedback.length,
      correctPredictions: correct,
      accuracy: binFeedback.length > 0 ? correct / binFeedback.length : 0,
    });
  }

  // Calculate ECE (Expected Calibration Error)
  let ece = 0;
  const totalPredictions = allFeedback.length;

  for (const bin of bins) {
    if (bin.totalPredictions > 0) {
      const expectedConfidence = (bin.confidenceMin + bin.confidenceMax) / 2;
      const error = Math.abs(bin.accuracy - expectedConfidence);
      ece += (bin.totalPredictions / totalPredictions) * error;
    }
  }

  // Calculate temperature (simple approach)
  // TODO: Implement Platt scaling for better calibration
  const temperature = ece > 0.1 ? 1.5 : ece > 0.05 ? 1.2 : 1.0;

  calibrationData = {
    bins,
    temperature,
    ece,
    updatedAt: new Date(),
  };

  log.info({ ece: ece.toFixed(3), temperature }, 'Calibration updated');

  return calibrationData;
}

/**
 * Apply calibration to a confidence score
 */
export function calibrateConfidence(rawConfidence: number): number {
  if (!calibrationData) {
    return rawConfidence;
  }

  // Apply temperature scaling
  const scaled = Math.pow(rawConfidence, 1 / calibrationData.temperature);

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, scaled));
}

/**
 * Get calibration data
 */
export function getCalibrationData(): CalibrationData | null {
  return calibrationData;
}

function createDefaultCalibration(): CalibrationData {
  return {
    bins: [],
    temperature: 1.0,
    ece: 0,
    updatedAt: new Date(),
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

/**
 * Minimal interface for Firestore operations needed by this module.
 * Avoids importing full Firestore types while maintaining type safety.
 */
interface FirestoreMinimal {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<void>;
      collection(name: string): {
        doc(id: string): {
          set(data: Record<string, unknown>): Promise<void>;
        };
      };
    };
  };
}

// Use the existing Firestore persistence module
async function getFirestoreInstance(): Promise<FirestoreMinimal | null> {
  try {
    // Use the existing firestore-persistence module
    const { getFirestore, initializeFirestorePersistence } =
      await import('../persistence/firestore-persistence.js');

    // Initialize if not already
    await initializeFirestorePersistence();

    return getFirestore() as FirestoreMinimal;
  } catch {
    // Firestore not available - that's OK, we'll use in-memory storage
    log.debug('Firestore not available, using in-memory storage');
    return null;
  }
}

async function persistFeedback(feedback: RoutingFeedback): Promise<void> {
  const db = await getFirestoreInstance();
  if (!db) return;

  try {
    await db
      .collection('semantic_routing_feedback')
      .doc(feedback.id)
      .set(
        cleanForFirestore({
          ...feedback,
          timestamp: feedback.timestamp.toISOString(),
        })
      );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist feedback');
  }
}

async function persistCorrection(correction: UserCorrection): Promise<void> {
  const db = await getFirestoreInstance();
  if (!db) return;

  try {
    await db
      .collection('semantic_routing_corrections')
      .doc(correction.userId)
      .collection('corrections')
      .doc(correction.id)
      .set(
        cleanForFirestore({
          ...correction,
          timestamp: correction.timestamp.toISOString(),
        })
      );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist correction');
  }
}

async function persistVocabulary(vocab: UserVocabulary): Promise<void> {
  const db = await getFirestoreInstance();
  if (!db) return;

  try {
    await db
      .collection('semantic_routing_vocabulary')
      .doc(vocab.userId)
      .set(
        cleanForFirestore({
          ...vocab,
          updatedAt: vocab.updatedAt.toISOString(),
          phrases: vocab.phrases.map((p) => ({
            ...p,
            lastUsed: p.lastUsed.toISOString(),
          })),
        })
      );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist vocabulary');
  }
}

async function loadVocabulary(userId: string): Promise<UserVocabulary | undefined> {
  const db = await getFirestoreInstance();
  if (!db) return undefined;

  try {
    const doc = await db.collection('semantic_routing_vocabulary').doc(userId).get();
    if (!doc.exists) return undefined;

    const data = doc.data();
    if (!data) return undefined;

    return {
      userId: String(data.userId ?? userId),
      updatedAt: new Date(String(data.updatedAt)),
      phrases: Array.isArray(data.phrases)
        ? data.phrases.map((p: Record<string, unknown>) => ({
            phrase: String(p.phrase ?? ''),
            toolId: String(p.toolId ?? ''),
            confidence: Number(p.confidence ?? 0),
            usageCount: Number(p.usageCount ?? 0),
            lastUsed: new Date(String(p.lastUsed)),
            source: (p.source === 'explicit' ? 'explicit' : 'implicit') as 'explicit' | 'implicit',
          }))
        : [],
      toolPreferences:
        (data.toolPreferences as Record<string, { boost: number; usageCount: number }>) ?? {},
      timePatterns:
        (data.timePatterns as Record<
          string,
          {
            toolId: string;
            timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
            dayOfWeek?: number;
            probability: number;
          }
        >) ?? {},
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load vocabulary');
    return undefined;
  }
}

// ============================================================================
// VOCABULARY MANAGEMENT
// ============================================================================

/**
 * Get all user IDs with vocabulary entries (from memory + Firestore)
 */
export async function getAllVocabularyUserIds(): Promise<string[]> {
  // Start with in-memory user IDs
  const userIds = new Set<string>(vocabularyStore.keys());

  // Try to get additional IDs from Firestore
  try {
    const db = await getFirestoreInstance();
    if (db) {
      // Note: This requires iterating the collection. For production,
      // consider maintaining a separate index of user IDs or using pagination.
      // For now, we only process in-memory vocabularies which is sufficient
      // for the batch learning use case (users who've been active this session).
    }
  } catch {
    // Firestore not available, continue with in-memory only
  }

  return Array.from(userIds);
}

/**
 * Save vocabulary (updates both in-memory and Firestore)
 */
export async function saveVocabulary(vocab: UserVocabulary): Promise<void> {
  // Update in-memory store
  vocabularyStore.set(vocab.userId, vocab);

  // Persist to Firestore
  await persistVocabulary(vocab);
}

// ============================================================================
// METRICS
// ============================================================================

/**
 * Get feedback statistics
 */
export function getFeedbackStats(): {
  totalFeedback: number;
  totalCorrections: number;
  correctionRate: number;
  successRate: number;
} {
  const allFeedback = Array.from(feedbackStore.values());
  const corrections = allFeedback.filter((f) => f.outcome.userCorrection).length;
  const successes = allFeedback.filter((f) => f.outcome.success).length;

  return {
    totalFeedback: allFeedback.length,
    totalCorrections: corrections,
    correctionRate: allFeedback.length > 0 ? corrections / allFeedback.length : 0,
    successRate: allFeedback.length > 0 ? successes / allFeedback.length : 0,
  };
}

/**
 * Get user statistics
 */
export function getUserStats(userId: string): {
  corrections: number;
  learnedPhrases: number;
  toolPreferences: number;
} {
  const corrections = correctionsStore.get(userId)?.length || 0;
  const vocab = vocabularyStore.get(userId);

  return {
    corrections,
    learnedPhrases: vocab?.phrases.length || 0,
    toolPreferences: Object.keys(vocab?.toolPreferences || {}).length,
  };
}
