/**
 * User Corrections Memory Service
 *
 * Tracks when users correct Ferni and learns from those corrections.
 * This is CRITICAL for improving accuracy - corrections are gold!
 *
 * "Better than human" means we NEVER make the same mistake twice.
 *
 * @module services/superhuman/user-corrections
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import {
  onUserCorrectionChange,
  onImplicitPreferenceChange,
} from '../data-layer/hooks/learning-hooks.js';
import type { UserCorrectionEntity, ImplicitPreferenceEntity } from '../data-layer/types.js';

const log = getLogger().child({ module: 'user-corrections' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserCorrection extends UserCorrectionEntity {
  id: string;
}

export interface CorrectionPattern {
  category: string;
  correctionCount: number;
  lastCorrected: string;
  examples: string[];
}

// ============================================================================
// CORRECTION DETECTION PATTERNS
// ============================================================================

const CORRECTION_PATTERNS = [
  // Direct corrections
  /^no,?\s*(actually|that's not right|that's wrong|i meant)/i,
  /^actually,?\s/i,
  /^that's not (right|correct|what i said|what i meant)/i,
  /^i (didn't|never) (say|mean|said) that/i,
  /^i meant/i,
  /^not\s+(.+?),\s+(.*)/i,

  // Clarifications
  /^let me clarify/i,
  /^to be clear/i,
  /^what i (actually|really) meant/i,

  // Factual corrections
  /^(it's|it was|that's|that was) (actually|really)/i,
  /^the (correct|right) (answer|thing|name|date) is/i,

  // Name/fact corrections
  /^(his|her|their|my) name is (actually|really)?/i,
  /^(i'm|we're|it's) (actually|really)/i,
];

// ============================================================================
// CORRECTION RECORDING
// ============================================================================

/**
 * Detect if a message contains a correction
 */
export function detectCorrection(
  userMessage: string,
  previousFerniMessage?: string
): { isCorrection: boolean; confidence: number } {
  const message = userMessage.trim().toLowerCase();

  // Check against correction patterns
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { isCorrection: true, confidence: 0.9 };
    }
  }

  // Check for "no" followed by alternative information
  if (/^no[,.\s]/.test(message) && message.length > 10) {
    return { isCorrection: true, confidence: 0.7 };
  }

  // Check for contradiction with previous message
  if (previousFerniMessage) {
    // Simple negation check
    const ferniLower = previousFerniMessage.toLowerCase();
    if (
      ferniLower.includes('you said') ||
      ferniLower.includes('you mentioned') ||
      ferniLower.includes('earlier you')
    ) {
      if (message.startsWith('no') || message.includes("didn't say")) {
        return { isCorrection: true, confidence: 0.85 };
      }
    }
  }

  return { isCorrection: false, confidence: 0 };
}

/**
 * Categorize a correction
 */
export function categorizeCorrection(
  whatFerniSaid: string,
  whatUserCorrected: string
): 'fact' | 'preference' | 'relationship' | 'event' | 'opinion' | 'other' {
  const combined = `${whatFerniSaid} ${whatUserCorrected}`.toLowerCase();

  // Check for name/relationship corrections
  if (
    combined.includes('name') ||
    combined.includes('husband') ||
    combined.includes('wife') ||
    combined.includes('partner') ||
    combined.includes('friend') ||
    combined.includes('family')
  ) {
    return 'relationship';
  }

  // Check for date/event corrections
  if (
    combined.includes('date') ||
    combined.includes('time') ||
    combined.includes('when') ||
    combined.includes('birthday') ||
    combined.includes('anniversary') ||
    combined.includes('meeting') ||
    combined.includes('appointment')
  ) {
    return 'event';
  }

  // Check for preference corrections
  if (
    combined.includes('prefer') ||
    combined.includes('like') ||
    combined.includes('want') ||
    combined.includes('enjoy') ||
    combined.includes("don't like") ||
    combined.includes('hate')
  ) {
    return 'preference';
  }

  // Check for opinion corrections
  if (
    combined.includes('think') ||
    combined.includes('feel') ||
    combined.includes('believe') ||
    combined.includes('opinion')
  ) {
    return 'opinion';
  }

  // Default to fact
  if (
    combined.includes('is') ||
    combined.includes('was') ||
    combined.includes('are') ||
    combined.includes('were')
  ) {
    return 'fact';
  }

  return 'other';
}

/**
 * Record a user correction
 */
export async function recordCorrection(
  userId: string,
  correction: {
    whatFerniSaid: string;
    whatUserCorrected: string;
    correctInformation: string;
    personaId?: string;
  }
): Promise<string> {
  try {
    const db = getFirestore();
    const category = categorizeCorrection(correction.whatFerniSaid, correction.whatUserCorrected);

    const correctionData: UserCorrectionEntity = {
      ...correction,
      category,
      timestamp: new Date().toISOString(),
      appliedToMemory: false,
    };

    // Save to Firestore
    const ref = await db.collection(`bogle_users/${userId}/corrections`).add({
      ...correctionData,
      createdAt: Timestamp.now(),
    });

    // Index to semantic memory (so we can search for past corrections)
    await onUserCorrectionChange(userId, ref.id, correctionData, 'create');

    // Mark as applied to memory
    await ref.update({ appliedToMemory: true });

    log.info({ userId, category, personaId: correction.personaId }, 'User correction recorded');

    return ref.id;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record correction');
    throw error;
  }
}

/**
 * Auto-detect and record correction from conversation
 */
export async function autoRecordCorrection(
  userId: string,
  userMessage: string,
  previousFerniMessage: string,
  personaId?: string
): Promise<string | null> {
  const { isCorrection, confidence } = detectCorrection(userMessage, previousFerniMessage);

  if (!isCorrection || confidence < 0.7) {
    return null;
  }

  return recordCorrection(userId, {
    whatFerniSaid: previousFerniMessage,
    whatUserCorrected: userMessage,
    correctInformation: userMessage, // The user's message contains the correction
    personaId,
  });
}

// ============================================================================
// CORRECTION RETRIEVAL
// ============================================================================

/**
 * Get all corrections for a user
 */
export async function getCorrections(
  userId: string,
  options?: {
    category?: string;
    personaId?: string;
    limit?: number;
  }
): Promise<UserCorrection[]> {
  try {
    const db = getFirestore();
    let query = db.collection(`bogle_users/${userId}/corrections`).orderBy('timestamp', 'desc');

    if (options?.category) {
      query = query.where('category', '==', options.category);
    }
    if (options?.personaId) {
      query = query.where('personaId', '==', options.personaId);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as UserCorrection[];
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get corrections');
    return [];
  }
}

/**
 * Get correction patterns (aggregate view)
 */
export async function getCorrectionPatterns(userId: string): Promise<CorrectionPattern[]> {
  try {
    const corrections = await getCorrections(userId);

    const byCategory: Record<string, UserCorrection[]> = {};
    for (const correction of corrections) {
      if (!byCategory[correction.category]) {
        byCategory[correction.category] = [];
      }
      byCategory[correction.category].push(correction);
    }

    return Object.entries(byCategory).map(([category, items]) => ({
      category,
      correctionCount: items.length,
      lastCorrected: items[0]?.timestamp || '',
      examples: items.slice(0, 3).map((c) => c.correctInformation),
    }));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get correction patterns');
    return [];
  }
}

/**
 * Search corrections for relevant context
 */
export async function searchCorrections(userId: string, query: string): Promise<UserCorrection[]> {
  try {
    const db = getFirestore();
    // Simple keyword search - in production, use semantic search
    const corrections = await getCorrections(userId, { limit: 100 });

    const queryLower = query.toLowerCase();
    return corrections.filter(
      (c) =>
        c.whatFerniSaid.toLowerCase().includes(queryLower) ||
        c.correctInformation.toLowerCase().includes(queryLower) ||
        c.whatUserCorrected.toLowerCase().includes(queryLower)
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to search corrections');
    return [];
  }
}

// ============================================================================
// IMPLICIT PREFERENCES
// ============================================================================

/**
 * Record an implicit preference (inferred from behavior)
 */
export async function recordImplicitPreference(
  userId: string,
  preference: Omit<ImplicitPreferenceEntity, 'firstObserved' | 'lastConfirmed' | 'contradicted'>
): Promise<string> {
  try {
    const db = getFirestore();
    const now = new Date().toISOString();

    // Check if this preference already exists
    const existing = await db
      .collection(`bogle_users/${userId}/implicit_preferences`)
      .where('preference', '==', preference.preference)
      .limit(1)
      .get();

    if (!existing.empty) {
      // Update existing
      const doc = existing.docs[0];
      await doc.ref.update({
        lastConfirmed: now,
        evidence: [...(doc.data().evidence || []), ...preference.evidence].slice(-10),
        confidence: Math.min(1, (doc.data().confidence || 0.5) + 0.1),
      });
      return doc.id;
    }

    // Create new
    const preferenceData: ImplicitPreferenceEntity = {
      ...preference,
      firstObserved: now,
      lastConfirmed: now,
      contradicted: false,
    };

    const ref = await db.collection(`bogle_users/${userId}/implicit_preferences`).add({
      ...preferenceData,
      createdAt: Timestamp.now(),
    });

    // Index to semantic memory (if confidence is high enough)
    if (preference.confidence >= 0.5) {
      await onImplicitPreferenceChange(userId, ref.id, preferenceData, 'create');
    }

    log.info({ userId, category: preference.category }, 'Implicit preference recorded');
    return ref.id;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record implicit preference');
    throw error;
  }
}

/**
 * Get implicit preferences for a user
 */
export async function getImplicitPreferences(
  userId: string,
  options?: {
    category?: string;
    minConfidence?: number;
    limit?: number;
  }
): Promise<Array<ImplicitPreferenceEntity & { id: string }>> {
  try {
    const db = getFirestore();
    let query = db
      .collection(`bogle_users/${userId}/implicit_preferences`)
      .orderBy('confidence', 'desc');

    if (options?.category) {
      query = query.where('category', '==', options.category);
    }
    if (options?.minConfidence) {
      query = query.where('confidence', '>=', options.minConfidence);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Array<ImplicitPreferenceEntity & { id: string }>;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get implicit preferences');
    return [];
  }
}

/**
 * Mark a preference as contradicted (user behavior changed)
 */
export async function contradictPreference(userId: string, preferenceId: string): Promise<void> {
  try {
    const db = getFirestore();
    await db.doc(`bogle_users/${userId}/implicit_preferences/${preferenceId}`).update({
      contradicted: true,
    });
    log.info({ userId, preferenceId }, 'Preference marked as contradicted');
  } catch (error) {
    log.error({ error: String(error), userId, preferenceId }, 'Failed to contradict preference');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context string of relevant corrections for LLM
 */
export async function buildCorrectionContext(
  userId: string,
  conversationContext?: string
): Promise<string> {
  try {
    const corrections = await getCorrections(userId, { limit: 20 });
    const preferences = await getImplicitPreferences(userId, { minConfidence: 0.6, limit: 10 });

    if (corrections.length === 0 && preferences.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // Add critical corrections
    if (corrections.length > 0) {
      parts.push('**IMPORTANT CORRECTIONS (never repeat these mistakes):**');
      for (const c of corrections.slice(0, 10)) {
        parts.push(
          `- I incorrectly said "${c.whatFerniSaid}". The correct info is: "${c.correctInformation}"`
        );
      }
    }

    // Add learned preferences
    if (preferences.length > 0) {
      parts.push('\n**Learned preferences:**');
      for (const p of preferences.filter((p) => !p.contradicted)) {
        parts.push(`- ${p.preference} (${Math.round(p.confidence * 100)}% confidence)`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build correction context');
    return '';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const userCorrections = {
  detect: detectCorrection,
  categorize: categorizeCorrection,
  record: recordCorrection,
  autoRecord: autoRecordCorrection,
  getAll: getCorrections,
  getPatterns: getCorrectionPatterns,
  search: searchCorrections,
  recordImplicitPreference,
  getImplicitPreferences,
  contradictPreference,
  buildContext: buildCorrectionContext,
};

export default userCorrections;
