/**
 * Workflow Engine
 *
 * Executes automated workflows based on triggers.
 * Supports time-based, event-based, and voice triggers.
 *
 * @module services/workflows/workflow-engine
 */
import { type Workflow, type WorkflowExecution, type WorkflowTemplate } from '../stores/workflow-store.js';
export interface WorkflowContext {
    userId: string;
    workflowId: string;
    executionId: string;
    triggeredBy: string;
    triggeredAt: Date;
    variables: Record<string, unknown>;
}
export interface ActionResult {
    success: boolean;
    output?: unknown;
    error?: string;
}
export declare class WorkflowEngine {
    private userId;
    private running;
    private checkInterval?;
    constructor(userId: string);
    /**
     * Start the workflow engine
     */
    start(): void;
    /**
     * Stop the workflow engine
     */
    stop(): void;
    /**
     * Check for time-based triggers
     */
    checkTimeTriggers(): Promise<void>;
    /**
     * Simple cron matcher (handles basic HH:MM patterns)
     * TODO: Use a proper cron parser for full cron support
     */
    private cronMatchesNow;
    /**
     * Handle a phrase trigger
     */
    handlePhraseTrigger(phrase: string): Promise<Workflow | null>;
    /**
     * Handle an event trigger
     */
    handleEventTrigger(eventType: string, eventData?: Record<string, unknown>): Promise<void>;
    /**
     * Handle a calendar event trigger
     * Called when a calendar event starts, ends, or reminder fires
     */
    handleCalendarTrigger(eventType: 'event_start' | 'event_end' | 'event_reminder', calendarEvent: {
        title: string;
        calendarId?: string;
        isAllDay?: boolean;
    }): Promise<void>;
    /**
     * Handle a habit streak trigger
     * Called when habits are logged, missed, or streaks change
     */
    handleHabitTrigger(habitEvent: 'habit_logged' | 'habit_missed' | 'streak_achieved' | 'streak_broken', habitData: {
        habitId: string;
        habitName: string;
        streak?: number;
        daysInactive?: number;
    }): Promise<void>;
    /**
     * Handle a location trigger
     * Called when user enters or exits a geofence
     */
    handleLocationTrigger(action: 'enter' | 'exit', location: {
        name?: string;
        latitude: number;
        longitude: number;
    }): Promise<void>;
    /**
     * Calculate distance between two points in meters (Haversine formula)
     */
    private haversineDistance;
    /**
     * Execute a workflow
     */
    executeWorkflow(workflow: Workflow, triggeredBy: string, eventData?: Record<string, unknown>): Promise<WorkflowExecution>;
    /**
     * Evaluate workflow conditions
     */
    private evaluateConditions;
    /**
     * Execute a single action using the REAL action executor
     * This calls actual services: push notifications, Spotify, habits, smart home, etc.
     */
    private executeAction;
    private delay;
}
export { WorkflowTemplate };
export declare const WORKFLOW_TEMPLATES: WorkflowTemplate[];
export declare function getWorkflowEngine(userId: string): WorkflowEngine;
export declare function resetWorkflowEngine(userId: string): void;
//# sourceMappingURL=workflow-engine.d.ts.map