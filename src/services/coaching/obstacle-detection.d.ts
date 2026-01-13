/**
 * Obstacle Detection & Support
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When progress stalls, understand why and offer support.
 * Never shame, always understand.
 *
 * Philosophy:
 * - Obstacles are information, not failures
 * - Curiosity over judgment
 * - Sometimes the obstacle is the path
 *
 * @module ObstacleDetection
 */
export type ObstacleType = 'time' | 'energy' | 'fear' | 'perfectionism' | 'overwhelm' | 'unclear' | 'motivation' | 'external' | 'self_doubt' | 'competing_priorities' | 'emotional' | 'unknown';
export interface Obstacle {
    id: string;
    userId: string;
    goalId?: string;
    actionId?: string;
    description: string;
    type: ObstacleType;
    severity: 'minor' | 'moderate' | 'major';
    detectedAt: Date;
    status: 'active' | 'addressed' | 'resolved' | 'accepted';
    resolvedAt?: Date;
    resolutionNote?: string;
    supportOffered: string[];
    whatHelped?: string;
}
export interface ObstacleProfile {
    userId: string;
    obstacles: Obstacle[];
    patterns: ObstaclePattern[];
}
export interface ObstaclePattern {
    type: ObstacleType;
    frequency: number;
    lastSeen: Date;
    commonContexts: string[];
}
export interface ObstacleSupport {
    type: ObstacleType;
    acknowledgment: string;
    questions: string[];
    reframes: string[];
    suggestions: string[];
}
/**
 * Detect obstacles in user speech
 */
export declare function detectObstacle(userId: string, userMessage: string, context?: {
    goalId?: string;
    actionId?: string;
    topic?: string;
}): Obstacle | null;
/**
 * Get support content for an obstacle type
 */
export declare function getObstacleSupport(type: ObstacleType): ObstacleSupport;
/**
 * Generate a supportive response to an obstacle
 */
export declare function generateObstacleResponse(obstacle: Obstacle): {
    acknowledgment: string;
    question: string;
    ssml: string;
};
/**
 * Mark an obstacle as addressed (we talked about it)
 */
export declare function markObstacleAddressed(userId: string, obstacleId: string, supportOffered: string): void;
/**
 * Mark an obstacle as resolved
 */
export declare function markObstacleResolved(userId: string, obstacleId: string, whatHelped?: string): void;
/**
 * Get active obstacles for a user
 */
export declare function getActiveObstacles(userId: string): Obstacle[];
/**
 * Get obstacle patterns for a user
 */
export declare function getObstaclePatterns(userId: string): ObstaclePattern[];
/**
 * Get the most common obstacle type for a user
 */
export declare function getMostCommonObstacle(userId: string): ObstacleType | null;
/**
 * Build LLM context for obstacles
 */
export declare function buildObstacleContext(userId: string): string | null;
export declare function exportObstacleProfile(userId: string): ObstacleProfile | null;
export declare function importObstacleProfile(profile: ObstacleProfile): void;
declare const _default: {
    detectObstacle: typeof detectObstacle;
    getObstacleSupport: typeof getObstacleSupport;
    generateObstacleResponse: typeof generateObstacleResponse;
    markObstacleAddressed: typeof markObstacleAddressed;
    markObstacleResolved: typeof markObstacleResolved;
    getActiveObstacles: typeof getActiveObstacles;
    getObstaclePatterns: typeof getObstaclePatterns;
    getMostCommonObstacle: typeof getMostCommonObstacle;
    buildObstacleContext: typeof buildObstacleContext;
    exportObstacleProfile: typeof exportObstacleProfile;
    importObstacleProfile: typeof importObstacleProfile;
};
export default _default;
//# sourceMappingURL=obstacle-detection.d.ts.map