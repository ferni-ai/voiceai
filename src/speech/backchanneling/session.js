/**
 * Backchanneling Session Management
 *
 * Session-scoped management for backchanneling engines.
 * Uses the SessionServiceManager abstraction.
 *
 * @module backchanneling/session
 */
import { getLogger } from '../../utils/safe-logger.js';
import { BreathPauseDetector } from '../live-backchanneling/breath-pause.js';
import { createSessionManager } from '../session-service.js';
import { createBackchannelEngine } from './decision-engine.js';
const log = getLogger().child({ module: 'BackchannelSession' });
// ============================================================================
// SESSION-SCOPED ENGINE WRAPPER
// ============================================================================
/**
 * Session-scoped wrapper that manages multiple engine modes
 */
export class SessionBackchannelManager {
    engines = new Map();
    breathPauseDetector = null;
    sessionId;
    personaId;
    constructor(sessionId, personaId = 'ferni') {
        this.sessionId = sessionId;
        this.personaId = personaId;
        log.debug({ sessionId, personaId }, 'SessionBackchannelManager initialized');
    }
    /**
     * Get or create an engine for a specific mode
     */
    getEngine(mode) {
        let engine = this.engines.get(mode);
        if (!engine) {
            engine = createBackchannelEngine({
                mode,
                personaId: this.personaId,
            });
            this.engines.set(mode, engine);
        }
        return engine;
    }
    /**
     * Get the breath pause detector (for live mode)
     */
    getBreathPauseDetector() {
        if (!this.breathPauseDetector) {
            this.breathPauseDetector = new BreathPauseDetector();
        }
        return this.breathPauseDetector;
    }
    /**
     * Signal new turn to all engines
     */
    newTurn() {
        for (const engine of this.engines.values()) {
            engine.newTurn();
        }
    }
    /**
     * Reset all engines and detector
     */
    reset() {
        for (const engine of this.engines.values()) {
            engine.reset();
        }
        this.engines.clear();
        this.breathPauseDetector?.reset();
        this.breathPauseDetector = null;
        log.debug({ sessionId: this.sessionId }, 'SessionBackchannelManager reset');
    }
}
// ============================================================================
// SESSION MANAGER
// ============================================================================
const backchannelManager = createSessionManager('Backchanneling', (sessionId) => new SessionBackchannelManager(sessionId));
/**
 * Get or create a session-scoped backchanneling manager
 */
export function getBackchannelManager(sessionId) {
    return backchannelManager.get(sessionId);
}
/**
 * Get a specific mode engine for a session
 */
export function getBackchannelEngine(sessionId, mode, options) {
    const manager = getBackchannelManager(sessionId);
    // If custom options provided, create new engine with those options
    if (options) {
        return createBackchannelEngine({
            mode,
            personaId: options.personaId,
            customTiming: options.customTiming,
        });
    }
    return manager.getEngine(mode);
}
/**
 * Get breath pause detector for a session (for live mode)
 */
export function getSessionBreathPauseDetector(sessionId) {
    return getBackchannelManager(sessionId).getBreathPauseDetector();
}
/**
 * Reset backchanneling for a session
 */
export function resetBackchanneling(sessionId) {
    backchannelManager.reset(sessionId);
}
/**
 * Reset all backchanneling sessions
 */
export function resetAllBackchanneling() {
    backchannelManager.resetAll();
}
/**
 * Get count of active backchanneling sessions
 */
export function getActiveBackchannelSessionCount() {
    return backchannelManager.getActiveCount();
}
/**
 * Signal new turn for a session
 */
export function signalNewTurn(sessionId) {
    if (backchannelManager.has(sessionId)) {
        getBackchannelManager(sessionId).newTurn();
    }
}
//# sourceMappingURL=session.js.map