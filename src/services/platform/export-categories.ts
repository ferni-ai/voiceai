/**
 * The categories "Take your story" offers, with what each holds.
 *
 * @module services/platform/export-categories
 */

/**
 * All exportable data categories with their descriptions.
 */
export const EXPORT_CATEGORIES = {
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
  'Answer Cards': {
    description: 'Answers and picks Ferni sent you, with their sources',
    icon: 'link',
  },
  Records: {
    description: 'Every call, summary, event, note and memory I keep for you, as stored',
    icon: 'archive',
  },
} as const;
