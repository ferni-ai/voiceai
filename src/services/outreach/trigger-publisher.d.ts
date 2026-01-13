/**
 * Outreach Trigger Publisher
 *
 * PERFORMANCE FIX: Decouples trigger creation from voice agent.
 * Instead of loading 300k+ triggers into voice agent memory,
 * triggers are published to Pub/Sub for async processing by a worker.
 *
 * Architecture:
 * ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
 * │ Voice Agent │────>│   Pub/Sub   │────>│  Outreach Worker    │
 * │  (Producer) │     │   Topic     │     │ (Cloud Run Job)     │
 * └─────────────┘     └─────────────┘     └─────────────────────┘
 *
 * Benefits:
 * - Voice agent cold starts are instant (no trigger loading)
 * - Memory usage drops from 3.7GB to ~500MB
 * - Outreach failures don't affect voice functionality
 * - Triggers processed at scale by dedicated workers
 *
 * @module services/outreach/trigger-publisher
 */
import type { OutreachPriority, OutreachTriggerType } from './decision-engine.js';
export interface OutreachTriggerPayload {
    /** Unique trigger ID */
    id: string;
    /** User who will receive outreach */
    userId: string;
    /** Type of trigger */
    type: OutreachTriggerType;
    /** Priority level */
    priority: OutreachPriority;
    /** Human-readable reason for outreach */
    reason: string;
    /** When trigger was created */
    createdAt: string;
    /** When outreach should happen (ISO string) */
    scheduledFor?: string;
    /** Associated session ID */
    sessionId?: string;
    /** Persona that detected the trigger */
    personaId?: string;
    /** Additional context */
    context?: {
        /** Original commitment text */
        commitment?: string;
        /** Detected emotion */
        emotion?: string;
        /** Emotion intensity 0-1 */
        emotionIntensity?: number;
        /** Topics discussed */
        topics?: string[];
        /** Milestone achieved */
        milestone?: string;
        /** Number of sessions */
        sessionCount?: number;
        /** Days since last interaction */
        daysSinceLastInteraction?: number;
        /** Any additional metadata */
        metadata?: Record<string, unknown>;
    };
}
export interface TriggerPublishResult {
    /** Whether publish was successful */
    success: boolean;
    /** Trigger ID */
    triggerId: string;
    /** Pub/Sub message ID (if published) */
    messageId?: string;
    /** Error message (if failed) */
    error?: string;
}
declare function generateTriggerId(): string;
/**
 * Publish an outreach trigger to Pub/Sub for async processing
 *
 * This is the main entry point for creating outreach triggers.
 * The trigger will be processed by the Outreach Worker (Cloud Run Job).
 *
 * @example
 * ```typescript
 * import { publishOutreachTrigger } from './trigger-publisher';
 *
 * // User made a commitment
 * await publishOutreachTrigger({
 *   userId: 'user-123',
 *   type: 'commitment_check',
 *   priority: 'medium',
 *   reason: 'User committed to working out tomorrow morning',
 *   context: {
 *     commitment: 'morning workout',
 *   },
 * });
 * ```
 */
export declare function publishOutreachTrigger(trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'>): Promise<TriggerPublishResult>;
/**
 * Publish a commitment check trigger
 */
export declare function publishCommitmentTrigger(userId: string, commitment: string, scheduledFor: Date, options?: {
    sessionId?: string;
    personaId?: string;
    priority?: OutreachPriority;
}): Promise<TriggerPublishResult>;
/**
 * Publish an emotional support trigger
 */
export declare function publishEmotionalSupportTrigger(userId: string, emotion: string, intensity: number, options?: {
    sessionId?: string;
    personaId?: string;
    topics?: string[];
}): Promise<TriggerPublishResult>;
/**
 * Publish a milestone celebration trigger
 */
export declare function publishMilestoneTrigger(userId: string, milestone: string, options?: {
    sessionId?: string;
    personaId?: string;
    sessionCount?: number;
}): Promise<TriggerPublishResult>;
/**
 * Publish a check-in trigger (user hasn't been seen in a while)
 */
export declare function publishCheckInTrigger(userId: string, daysSinceLastInteraction: number, options?: {
    personaId?: string;
}): Promise<TriggerPublishResult>;
/**
 * Publish a thinking-of-you trigger (random kindness)
 */
export declare function publishThinkingOfYouTrigger(userId: string, reason: string, options?: {
    personaId?: string;
    metadata?: Record<string, unknown>;
}): Promise<TriggerPublishResult>;
/**
 * Publish multiple triggers in parallel
 */
export declare function publishOutreachTriggerBatch(triggers: Array<Omit<OutreachTriggerPayload, 'id' | 'createdAt'>>): Promise<TriggerPublishResult[]>;
export { generateTriggerId };
//# sourceMappingURL=trigger-publisher.d.ts.map