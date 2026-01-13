/**
 * Live Backchanneling Session Management
 *
 * Session-scoped instance management for live backchanneling services.
 * Uses the centralized SessionRegistry pattern for consistent lifecycle management.
 */
import { BreathPauseDetector } from './breath-pause.js';
import { LiveBackchannelingService } from './service.js';
/**
 * Get or create a session-scoped LiveBackchannelingService
 */
export declare function getLiveBackchannelingService(sessionId?: string): LiveBackchannelingService;
/**
 * Get or create a session-scoped BreathPauseDetector
 */
export declare function getBreathPauseDetector(sessionId?: string): BreathPauseDetector;
/**
 * Reset live backchanneling for a specific session
 */
export declare function resetLiveBackchanneling(sessionId?: string): void;
/**
 * Reset all live backchanneling services
 */
export declare function resetAllLiveBackchanneling(): void;
/**
 * Get active session count (for debugging)
 */
export declare function getActiveLiveBackchannelSessionCount(): number;
/**
 * Check if a session has active live backchanneling
 */
export declare function hasLiveBackchanneling(sessionId: string): boolean;
/**
 * Get all active session IDs (for monitoring)
 */
export declare function getActiveLiveBackchannelSessionIds(): string[];
//# sourceMappingURL=session-management.d.ts.map