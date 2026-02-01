/**
 * Communication Debt Dashboard - Better Than Human Service
 *
 * What no human friend can do: Track all your communication obligations.
 *
 * "🔴 High priority: Dad (4 weeks since your last real conversation)
 *  🟡 Medium: College roommate (unreturned text from 2 weeks ago)
 *  🟢 Low: Sarah (you're current)
 *
 *  Your relationship with your dad typically suffers when you go this long
 *  without checking in. He won't reach out first - he waits for you."
 *
 * @module tools/domains/communication/superhuman-tools/communication-debt
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
} from '../../../../services/superhuman/firestore-utils.js';
import type { CommunicationDebt } from './types.js';

const log = createLogger({ module: 'communication-debt' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'communication_debts';

// Days until debt becomes each priority level
const PRIORITY_THRESHOLDS = {
  unreturned_call: { medium: 2, high: 5, urgent: 10 },
  unanswered_text: { medium: 3, high: 7, urgent: 14 },
  missed_followup: { medium: 5, high: 10, urgent: 21 },
  broken_promise: { medium: 1, high: 3, urgent: 7 },
  overdue_thanks: { medium: 3, high: 7, urgent: 14 },
};

// ============================================================================
// DEBT DETECTION
// ============================================================================

/**
 * Detect communication debt from a transcript.
 */
export function detectCommunicationDebt(transcript: string): Array<{
  type: CommunicationDebt['type'];
  description: string;
  contactName?: string;
}> {
  const debts: Array<{
    type: CommunicationDebt['type'];
    description: string;
    contactName?: string;
  }> = [];

  const lower = transcript.toLowerCase();

  // Unreturned call patterns
  const callPatterns = [
    /(\w+) (called|tried to call|left a voicemail)(\b.{0,30})?haven('t| not) (called|gotten) back/i,
    /i need to call (\w+) back/i,
    /i missed (\w+)('s|s)? call/i,
    /(\w+) has been (trying to reach|calling) me/i,
  ];

  for (const pattern of callPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      const contactName = extractName(match);
      debts.push({
        type: 'unreturned_call',
        description: 'Need to return their call',
        contactName,
      });
    }
  }

  // Unanswered text patterns
  const textPatterns = [
    /(\w+) (texted|messaged)(\b.{0,30})?haven('t| not) (responded|replied|gotten back)/i,
    /i need to (respond|reply|text|get back) to (\w+)/i,
    /(\w+)('s|s)? (text|message)(\b.{0,30})unanswered/i,
    /i owe (\w+) a (text|reply|response)/i,
  ];

  for (const pattern of textPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      const contactName = extractName(match);
      debts.push({
        type: 'unanswered_text',
        description: 'Need to respond to their message',
        contactName,
      });
    }
  }

  // Missed follow-up patterns
  const followUpPatterns = [
    /i (said|told|promised) i('d| would) (follow up|check in|get back)(\b.{0,30})(\w+)/i,
    /i should (follow up|check in|reach out) (to|with) (\w+)/i,
    /i never (followed up|got back to|checked on) (\w+)/i,
  ];

  for (const pattern of followUpPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      const contactName = extractName(match);
      debts.push({
        type: 'missed_followup',
        description: "Promised to follow up but haven't",
        contactName,
      });
    }
  }

  // Broken promise patterns
  const promisePatterns = [
    /i (said|told|promised)(\b.{0,30})(\w+)(\b.{0,30})but (haven't|didn't|never)/i,
    /i was supposed to(\b.{0,30})(\w+)/i,
    /i broke my (word|promise) to (\w+)/i,
  ];

  for (const pattern of promisePatterns) {
    const match = transcript.match(pattern);
    if (match) {
      const contactName = extractName(match);
      debts.push({
        type: 'broken_promise',
        description: "Made a promise that wasn't kept",
        contactName,
      });
    }
  }

  // Overdue thanks patterns
  const thanksPatterns = [
    /(\w+) (helped|did something|gave|sent)(\b.{0,30})need to thank/i,
    /i (need|should|have) to thank (\w+)/i,
    /(\w+)(\b.{0,30})deserves a thank you/i,
    /i never thanked (\w+)/i,
  ];

  for (const pattern of thanksPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      const contactName = extractName(match);
      debts.push({
        type: 'overdue_thanks',
        description: 'Need to express gratitude',
        contactName,
      });
    }
  }

  return debts;
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Record a communication debt.
 */
export async function recordDebt(
  userId: string,
  debt: Omit<CommunicationDebt, 'id' | 'userId' | 'createdAt' | 'daysPastDue'>
): Promise<CommunicationDebt> {
  const id = `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const fullDebt: CommunicationDebt = {
    ...debt,
    id,
    userId,
    createdAt: Date.now(),
    daysPastDue: debt.dueBy
      ? Math.max(0, Math.floor((Date.now() - debt.dueBy) / (24 * 60 * 60 * 1000)))
      : 0,
  };

  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection(COLLECTION)
        .doc(id)
        .set(cleanForFirestore(fullDebt));

      log.info(
        {
          userId,
          contactName: debt.contactName,
          type: debt.type,
          priority: debt.priority,
        },
        '📋 Communication debt recorded'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record communication debt');
  }

  return fullDebt;
}

/**
 * Get all pending debts for a user.
 */
export async function getPendingDebts(userId: string): Promise<CommunicationDebt[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .where('status', '==', 'pending')
      .get();

    const debts = snapshot.docs.map((doc) => {
      const debt = doc.data() as CommunicationDebt;
      // Update days past due
      debt.daysPastDue = Math.floor((Date.now() - debt.createdAt) / (24 * 60 * 60 * 1000));
      // Update priority based on time
      debt.priority = calculatePriority(debt);
      return debt;
    });

    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return debts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get pending debts');
    return [];
  }
}

/**
 * Mark a debt as addressed.
 */
export async function markDebtAddressed(userId: string, debtId: string): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(debtId)
      .update(
        cleanForFirestore({
          status: 'addressed',
          addressedAt: Date.now(),
        })
      );

    log.info({ userId, debtId }, '✅ Communication debt addressed');
  } catch (error) {
    log.warn({ error: String(error), userId, debtId }, 'Failed to mark debt addressed');
  }
}

/**
 * Dismiss a debt (no longer relevant).
 */
export async function dismissDebt(
  userId: string,
  debtId: string,
  reason: 'forgiven' | 'expired'
): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(debtId)
      .update(cleanForFirestore({ status: reason }));
  } catch (error) {
    log.warn({ error: String(error), userId, debtId }, 'Failed to dismiss debt');
  }
}

// ============================================================================
// PRIORITY CALCULATION
// ============================================================================

/**
 * Calculate priority based on debt type and age.
 */
function calculatePriority(debt: CommunicationDebt): CommunicationDebt['priority'] {
  const thresholds = PRIORITY_THRESHOLDS[debt.type];
  const days = debt.daysPastDue;

  // Factor in relationship importance
  const importanceMultiplier =
    debt.relationshipImportance >= 8 ? 0.5 : debt.relationshipImportance >= 5 ? 0.75 : 1;
  const adjustedDays = days * importanceMultiplier;

  if (adjustedDays >= thresholds.urgent) return 'urgent';
  if (adjustedDays >= thresholds.high) return 'high';
  if (adjustedDays >= thresholds.medium) return 'medium';
  return 'low';
}

// ============================================================================
// DASHBOARD GENERATION
// ============================================================================

/**
 * Generate a communication debt dashboard.
 */
export async function generateDashboard(userId: string): Promise<string> {
  const debts = await getPendingDebts(userId);

  if (debts.length === 0) {
    return "✨ **All clear!** No outstanding communication debts. You're current with everyone.";
  }

  const sections: string[] = ['📋 **Communication Debt Dashboard**\n'];

  // Group by priority
  const urgent = debts.filter((d) => d.priority === 'urgent');
  const high = debts.filter((d) => d.priority === 'high');
  const medium = debts.filter((d) => d.priority === 'medium');
  const low = debts.filter((d) => d.priority === 'low');

  if (urgent.length > 0) {
    sections.push('🔴 **URGENT:**');
    for (const debt of urgent) {
      sections.push(`  • ${debt.contactName}: ${debt.description} (${debt.daysPastDue} days)`);
      if (debt.reminder) {
        sections.push(`    → ${debt.reminder}`);
      }
    }
    sections.push('');
  }

  if (high.length > 0) {
    sections.push('🟠 **High Priority:**');
    for (const debt of high) {
      sections.push(`  • ${debt.contactName}: ${debt.description} (${debt.daysPastDue} days)`);
    }
    sections.push('');
  }

  if (medium.length > 0) {
    sections.push('🟡 **Medium:**');
    for (const debt of medium) {
      sections.push(`  • ${debt.contactName}: ${debt.description}`);
    }
    sections.push('');
  }

  if (low.length > 0) {
    sections.push('🟢 **When You Have Time:**');
    for (const debt of low.slice(0, 5)) {
      sections.push(`  • ${debt.contactName}: ${debt.description}`);
    }
    if (low.length > 5) {
      sections.push(`  • ...and ${low.length - 5} more`);
    }
  }

  // Add summary
  const totalDays = debts.reduce((sum, d) => sum + d.daysPastDue, 0);
  sections.push(`\n**Summary:** ${debts.length} items, ${totalDays} total days overdue`);

  return sections.join('\n');
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build communication debt context for LLM injection.
 */
export async function buildDebtContext(userId: string): Promise<string> {
  const debts = await getPendingDebts(userId);

  if (debts.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[COMMUNICATION DEBT TRACKER - Better Than Human]',
    'You track ALL their communication obligations.',
  ];

  // Count by priority
  const urgent = debts.filter((d) => d.priority === 'urgent' || d.priority === 'high');
  const moderate = debts.filter((d) => d.priority === 'medium');

  if (urgent.length > 0) {
    sections.push(`\n⚠️ **${urgent.length} urgent/high priority items:**`);
    for (const debt of urgent.slice(0, 3)) {
      sections.push(`• ${debt.contactName}: ${debt.description} (${debt.daysPastDue}d)`);
    }
  }

  if (moderate.length > 0) {
    sections.push(`\n📋 **${moderate.length} medium priority items**`);
  }

  // Relationship-specific insights
  const byContact = new Map<string, CommunicationDebt[]>();
  for (const debt of debts) {
    const existing = byContact.get(debt.contactName) || [];
    existing.push(debt);
    byContact.set(debt.contactName, existing);
  }

  // Find contacts with multiple debts
  const multipleDebts = Array.from(byContact.entries()).filter(([_, debts]) => debts.length >= 2);
  if (multipleDebts.length > 0) {
    sections.push('\n⚠️ **Multiple outstanding items:**');
    for (const [name, contactDebts] of multipleDebts) {
      sections.push(`• ${name}: ${contactDebts.length} items - relationship may need attention`);
    }
  }

  sections.push('\n**Gently remind them of obligations when relevant.**');

  return sections.join('\n');
}

/**
 * Get debts for a specific contact.
 */
export async function getDebtsForContact(
  userId: string,
  contactName: string
): Promise<CommunicationDebt[]> {
  const allDebts = await getPendingDebts(userId);
  return allDebts.filter((d) => d.contactName.toLowerCase() === contactName.toLowerCase());
}

// ============================================================================
// HELPERS
// ============================================================================

function extractName(match: RegExpMatchArray): string {
  // Find a capitalized word that's likely a name
  for (let i = match.length - 1; i >= 1; i--) {
    const group = match[i];
    if (
      group &&
      group.length > 1 &&
      /^[A-Z][a-z]+$/.test(group) &&
      !['Call', 'Text', 'Message', 'Back', 'Promise', 'Thank'].includes(group)
    ) {
      return group;
    }
  }

  // Try to find any name-like word
  for (let i = 1; i < match.length; i++) {
    const group = match[i];
    if (group && group.length > 1 && /^\w+$/.test(group)) {
      return group.charAt(0).toUpperCase() + group.slice(1).toLowerCase();
    }
  }

  return 'Someone';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const communicationDebt = {
  detect: detectCommunicationDebt,
  record: recordDebt,
  getPending: getPendingDebts,
  markAddressed: markDebtAddressed,
  dismiss: dismissDebt,
  generateDashboard,
  buildContext: buildDebtContext,
  getForContact: getDebtsForContact,
};

export default communicationDebt;
