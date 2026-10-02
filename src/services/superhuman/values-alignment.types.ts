/**
 * Values Alignment Types
 *
 * Value, conflict and profile shapes for values-alignment.ts.
 */

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

  // Provenance (memory control: services/life-story/values-store.ts)
  label?: string;
  source?: 'stated' | 'inferred' | 'user';
  userEdited?: boolean;
  sourceConversationIds?: string[];
  sourceFactIds?: string[];
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
