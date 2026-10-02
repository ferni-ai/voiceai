/**
 * Data Export Categories
 *
 * Public types and the exportable category catalog for data-export.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExportCategory {
  category: string;
  description: string;
  itemCount: number;
  exportable: boolean;
  icon?: string;
}

export interface ExportData {
  exportedAt: string;
  userId: string;
  version: string;
  categories: Record<string, unknown>;
}

export type ExportFormat = 'json' | 'csv';

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * All exportable data categories with their descriptions.
 */
export const EXPORT_CATEGORIES = {
  Memories: {
    description: 'Facts, people, full conversation transcripts and summaries Ferni remembers',
    icon: 'brain',
  },
  Conversations: {
    description: 'All conversation transcripts and metadata',
    icon: 'message-circle',
  },
  Insights: {
    description: 'What Ferni has learned about you',
    icon: 'lightbulb',
  },
  Rituals: {
    description: 'Daily practice history and streaks',
    icon: 'sun',
  },
  Predictions: {
    description: 'Your predictions and outcomes',
    icon: 'target',
  },
  'Mood History': {
    description: 'Emotional weather records',
    icon: 'cloud-sun',
  },
  Profile: {
    description: 'Your profile and preferences',
    icon: 'user',
  },
  Contacts: {
    description: 'Your people and relationships',
    icon: 'users',
  },
  'Trust Journey': {
    description: 'Your growth, boundaries, and shared moments',
    icon: 'heart',
  },
  Wellbeing: {
    description: 'Wellness snapshots and trends',
    icon: 'activity',
  },
  Habits: {
    description: "Maya's habit coaching data",
    icon: 'repeat',
  },
  Productivity: {
    description: 'Tasks, notes, and journal entries',
    icon: 'check-square',
  },
} as const;
