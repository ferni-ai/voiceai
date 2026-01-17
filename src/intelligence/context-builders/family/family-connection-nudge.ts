/**
 * Family Connection Nudge Context Builder
 *
 * "Better Than Human" - Ferni notices when you haven't connected with
 * family in a while and gently suggests reaching out.
 *
 * Human friends forget. Ferni doesn't.
 *
 * Injections:
 * - Contacts who haven't been reached in a while
 * - Upcoming occasions (birthdays, anniversaries) that warrant calls
 * - Gentle nudges woven into natural conversation
 *
 * @module intelligence/context-builders/family/family-connection-nudge
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:family-nudge' });

// ============================================================================
// TYPES
// ============================================================================

interface FamilyContactStatus {
  name: string;
  relationship: string;
  daysSinceContact: number;
  lastCallSummary?: string;
  upcomingOccasion?: {
    type: 'birthday' | 'anniversary' | 'holiday';
    daysUntil: number;
  };
}

// Cache to avoid repeated Firestore queries within same session
const nudgeCache = new Map<string, { data: FamilyContactStatus[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Get family contacts who might need a check-in
 */
async function getFamilyContactsNeedingAttention(userId: string): Promise<FamilyContactStatus[]> {
  // Check cache first
  const cached = nudgeCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const results: FamilyContactStatus[] = [];

  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return [];

    // Get family members from entity store
    const entitiesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('unified_entities')
      .where('type', '==', 'person')
      .where('relationship', '==', 'family')
      .limit(20)
      .get();

    if (entitiesSnapshot.empty) return [];

    // Get recent calls to calculate days since contact
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90); // Look back 90 days

    const callsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .where('capturedAt', '>=', cutoff.toISOString())
      .orderBy('capturedAt', 'desc')
      .get();

    // Build a map of last contact per person
    const lastContactMap = new Map<string, { date: Date; summary?: string }>();
    for (const doc of callsSnapshot.docs) {
      const data = doc.data();
      const name = (data.request?.contactName || data.request?.contactQuery || '').toLowerCase();
      if (name && !lastContactMap.has(name)) {
        lastContactMap.set(name, {
          date: new Date(data.capturedAt),
          summary: data.outcome?.transcriptSummary || data.outcome?.outcome,
        });
      }
    }

    // Calculate status for each family member
    const now = Date.now();
    for (const doc of entitiesSnapshot.docs) {
      const entity = doc.data();
      const name = entity.canonicalName || entity.name;
      const lowerName = name.toLowerCase();

      const lastContact = lastContactMap.get(lowerName);
      const daysSinceContact = lastContact
        ? Math.floor((now - lastContact.date.getTime()) / (1000 * 60 * 60 * 24))
        : 999; // Never contacted

      // Only include if it's been more than 2 weeks
      if (daysSinceContact >= 14) {
        results.push({
          name,
          relationship: entity.specificRelation || 'family member',
          daysSinceContact,
          lastCallSummary: lastContact?.summary,
        });
      }
    }

    // Sort by days since contact (longest first)
    results.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

    // Cache results
    nudgeCache.set(userId, { data: results, timestamp: Date.now() });
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get family contacts needing attention');
  }

  return results;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const familyConnectionNudgeBuilder: ContextBuilder = {
  name: 'family-connection-nudge',
  description:
    "Notices when family members haven't been contacted in a while and suggests reaching out",
  priority: 3, // Lower priority - only inject when relevant
  category: BuilderCategory.EXTERNAL, // Part of external/family awareness

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    // Only inject occasionally (not every turn)
    // Check if this is a good moment to suggest
    const turnCount = userData?.turnCount || 0;

    // Only check on turn 2-3 (after greeting, during natural conversation)
    // and then every 10 turns or so
    if (turnCount < 2 || (turnCount > 5 && turnCount % 10 !== 0)) {
      return [];
    }

    const needingAttention = await getFamilyContactsNeedingAttention(userId);

    if (needingAttention.length === 0) {
      return [];
    }

    log.debug(
      { userId, count: needingAttention.length },
      'Found family contacts needing attention'
    );

    // Build a gentle nudge
    const nudgeContent = buildConnectionNudge(needingAttention);

    return [
      createStandardInjection('family_connection_nudge', nudgeContent, {
        category: 'proactive',
        confidence: 0.8,
      }),
    ];
  },
};

// ============================================================================
// NUDGE BUILDING
// ============================================================================

/**
 * Build a gentle, non-pushy nudge about family connections
 */
function buildConnectionNudge(contacts: FamilyContactStatus[]): string {
  // Pick the most "important" person to nudge about
  // Prioritize: longer time since contact, closer relationships
  const priority = contacts[0];

  const relationshipWeight: Record<string, number> = {
    mother: 10,
    father: 10,
    grandmother: 9,
    grandfather: 9,
    sister: 7,
    brother: 7,
    aunt: 5,
    uncle: 5,
    cousin: 3,
  };

  // Sort by relationship importance
  const sorted = [...contacts].sort((a, b) => {
    const aWeight = relationshipWeight[a.relationship] || 1;
    const bWeight = relationshipWeight[b.relationship] || 1;
    return bWeight - aWeight;
  });

  const topContact = sorted[0];

  const lines: string[] = [
    '',
    '## 💭 FAMILY CONNECTION OPPORTUNITY (Gentle Nudge)',
    '',
    `It's been ${topContact.daysSinceContact} days since you connected with ${formatRelationship(topContact.relationship)} ${topContact.name}.`,
    '',
  ];

  if (topContact.lastCallSummary) {
    lines.push(`Last time you talked: ${topContact.lastCallSummary}`);
    lines.push('');
  }

  lines.push('**How to weave this in naturally:**');
  lines.push("- Don't bring it up immediately - wait for a natural moment");
  lines.push('- Example: "By the way, it\'s been a few weeks since we talked to your mom..."');
  lines.push('- Or: "Have you had a chance to check in with [name] lately?"');
  lines.push("- Keep it light and optional - don't make them feel guilty");
  lines.push('');
  lines.push('If they seem receptive, offer: "Want me to give them a call for you?"');
  lines.push('');

  if (contacts.length > 1) {
    const others = contacts
      .slice(1, 3)
      .map((c) => `${formatRelationship(c.relationship)} ${c.name}`);
    lines.push(`Also on the list: ${others.join(', ')}`);
  }

  return lines.join('\n');
}

function formatRelationship(relationship: string): string {
  const map: Record<string, string> = {
    mother: 'your mom',
    father: 'your dad',
    grandmother: 'grandma',
    grandfather: 'grandpa',
    sister: 'your sister',
    brother: 'your brother',
    aunt: 'your aunt',
    uncle: 'your uncle',
    cousin: 'your cousin',
  };
  return map[relationship] || relationship;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(familyConnectionNudgeBuilder);

export default familyConnectionNudgeBuilder;
