export type RelationshipType =
  | 'family'
  | 'friend'
  | 'partner'
  | 'coworker'
  | 'acquaintance'
  | 'professional'
  | 'unknown';

export interface Person {
  id: string;
  name: string;
  aliases: string[]; // "mom", "mother", "mama" -> same person
  relationship: RelationshipType;
  importance: number; // 0-1 based on mention frequency and emotional weight
  /** Important dates (birthdays, anniversaries) */
  importantDates: Array<{
    date: string; // MM-DD format
    type: 'birthday' | 'anniversary' | 'memorial' | 'other';
    label?: string;
  }>;
  /** Last time this person was mentioned */
  lastMentioned: Date;
  /** Total mention count */
  mentionCount: number;
  /** Average sentiment when discussing this person */
  averageSentiment: number;
  /** Topics often discussed about this person */
  associatedTopics: string[];
  /** Notes about the relationship */
  notes: string[];
  /** User-confirmed important person */
  isConfirmedImportant: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Mention {
  personId: string;
  timestamp: Date;
  sentiment: number; // -1 to 1
  context: string; // Brief snippet
  topics: string[];
  emotionalWeight: number; // How emotionally significant
}

export interface RelationshipPattern {
  personId: string;
  personName: string;
  pattern: 'positive_correlation' | 'negative_correlation' | 'neutral';
  description: string;
  confidence: number;
}

export interface WithdrawalAlert {
  personId: string;
  personName: string;
  daysSinceLastMention: number;
  usualFrequencyDays: number;
  significance: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface ImportantDate {
  personId: string;
  personName: string;
  date: Date;
  type: 'birthday' | 'anniversary' | 'memorial' | 'other';
  label?: string;
  daysUntil: number;
}

export interface SocialInsight {
  type: 'withdrawal' | 'pattern' | 'date' | 'sentiment';
  insight: string;
  suggestion?: string;
  personName: string;
  urgency: 'low' | 'medium' | 'high';
}
