/**
 * Background Agent Result Types
 *
 * Unified type definitions for all background agent task results.
 * These types define what gets stored and reported back to users
 * when background tasks complete.
 *
 * "BETTER THAN HUMAN" - We track everything we do in the background
 * and report back like a thoughtful assistant would.
 */

import { z } from 'zod';

// ============================================================================
// RESULT TYPE ENUM
// ============================================================================

export const BackgroundResultTypeSchema = z.enum([
  'on_behalf_call',       // Phone call made on user's behalf
  'research_complete',    // Peter researched something
  'reservation_made',     // Jordan booked something
  'follow_up_sent',       // Alex sent a follow-up email/message
  'reminder_triggered',   // Maya's habit reminder fired
  'commitment_check',     // Checked on user's commitment
  'calendar_update',      // Calendar event created/modified
  'contact_updated',      // Contact info updated
  'email_sent',           // Email sent on behalf
  'task_completed',       // Generic background task completed
]);

export type BackgroundResultType = z.infer<typeof BackgroundResultTypeSchema>;

// ============================================================================
// PRIORITY LEVELS
// ============================================================================

export const ResultPrioritySchema = z.enum([
  'urgent',    // Tell them immediately (e.g., call with callback request)
  'high',      // Tell them soon (e.g., reservation confirmed)
  'normal',    // Tell them when convenient (e.g., research complete)
  'low',       // Mention if relevant (e.g., contact updated)
]);

export type ResultPriority = z.infer<typeof ResultPrioritySchema>;

// ============================================================================
// OUTCOME STATUS
// ============================================================================

export const OutcomeStatusSchema = z.enum([
  'success',           // Task completed successfully
  'partial_success',   // Partially completed (e.g., left voicemail)
  'failed',            // Task failed
  'requires_action',   // Needs user input to continue
  'pending',           // Still in progress
]);

export type OutcomeStatus = z.infer<typeof OutcomeStatusSchema>;

// ============================================================================
// BASE RESULT SCHEMA
// ============================================================================

export const BackgroundResultSchema = z.object({
  // Identity
  id: z.string(),
  userId: z.string(),
  type: BackgroundResultTypeSchema,
  
  // What happened
  status: OutcomeStatusSchema,
  summary: z.string(),           // Human-readable summary for the agent to speak
  details: z.string().optional(), // More details if needed
  
  // Priority for "while you were away" ordering
  priority: ResultPrioritySchema,
  
  // Related entities
  contactName: z.string().optional(),
  contactId: z.string().optional(),
  relatedTaskId: z.string().optional(),
  
  // Agent context
  initiatedBy: z.string(),       // Which persona initiated this
  completedBy: z.string().optional(), // Which persona completed (for handoffs)
  
  // Follow-up info
  requiresCallback: z.boolean().default(false),
  callbackTime: z.string().optional(),
  actionItems: z.array(z.string()).default([]),
  
  // Delivery tracking
  delivered: z.boolean().default(false),
  deliveredAt: z.string().optional(),
  deliveryMethod: z.enum(['voice', 'push', 'email', 'sms']).optional(),
  
  // Timestamps
  capturedAt: z.string(),
  expiresAt: z.string().optional(), // Results can expire (e.g., don't tell them about old things)
});

export type BackgroundResult = z.infer<typeof BackgroundResultSchema>;

// ============================================================================
// SPECIFIC RESULT TYPES
// ============================================================================

/**
 * On-behalf call result (existing functionality, now unified)
 */
export const CallResultSchema = BackgroundResultSchema.extend({
  type: z.literal('on_behalf_call'),
  callSpecific: z.object({
    callId: z.string(),
    phoneNumber: z.string().optional(),
    duration: z.number().optional(),  // seconds
    recordingUrl: z.string().optional(),
    transcript: z.string().optional(),
  }).optional(),
});

export type CallResult = z.infer<typeof CallResultSchema>;

/**
 * Research task result (Peter's specialty)
 */
export const ResearchResultSchema = BackgroundResultSchema.extend({
  type: z.literal('research_complete'),
  researchSpecific: z.object({
    query: z.string(),
    findings: z.array(z.object({
      title: z.string(),
      summary: z.string(),
      source: z.string().optional(),
      url: z.string().optional(),
      confidence: z.number().optional(),
    })),
    methodology: z.string().optional(),
  }).optional(),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;

/**
 * Reservation result (Jordan's specialty)
 */
export const ReservationResultSchema = BackgroundResultSchema.extend({
  type: z.literal('reservation_made'),
  reservationSpecific: z.object({
    venue: z.string(),
    dateTime: z.string(),
    partySize: z.number().optional(),
    confirmationNumber: z.string().optional(),
    specialRequests: z.string().optional(),
    cancellationPolicy: z.string().optional(),
  }).optional(),
});

export type ReservationResult = z.infer<typeof ReservationResultSchema>;

/**
 * Follow-up sent result (Alex's specialty)
 */
export const FollowUpResultSchema = BackgroundResultSchema.extend({
  type: z.literal('follow_up_sent'),
  followUpSpecific: z.object({
    channel: z.enum(['email', 'sms', 'linkedin', 'other']),
    recipient: z.string(),
    subject: z.string().optional(),
    messageSummary: z.string(),
    responseReceived: z.boolean().default(false),
    responseAt: z.string().optional(),
  }).optional(),
});

export type FollowUpResult = z.infer<typeof FollowUpResultSchema>;

/**
 * Commitment check result (Maya's specialty)
 */
export const CommitmentCheckResultSchema = BackgroundResultSchema.extend({
  type: z.literal('commitment_check'),
  commitmentSpecific: z.object({
    commitment: z.string(),
    wasCompleted: z.boolean().optional(),
    userResponse: z.string().optional(),
    nextCheckIn: z.string().optional(),
    streakCount: z.number().optional(),
  }).optional(),
});

export type CommitmentCheckResult = z.infer<typeof CommitmentCheckResultSchema>;

// ============================================================================
// UNION TYPE FOR ALL RESULTS
// ============================================================================

export type AnyBackgroundResult = 
  | CallResult 
  | ResearchResult 
  | ReservationResult 
  | FollowUpResult 
  | CommitmentCheckResult 
  | BackgroundResult;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new background result with defaults
 */
export function createBackgroundResult(
  partial: Partial<BackgroundResult> & Pick<BackgroundResult, 'userId' | 'type' | 'summary' | 'initiatedBy'>
): BackgroundResult {
  return {
    id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'success',
    priority: 'normal',
    delivered: false,
    actionItems: [],
    requiresCallback: false,
    capturedAt: new Date().toISOString(),
    ...partial,
  };
}

/**
 * Get a human-readable description for the result type
 */
export function getResultTypeDescription(type: BackgroundResultType): string {
  const descriptions: Record<BackgroundResultType, string> = {
    on_behalf_call: 'phone call',
    research_complete: 'research',
    reservation_made: 'reservation',
    follow_up_sent: 'follow-up message',
    reminder_triggered: 'reminder',
    commitment_check: 'commitment check',
    calendar_update: 'calendar update',
    contact_updated: 'contact update',
    email_sent: 'email',
    task_completed: 'task',
  };
  return descriptions[type] || 'task';
}

/**
 * Sort results by priority and recency for "while you were away" display
 */
export function sortResultsForDisplay(results: BackgroundResult[]): BackgroundResult[] {
  const priorityOrder: Record<ResultPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  
  return [...results].sort((a, b) => {
    // First by priority
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by recency (newer first)
    return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
  });
}
