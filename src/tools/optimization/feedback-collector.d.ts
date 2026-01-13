/**
 * Feedback Collection System
 *
 * Collects both explicit and implicit user feedback on tool usage to power
 * automated recommendations and experimentation.
 *
 * Explicit Feedback:
 * - Direct ratings (1-5 stars, thumbs up/down)
 * - Verbal feedback ("that was helpful", "that didn't work")
 * - Feature requests ("I wish I could...")
 *
 * Implicit Feedback:
 * - Tool success/failure rates
 * - Retry patterns (user asks same thing again)
 * - Abandonment (user changes topic after tool use)
 * - Follow-up questions (indicates incomplete result)
 * - Time to next turn (long pause = confusion?)
 * - Tool sequences (what tools are used together)
 */
export type { FeedbackType, FeedbackRecord, FeedbackSummary, } from '../../types/optimization-types.js';
import type { FeedbackRecord, FeedbackSummary } from '../../types/optimization-types.js';
export interface ConversationContext {
    userId: string;
    sessionId: string;
    agentId: string;
    turnNumber: number;
    recentTools: string[];
    lastToolResult?: string;
}
export declare class FeedbackCollector {
    private feedbackBuffer;
    private readonly BUFFER_SIZE;
    private lastFeedbackByTool;
    private toolStats;
    private featureRequests;
    /**
     * Process a user message and extract feedback
     */
    processFeedback(message: string, context: ConversationContext, lastToolId?: string): FeedbackRecord | null;
    /**
     * Record explicit rating (e.g., from UI thumbs up/down)
     */
    recordRating(toolId: string, rating: number, // 1-5 or -1/1 for thumbs
    context: ConversationContext): void;
    /**
     * Update aggregated statistics
     */
    private updateStats;
    /**
     * Track feature requests
     */
    private trackFeatureRequest;
    /**
     * Get feedback summary for a tool
     */
    getToolFeedback(toolId: string): FeedbackSummary | null;
    /**
     * Get all tool feedback summaries
     */
    getAllFeedback(): FeedbackSummary[];
    /**
     * Get top feature requests
     */
    getTopFeatureRequests(limit?: number): Array<{
        capability: string;
        count: number;
        examples: string[];
    }>;
    /**
     * Get problematic tools (high negative feedback or retry rate)
     */
    getProblematicTools(): FeedbackSummary[];
    /**
     * Get highly rated tools
     */
    getTopRatedTools(limit?: number): FeedbackSummary[];
    /**
     * Flush feedback buffer to storage (Firestore)
     */
    flush(): Promise<void>;
    /**
     * Get all buffered feedback
     */
    getBufferedFeedback(): FeedbackRecord[];
}
export declare const feedbackCollector: FeedbackCollector;
export default feedbackCollector;
//# sourceMappingURL=feedback-collector.d.ts.map