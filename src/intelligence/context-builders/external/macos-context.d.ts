/**
 * macOS Context Builder
 *
 * Processes context from the macOS menubar app and generates
 * context strings for the agent's system prompt.
 *
 * The macOS app sends context via the LiveKit data channel as:
 * { type: "macos_context", payload: MacOSContextPayload, timestamp: number }
 *
 * "Better than Human" - Awareness that no human friend could consistently maintain:
 * - Real-time calendar awareness (next meeting in X minutes)
 * - Focus mode detection (adjust response length accordingly)
 * - App context awareness (knows you're coding vs. emailing)
 * - Screen time monitoring (gentle break suggestions)
 * - Selected text for instant help ("Help me with this")
 *
 * @module intelligence/context-builders/external/macos-context
 */
import { type ContextBuilder } from '../index.js';
export interface MacOSContextPayload {
    activeApp: string;
    windowTitle: string;
    selectedText?: string;
    /** True when user pressed Cmd+Shift+H "Help me with this" */
    helpMeWithThis?: boolean;
    upcomingEvent?: {
        title: string;
        inMinutes: number;
        attendees?: string[];
        notes?: string;
    };
    todaysEventCount: number;
    currentMeeting?: {
        title: string;
        remainingMinutes: number;
    };
    /** Whether user is currently in a meeting */
    isInMeeting?: boolean;
    isFocused: boolean;
    focusMode?: string;
    location?: string;
    /** Whether user is commuting */
    isCommuting?: boolean;
    topApp?: {
        name: string;
        minutesToday: number;
    };
    /** Total screen time today in minutes */
    totalMinutesToday?: number;
    /** Whether user needs a break */
    needsBreak?: boolean;
    /** Current app session duration in minutes */
    currentSessionMinutes?: number;
    upcomingBirthdays?: Array<{
        name: string;
        daysUntil: number;
    }>;
    /** Timestamp when context was captured (ms since epoch) */
    timestamp?: number;
}
export interface MacOSContextMessage {
    type: 'macos_context';
    payload: MacOSContextPayload;
    timestamp: number;
}
/**
 * Build a context string from macOS context for injection into system prompt
 */
export declare function buildMacOSContext(ctx: MacOSContextPayload): string;
/**
 * Parse a data channel message and extract macOS context if present
 */
export declare function parseMacOSContextMessage(data: Buffer | string): MacOSContextPayload | null;
/**
 * Generate proactive insights based on macOS context
 * These can be used by the agent to offer unprompted help
 */
export declare function generateContextInsights(ctx: MacOSContextPayload): string[];
export type WorkContextType = 'communication' | 'email' | 'coding' | 'terminal' | 'notes' | 'documents' | 'spreadsheet' | 'presentation' | 'browsing' | 'design' | 'media' | 'other';
/**
 * Classify the work context from the active app
 */
export declare function classifyWorkContext(activeApp: string): WorkContextType;
/**
 * Get suggested persona based on work context
 */
export declare function getSuggestedPersona(workContext: WorkContextType): string | null;
/**
 * macOS Context Builder
 *
 * Priority: 30 (runs early to inform other builders about user's desktop context)
 *
 * Reads macOS context from userData.macOS (stored by data-channel-handler)
 * and generates context injections for the LLM.
 */
export declare const macOSContextBuilder: ContextBuilder;
//# sourceMappingURL=macos-context.d.ts.map