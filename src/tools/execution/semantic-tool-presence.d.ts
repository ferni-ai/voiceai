/**
 * Semantic Tool Presence System
 *
 * "Better than Human" tool feedback that adapts to user emotional state.
 *
 * Philosophy:
 * - When humans help each other, they show presence and care during waits
 * - Robotic feedback ("Checking...") feels transactional
 * - Semantic feedback matches emotional context and relationship depth
 *
 * This module provides:
 * 1. Emotion-aware verbal feedback during tool execution
 * 2. "Still here" presence signals for long operations
 * 3. Tool timing context for natural LLM framing
 *
 * @module semantic-tool-presence
 */
import { EventEmitter } from 'events';
export type ToolStatus = 'starting' | 'executing' | 'waiting' | 'completing' | 'failed';
export type EmotionalContext = 'calm' | 'anxious' | 'excited' | 'sad' | 'stressed' | 'curious' | 'tired' | 'neutral';
export type RelationshipStage = 'new' | 'familiar' | 'trusted' | 'deep';
export interface ToolExecutionContext {
    toolName: string;
    sessionId: string;
    userId: string;
    personaId: string;
    startTime: number;
    userEmotion?: EmotionalContext;
    relationshipStage?: RelationshipStage;
    isTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late-night';
}
export interface PresenceFeedback {
    text: string;
    timing: 'immediate' | 'delayed' | 'progressive';
    emotion?: string;
    speedRatio?: number;
    shouldSpeak: boolean;
    reason: string;
}
export interface ToolTimingContext {
    toolName: string;
    durationMs: number;
    wasLong: boolean;
    wasVeryLong: boolean;
    userWasPatient: boolean;
    framingHint: string;
}
/**
 * Emotion-aware presence patterns.
 * Each pattern provides natural language that matches the emotional context.
 *
 * These are NOT robotic phrases - they're natural presence signals.
 */
declare const PRESENCE_PATTERNS: Record<EmotionalContext, {
    initial: string[];
    stillHere: string[];
    completion: string[];
}>;
/**
 * Time-of-day modifiers for more natural presence.
 */
declare const TIME_MODIFIERS: Record<string, {
    speedAdjust: number;
    pauseMultiplier: number;
}>;
/**
 * Tool category to semantic meaning mapping.
 * Helps us understand what the tool is doing conceptually.
 */
declare const TOOL_SEMANTICS: Record<string, {
    action: string;
    domain: string;
}>;
/**
 * Select appropriate presence feedback based on context.
 * This is the core "Better than Human" logic.
 */
export declare function selectPresenceFeedback(phase: 'initial' | 'stillHere' | 'completion', context: ToolExecutionContext, elapsedMs: number): PresenceFeedback;
/**
 * Generate context for the LLM about tool execution timing.
 * This helps the LLM frame its response naturally.
 */
export declare function generateToolTimingContext(toolName: string, durationMs: number, userWasPatient?: boolean): ToolTimingContext;
/**
 * Event emitter for tool execution lifecycle.
 * Enables real-time status updates to voice layer.
 */
export declare const toolPresenceEvents: EventEmitter<[never]>;
export interface ToolPresenceEvent {
    type: 'start' | 'progress' | 'complete' | 'error';
    context: ToolExecutionContext;
    elapsedMs: number;
    feedback?: PresenceFeedback;
    error?: string;
}
/**
 * Emit a tool presence event.
 * Voice layer listens to these for real-time feedback.
 */
export declare function emitToolPresence(event: ToolPresenceEvent): void;
/**
 * Start tracking a tool execution for semantic presence.
 */
export declare function startToolPresence(context: ToolExecutionContext, onProgress?: (feedback: PresenceFeedback) => void): void;
/**
 * Stop tracking a tool execution.
 */
export declare function stopToolPresence(sessionId: string, toolName: string): ToolTimingContext | null;
/**
 * Clean up all tool presence for a session.
 */
export declare function cleanupSessionToolPresence(sessionId: string): void;
/**
 * Generate LLM context injection about recent tool executions.
 * This helps the LLM frame its response naturally.
 */
export declare function generateToolContextInjection(timingContexts: ToolTimingContext[]): string;
export { PRESENCE_PATTERNS, TIME_MODIFIERS, TOOL_SEMANTICS };
//# sourceMappingURL=semantic-tool-presence.d.ts.map