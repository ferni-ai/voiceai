/**
 * CEO Coaching Domain Types
 *
 * Data models for the CEO personal coaching system.
 * Enables voice-based tracking of wins, energy, decisions, priorities, and more.
 */

/**
 * A logged achievement or win
 */
export interface CEOWin {
  id: string;
  text: string;
  date: string; // ISO date (YYYY-MM-DD)
  category?: 'work' | 'personal' | 'health' | 'relationships' | 'growth';
  createdAt: string; // ISO timestamp
}

/**
 * An energy level log entry
 */
export interface CEOEnergy {
  id: string;
  level: number; // 1-10 scale
  timestamp: string; // ISO timestamp
  note?: string;
}

/**
 * A tracked decision
 */
export interface CEODecision {
  id: string;
  description: string;
  status: 'pending' | 'made' | 'deferred';
  context?: string; // Why this decision matters
  outcome?: string; // Result after decision was made
  deadline?: string; // Optional deadline for time-sensitive decisions (ISO date)
  createdAt: string;
  decidedAt?: string;
}

/**
 * A priority in the user's stack
 */
export interface CEOPriority {
  id: string;
  text: string;
  order: number; // Stack order (1 = top)
  status: 'active' | 'completed';
  createdAt: string;
  completedAt?: string;
}

/**
 * A blocker preventing progress
 */
export interface CEOBlocker {
  id: string;
  text: string;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

/**
 * A captured idea
 */
export interface CEOIdea {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
}

/**
 * A focus session
 */
export interface CEOFocusSession {
  id: string;
  task?: string; // What they're focusing on
  durationMinutes: number;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
}

/**
 * A quick journal entry
 */
export interface CEOJournalEntry {
  id: string;
  text: string;
  timestamp: string;
  mood?: 'great' | 'good' | 'okay' | 'low' | 'rough';
}

/**
 * A gratitude entry
 */
export interface CEOGratitude {
  id: string;
  text: string;
  date: string; // ISO date
  createdAt: string;
}

/**
 * A daily reflection
 */
export interface CEOReflection {
  id: string;
  date: string; // ISO date
  highlights: string[];
  challenges: string[];
  tomorrow: string[];
  createdAt: string;
}

/**
 * Weekly review summary
 */
export interface CEOWeeklyReview {
  id: string;
  weekStart: string; // ISO date (Monday)
  weekEnd: string; // ISO date (Sunday)
  wins: string[];
  learnings: string[];
  nextWeekFocus: string[];
  energyAverage?: number;
  createdAt: string;
}

/**
 * Aggregated state for context injection
 */
export interface CEOCoachingState {
  recentWins: CEOWin[];
  currentPriorities: CEOPriority[];
  activeBlockers: CEOBlocker[];
  pendingDecisions: CEODecision[];
  energyTrend: {
    current?: number;
    weekAverage?: number;
    trend: 'up' | 'down' | 'stable';
  };
  recentGratitude: CEOGratitude[];
  activeFocusSession?: CEOFocusSession;
}

/**
 * Tool execution context for CEO coaching
 */
export interface CEOToolContext {
  userId: string;
  personaId?: string;
  sessionId?: string;
}
