/**
 * Voice Humanization Session Management
 *
 * Session-scoped instance management for the voice humanization service.
 * Uses the centralized SessionRegistry pattern for consistent lifecycle management.
 */
import { VoiceHumanizationService } from './service.js';
/**
 * Get or create voice humanization service for a session
 */
export declare function getVoiceHumanizationService(sessionId: string): VoiceHumanizationService;
/**
 * Reset voice humanization service for a session
 */
export declare function resetVoiceHumanization(sessionId: string): void;
/**
 * Reset all instances
 */
export declare function resetAllVoiceHumanization(): void;
/**
 * Get count of active sessions
 */
export declare function getActiveVoiceHumanizationCount(): number;
/**
 * Check if a session has an active voice humanization service
 */
export declare function hasVoiceHumanization(sessionId: string): boolean;
/**
 * Get all active session IDs (for monitoring/debugging)
 */
export declare function getActiveVoiceHumanizationSessionIds(): string[];
//# sourceMappingURL=session-management.d.ts.map