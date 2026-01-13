/**
 * Conversation Semantic Trajectory
 *
 * Tracks how the semantic space shifts across a conversation in real-time.
 *
 * Enables:
 * - Detecting when conversation is circling an avoided topic
 * - Measuring semantic drift (how far from starting point)
 * - Tracking depth progression (surface → deep)
 * - Identifying topic coherence vs. scattered conversations
 *
 * @module intelligence/predictive/embeddings/conversation-trajectory
 */
export interface TurnEmbedding {
    turnNumber: number;
    timestamp: number;
    embedding: number[];
    text: string;
    speaker: 'user' | 'agent';
    emotionalValence: number;
    topicDepth: number;
}
export interface ConversationTrajectory {
    sessionId: string;
    userId: string;
    startTime: number;
    turns: TurnEmbedding[];
    metrics: {
        semanticDrift: number;
        topicCoherence: number;
        depthProgression: number;
        emotionalArc: number;
        avoidanceProximity: number;
        circlingDetected: boolean;
        circlingTopic?: string;
    };
    pivotPoints: Array<{
        turnNumber: number;
        description: string;
        type: 'topic_shift' | 'depth_increase' | 'emotional_peak' | 'avoidance_approach';
    }>;
}
export interface TrajectoryAnalysis {
    pattern: 'linear' | 'spiral' | 'wandering' | 'deepening' | 'circling' | 'avoiding';
    depth: 'surface' | 'moderate' | 'deep';
    coherence: 'scattered' | 'moderate' | 'focused';
    emotionalDirection: 'improving' | 'declining' | 'stable' | 'volatile';
    recommendations: string[];
}
/**
 * Start tracking a conversation trajectory
 */
export declare function startTrajectory(sessionId: string, userId: string): ConversationTrajectory;
/**
 * Record a turn and update trajectory
 */
export declare function recordTurn(sessionId: string, turn: {
    text: string;
    speaker: 'user' | 'agent';
    emotionalValence?: number;
    topicDepth?: number;
}, avoidedTopicEmbeddings?: number[][]): Promise<ConversationTrajectory | null>;
/**
 * Get current trajectory state
 */
export declare function getTrajectory(sessionId: string): ConversationTrajectory | null;
/**
 * Analyze the trajectory pattern
 */
export declare function analyzeTrajectory(sessionId: string): TrajectoryAnalysis | null;
/**
 * Check if conversation is approaching avoided territory
 */
export declare function checkAvoidanceApproach(sessionId: string, avoidedTopicEmbeddings: number[][]): Promise<{
    approaching: boolean;
    distance: number;
    direction: 'toward' | 'away' | 'stable';
    nearestTopic?: number;
}>;
/**
 * Get semantic distance between two points in conversation
 */
export declare function getSemanticDistance(sessionId: string, turnA: number, turnB: number): number | null;
/**
 * End trajectory tracking
 */
export declare function endTrajectory(sessionId: string): ConversationTrajectory | null;
/**
 * Build conversation trajectory context for LLM
 */
export declare function buildTrajectoryContext(sessionId: string): string;
export declare const conversationTrajectory: {
    startTrajectory: typeof startTrajectory;
    recordTurn: typeof recordTurn;
    getTrajectory: typeof getTrajectory;
    analyzeTrajectory: typeof analyzeTrajectory;
    checkAvoidanceApproach: typeof checkAvoidanceApproach;
    getSemanticDistance: typeof getSemanticDistance;
    endTrajectory: typeof endTrajectory;
    buildTrajectoryContext: typeof buildTrajectoryContext;
};
export default conversationTrajectory;
//# sourceMappingURL=conversation-trajectory.d.ts.map