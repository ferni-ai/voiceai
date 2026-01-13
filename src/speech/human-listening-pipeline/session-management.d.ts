/**
 * Human Listening Pipeline Session Management
 *
 * Session-scoped instance management for the pipeline.
 */
import { HumanListeningPipeline } from './pipeline.js';
/**
 * Get or create a Human Listening Pipeline for a session
 */
export declare function getHumanListeningPipeline(sessionId: string): HumanListeningPipeline;
/**
 * Reset pipeline for a specific session
 */
export declare function resetHumanListeningPipeline(sessionId: string): void;
/**
 * Reset all pipeline instances
 */
export declare function resetAllHumanListeningPipelines(): void;
//# sourceMappingURL=session-management.d.ts.map