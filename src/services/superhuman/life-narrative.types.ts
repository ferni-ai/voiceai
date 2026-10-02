/**
 * Life Narrative Types
 *
 * Chapter, identity and narrative-context shapes for life-narrative.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ChapterType =
  | 'struggle' // Hard times, challenges
  | 'growth' // Learning, development
  | 'triumph' // Victories, achievements
  | 'transition' // Life changes
  | 'loss' // Grief, endings
  | 'discovery' // Self-awareness moments
  | 'connection' // Relationship milestones
  | 'decision'; // Major choices

export type NarrativeArc =
  | 'hero_journey' // Struggle → growth → triumph
  | 'phoenix_rising' // Loss → rebuilding → renewal
  | 'coming_of_age' // Discovery → identity → purpose
  | 'healing' // Wound → processing → integration
  | 'transformation' // Old self → transition → new self
  | 'in_progress'; // Still unfolding

export interface LifeChapter {
  id: string;
  userId: string;

  // Chapter content
  title: string; // "The Month You Left Your Job"
  summary: string; // Brief description
  type: ChapterType;

  // When
  startDate: number;
  endDate?: number; // undefined = ongoing
  duration?: string; // "3 weeks", "ongoing"

  // Key elements
  keyQuotes: string[]; // User's own words
  keyPeople: string[]; // People involved
  keyEmotions: string[]; // Dominant emotions
  keyThemes: string[]; // Recurring themes

  // Growth tracking
  insightsGained: string[];
  strengthsRevealed: string[];
  patternsIdentified: string[];

  // Narrative position
  arcRole?: 'beginning' | 'middle' | 'climax' | 'resolution';
  precedingChapterId?: string;
  followingChapterId?: string;

  // Meta
  createdAt: number;
  lastUpdated: number;
  conversationCount: number; // How many conversations touched this
  /** Conversations this chapter was heard in (memory control cascades on these). */
  sourceConversationIds?: string[];
}

export interface IdentityEvolution {
  userId: string;

  // Core identity
  coreValues: string[];
  coreStrengths: string[];
  coreFears: string[];

  // Evolution tracking
  pastIdentityMarkers: string[]; // "Used to be..."
  currentIdentityMarkers: string[]; // "Now you are..."
  aspirationalIdentityMarkers: string[]; // "Becoming..."

  // Growth evidence
  transformations: Array<{
    from: string;
    to: string;
    when: number;
    evidence: string;
  }>;

  lastUpdated: number;
}

export interface NarrativeContext {
  currentChapter?: LifeChapter;
  recentChapters: LifeChapter[];
  activeArcs: NarrativeArc[];
  identityNow: string[];
  growthEvidence: string[];
  journeyMilestones: string[];
}
