/**
 * Apology Effectiveness Memory - Better Than Human Service
 *
 * What no human friend can do: Remember what kind of apologies work with each person.
 *
 * "With Lisa, your apologies work better when they're action-focused rather
 * than emotional. Last time you said 'I'm so sorry,' she responded coolly.
 * When you said 'Here's what I'll do differently,' she engaged. Try leading
 * with action."
 *
 * @module tools/domains/communication/superhuman-tools/apology-effectiveness
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
} from '../../../../services/superhuman/firestore-utils.js';
import type { ApologyRecord } from './types.js';

const log = createLogger({ module: 'apology-effectiveness' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'apology_records';

// ============================================================================
// APOLOGY PATTERNS
// ============================================================================

export type ApologyStyle =
  | 'emotional' // "I'm so sorry, I feel terrible"
  | 'action' // "Here's what I'll do differently"
  | 'explanation' // "Let me explain what happened"
  | 'acknowledgment' // "I hear that I hurt you"
  | 'responsibility' // "I take full responsibility"
  | 'combination'; // Mix of styles

const APOLOGY_STYLE_PATTERNS: Record<ApologyStyle, RegExp[]> = {
  emotional: [
    /\bi('m| am) (so |really |truly )?sorry\b/i,
    /\bi feel (terrible|awful|bad|horrible)\b/i,
    /\bforgive me\b/i,
    /\bi can('t|not) believe i\b/i,
  ],
  action: [
    /\b(i('ll| will)|going to) (do|make sure|change|fix)\b/i,
    /\bhere('s| is) what i('ll| will)\b/i,
    /\bnext time i('ll| will)\b/i,
    /\bi commit to\b/i,
    /\bmoving forward\b/i,
  ],
  explanation: [
    /\b(what happened (was|is)|let me explain)\b/i,
    /\bthe reason (was|is)\b/i,
    /\bi was (trying|thinking|feeling)\b/i,
    /\bit wasn('t|'t) (intentional|on purpose|meant)\b/i,
  ],
  acknowledgment: [
    /\bi (hear|understand|see) (that|how|you)\b/i,
    /\bi (know|realize) (i|that|how)\b/i,
    /\byou('re| are) right (to feel|that)\b/i,
    /\bthat must have (been|felt)\b/i,
  ],
  responsibility: [
    /\b(take|accept) (full |complete )?(responsibility|blame)\b/i,
    /\bit('s| is|was) (my|all my) fault\b/i,
    /\bi (messed|screwed) up\b/i,
    /\bi was wrong\b/i,
    /\bthere('s| is) no excuse\b/i,
  ],
  combination: [], // Detected when multiple styles present
};

/**
 * Detect the apology style(s) in a message.
 */
export function detectApologyStyle(message: string): ApologyStyle[] {
  const styles: ApologyStyle[] = [];

  for (const [style, patterns] of Object.entries(APOLOGY_STYLE_PATTERNS)) {
    if (style === 'combination') continue;

    for (const pattern of patterns) {
      if (pattern.test(message)) {
        styles.push(style as ApologyStyle);
        break;
      }
    }
  }

  if (styles.length > 1) {
    return ['combination', ...styles];
  }

  return styles.length > 0 ? styles : ['emotional']; // Default to emotional
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Record an apology and its outcome.
 */
export async function recordApology(
  userId: string,
  record: Omit<ApologyRecord, 'id' | 'recordedAt'>
): Promise<ApologyRecord> {
  const id = `apology_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullRecord: ApologyRecord = {
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
          reception: record.reception,
          type: record.apologyType,
        },
        '🙏 Apology record saved'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record apology');
  }

  return fullRecord;
}

/**
 * Get apology history with a specific contact.
 */
export async function getApologyHistory(
  userId: string,
  contactName: string
): Promise<ApologyRecord[]> {
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

    return snapshot.docs.map((doc) => doc.data() as ApologyRecord);
  } catch (error) {
    log.warn({ error: String(error), userId, contactName }, 'Failed to get apology history');
    return [];
  }
}

/**
 * Get all apology records for a user.
 */
export async function getAllApologyRecords(userId: string): Promise<ApologyRecord[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .orderBy('occurredAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as ApologyRecord);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get all apology records');
    return [];
  }
}

// ============================================================================
// ANALYSIS
// ============================================================================

interface ApologyEffectivenessProfile {
  contactName: string;
  totalApologies: number;
  effectiveStyles: Array<{ style: ApologyStyle; successRate: number }>;
  ineffectiveStyles: Array<{ style: ApologyStyle; failureRate: number }>;
  bestApproach: string;
  worstApproach: string;
  insights: string[];
}

/**
 * Analyze apology effectiveness for a specific contact.
 */
export async function analyzeApologyEffectiveness(
  userId: string,
  contactName: string
): Promise<ApologyEffectivenessProfile | null> {
  const history = await getApologyHistory(userId, contactName);

  if (history.length < 2) {
    return null; // Not enough data
  }

  // Analyze by style
  const styleStats: Record<ApologyStyle, { success: number; total: number }> = {
    emotional: { success: 0, total: 0 },
    action: { success: 0, total: 0 },
    explanation: { success: 0, total: 0 },
    acknowledgment: { success: 0, total: 0 },
    responsibility: { success: 0, total: 0 },
    combination: { success: 0, total: 0 },
  };

  const whatWorked: string[] = [];
  const whatDidntWork: string[] = [];

  for (const record of history) {
    const styles = detectApologyStyle(record.apologyContent);
    const wasSuccessful =
      record.reception === 'well-received' || record.relationshipAfter === 'improved';

    for (const style of styles) {
      styleStats[style].total++;
      if (wasSuccessful) {
        styleStats[style].success++;
      }
    }

    // Collect specific learnings
    if (record.whatWorked) {
      whatWorked.push(...record.whatWorked);
    }
    if (record.whatDidntWork) {
      whatDidntWork.push(...record.whatDidntWork);
    }
  }

  // Calculate effectiveness
  const effective: Array<{ style: ApologyStyle; successRate: number }> = [];
  const ineffective: Array<{ style: ApologyStyle; failureRate: number }> = [];

  for (const [style, stats] of Object.entries(styleStats)) {
    if (stats.total >= 2) {
      const successRate = stats.success / stats.total;
      if (successRate >= 0.6) {
        effective.push({ style: style as ApologyStyle, successRate });
      } else if (successRate <= 0.4) {
        ineffective.push({
          style: style as ApologyStyle,
          failureRate: 1 - successRate,
        });
      }
    }
  }

  // Sort by effectiveness
  effective.sort((a, b) => b.successRate - a.successRate);
  ineffective.sort((a, b) => b.failureRate - a.failureRate);

  // Generate insights
  const insights: string[] = [];

  if (effective.length > 0) {
    insights.push(
      `${contactName} responds best to ${effective[0].style} apologies (${Math.round(effective[0].successRate * 100)}% success rate).`
    );
  }

  if (ineffective.length > 0) {
    insights.push(
      `Avoid ${ineffective[0].style} apologies with ${contactName} - they don't land well.`
    );
  }

  if (whatWorked.length > 0) {
    insights.push(`What's worked: ${whatWorked.slice(0, 2).join(', ')}`);
  }

  // Determine best/worst approach
  const bestApproach =
    effective.length > 0
      ? generateApologyTemplate(effective[0].style, contactName)
      : 'Be genuine and specific about what you did wrong.';

  const worstApproach =
    ineffective.length > 0
      ? `Avoid ${ineffective[0].style} apologies - they haven't worked with ${contactName}.`
      : 'No clear pattern yet.';

  return {
    contactName,
    totalApologies: history.length,
    effectiveStyles: effective,
    ineffectiveStyles: ineffective,
    bestApproach,
    worstApproach,
    insights,
  };
}

/**
 * Get quick recommendation for an apology to a specific person.
 */
export async function getApologyRecommendation(
  userId: string,
  contactName: string
): Promise<string> {
  const profile = await analyzeApologyEffectiveness(userId, contactName);

  if (!profile || profile.totalApologies < 2) {
    return `I don't have enough data about apologies with ${contactName} yet. Go with a genuine, specific apology that acknowledges what happened and what you'll do differently.`;
  }

  const sections: string[] = [];

  sections.push(`**Apology Guide for ${contactName}:**\n`);

  if (profile.effectiveStyles.length > 0) {
    sections.push(
      `✅ **What works:** ${profile.effectiveStyles.map((s) => s.style).join(', ')} apologies`
    );
    sections.push(`   ${profile.bestApproach}\n`);
  }

  if (profile.ineffectiveStyles.length > 0) {
    sections.push(
      `❌ **What doesn't work:** ${profile.ineffectiveStyles.map((s) => s.style).join(', ')}`
    );
    sections.push(`   ${profile.worstApproach}\n`);
  }

  if (profile.insights.length > 0) {
    sections.push(`💡 **Key insight:** ${profile.insights[0]}`);
  }

  return sections.join('\n');
}

// ============================================================================
// TEMPLATES
// ============================================================================

function generateApologyTemplate(style: ApologyStyle, contactName: string): string {
  const templates: Record<ApologyStyle, string> = {
    emotional: `Express genuine remorse. ${contactName} responds to emotional authenticity.`,
    action: `Lead with what you'll do differently. ${contactName} values seeing a plan, not just words.`,
    explanation: `Share context (briefly) about what happened. ${contactName} wants to understand.`,
    acknowledgment: `Start by acknowledging their experience. ${contactName} needs to feel heard first.`,
    responsibility: `Take clear ownership without excuses. ${contactName} respects directness.`,
    combination: `Combine acknowledgment of their experience with a clear action plan.`,
  };

  return templates[style] || templates.combination;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build apology context for LLM injection.
 */
export async function buildApologyContext(userId: string, contactName?: string): Promise<string> {
  if (contactName) {
    const recommendation = await getApologyRecommendation(userId, contactName);
    return `[APOLOGY EFFECTIVENESS - Better Than Human]\n${recommendation}`;
  }

  // General patterns across all contacts
  const allRecords = await getAllApologyRecords(userId);

  if (allRecords.length < 3) {
    return '';
  }

  const sections: string[] = [
    '[APOLOGY EFFECTIVENESS MEMORY - Better Than Human]',
    'You remember what kinds of apologies work with each person.',
  ];

  // Group by contact
  const byContact = new Map<string, ApologyRecord[]>();
  for (const record of allRecords) {
    const existing = byContact.get(record.contactName) || [];
    existing.push(record);
    byContact.set(record.contactName, existing);
  }

  sections.push('\n**Apology Patterns by Person:**');

  for (const [name, records] of Array.from(byContact.entries())) {
    if (records.length < 2) continue;

    const successful = records.filter(
      (r) => r.reception === 'well-received' || r.relationshipAfter === 'improved'
    );
    const successRate = successful.length / records.length;

    const styles = records.flatMap((r) => detectApologyStyle(r.apologyContent));
    const dominantStyle = getMostCommon(styles);

    const emoji = successRate >= 0.6 ? '✅' : successRate <= 0.3 ? '❌' : '😐';

    sections.push(
      `• ${name}: ${Math.round(successRate * 100)}% success ${emoji} (prefers ${dominantStyle} apologies)`
    );
  }

  sections.push('\n**When helping craft an apology, reference their history with that person.**');

  return sections.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function getMostCommon<T>(arr: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: T | undefined;
  for (const [item, count] of Array.from(counts.entries())) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }

  return mostCommon;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const apologyEffectiveness = {
  detectStyle: detectApologyStyle,
  record: recordApology,
  getHistory: getApologyHistory,
  analyze: analyzeApologyEffectiveness,
  getRecommendation: getApologyRecommendation,
  buildContext: buildApologyContext,
};

export default apologyEffectiveness;
