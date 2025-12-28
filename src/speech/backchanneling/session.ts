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
import { createSessionManager, type SessionService } from '../session-service.js';
import type { BackchannelEngine } from './decision-engine.js';
import { createBackchannelEngine } from './decision-engine.js';
import type { BackchannelEngineOptions, BackchannelMode } from './types.js';

const log = getLogger().child({ module: 'BackchannelSession' });

// ============================================================================
// SESSION-SCOPED ENGINE WRAPPER
// ============================================================================

/**
 * Session-scoped wrapper that manages multiple engine modes
 */
export class SessionBackchannelManager implements SessionService {
  private engines = new Map<BackchannelMode, BackchannelEngine>();
  private breathPauseDetector: BreathPauseDetector | null = null;
  private readonly sessionId: string;
  private readonly personaId: string;

  constructor(sessionId: string, personaId = 'ferni') {
    this.sessionId = sessionId;
    this.personaId = personaId;
    log.debug({ sessionId, personaId }, 'SessionBackchannelManager initialized');
  }

  /**
   * Get or create an engine for a specific mode
   */
  getEngine(mode: BackchannelMode): BackchannelEngine {
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
  getBreathPauseDetector(): BreathPauseDetector {
    if (!this.breathPauseDetector) {
      this.breathPauseDetector = new BreathPauseDetector();
    }
    return this.breathPauseDetector;
  }

  /**
   * Signal new turn to all engines
   */
  newTurn(): void {
    for (const engine of this.engines.values()) {
      engine.newTurn();
    }
  }

  /**
   * Reset all engines and detector
   */
  reset(): void {
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

const backchannelManager = createSessionManager(
  'Backchanneling',
  (sessionId: string) => new SessionBackchannelManager(sessionId)
);

/**
 * Get or create a session-scoped backchanneling manager
 */
export function getBackchannelManager(sessionId: string): SessionBackchannelManager {
  return backchannelManager.get(sessionId);
}

/**
 * Get a specific mode engine for a session
 */
export function getBackchannelEngine(
  sessionId: string,
  mode: BackchannelMode,
  options?: Partial<BackchannelEngineOptions>
): BackchannelEngine {
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
export function getSessionBreathPauseDetector(sessionId: string): BreathPauseDetector {
  return getBackchannelManager(sessionId).getBreathPauseDetector();
}

/**
 * Reset backchanneling for a session
 */
export function resetBackchanneling(sessionId: string): void {
  backchannelManager.reset(sessionId);
}

/**
 * Reset all backchanneling sessions
 */
export function resetAllBackchanneling(): void {
  backchannelManager.resetAll();
}

/**
 * Get count of active backchanneling sessions
 */
export function getActiveBackchannelSessionCount(): number {
  return backchannelManager.getActiveCount();
}

/**
 * Signal new turn for a session
 */
export function signalNewTurn(sessionId: string): void {
  if (backchannelManager.has(sessionId)) {
    getBackchannelManager(sessionId).newTurn();
  }
}
