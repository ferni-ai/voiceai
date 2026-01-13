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
export declare const BackgroundResultTypeSchema: z.ZodEnum<{
    commitment_check: "commitment_check";
    task_completed: "task_completed";
    on_behalf_call: "on_behalf_call";
    research_complete: "research_complete";
    reservation_made: "reservation_made";
    follow_up_sent: "follow_up_sent";
    reminder_triggered: "reminder_triggered";
    calendar_update: "calendar_update";
    contact_updated: "contact_updated";
    email_sent: "email_sent";
}>;
export type BackgroundResultType = z.infer<typeof BackgroundResultTypeSchema>;
export declare const ResultPrioritySchema: z.ZodEnum<{
    low: "low";
    high: "high";
    normal: "normal";
    urgent: "urgent";
}>;
export type ResultPriority = z.infer<typeof ResultPrioritySchema>;
export declare const OutcomeStatusSchema: z.ZodEnum<{
    success: "success";
    pending: "pending";
    failed: "failed";
    partial_success: "partial_success";
    requires_action: "requires_action";
}>;
export type OutcomeStatus = z.infer<typeof OutcomeStatusSchema>;
export declare const BackgroundResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    type: z.ZodEnum<{
        commitment_check: "commitment_check";
        task_completed: "task_completed";
        on_behalf_call: "on_behalf_call";
        research_complete: "research_complete";
        reservation_made: "reservation_made";
        follow_up_sent: "follow_up_sent";
        reminder_triggered: "reminder_triggered";
        calendar_update: "calendar_update";
        contact_updated: "contact_updated";
        email_sent: "email_sent";
    }>;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BackgroundResult = z.infer<typeof BackgroundResultSchema>;
/**
 * On-behalf call result (existing functionality, now unified)
 */
export declare const CallResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"on_behalf_call">;
    callSpecific: z.ZodOptional<z.ZodObject<{
        callId: z.ZodString;
        phoneNumber: z.ZodOptional<z.ZodString>;
        duration: z.ZodOptional<z.ZodNumber>;
        recordingUrl: z.ZodOptional<z.ZodString>;
        transcript: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CallResult = z.infer<typeof CallResultSchema>;
/**
 * Research task result (Peter's specialty)
 */
export declare const ResearchResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"research_complete">;
    researchSpecific: z.ZodOptional<z.ZodObject<{
        query: z.ZodString;
        findings: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            summary: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        methodology: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
/**
 * Reservation result (Jordan's specialty)
 */
export declare const ReservationResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"reservation_made">;
    reservationSpecific: z.ZodOptional<z.ZodObject<{
        venue: z.ZodString;
        dateTime: z.ZodString;
        partySize: z.ZodOptional<z.ZodNumber>;
        confirmationNumber: z.ZodOptional<z.ZodString>;
        specialRequests: z.ZodOptional<z.ZodString>;
        cancellationPolicy: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ReservationResult = z.infer<typeof ReservationResultSchema>;
/**
 * Follow-up sent result (Alex's specialty)
 */
export declare const FollowUpResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"follow_up_sent">;
    followUpSpecific: z.ZodOptional<z.ZodObject<{
        channel: z.ZodEnum<{
            email: "email";
            other: "other";
            sms: "sms";
            linkedin: "linkedin";
        }>;
        recipient: z.ZodString;
        subject: z.ZodOptional<z.ZodString>;
        messageSummary: z.ZodString;
        responseReceived: z.ZodDefault<z.ZodBoolean>;
        responseAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FollowUpResult = z.infer<typeof FollowUpResultSchema>;
/**
 * Commitment check result (Maya's specialty)
 */
export declare const CommitmentCheckResultSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
        partial_success: "partial_success";
        requires_action: "requires_action";
    }>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        low: "low";
        high: "high";
        normal: "normal";
        urgent: "urgent";
    }>;
    contactName: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    relatedTaskId: z.ZodOptional<z.ZodString>;
    initiatedBy: z.ZodString;
    completedBy: z.ZodOptional<z.ZodString>;
    requiresCallback: z.ZodDefault<z.ZodBoolean>;
    callbackTime: z.ZodOptional<z.ZodString>;
    actionItems: z.ZodDefault<z.ZodArray<z.ZodString>>;
    delivered: z.ZodDefault<z.ZodBoolean>;
    deliveredAt: z.ZodOptional<z.ZodString>;
    deliveryMethod: z.ZodOptional<z.ZodEnum<{
        voice: "voice";
        push: "push";
        email: "email";
        sms: "sms";
    }>>;
    capturedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"commitment_check">;
    commitmentSpecific: z.ZodOptional<z.ZodObject<{
        commitment: z.ZodString;
        wasCompleted: z.ZodOptional<z.ZodBoolean>;
        userResponse: z.ZodOptional<z.ZodString>;
        nextCheckIn: z.ZodOptional<z.ZodString>;
        streakCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CommitmentCheckResult = z.infer<typeof CommitmentCheckResultSchema>;
export type AnyBackgroundResult = CallResult | ResearchResult | ReservationResult | FollowUpResult | CommitmentCheckResult | BackgroundResult;
/**
 * Create a new background result with defaults
 */
export declare function createBackgroundResult(partial: Partial<BackgroundResult> & Pick<BackgroundResult, 'userId' | 'type' | 'summary' | 'initiatedBy'>): BackgroundResult;
/**
 * Get a human-readable description for the result type
 */
export declare function getResultTypeDescription(type: BackgroundResultType): string;
/**
 * Sort results by priority and recency for "while you were away" display
 */
export declare function sortResultsForDisplay(results: BackgroundResult[]): BackgroundResult[];
//# sourceMappingURL=result-types.d.ts.map