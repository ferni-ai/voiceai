/**
 * Story Arc Tracking Types
 *
 * Track narrative threads across sessions. Remember cliffhangers,
 * unresolved tensions, and bring continuity to the user's story.
 *
 * @module @ferni/intelligence/story-tracking/types
 */

// ============================================================================
// STORY ARC TYPES
// ============================================================================

/**
 * A narrative thread in the user's life
 */
export interface StoryArc {
  /** Unique ID */
  id: string;

  /** Title/summary of the arc */
  title: string;

  /** Type of story */
  type: 'challenge' | 'growth' | 'relationship' | 'project' | 'decision' | 'exploration';

  /** Current status */
  status: 'active' | 'resolved' | 'paused' | 'abandoned';

  /** Key characters/people involved */
  characters: string[];

  /** Timeline events */
  events: StoryEvent[];

  /** Unresolved tensions */
  cliffhangers: Cliffhanger[];

  /** Emotional tone */
  emotionalTone: string;

  /** When started */
  startedAt: Date;

  /** Last updated */
  updatedAt: Date;

  /** Resolution if completed */
  resolution?: string;
}

/**
 * An event in a story arc
 */
export interface StoryEvent {
  /** When it happened */
  timestamp: Date;

  /** Session ID */
  sessionId: string;

  /** What happened */
  description: string;

  /** Emotional state */
  emotion: string;

  /** Significance (0-1) */
  significance: number;
}

/**
 * An unresolved tension or cliffhanger
 */
export interface Cliffhanger {
  /** Unique ID */
  id: string;

  /** The unresolved situation */
  situation: string;

  /** Last mentioned */
  lastMentioned: Date;

  /** Sessions where discussed */
  sessionIds: string[];

  /** Priority for follow-up */
  priority: 'high' | 'medium' | 'low';

  /** Is this resolved? */
  resolved: boolean;
}

// ============================================================================
// CONTINUITY TYPES
// ============================================================================

/**
 * Continuity prompt for session start
 */
export interface ContinuityPrompt {
  /** Type of prompt */
  type: 'follow-up' | 'check-in' | 'callback' | 'reminder';

  /** The prompt */
  prompt: string;

  /** Related arc */
  arcId?: string;

  /** Related cliffhanger */
  cliffhangerId?: string;

  /** Confidence this is appropriate */
  confidence: number;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Story Arc Tracking
 */
export interface IStoryArcTracker {
  /**
   * Create a new story arc
   */
  createArc(
    userId: string,
    arc: Omit<StoryArc, 'id' | 'events' | 'cliffhangers' | 'startedAt' | 'updatedAt'>
  ): Promise<StoryArc>;

  /**
   * Get all active arcs for user
   */
  getActiveArcs(userId: string): Promise<StoryArc[]>;

  /**
   * Get specific arc
   */
  getArc(userId: string, arcId: string): Promise<StoryArc | null>;

  /**
   * Add event to arc
   */
  addEvent(userId: string, arcId: string, event: Omit<StoryEvent, 'timestamp'>): Promise<void>;

  /**
   * Add cliffhanger to arc
   */
  addCliffhanger(
    userId: string,
    arcId: string,
    cliffhanger: Omit<Cliffhanger, 'id' | 'lastMentioned' | 'sessionIds' | 'resolved'>
  ): Promise<Cliffhanger>;

  /**
   * Resolve cliffhanger
   */
  resolveCliffhanger(userId: string, arcId: string, cliffhangerId: string): Promise<void>;

  /**
   * Get unresolved cliffhangers
   */
  getUnresolvedCliffhangers(userId: string): Promise<
    Array<{
      arc: StoryArc;
      cliffhanger: Cliffhanger;
    }>
  >;

  /**
   * Resolve arc
   */
  resolveArc(userId: string, arcId: string, resolution: string): Promise<void>;

  /**
   * Get continuity prompts for session start
   */
  getContinuityPrompts(userId: string): Promise<ContinuityPrompt[]>;

  /**
   * Build context injection for LLM
   */
  buildContextInjection(userId: string): Promise<string>;

  /**
   * Reset
   */
  reset(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

export const StoryArcTrackerToken = Symbol('StoryArcTracker');
