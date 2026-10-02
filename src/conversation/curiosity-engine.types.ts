/**
 * Curiosity Engine - types
 *
 * @module conversation/curiosity-engine.types
 */

export interface ConversationThread {
  /** Unique ID */
  id: string;

  /** What was mentioned */
  content: string;

  /** Category of thread */
  category:
    | 'person'
    | 'event'
    | 'situation'
    | 'feeling'
    | 'goal'
    | 'problem'
    | 'story'
    | 'decision'
    | 'question';

  /** When first mentioned */
  introducedTurn: number;

  /** When last referenced */
  lastReferencedTurn: number;

  /** Is this resolved? */
  resolved: boolean;

  /** Context around the mention */
  context?: string;

  /** Importance level */
  importance: 'low' | 'medium' | 'high';

  /** Related details */
  details: string[];

  /** Times we've asked about it */
  followUpCount: number;
}

export interface LifeDetail {
  /** Category */
  category: 'person' | 'place' | 'job' | 'hobby' | 'pet' | 'relationship' | 'other';

  /** The detail */
  content: string;

  /** Name if applicable */
  name?: string;

  /** When learned */
  learnedTurn: number;

  /** Related threads */
  relatedThreads: string[];
}

export interface CuriosityPrompt {
  /** The question or prompt */
  question: string;

  /** Type of curiosity */
  type: 'follow_up' | 'detail_check' | 'life_investment' | 'deepening' | 'callback';

  /** Related thread ID */
  threadId?: string;

  /** Confidence this is appropriate */
  confidence: number;

  /** Is this time-sensitive? */
  timeSensitive: boolean;
}

export interface CuriosityState {
  /** Unresolved threads */
  unresolvedThreads: ConversationThread[];

  /** Life details we've learned */
  lifeDetails: LifeDetail[];

  /** Things we've been curious about */
  curiosityHistory: Array<{ question: string; turn: number; wasWellReceived?: boolean }>;

  /** Current turn */
  turnCount: number;
}
