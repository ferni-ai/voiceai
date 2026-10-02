/**
 * Relationship Events - types
 *
 * @module conversation/relationship-events.types
 */

export type MilestoneType =
  | 'first_session' // Very first conversation
  | 'first_vulnerability' // First time they opened up
  | 'first_breakthrough' // First major insight
  | 'first_inside_joke' // First shared joke/reference
  | 'session_milestone' // 10th, 25th, 50th, 100th session
  | 'time_milestone' // 1 week, 1 month, 6 months, 1 year
  | 'growth_recognition' // Recognizing a pattern of growth
  | 'callback_moment' // Referencing something from early on
  | 'relationship_acknowledgment'; // "We've built something real"

export interface RelationshipMilestone {
  /** Unique ID */
  id: string;

  /** Type of milestone */
  type: MilestoneType;

  /** When it happened */
  date: Date;

  /** Session number when it occurred */
  sessionNumber: number;

  /** Description */
  description: string;

  /** Has it been acknowledged to user? */
  acknowledged: boolean;

  /** Emotional significance (0-1) */
  significance: number;

  /** Related content/context */
  context?: string;
}

export interface SharedMemory {
  /** What the memory is */
  content: string;

  /** When it was created */
  date: Date;

  /** Category */
  category: 'joke' | 'phrase' | 'story' | 'reference' | 'nickname';

  /** Times referenced */
  referenceCount: number;

  /** Last referenced */
  lastReferenced?: Date;
}

export interface RelationshipState {
  /** First session date */
  firstSessionDate: Date | null;

  /** Total session count */
  totalSessions: number;

  /** Current session number */
  currentSession: number;

  /** All milestones */
  milestones: RelationshipMilestone[];

  /** Shared memories (inside jokes, etc.) */
  sharedMemories: SharedMemory[];

  /** Relationship depth score (0-1) */
  depthScore: number;

  /** Topics that define the relationship */
  definingTopics: string[];

  /** Significant dates to remember */
  significantDates: Array<{ date: Date; description: string }>;
}

export interface MilestoneOpportunity {
  /** Type of milestone */
  type: MilestoneType;

  /** Acknowledgment phrase */
  phrase: string;

  /** Significance */
  significance: number;

  /** Should we acknowledge this turn? */
  shouldAcknowledge: boolean;
}
