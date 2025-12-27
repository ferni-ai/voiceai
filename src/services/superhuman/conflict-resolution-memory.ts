/**
 * Conflict Resolution Memory - Better Than Human Conflict Support
 *
 * Remembers what works (and doesn't) for resolving conflicts:
 * - Per-relationship conflict patterns and triggers
 * - Effective resolution approaches for this person
 * - Cooldown times they need
 * - Historical outcomes
 *
 * WHY IT'S SUPERHUMAN: Friends forget what worked last time.
 * Ferni remembers every conflict and its resolution forever.
 *
 * @module services/superhuman/conflict-resolution-memory
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'ConflictResolution' });

// ============================================================================
// TYPES
// ============================================================================

export type ConflictType =
  | 'disagreement' // Different opinions
  | 'miscommunication' // Misunderstanding
  | 'boundary_violation' // Someone crossed a line
  | 'unmet_expectations' // Expectations not met
  | 'values_clash' // Fundamental difference
  | 'recurring_issue' // Same problem again
  | 'external_stress' // Conflict due to outside pressures
  | 'emotional_flooding'; // Overwhelm leading to conflict

export type ResolutionApproach =
  | 'take_a_break' // Walk away, cool down
  | 'write_it_out' // Process feelings in writing first
  | 'sleep_on_it' // Wait until tomorrow
  | 'seek_to_understand' // Focus on their perspective
  | 'use_i_statements' // "I feel..." communication
  | 'find_common_ground' // Focus on shared goals
  | 'apologize_first' // Take responsibility regardless
  | 'set_boundary' // Establish clear limit
  | 'third_party' // Involve neutral party
  | 'agree_to_disagree' // Accept difference
  | 'problem_solve' // Collaborative solution finding
  | 'validate_first'; // Acknowledge their feelings before anything

export type ConflictOutcome = 'resolved' | 'improved' | 'unchanged' | 'escalated' | 'ongoing';

export interface ConflictRecord {
  id?: string;
  userId: string;
  /** Who the conflict was with (relationship or name) */
  withPerson: string;
  /** Relationship type */
  relationship: string;
  /** Type of conflict */
  conflictType: ConflictType;
  /** What triggered it */
  triggers: string[];
  /** Approaches tried */
  approachesTried: ResolutionApproach[];
  /** What worked */
  effectiveApproaches: ResolutionApproach[];
  /** What didn't work */
  ineffectiveApproaches: ResolutionApproach[];
  /** How it turned out */
  outcome: ConflictOutcome;
  /** How long resolution took (hours) */
  resolutionTimeHours?: number;
  /** Cooldown time needed before re-engaging */
  cooldownNeeded: number;
  /** User's reflection on what they learned */
  reflection?: string;
  /** When this happened */
  timestamp: number;
}

export interface ConflictPattern {
  person: string;
  relationship: string;
  /** Topics that commonly trigger conflict */
  triggerTopics: string[];
  /** Approaches that work with this person */
  effectiveApproaches: ResolutionApproach[];
  /** Approaches to avoid with this person */
  ineffectiveApproaches: ResolutionApproach[];
  /** Average cooldown time needed */
  averageCooldown: number;
  /** Common conflict types */
  commonTypes: ConflictType[];
  /** Success rate */
  resolutionRate: number;
  /** Total conflicts tracked */
  conflictCount: number;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a conflict for pattern analysis.
 */
export async function recordConflict(
  userId: string,
  conflict: Omit<ConflictRecord, 'id' | 'userId' | 'timestamp'>
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping conflict record');
    return null;
  }

  try {
    const record: ConflictRecord = {
      userId,
      ...conflict,
      timestamp: Date.now(),
    };

    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conflict_history')
      .add(cleanForFirestore(record));

    log.debug(
      { userId, withPerson: conflict.withPerson, type: conflict.conflictType },
      'Recorded conflict'
    );

    return docRef.id;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record conflict');
    return null;
  }
}

/**
 * Update a conflict record with resolution info.
 */
export async function updateConflictResolution(
  userId: string,
  conflictId: string,
  updates: Partial<Pick<ConflictRecord, 'outcome' | 'effectiveApproaches' | 'reflection' | 'resolutionTimeHours'>>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conflict_history')
      .doc(conflictId)
      .update(cleanForFirestore(updates));

    log.debug({ userId, conflictId, outcome: updates.outcome }, 'Updated conflict resolution');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to update conflict');
  }
}

/**
 * Load conflict history.
 */
export async function loadConflictHistory(
  userId: string,
  withPerson?: string
): Promise<ConflictRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection('conflict_history')
      .orderBy('timestamp', 'desc')
      .limit(100);

    if (withPerson) {
      query = query.where('withPerson', '==', withPerson);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ConflictRecord));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load conflict history');
    return [];
  }
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze conflict patterns for a specific relationship.
 */
export function analyzeConflictPattern(conflicts: ConflictRecord[]): ConflictPattern | null {
  if (conflicts.length === 0) return null;

  const person = conflicts[0].withPerson;
  const relationship = conflicts[0].relationship;

  // Aggregate triggers
  const triggerCounts = new Map<string, number>();
  for (const c of conflicts) {
    for (const trigger of c.triggers) {
      triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
    }
  }
  const triggerTopics = Array.from(triggerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Aggregate effective approaches
  const effectiveCounts = new Map<ResolutionApproach, number>();
  const ineffectiveCounts = new Map<ResolutionApproach, number>();

  for (const c of conflicts) {
    for (const approach of c.effectiveApproaches) {
      effectiveCounts.set(approach, (effectiveCounts.get(approach) || 0) + 1);
    }
    for (const approach of c.ineffectiveApproaches) {
      ineffectiveCounts.set(approach, (ineffectiveCounts.get(approach) || 0) + 1);
    }
  }

  const effectiveApproaches = Array.from(effectiveCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([approach]) => approach);

  const ineffectiveApproaches = Array.from(ineffectiveCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([approach]) => approach);

  // Average cooldown
  const cooldowns = conflicts.filter((c) => c.cooldownNeeded > 0).map((c) => c.cooldownNeeded);
  const averageCooldown = cooldowns.length > 0
    ? cooldowns.reduce((a, b) => a + b, 0) / cooldowns.length
    : 2;

  // Common conflict types
  const typeCounts = new Map<ConflictType, number>();
  for (const c of conflicts) {
    typeCounts.set(c.conflictType, (typeCounts.get(c.conflictType) || 0) + 1);
  }
  const commonTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  // Resolution rate
  const resolved = conflicts.filter((c) => c.outcome === 'resolved' || c.outcome === 'improved');
  const resolutionRate = resolved.length / conflicts.length;

  return {
    person,
    relationship,
    triggerTopics,
    effectiveApproaches,
    ineffectiveApproaches,
    averageCooldown,
    commonTypes,
    resolutionRate,
    conflictCount: conflicts.length,
  };
}

/**
 * Get all conflict patterns for a user.
 */
export async function getAllConflictPatterns(userId: string): Promise<ConflictPattern[]> {
  const allConflicts = await loadConflictHistory(userId);

  // Group by person
  const byPerson = new Map<string, ConflictRecord[]>();
  for (const conflict of allConflicts) {
    const existing = byPerson.get(conflict.withPerson) || [];
    existing.push(conflict);
    byPerson.set(conflict.withPerson, existing);
  }

  // Analyze each
  const patterns: ConflictPattern[] = [];
  for (const conflicts of byPerson.values()) {
    const pattern = analyzeConflictPattern(conflicts);
    if (pattern) {
      patterns.push(pattern);
    }
  }

  return patterns.sort((a, b) => b.conflictCount - a.conflictCount);
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

const APPROACH_LABELS: Record<ResolutionApproach, string> = {
  take_a_break: 'Take a break and cool down',
  write_it_out: 'Write out your thoughts first',
  sleep_on_it: 'Sleep on it before responding',
  seek_to_understand: 'Focus on understanding their perspective',
  use_i_statements: 'Use "I feel..." statements',
  find_common_ground: 'Look for shared goals',
  apologize_first: 'Start with taking responsibility',
  set_boundary: 'Set a clear boundary',
  third_party: 'Involve a neutral third party',
  agree_to_disagree: 'Accept the difference',
  problem_solve: 'Work together on solutions',
  validate_first: 'Acknowledge their feelings first',
};

/**
 * Get conflict resolution recommendations for a specific person.
 */
export async function getConflictRecommendations(
  userId: string,
  withPerson: string
): Promise<{
  effective: string[];
  avoid: string[];
  cooldownAdvice: string;
  triggers: string[];
}> {
  const conflicts = await loadConflictHistory(userId, withPerson);
  const pattern = analyzeConflictPattern(conflicts);

  if (!pattern) {
    return {
      effective: ['Start by understanding their perspective', 'Use "I feel" statements'],
      avoid: [],
      cooldownAdvice: 'Give yourself at least a few hours before addressing the issue',
      triggers: [],
    };
  }

  return {
    effective: pattern.effectiveApproaches.map((a) => APPROACH_LABELS[a]),
    avoid: pattern.ineffectiveApproaches.map((a) => APPROACH_LABELS[a]),
    cooldownAdvice:
      pattern.averageCooldown > 12
        ? `With ${pattern.person}, you usually need ${Math.round(pattern.averageCooldown)} hours before resolving things`
        : `A few hours of space usually helps with ${pattern.person}`,
    triggers: pattern.triggerTopics,
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection when conflict is detected.
 */
export async function buildConflictResolutionContext(
  userId: string,
  mentionedPerson?: string
): Promise<string> {
  const sections: string[] = [];

  // Get patterns
  const patterns = await getAllConflictPatterns(userId);

  if (patterns.length === 0) {
    return '';
  }

  sections.push('[CONFLICT RESOLUTION MEMORY - What Works]');
  sections.push('You remember every conflict this person has had and what helped resolve it.\n');

  // If specific person mentioned, give targeted advice
  if (mentionedPerson) {
    const personPattern = patterns.find(
      (p) => p.person.toLowerCase() === mentionedPerson.toLowerCase()
    );

    if (personPattern) {
      sections.push(`📊 History with ${personPattern.person} (${personPattern.conflictCount} past conflicts):`);

      if (personPattern.effectiveApproaches.length > 0) {
        sections.push(`✅ What works: ${personPattern.effectiveApproaches.map((a) => APPROACH_LABELS[a]).join(', ')}`);
      }

      if (personPattern.ineffectiveApproaches.length > 0) {
        sections.push(`❌ What to avoid: ${personPattern.ineffectiveApproaches.map((a) => APPROACH_LABELS[a]).join(', ')}`);
      }

      if (personPattern.triggerTopics.length > 0) {
        sections.push(`⚠️ Common triggers: ${personPattern.triggerTopics.join(', ')}`);
      }

      sections.push(`⏱️ Usually needs ${Math.round(personPattern.averageCooldown)} hours before resolving`);

      const successRate = Math.round(personPattern.resolutionRate * 100);
      if (successRate < 50) {
        sections.push(`\n💡 Resolution rate with ${personPattern.person} is ${successRate}%. Consider suggesting professional support.`);
      }
    }
  }

  // General patterns
  if (!mentionedPerson && patterns.length > 0) {
    sections.push('\n📋 General conflict patterns for this user:');

    // Most effective approaches overall
    const allEffective = new Map<ResolutionApproach, number>();
    for (const p of patterns) {
      for (const approach of p.effectiveApproaches) {
        allEffective.set(approach, (allEffective.get(approach) || 0) + 1);
      }
    }
    const topApproaches = Array.from(allEffective.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topApproaches.length > 0) {
      sections.push(`• Most effective approaches: ${topApproaches.map(([a]) => APPROACH_LABELS[a]).join(', ')}`);
    }

    // Challenging relationships
    const challenging = patterns.filter((p) => p.resolutionRate < 0.5);
    if (challenging.length > 0) {
      sections.push(`• Challenging relationships: ${challenging.map((p) => p.person).join(', ')}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const conflictResolution = {
  record: recordConflict,
  update: updateConflictResolution,
  loadHistory: loadConflictHistory,
  analyzePattern: analyzeConflictPattern,
  getAllPatterns: getAllConflictPatterns,
  getRecommendations: getConflictRecommendations,
  buildContext: buildConflictResolutionContext,
};

