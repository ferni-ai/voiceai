/**
 * Family Network Status Tool
 *
 * "How's everyone in my family doing?" - superhuman relationship awareness
 *
 * Aggregates:
 * - Recent calls made to family members
 * - Last conversation summaries
 * - Pending follow-ups and reminders
 * - Time since last contact
 *
 * @module tools/domains/family/family-network-status
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'family-network-status' });

// ============================================================================
// TYPES
// ============================================================================

interface FamilyMemberStatus {
  name: string;
  relationship: string;
  phone?: string;

  // Contact history
  daysSinceLastContact: number | null;
  lastContactMethod?: 'call' | 'message' | 'conversation';
  lastContactSummary?: string;

  // Recent call info (from on-behalf calls)
  recentCallOutcome?: string;
  recentCallDate?: string;

  // Pending items
  pendingReminders: string[];
  needsAttention: boolean;
  attentionReason?: string;
}

interface FamilyNetworkOverview {
  totalMembers: number;
  recentlyContacted: number;
  needingAttention: number;
  members: FamilyMemberStatus[];
}

// ============================================================================
// SCHEMA
// ============================================================================

export const familyNetworkStatusSchema = z.object({
  detailed: z
    .boolean()
    .optional()
    .describe('Whether to include detailed summaries for each family member'),
});

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Get family members from entity store
 */
async function getFamilyMembers(userId: string): Promise<Array<{
  name: string;
  relationship: string;
  phone?: string;
}>> {
  try {
    const { isEntityStoreReady } = await import('../../../memory/entity-store/integration.js');
    
    if (!isEntityStoreReady()) {
      return [];
    }

    // Get all entities for this user that are family relationships
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('unified_entities')
      .where('type', '==', 'person')
      .where('relationship', '==', 'family')
      .get();

    const members: Array<{ name: string; relationship: string; phone?: string }> = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      members.push({
        name: data.canonicalName || data.name,
        relationship: data.specificRelation || 'family',
        phone: data.contact?.phone,
      });
    }

    return members;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get family members');
    return [];
  }
}

/**
 * Get recent on-behalf calls to family members
 */
async function getRecentFamilyCalls(
  userId: string
): Promise<Map<string, { date: string; summary: string }>> {
  const callMap = new Map<string, { date: string; summary: string }>();

  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return callMap;

    // Get calls from the last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .where('capturedAt', '>=', cutoff.toISOString())
      .orderBy('capturedAt', 'desc')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const contactName = data.request?.contactName || data.request?.contactQuery || '';
      
      // Only keep the most recent call per contact
      if (contactName && !callMap.has(contactName.toLowerCase())) {
        callMap.set(contactName.toLowerCase(), {
          date: data.capturedAt,
          summary: data.outcome?.transcriptSummary || data.outcome?.outcome || 'Call completed',
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent family calls');
  }

  return callMap;
}

/**
 * Get pending reminders about family members
 */
async function getFamilyReminders(
  userId: string,
  familyNames: string[]
): Promise<Map<string, string[]>> {
  const reminderMap = new Map<string, string[]>();

  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return reminderMap;

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reminders')
      .where('status', '==', 'pending')
      .limit(50)
      .get();

    const lowerNames = familyNames.map((n) => n.toLowerCase());

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const message = (data.message || '').toLowerCase();
      const context = (data.context || '').toLowerCase();

      for (let i = 0; i < lowerNames.length; i++) {
        if (message.includes(lowerNames[i]) || context.includes(lowerNames[i])) {
          const existing = reminderMap.get(familyNames[i]) || [];
          existing.push(data.message);
          reminderMap.set(familyNames[i], existing);
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get family reminders');
  }

  return reminderMap;
}

// ============================================================================
// MAIN TOOL
// ============================================================================

/**
 * Get family network status overview
 */
export async function getFamilyNetworkStatus(
  params: z.infer<typeof familyNetworkStatusSchema>,
  ctx: { userId: string }
): Promise<string> {
  const { detailed = false } = params;

  log.info({ userId: ctx.userId, detailed }, 'Getting family network status');

  // Fetch family members
  const familyMembers = await getFamilyMembers(ctx.userId);

  if (familyMembers.length === 0) {
    return (
      "I don't have any family members saved for you yet. " +
      "You can add them by telling me about them - like 'my mom is Betty at 555-1234' " +
      "or just call them and I'll remember them."
    );
  }

  // Fetch recent calls and reminders in parallel
  const [recentCalls, reminders] = await Promise.all([
    getRecentFamilyCalls(ctx.userId),
    getFamilyReminders(ctx.userId, familyMembers.map((m) => m.name)),
  ]);

  // Build status for each member
  const memberStatuses: FamilyMemberStatus[] = [];
  let needingAttentionCount = 0;
  let recentlyContactedCount = 0;

  for (const member of familyMembers) {
    const lowerName = member.name.toLowerCase();
    const recentCall = recentCalls.get(lowerName);
    const memberReminders = reminders.get(member.name) || [];

    // Calculate days since last contact
    let daysSinceLastContact: number | null = null;
    if (recentCall) {
      const callDate = new Date(recentCall.date);
      daysSinceLastContact = Math.floor(
        (Date.now() - callDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Determine if needs attention
    let needsAttention = false;
    let attentionReason: string | undefined;

    if (daysSinceLastContact === null || daysSinceLastContact > 14) {
      needsAttention = true;
      attentionReason = daysSinceLastContact === null
        ? "Haven't connected recently"
        : `${daysSinceLastContact} days since last contact`;
    } else if (memberReminders.length > 0) {
      needsAttention = true;
      attentionReason = `${memberReminders.length} pending reminder(s)`;
    }

    if (needsAttention) needingAttentionCount++;
    if (daysSinceLastContact !== null && daysSinceLastContact <= 7) recentlyContactedCount++;

    memberStatuses.push({
      name: member.name,
      relationship: member.relationship,
      phone: member.phone,
      daysSinceLastContact,
      lastContactMethod: recentCall ? 'call' : undefined,
      lastContactSummary: recentCall?.summary,
      recentCallOutcome: recentCall?.summary,
      recentCallDate: recentCall?.date,
      pendingReminders: memberReminders,
      needsAttention,
      attentionReason,
    });
  }

  // Sort: needs attention first, then by days since contact
  memberStatuses.sort((a, b) => {
    if (a.needsAttention && !b.needsAttention) return -1;
    if (!a.needsAttention && b.needsAttention) return 1;
    const aDays = a.daysSinceLastContact ?? 999;
    const bDays = b.daysSinceLastContact ?? 999;
    return bDays - aDays;
  });

  // Build response
  return buildFamilyStatusResponse(
    {
      totalMembers: familyMembers.length,
      recentlyContacted: recentlyContactedCount,
      needingAttention: needingAttentionCount,
      members: memberStatuses,
    },
    detailed
  );
}

/**
 * Build a warm, human response about family status
 */
function buildFamilyStatusResponse(overview: FamilyNetworkOverview, detailed: boolean): string {
  const parts: string[] = [];

  // Opening summary
  if (overview.needingAttention === 0) {
    parts.push(
      `Great news! You're staying connected with your family. ` +
      `I've helped you reach out to ${overview.recentlyContacted} of ${overview.totalMembers} ` +
      `family members recently.`
    );
  } else if (overview.needingAttention === overview.totalMembers) {
    parts.push(
      `It's been a while since you've connected with family. ` +
      `Want me to help you reach out to someone?`
    );
  } else {
    parts.push(
      `Here's how your family connections are looking: ` +
      `${overview.recentlyContacted} recently contacted, ` +
      `${overview.needingAttention} could use some attention.`
    );
  }

  // Members needing attention
  const needAttention = overview.members.filter((m) => m.needsAttention);
  if (needAttention.length > 0) {
    parts.push('\n**Could use your attention:**');
    for (const member of needAttention.slice(0, 3)) {
      const reason = member.attentionReason || 'no recent contact';
      parts.push(`- ${formatRelationship(member.relationship)} ${member.name}: ${reason}`);
      
      if (detailed && member.pendingReminders.length > 0) {
        parts.push(`  📝 Reminder: ${member.pendingReminders[0]}`);
      }
    }
    if (needAttention.length > 3) {
      parts.push(`  ...and ${needAttention.length - 3} more`);
    }
  }

  // Recently contacted (if detailed)
  if (detailed) {
    const recentlyContacted = overview.members.filter(
      (m) => m.daysSinceLastContact !== null && m.daysSinceLastContact <= 7
    );
    if (recentlyContacted.length > 0) {
      parts.push('\n**Recently connected:**');
      for (const member of recentlyContacted) {
        const days = member.daysSinceLastContact!;
        const timeAgo = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
        parts.push(`- ${formatRelationship(member.relationship)} ${member.name}: ${timeAgo}`);
        if (member.lastContactSummary) {
          parts.push(`  ${truncate(member.lastContactSummary, 80)}`);
        }
      }
    }
  }

  // Call to action
  if (overview.needingAttention > 0) {
    parts.push(
      '\nWant me to call someone for you? Just say "call mom" or "check in with dad".'
    );
  }

  return parts.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRelationship(relationship: string): string {
  const map: Record<string, string> = {
    mother: 'Mom',
    father: 'Dad',
    grandmother: 'Grandma',
    grandfather: 'Grandpa',
    sister: 'Sister',
    brother: 'Brother',
    aunt: 'Aunt',
    uncle: 'Uncle',
    cousin: 'Cousin',
    family: '',
  };
  return map[relationship] || relationship;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const familyNetworkStatusTool = {
  name: 'getFamilyNetworkStatus',
  description:
    'Get an overview of how you\'re staying connected with family. Shows who you\'ve talked to recently and who might need attention.',
  schema: familyNetworkStatusSchema,
  execute: getFamilyNetworkStatus,
};

export default familyNetworkStatusTool;
