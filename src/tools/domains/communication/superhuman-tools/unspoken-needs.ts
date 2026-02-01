/**
 * Unspoken Needs Translator - Better Than Human Service
 *
 * What no human friend can do: Help you see what you actually need.
 *
 * "When you say 'My sister never calls,' I hear an underlying need for feeling
 * valued, not the call itself. Would it help to tell her 'It means a lot when
 * you reach out first' instead of 'You never call'? That names what you
 * actually need."
 *
 * @module tools/domains/communication/superhuman-tools/unspoken-needs
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
} from '../../../../services/superhuman/firestore-utils.js';
import type { UnspokenNeed } from './types.js';

const log = createLogger({ module: 'unspoken-needs' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'unspoken_needs';

// ============================================================================
// NEEDS FRAMEWORK (Based on NVC and Self-Determination Theory)
// ============================================================================

export type NeedCategory =
  | 'belonging' // Connection, acceptance, inclusion
  | 'autonomy' // Independence, choice, freedom
  | 'competence' // Mastery, contribution, effectiveness
  | 'security' // Safety, stability, predictability
  | 'meaning' // Purpose, significance, growth
  | 'connection' // Intimacy, understanding, empathy
  | 'respect'; // Recognition, appreciation, being seen

const NEED_CATEGORIES: Record<
  NeedCategory,
  {
    description: string;
    surfaceComplaints: RegExp[];
    betterExpressions: string[];
  }
> = {
  belonging: {
    description: 'The need to feel included, accepted, and part of something',
    surfaceComplaints: [
      /they (never|don't) (invite|include|ask) me/i,
      /i('m| am) always (left out|excluded|the last to know)/i,
      /no one (tells|asks|includes) me/i,
      /they (forgot|didn't remember) (me|my|about me)/i,
    ],
    betterExpressions: [
      "I'd love to be included more. It means a lot to me to be part of things.",
      "When I'm not invited, I start to feel like I don't belong. That's probably not your intent.",
      'Being included matters to me more than I usually say.',
    ],
  },
  autonomy: {
    description: 'The need for independence, choice, and self-direction',
    surfaceComplaints: [
      /they('re| are) (always|constantly) telling me what to do/i,
      /i (can't|don't get to) (decide|choose|have a say)/i,
      /they (control|micromanage|don't trust)/i,
      /i('m| am) not (allowed|able) to/i,
    ],
    betterExpressions: [
      'I need to feel like I have some choice in this.',
      'It helps me when I can decide how to approach things.',
      'I work better when I feel trusted to figure things out.',
    ],
  },
  competence: {
    description: 'The need to feel capable, effective, and contributing',
    surfaceComplaints: [
      /they (never|don't) (appreciate|notice|acknowledge) (what i do|my work|my effort)/i,
      /nothing i do is (good enough|ever right)/i,
      /i('m| am) (useless|not good at anything|failing)/i,
      /they (criticize|correct|fix) everything/i,
    ],
    betterExpressions: [
      'I need to feel like my contributions matter.',
      "It helps when you acknowledge what's working, not just what needs fixing.",
      "I want to feel like I'm doing a good job.",
    ],
  },
  security: {
    description: 'The need for safety, stability, and predictability',
    surfaceComplaints: [
      /i never know (what to expect|where i stand)/i,
      /they('re| are) (so unpredictable|always changing)/i,
      /i('m| am) (worried|anxious|scared) (about|that)/i,
      /i (don't feel|never feel) (safe|secure|stable)/i,
    ],
    betterExpressions: [
      'I need more predictability to feel secure.',
      'It helps me when I know what to expect.',
      "I feel better when there's some consistency.",
    ],
  },
  meaning: {
    description: 'The need for purpose, significance, and growth',
    surfaceComplaints: [
      /what('s| is) the point/i,
      /this (doesn't matter|is meaningless|feels pointless)/i,
      /i('m| am) (just going through the motions|wasting my time)/i,
      /nothing (matters|changes|makes a difference)/i,
    ],
    betterExpressions: [
      'I need to feel like this matters.',
      'Help me understand why this is important.',
      "I want to feel like I'm growing, not just existing.",
    ],
  },
  connection: {
    description: 'The need for intimacy, understanding, and emotional closeness',
    surfaceComplaints: [
      /they (never|don't) (listen|understand|get it)/i,
      /we (never|don't) (talk|connect|spend time)/i,
      /i feel (so alone|disconnected|distant)/i,
      /they('re| are) (always busy|never available|distracted)/i,
    ],
    betterExpressions: [
      'I miss feeling close to you.',
      'I need to feel like you really hear me.',
      "I want more moments where we're really present with each other.",
    ],
  },
  respect: {
    description: 'The need to be seen, valued, and taken seriously',
    surfaceComplaints: [
      /they (don't|never) (respect|value|appreciate) me/i,
      /i('m| am) (invisible|ignored|dismissed)/i,
      /they (talk over|interrupt|dismiss) me/i,
      /my (opinion|input|voice) doesn't (matter|count)/i,
    ],
    betterExpressions: [
      'I need to feel like my perspective matters to you.',
      'It helps when you take my input seriously.',
      'I want to feel seen and valued, not dismissed.',
    ],
  },
};

// ============================================================================
// NEED DETECTION
// ============================================================================

/**
 * Detect the underlying need from a complaint or expression.
 */
export function detectUnderlyingNeed(
  complaint: string
): { category: NeedCategory; confidence: number; betterExpression: string } | null {
  const lower = complaint.toLowerCase();
  let bestMatch: { category: NeedCategory; confidence: number } | null = null;

  for (const [category, info] of Object.entries(NEED_CATEGORIES)) {
    for (const pattern of info.surfaceComplaints) {
      if (pattern.test(lower)) {
        const confidence = 0.7; // Could be refined based on specificity
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { category: category as NeedCategory, confidence };
        }
      }
    }
  }

  if (!bestMatch) return null;

  const categoryInfo = NEED_CATEGORIES[bestMatch.category];
  const betterExpression =
    categoryInfo.betterExpressions[
      Math.floor(Math.random() * categoryInfo.betterExpressions.length)
    ];

  return {
    category: bestMatch.category,
    confidence: bestMatch.confidence,
    betterExpression,
  };
}

/**
 * Translate a complaint into a need statement.
 */
export function translateToNeed(
  complaint: string,
  targetPerson?: string
): {
  originalComplaint: string;
  underlyingNeed: string;
  needCategory: NeedCategory;
  betterWayToExpress: string;
  whyItMatters: string;
} | null {
  const detected = detectUnderlyingNeed(complaint);
  if (!detected) return null;

  const categoryInfo = NEED_CATEGORIES[detected.category];
  const personRef = targetPerson ? `When talking to ${targetPerson}, try: ` : 'Try saying: ';

  return {
    originalComplaint: complaint,
    underlyingNeed: categoryInfo.description,
    needCategory: detected.category,
    betterWayToExpress: personRef + `"${detected.betterExpression}"`,
    whyItMatters: generateWhyItMatters(detected.category, complaint),
  };
}

function generateWhyItMatters(category: NeedCategory, complaint: string): string {
  const explanations: Record<NeedCategory, string> = {
    belonging:
      'When you name the need to belong instead of the specific incident, it opens a conversation about the relationship, not just one event.',
    autonomy:
      'Asking for autonomy directly is more likely to get a positive response than pushing back against control.',
    competence: 'Asking for acknowledgment is more empowering than complaining about criticism.',
    security: 'Naming your need for security invites problem-solving instead of defensiveness.',
    meaning:
      'Expressing a need for meaning invites deeper conversation than expressing frustration.',
    connection:
      'Asking for connection is vulnerable but more likely to create it than complaining about distance.',
    respect: "Asking to be respected is clearer than cataloging ways you've been disrespected.",
  };

  return explanations[category];
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Save a detected unspoken need.
 */
export async function saveUnspokenNeed(
  userId: string,
  need: Omit<UnspokenNeed, 'id' | 'detectedAt'>
): Promise<UnspokenNeed> {
  const id = `need_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const fullNeed: UnspokenNeed = {
    ...need,
    id,
    userId,
    detectedAt: Date.now(),
  };

  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection(COLLECTION)
        .doc(id)
        .set(cleanForFirestore(fullNeed));

      log.info(
        {
          userId,
          needCategory: need.needCategory,
          surfaceComplaint: need.surfaceComplaint.slice(0, 50),
        },
        '💭 Unspoken need saved'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save unspoken need');
  }

  return fullNeed;
}

/**
 * Get unspoken needs that have been detected.
 */
export async function getUnspokenNeeds(userId: string): Promise<UnspokenNeed[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .where('status', 'in', ['detected', 'surfaced'])
      .orderBy('detectedAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as UnspokenNeed);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get unspoken needs');
    return [];
  }
}

/**
 * Mark a need as surfaced (we helped them articulate it).
 */
export async function markNeedSurfaced(userId: string, needId: string): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(needId)
      .update(
        cleanForFirestore({
          status: 'surfaced',
          surfacedAt: Date.now(),
        })
      );
  } catch (error) {
    log.warn({ error: String(error), userId, needId }, 'Failed to mark need surfaced');
  }
}

/**
 * Mark a need as addressed.
 */
export async function markNeedAddressed(userId: string, needId: string): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(needId)
      .update(cleanForFirestore({ status: 'addressed' }));
  } catch (error) {
    log.warn({ error: String(error), userId, needId }, 'Failed to mark need addressed');
  }
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze need patterns for a user.
 */
export async function analyzeNeedPatterns(userId: string): Promise<{
  dominantNeeds: Array<{ category: NeedCategory; frequency: number }>;
  recurringPeople: Array<{ person: string; needs: NeedCategory[] }>;
  insight: string;
}> {
  const needs = await getUnspokenNeeds(userId);

  if (needs.length < 3) {
    return {
      dominantNeeds: [],
      recurringPeople: [],
      insight: 'Not enough data yet to identify patterns.',
    };
  }

  // Count by category
  const categoryCounts = new Map<NeedCategory, number>();
  for (const need of needs) {
    const count = categoryCounts.get(need.needCategory) || 0;
    categoryCounts.set(need.needCategory, count + 1);
  }

  // Sort by frequency
  const dominantNeeds = Array.from(categoryCounts.entries())
    .map(([category, frequency]) => ({ category, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  // Group by person
  const byPerson = new Map<string, NeedCategory[]>();
  for (const need of needs) {
    if (need.targetPerson) {
      const existing = byPerson.get(need.targetPerson) || [];
      existing.push(need.needCategory);
      byPerson.set(need.targetPerson, existing);
    }
  }

  const recurringPeople = Array.from(byPerson.entries())
    .filter(([_, needs]) => needs.length >= 2)
    .map(([person, personNeeds]) => ({ person, needs: Array.from(new Set(personNeeds)) }));

  // Generate insight
  let insight: string;
  if (dominantNeeds.length > 0) {
    const topNeed = dominantNeeds[0];
    const categoryInfo = NEED_CATEGORIES[topNeed.category];
    insight = `You frequently express complaints related to ${topNeed.category} (${categoryInfo.description}). This might be your most unmet need.`;
  } else {
    insight = 'Your needs seem varied. No single pattern dominates.';
  }

  return { dominantNeeds, recurringPeople, insight };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build unspoken needs context for LLM injection.
 */
export async function buildNeedsContext(userId: string): Promise<string> {
  const patterns = await analyzeNeedPatterns(userId);

  const sections: string[] = [
    '[UNSPOKEN NEEDS TRANSLATOR - Better Than Human]',
    'You hear the need behind the complaint. Most people miss this.',
  ];

  if (patterns.dominantNeeds.length > 0) {
    sections.push('\n**Recurring Unmet Needs:**');
    for (const { category, frequency } of patterns.dominantNeeds.slice(0, 3)) {
      const info = NEED_CATEGORIES[category];
      sections.push(
        `• ${category.charAt(0).toUpperCase() + category.slice(1)}: ${info.description} (${frequency}x)`
      );
    }
  }

  if (patterns.recurringPeople.length > 0) {
    sections.push('\n**Relationships with Unmet Needs:**');
    for (const { person, needs } of patterns.recurringPeople) {
      sections.push(`• ${person}: ${needs.join(', ')}`);
    }
  }

  sections.push('\n**When they complain:**');
  sections.push('• Listen for the underlying need');
  sections.push('• Help them name it: "Sounds like you need to feel..."');
  sections.push('• Offer better language: "What if you said..."');

  return sections.join('\n');
}

/**
 * Generate a needs translation prompt.
 */
export function generateTranslationPrompt(complaint: string): string {
  const translation = translateToNeed(complaint);

  if (!translation) {
    return "I hear frustration, but I'm not sure what the underlying need is. Can you tell me more about what you wish was different?";
  }

  return `When you say "${complaint.slice(0, 50)}...", I hear a need for ${translation.needCategory}.

${translation.betterWayToExpress}

${translation.whyItMatters}

Does that resonate?`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const unspokenNeeds = {
  detect: detectUnderlyingNeed,
  translate: translateToNeed,
  save: saveUnspokenNeed,
  get: getUnspokenNeeds,
  markSurfaced: markNeedSurfaced,
  markAddressed: markNeedAddressed,
  analyzePatterns: analyzeNeedPatterns,
  buildContext: buildNeedsContext,
  generatePrompt: generateTranslationPrompt,
  NEED_CATEGORIES,
};

export default unspokenNeeds;
