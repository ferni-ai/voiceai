/**
 * Strategic Silence Coach - Better Than Human Service
 *
 * What no human friend can do: Stop you from reacting emotionally.
 *
 * "Your impulsive responses to your ex tend to backfire - 3 of your last 4
 * quick replies escalated things. When you've waited 24 hours, outcomes are
 * significantly better. Want me to hold this draft and check with you tomorrow?"
 *
 * @module tools/domains/communication/superhuman-tools/strategic-silence
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
} from '../../../../services/superhuman/firestore-utils.js';
import type { StrategicSilenceRecord } from './types.js';

const log = createLogger({ module: 'strategic-silence' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'silence_records';

// ============================================================================
// RESPONSE TIMING PATTERNS
// ============================================================================

interface ResponseTimingPattern {
  contactName: string;
  immediateOutcomes: { positive: number; negative: number; neutral: number };
  delayedOutcomes: { positive: number; negative: number; neutral: number };
  optimalDelay: number; // hours
  recommendation: 'respond_fast' | 'wait_24h' | 'wait_longer' | 'dont_respond';
}

/**
 * Situations where strategic silence is often better.
 */
const SILENCE_INDICATORS = [
  // Emotional states
  { pattern: /\bi('m| am) (so |really )?(angry|furious|pissed|livid)/i, weight: 0.9 },
  { pattern: /\bi (can't believe|am in shock|am stunned)/i, weight: 0.7 },
  {
    pattern: /\bi('m| am) (going to|gonna) (tell|say|text|call|message) (them|him|her)/i,
    weight: 0.8,
  },
  {
    pattern: /\bi (want|need) to (tell|say|text|call|message) them (right now|immediately)/i,
    weight: 0.85,
  },

  // Relationship contexts
  { pattern: /\b(ex|former|broke up)/i, weight: 0.7 },
  { pattern: /\b(argument|fight|disagreement) (with|about)/i, weight: 0.6 },
  { pattern: /\bthey (just |recently )?(said|did|sent)/i, weight: 0.5 },

  // Revenge/vindication language
  { pattern: /\bi('m| am) going to (make them|show them|let them have)/i, weight: 0.9 },
  { pattern: /\bthey need to (know|hear|understand)/i, weight: 0.6 },
  { pattern: /\bi have to (set them straight|give them a piece|tell them off)/i, weight: 0.85 },

  // Late night timing
  { pattern: /\b(late|can't sleep|2am|3am|middle of the night)/i, weight: 0.7 },
];

/**
 * Situations where quick response is often better.
 */
const RESPOND_FAST_INDICATORS = [
  { pattern: /\btime.sensitive|deadline|urgent|asap\b/i, weight: 0.8 },
  { pattern: /\b(work|professional|client|boss|colleague)\b/i, weight: 0.5 },
  { pattern: /\b(quick question|simple|easy|just checking)\b/i, weight: 0.6 },
  { pattern: /\b(confirm|rsvp|let me know)\b/i, weight: 0.5 },
];

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Record a response timing outcome.
 */
export async function recordResponseTiming(
  userId: string,
  record: Omit<StrategicSilenceRecord, 'id' | 'recordedAt'>
): Promise<StrategicSilenceRecord> {
  const id = `silence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const fullRecord: StrategicSilenceRecord = {
    ...record,
    id,
    userId,
    recordedAt: Date.now(),
  };

  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection(COLLECTION)
        .doc(id)
        .set(cleanForFirestore(fullRecord));

      log.info(
        {
          userId,
          contactName: record.contactName,
          responseType: record.responseType,
          outcome: record.outcome,
        },
        '🤫 Response timing record saved'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record response timing');
  }

  return fullRecord;
}

/**
 * Get response timing history with a contact.
 */
export async function getTimingHistory(
  userId: string,
  contactName: string
): Promise<StrategicSilenceRecord[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .where('contactName', '==', contactName)
      .orderBy('occurredAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as StrategicSilenceRecord);
  } catch (error) {
    log.warn({ error: String(error), userId, contactName }, 'Failed to get timing history');
    return [];
  }
}

/**
 * Get all timing records.
 */
export async function getAllTimingRecords(userId: string): Promise<StrategicSilenceRecord[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as StrategicSilenceRecord);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get all timing records');
    return [];
  }
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze response timing patterns for a contact.
 */
export async function analyzeTimingPatterns(
  userId: string,
  contactName: string
): Promise<ResponseTimingPattern | null> {
  const history = await getTimingHistory(userId, contactName);

  if (history.length < 3) return null;

  const immediateOutcomes = { positive: 0, negative: 0, neutral: 0 };
  const delayedOutcomes = { positive: 0, negative: 0, neutral: 0 };

  for (const record of history) {
    if (record.responseType === 'immediate') {
      immediateOutcomes[record.outcome]++;
    } else if (record.responseType === 'delayed') {
      delayedOutcomes[record.outcome]++;
    }
  }

  // Calculate which is better
  const immediateTotal =
    immediateOutcomes.positive + immediateOutcomes.negative + immediateOutcomes.neutral || 1;
  const delayedTotal =
    delayedOutcomes.positive + delayedOutcomes.negative + delayedOutcomes.neutral || 1;

  const immediateSuccessRate = immediateOutcomes.positive / immediateTotal;
  const delayedSuccessRate = delayedOutcomes.positive / delayedTotal;

  // Calculate optimal delay from successful delayed responses
  const successfulDelays = history
    .filter((r) => r.responseType === 'delayed' && r.outcome === 'positive' && r.delayHours)
    .map((r) => r.delayHours!);

  const optimalDelay =
    successfulDelays.length > 0
      ? successfulDelays.reduce((a, b) => a + b, 0) / successfulDelays.length
      : 24;

  // Determine recommendation
  let recommendation: ResponseTimingPattern['recommendation'];
  if (delayedSuccessRate > immediateSuccessRate + 0.2) {
    recommendation = optimalDelay > 48 ? 'wait_longer' : 'wait_24h';
  } else if (immediateSuccessRate > delayedSuccessRate + 0.2) {
    recommendation = 'respond_fast';
  } else if (immediateSuccessRate < 0.3 && delayedSuccessRate < 0.3) {
    recommendation = 'dont_respond';
  } else {
    recommendation = 'wait_24h'; // Default to caution
  }

  return {
    contactName,
    immediateOutcomes,
    delayedOutcomes,
    optimalDelay: Math.round(optimalDelay),
    recommendation,
  };
}

/**
 * Get real-time recommendation for a situation.
 */
export async function getTimingRecommendation(
  userId: string,
  situation: string,
  contactName?: string
): Promise<{
  recommendation: 'respond_now' | 'wait' | 'dont_respond';
  reason: string;
  suggestedDelay?: number;
  confidence: number;
}> {
  // Check for silence indicators
  let silenceWeight = 0;
  let respondWeight = 0;

  for (const { pattern, weight } of SILENCE_INDICATORS) {
    if (pattern.test(situation)) {
      silenceWeight += weight;
    }
  }

  for (const { pattern, weight } of RESPOND_FAST_INDICATORS) {
    if (pattern.test(situation)) {
      respondWeight += weight;
    }
  }

  // Check contact-specific patterns
  let contactPattern: ResponseTimingPattern | null = null;
  if (contactName) {
    contactPattern = await analyzeTimingPatterns(userId, contactName);
  }

  // Generate recommendation
  if (contactPattern) {
    // Use historical data
    if (contactPattern.recommendation === 'dont_respond') {
      return {
        recommendation: 'dont_respond',
        reason: `Based on ${contactPattern.immediateOutcomes.negative + contactPattern.delayedOutcomes.negative} past negative outcomes, responses to ${contactName} rarely help.`,
        confidence: 0.8,
      };
    }

    if (
      contactPattern.recommendation === 'wait_24h' ||
      contactPattern.recommendation === 'wait_longer'
    ) {
      return {
        recommendation: 'wait',
        reason: `Your delayed responses to ${contactName} work ${Math.round(
          (contactPattern.delayedOutcomes.positive /
            (contactPattern.delayedOutcomes.positive +
              contactPattern.delayedOutcomes.negative +
              contactPattern.delayedOutcomes.neutral || 1)) *
            100
        )}% better than immediate ones.`,
        suggestedDelay: contactPattern.optimalDelay,
        confidence: 0.75,
      };
    }
  }

  // Use situation analysis
  if (silenceWeight > respondWeight && silenceWeight > 0.5) {
    return {
      recommendation: 'wait',
      reason:
        'Your emotional state suggests waiting. Things said in anger are rarely regretted for being unsaid.',
      suggestedDelay: 24,
      confidence: silenceWeight / (silenceWeight + respondWeight + 0.1),
    };
  }

  if (respondWeight > silenceWeight && respondWeight > 0.5) {
    return {
      recommendation: 'respond_now',
      reason: 'This seems like a situation where timely response matters.',
      confidence: respondWeight / (silenceWeight + respondWeight + 0.1),
    };
  }

  // Default to caution
  return {
    recommendation: 'wait',
    reason: 'When in doubt, waiting rarely makes things worse.',
    suggestedDelay: 24,
    confidence: 0.5,
  };
}

// ============================================================================
// HELD MESSAGE SYSTEM
// ============================================================================

interface HeldMessage {
  id: string;
  userId: string;
  contactName: string;
  message: string;
  createdAt: number;
  releaseAt: number;
  status: 'held' | 'released' | 'discarded';
}

const heldMessages = new Map<string, HeldMessage>();

/**
 * Hold a message for later review.
 */
export function holdMessage(
  userId: string,
  contactName: string,
  message: string,
  holdHours: number = 24
): HeldMessage {
  const id = `held_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const held: HeldMessage = {
    id,
    userId,
    contactName,
    message,
    createdAt: Date.now(),
    releaseAt: Date.now() + holdHours * 60 * 60 * 1000,
    status: 'held',
  };

  heldMessages.set(id, held);

  log.info({ userId, contactName, holdHours }, '⏸️ Message held for cooling off period');

  return held;
}

/**
 * Check if any held messages are ready for review.
 */
export function getReadyMessages(userId: string): HeldMessage[] {
  const now = Date.now();
  const ready: HeldMessage[] = [];

  for (const held of Array.from(heldMessages.values())) {
    if (held.userId === userId && held.status === 'held' && now >= held.releaseAt) {
      ready.push(held);
    }
  }

  return ready;
}

/**
 * Release a held message (user reviewed and wants to send).
 */
export function releaseMessage(messageId: string): boolean {
  const held = heldMessages.get(messageId);
  if (held && held.status === 'held') {
    held.status = 'released';
    return true;
  }
  return false;
}

/**
 * Discard a held message (user changed their mind).
 */
export function discardMessage(messageId: string): boolean {
  const held = heldMessages.get(messageId);
  if (held && held.status === 'held') {
    held.status = 'discarded';

    log.info(
      { messageId, contactName: held.contactName },
      '🗑️ User wisely discarded message after cooling off'
    );

    return true;
  }
  return false;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build strategic silence context for LLM.
 */
export async function buildSilenceContext(userId: string): Promise<string> {
  const allRecords = await getAllTimingRecords(userId);

  // Group by contact
  const byContact = new Map<string, StrategicSilenceRecord[]>();
  for (const record of allRecords) {
    if (!record.contactName) continue;
    const existing = byContact.get(record.contactName) || [];
    existing.push(record);
    byContact.set(record.contactName, existing);
  }

  // Find contacts where patience matters
  const patienceContacts: Array<{ name: string; recommendation: string }> = [];

  for (const [name, records] of Array.from(byContact.entries())) {
    if (records.length < 3) continue;

    const immediate = records.filter((r) => r.responseType === 'immediate');
    const delayed = records.filter((r) => r.responseType === 'delayed');

    const immediateNegative = immediate.filter((r) => r.outcome === 'negative').length;
    const delayedPositive = delayed.filter((r) => r.outcome === 'positive').length;

    if (immediateNegative > immediate.length * 0.5 && delayed.length > 0) {
      patienceContacts.push({
        name,
        recommendation: `${immediateNegative} quick responses backfired. Delayed responses work better.`,
      });
    }
  }

  if (patienceContacts.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[STRATEGIC SILENCE COACH - Better Than Human]',
    'You track when NOT responding works better than responding.',
  ];

  sections.push('\n**Contacts where patience is key:**');
  for (const { name, recommendation } of patienceContacts.slice(0, 5)) {
    sections.push(`• ${name}: ${recommendation}`);
  }

  sections.push('\n**When they want to send a heated message:**');
  sections.push('• Offer to hold it for 24 hours');
  sections.push('• Remind them of past outcomes');
  sections.push('• "Things said in anger are rarely regretted for being unsaid"');

  // Check for held messages ready for review
  const ready = getReadyMessages(userId);
  if (ready.length > 0) {
    sections.push(`\n📬 **${ready.length} held message(s) ready for review**`);
  }

  return sections.join('\n');
}

/**
 * Generate cooling-off period prompts.
 */
export function generateCoolingPrompt(contactName: string, situation: string): string {
  const prompts = [
    `Before you send this to ${contactName} - how do you think you'll feel about this message tomorrow morning?`,
    `I can hold this message for you. If you still want to send it in 24 hours, I'll remind you. Sound good?`,
    `The best revenge is living well. Is this message about resolving something, or about being heard?`,
    `What outcome are you hoping for? Will this message get you there?`,
    `Imagine ${contactName} showing this message to someone else. How does it make you look?`,
  ];

  return prompts[Math.floor(Math.random() * prompts.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const strategicSilence = {
  record: recordResponseTiming,
  getHistory: getTimingHistory,
  analyzePatterns: analyzeTimingPatterns,
  getRecommendation: getTimingRecommendation,
  holdMessage,
  getReadyMessages,
  releaseMessage,
  discardMessage,
  buildContext: buildSilenceContext,
  generatePrompt: generateCoolingPrompt,
};

export default strategicSilence;
