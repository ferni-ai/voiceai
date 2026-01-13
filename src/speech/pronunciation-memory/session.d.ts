/**
 * Pronunciation Memory Session Management
 *
 * @module speech/pronunciation-memory/session
 */
import { PronunciationMemoryService } from './service.js';
/**
 * Get or create pronunciation memory for a session
 */
export declare function getPronunciationMemory(sessionId: string): PronunciationMemoryService;
/**
 * Reset pronunciation memory for a session
 */
export declare function resetPronunciationMemory(sessionId: string): void;
/**
 * Reset all pronunciation memories
 */
export declare function resetAllPronunciationMemory(): void;
/**
 * Check if pronunciation memory exists for a session
 */
export declare function hasPronunciationMemory(sessionId: string): boolean;
/**
 * Get count of active pronunciation memories
 */
export declare function getActivePronunciationMemoryCount(): number;
//# sourceMappingURL=session.d.ts.map