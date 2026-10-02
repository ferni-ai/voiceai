/**
 * Commitment Keeper Types
 *
 * Commitment, follow-up and detection shapes for commitment-keeper.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export type CommitmentType =
  | 'intention' // "I'm going to..." - soft commitment
  | 'promise' // "I promise..." - strong commitment
  | 'goal' // "My goal is..." - aspirational
  | 'boundary' // "I need to stop..." - self-protection
  | 'conversation' // "I need to talk to..." - interpersonal
  | 'decision' // "I've decided..." - firm choice
  | 'experiment'; // "I'm going to try..." - exploratory;

export type CommitmentStatus =
  | 'active' // Still working toward it
  | 'completed' // User confirmed done
  | 'deferred' // Postponed with reason
  | 'abandoned' // User decided not to pursue
  | 'unclear'; // Need to check in

export type FollowUpTone =
  | 'curious' // "How did it go?"
  | 'supportive' // "No pressure, just thinking of you"
  | 'celebratory' // "Tell me everything!"
  | 'gentle' // "I know this was hard..."
  | 'patient'; // "Whenever you're ready"

export interface Commitment {
  id: string;
  userId: string;

  // What they committed to
  statement: string; // Original words
  summary: string; // Condensed version
  text: string; // Alias for summary (for calendar integration)
  type: CommitmentType;

  // Context
  topic?: string; // What were we discussing
  emotionalWeight: number; // 0-1 how significant this feels
  personInvolved?: string; // If about a relationship/conversation
  personaId?: string; // Which persona captured this commitment

  // Timing
  createdAt: number;
  targetDate?: number; // When they said they'd do it
  lastMentioned: number;
  followUpAfter: number; // When to check in

  // Status
  status: CommitmentStatus;
  followUpCount: number;
  lastFollowUp?: number;

  // Learning
  userReactionToFollowUp?: 'appreciated' | 'annoyed' | 'neutral';

  // Calendar integration (Better Than Human)
  calendarEventIds?: string[]; // Events created for this commitment
  feasibilityScore?: number; // 0-100, how feasible given calendar
  duration?: number; // Duration in minutes for recurring commitments
  frequency?: { times: number; period: string }; // e.g., { times: 3, period: 'week' }
  preferredTime?: string; // 'morning', 'afternoon', 'evening'
}

export interface CommitmentFollowUp {
  commitmentId: string;
  tone: FollowUpTone;
  message: string;
  shouldSurface: boolean;
  urgency: 'low' | 'normal' | 'high';
}

export interface CommitmentDetectionResult {
  detected: boolean;
  commitment?: Omit<
    Commitment,
    'id' | 'createdAt' | 'lastMentioned' | 'followUpAfter' | 'status' | 'followUpCount'
  >;
  confidence: number;
}
