/**
 * Values Alignment Engine - Better Than Human Service
 *
 * What no human friend can do: Track values across 1000 conversations.
 *
 * Continuously monitors stated values and detects when decisions
 * or actions conflict with those values.
 *
 * @module services/superhuman/values-alignment
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../memory/firestore-client.js';

const log = createLogger({ module: 'values-alignment' });

// ============================================================================
// TYPES
// ============================================================================

export type ValueCategory =
  | 'family' // Family, relationships, loved ones
  | 'freedom' // Independence, autonomy, choice
  | 'security' // Safety, stability, predictability
  | 'growth' // Learning, development, becoming
  | 'achievement' // Success, accomplishment, recognition
  | 'service' // Helping others, contribution, impact
  | 'creativity' // Expression, innovation, art
  | 'authenticity' // Truth, honesty, being real
  | 'connection' // Belonging, community, relationships
  | 'health' // Wellness, energy, vitality
  | 'adventure' // Excitement, novelty, exploration
  | 'peace' // Calm, harmony, balance
  | 'purpose' // Meaning, significance, legacy
  | 'wealth' // Financial security, abundance
  | 'fun'; // Joy, pleasure, enjoyment

export interface UserValue {
  id: string;
  userId: string;

  // The value
  category: ValueCategory;
  statement: string; // User's own words about this value
  importance: number; // 0-1, how important based on frequency

  // Evidence
  mentions: number;
  firstMentioned: number;
  lastMentioned: number;
  contextExamples: string[]; // Times they mentioned it

  // Conflicts detected
  conflictCount: number;
  lastConflictDate?: number;
}

export interface ValueConflict {
  id: string;
  userId: string;
  valueId: string;

  // The conflict
  statedValue: string;
  conflictingAction: string;
  detectedAt: number;

  // Context
  conversationContext: string;
  wasAddressed: boolean;
  userResponse?: 'acknowledged' | 'defended' | 'dismissed' | 'explored';
}

export interface ValuesProfile {
  userId: string;
  topValues: UserValue[];
  recentConflicts: ValueConflict[];
  valueAlignment: number; // 0-1, how aligned actions are with values
  lastUpdated: number;
}

// ============================================================================
// VALUE DETECTION PATTERNS
// ============================================================================

const VALUE_PATTERNS: Array<{
  patterns: RegExp[];
  category: ValueCategory;
  weight: number;
}> = [
  {
    patterns: [
      /\bfamily (is|means|comes first)/i,
      /\bmy (kids|children|spouse|partner) (are|is) (everything|most important)/i,
      /\bnothing (is|matters) more than (my )?(family|kids)/i,
    ],
    category: 'family',
    weight: 0.9,
  },
  {
    patterns: [
      /\bi (need|want|value) my freedom/i,
      /\bi (hate|can't stand) being (told|controlled)/i,
      /\bmy independence (is|matters)/i,
    ],
    category: 'freedom',
    weight: 0.85,
  },
  {
    patterns: [
      /\bi (need|want) (security|stability)/i,
      /\bi (hate|can't stand) uncertainty/i,
      /\bsafety (is|comes) first/i,
    ],
    category: 'security',
    weight: 0.8,
  },
  {
    patterns: [
      /\bi want to (grow|learn|become)/i,
      /\bgrowth (is|means) (everything|important)/i,
      /\bi('m| am) always (learning|growing)/i,
    ],
    category: 'growth',
    weight: 0.85,
  },
  {
    patterns: [
      /\bi want to (succeed|achieve|accomplish)/i,
      /\bsuccess (is|means|matters)/i,
      /\bi need to (prove|show|achieve)/i,
    ],
    category: 'achievement',
    weight: 0.8,
  },
  {
    patterns: [
      /\bi want to (help|serve|give back)/i,
      /\bmaking a difference (is|matters)/i,
      /\bi (need|want) to contribute/i,
    ],
    category: 'service',
    weight: 0.85,
  },
  {
    patterns: [
      /\bi (need|have) to (create|express|make)/i,
      /\bcreativity (is|means)/i,
      /\bi('m| am) (creative|artistic|a creator)/i,
    ],
    category: 'creativity',
    weight: 0.75,
  },
  {
    patterns: [
      /\bi (need|want) to be (real|authentic|myself)/i,
      /\bhonesty (is|matters) (most|to me)/i,
      /\bi (can't|won't) (pretend|fake)/i,
    ],
    category: 'authenticity',
    weight: 0.9,
  },
  {
    patterns: [
      /\bi (need|want|crave) connection/i,
      /\bbelonging (is|matters|means)/i,
      /\bi (hate|can't stand) being alone/i,
    ],
    category: 'connection',
    weight: 0.8,
  },
  {
    patterns: [
      /\bmy health (is|comes) first/i,
      /\bwithout (my )?health, nothing/i,
      /\bi (need|want) to (be|stay|get) healthy/i,
    ],
    category: 'health',
    weight: 0.85,
  },
  {
    patterns: [
      /\bi (need|want|crave) adventure/i,
      /\bi (hate|can't stand) routine/i,
      /\bi (need|want) excitement/i,
    ],
    category: 'adventure',
    weight: 0.75,
  },
  {
    patterns: [
      /\bi (need|want) peace/i,
      /\bi (hate|can't stand) (drama|conflict|chaos)/i,
      /\bharmony (is|matters|means)/i,
    ],
    category: 'peace',
    weight: 0.85,
  },
  {
    patterns: [
      /\bi (need|want) purpose/i,
      /\bmeaning (is|matters|means)/i,
      /\bwhat('s| is) the point if/i,
    ],
    category: 'purpose',
    weight: 0.9,
  },
];

const CONFLICT_PATTERNS: Array<{
  valueCategory: ValueCategory;
  conflictPatterns: RegExp[];
}> = [
  {
    valueCategory: 'family',
    conflictPatterns: [
      /\bi('m| am) (working|staying) late again/i,
      /\bi (missed|skipped) (my kid's|their)/i,
      /\bwork (is|has been) taking over/i,
    ],
  },
  {
    valueCategory: 'health',
    conflictPatterns: [
      /\bi (haven't|have not) (exercised|worked out|slept)/i,
      /\bi('m| am) (eating|drinking) too much/i,
      /\bi('m| am) (exhausted|burned out)/i,
    ],
  },
  {
    valueCategory: 'freedom',
    conflictPatterns: [
      /\bi (feel|am) trapped/i,
      /\bi (have|got) to do what they/i,
      /\bi (can't|cannot) say no/i,
    ],
  },
  {
    valueCategory: 'authenticity',
    conflictPatterns: [
      /\bi('m| am) (pretending|faking)/i,
      /\bi (can't|cannot) (be myself|show who i)/i,
      /\bi('m| am) not being honest/i,
    ],
  },
  {
    valueCategory: 'peace',
    conflictPatterns: [
      /\bthere('s| is) so much drama/i,
      /\bi('m| am) (always|constantly) stressed/i,
      /\bmy life is chaos/i,
    ],
  },
];

// ============================================================================
// VALUE DETECTION
// ============================================================================

export function detectValue(
  transcript: string
): { category: ValueCategory; statement: string; weight: number } | null {
  for (const { patterns, category, weight } of VALUE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        // Extract the value statement (the sentence containing the match)
        const match = transcript.match(pattern);
        if (match) {
          const sentenceStart = transcript.lastIndexOf('.', match.index) + 1;
          const sentenceEnd = transcript.indexOf('.', (match.index || 0) + match[0].length);
          const statement = transcript
            .slice(sentenceStart, sentenceEnd > 0 ? sentenceEnd : undefined)
            .trim();
          return { category, statement, weight };
        }
      }
    }
  }
  return null;
}

export function detectConflict(
  transcript: string,
  userValues: UserValue[]
): { valueId: string; conflictingAction: string } | null {
  for (const value of userValues) {
    const conflictDef = CONFLICT_PATTERNS.find((c) => c.valueCategory === value.category);
    if (conflictDef) {
      for (const pattern of conflictDef.conflictPatterns) {
        if (pattern.test(transcript)) {
          const match = transcript.match(pattern);
          return {
            valueId: value.id,
            conflictingAction: match?.[0] || transcript.slice(0, 100),
          };
        }
      }
    }
  }
  return null;
}

// ============================================================================
// STORAGE
// ============================================================================

const valuesCache = new Map<string, UserValue[]>();

export async function loadUserValues(userId: string): Promise<UserValue[]> {
  if (valuesCache.has(userId)) {
    return valuesCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('values')
      .orderBy('importance', 'desc')
      .limit(20)
      .get();

    const values = snapshot.docs.map((doc) => doc.data() as UserValue);
    valuesCache.set(userId, values);
    return values;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load values');
    return [];
  }
}

export async function saveValue(value: UserValue): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    await db.collection('bogle_users').doc(value.userId).collection('values').doc(value.id).set(value);
  }

  // Update cache
  const values = valuesCache.get(value.userId) || [];
  const idx = values.findIndex((v) => v.id === value.id);
  if (idx >= 0) {
    values[idx] = value;
  } else {
    values.push(value);
  }
  valuesCache.set(value.userId, values);
}

export async function recordValueMention(
  userId: string,
  detected: { category: ValueCategory; statement: string; weight: number }
): Promise<UserValue> {
  const values = await loadUserValues(userId);
  const existing = values.find((v) => v.category === detected.category);

  if (existing) {
    existing.mentions++;
    existing.lastMentioned = Date.now();
    existing.importance = Math.min(1, existing.importance + 0.05);
    if (existing.contextExamples.length < 10) {
      existing.contextExamples.push(detected.statement);
    }
    await saveValue(existing);
    return existing;
  }

  // Create new value
  const newValue: UserValue = {
    id: `value_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    category: detected.category,
    statement: detected.statement,
    importance: detected.weight,
    mentions: 1,
    firstMentioned: Date.now(),
    lastMentioned: Date.now(),
    contextExamples: [detected.statement],
    conflictCount: 0,
  };

  await saveValue(newValue);
  log.info({ userId, category: detected.category }, '💎 New value detected');
  return newValue;
}

export async function recordConflict(
  userId: string,
  conflict: { valueId: string; conflictingAction: string; context: string }
): Promise<void> {
  const values = await loadUserValues(userId);
  const value = values.find((v) => v.id === conflict.valueId);

  if (value) {
    value.conflictCount++;
    value.lastConflictDate = Date.now();
    await saveValue(value);
  }

  // Save conflict record
  const conflictRecord: ValueConflict = {
    id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    valueId: conflict.valueId,
    statedValue: value?.statement || '',
    conflictingAction: conflict.conflictingAction,
    detectedAt: Date.now(),
    conversationContext: conflict.context,
    wasAddressed: false,
  };

  const db = getFirestoreDb();
  if (db) {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('value_conflicts')
      .doc(conflictRecord.id)
      .set(conflictRecord);
  }

  log.info({ userId, valueId: conflict.valueId }, '⚠️ Value conflict detected');
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildValuesContext(userId: string): Promise<string> {
  const values = await loadUserValues(userId);

  if (values.length === 0) {
    return '';
  }

  const sections: string[] = ['[VALUES ALIGNMENT - Better Than Human Value Tracking]'];
  sections.push('You know what matters to them. Help them live in alignment.');

  // Top values
  const topValues = values.slice(0, 5);
  sections.push('\n**Core Values:**');
  for (const value of topValues) {
    const conflictNote = value.conflictCount > 0 ? ` (${value.conflictCount} conflicts)` : '';
    sections.push(`• ${value.category.toUpperCase()}: "${value.statement}"${conflictNote}`);
  }

  // Recent conflicts
  const conflictingValues = values.filter((v) => v.conflictCount > 0 && v.lastConflictDate);
  if (conflictingValues.length > 0) {
    sections.push('\n**Values Under Pressure:**');
    for (const value of conflictingValues.slice(0, 3)) {
      const daysAgo = Math.floor((Date.now() - (value.lastConflictDate || 0)) / (24 * 60 * 60 * 1000));
      sections.push(
        `• ${value.category}: Conflict detected ${daysAgo} days ago. Worth exploring gently.`
      );
    }
  }

  sections.push('\nWhen you see misalignment, reflect it back with curiosity, not judgment.');
  sections.push('Example: "You said family comes first... but I\'m noticing work keeps winning. What\'s going on there?"');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const valuesAlignment = {
  detectValue,
  detectConflict,
  loadValues: loadUserValues,
  recordMention: recordValueMention,
  recordConflict,
  buildContext: buildValuesContext,
};

