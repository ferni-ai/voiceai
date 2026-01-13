/**
 * Backchanneling Session Management
 *
 * Session-scoped management for backchanneling engines.
 * Uses the SessionServiceManager abstraction.
 *
 * @module backchanneling/session
 */
import { BreathPauseDetector } from '../live-backchanneling/breath-pause.js';
import { type SessionService } from '../session-service.js';
import type { BackchannelEngine } from './decision-engine.js';
import type { BackchannelEngineOptions, BackchannelMode } from './types.js';
/**
 * Session-scoped wrapper that manages multiple engine modes
 */
export declare class SessionBackchannelManager implements SessionService {
    private engines;
    private breathPauseDetector;
    private readonly sessionId;
    private readonly personaId;
    constructor(sessionId: string, personaId?: string);
    /**
     * Get or create an engine for a specific mode
     */
    getEngine(mode: BackchannelMode): BackchannelEngine;
    /**
     * Get the breath pause detector (for live mode)
     */
    getBreathPauseDetector(): BreathPauseDetector;
    /**
     * Signal new turn to all engines
     */
    newTurn(): void;
    /**
     * Reset all engines and detector
     */
    reset(): void;
}
/**
 * Get or create a session-scoped backchanneling manager
 */
export declare function getBackchannelManager(sessionId: string): SessionBackchannelManager;
/**
 * Get a specific mode engine for a session
 */
export declare function getBackchannelEngine(sessionId: string, mode: BackchannelMode, options?: Partial<BackchannelEngineOptions>): BackchannelEngine;
/**
 * Get breath pause detector for a session (for live mode)
 */
export declare function getSessionBreathPauseDetector(sessionId: string): BreathPauseDetector;
/**
 * Reset backchanneling for a session
 */
export declare function resetBackchanneling(sessionId: string): void;
/**
 * Reset all backchanneling sessions
 */
export declare function resetAllBackchanneling(): void;
/**
 * Get count of active backchanneling sessions
 */
export declare function getActiveBackchannelSessionCount(): number;
/**
 * Signal new turn for a session
 */
export declare function signalNewTurn(sessionId: string): void;
//# sourceMappingURL=session.d.ts.map