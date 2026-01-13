/**
 * Temporal Context Engine
 *
 * Awareness of life rhythms and temporal context.
 *
 * @module @ferni/conversation/temporal-context/engine
 */
import type { TemporalGuidance, TemporalState, UpcomingEvent } from './types.js';
export declare class TemporalContextEngine {
    private upcomingEvents;
    private lastCheckInTurn;
    private turnCount;
    constructor();
    /**
     * Get current temporal state
     */
    getState(now?: Date): TemporalState;
    /**
     * Get temporal guidance for response
     */
    getGuidance(turnCount: number, now?: Date): TemporalGuidance;
    /**
     * Get a closing appropriate for time
     */
    getClosing(now?: Date, context?: {
        emotion?: string;
        topic?: string;
    }): string;
    /**
     * Get a closing asynchronously with fresh LLM generation
     */
    getClosingAsync(now?: Date, context?: {
        emotion?: string;
        topic?: string;
    }): Promise<string>;
    /**
     * Record an upcoming event mentioned by user
     */
    recordEvent(description: string, date: Date, category: UpcomingEvent['category'], sentiment: UpcomingEvent['sentiment'], turnCount: number): void;
    /**
     * Extract events from user message
     */
    extractEvents(message: string, turnCount: number): UpcomingEvent[];
    /**
     * Mark event as followed up
     */
    markEventFollowedUp(description: string): void;
    /**
     * Get all events
     */
    getEvents(): UpcomingEvent[];
    /**
     * Reset for new session (keeps events)
     */
    resetSession(): void;
    /**
     * Full reset
     */
    reset(): void;
    private getTimeOfDay;
    private getDayType;
    private getTemporalMood;
    private getDaysUntilWeekend;
    private getSpecialContext;
    private getGreeting;
    private getContextualCheckIn;
    private getToneAdjustment;
    private getExpectedEnergy;
    private getEventFollowUp;
    private estimateDate;
    private estimateSentiment;
    private categorizeEvent;
}
export default TemporalContextEngine;
//# sourceMappingURL=engine.d.ts.map