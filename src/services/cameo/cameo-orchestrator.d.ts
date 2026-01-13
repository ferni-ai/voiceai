/**
 * Cameo Orchestrator - The Heart of the Team Cameo System
 *
 * Coordinates all aspects of a cameo:
 * 1. State management (who's speaking, cooldowns, history)
 * 2. Voice switching (via PersonaAwareTTS)
 * 3. Event emission (for frontend synchronization)
 * 4. Timing and transitions
 * 5. Safety (max duration, rate limiting)
 *
 * A cameo flow:
 * 1. Request received → validate → emit cameo_starting
 * 2. Play arrival sound → wait
 * 3. Switch voice → emit cameo_started
 * 4. Persona speaks their insight
 * 5. Persona says handback → emit cameo_ending
 * 6. Play return sound → wait
 * 7. Switch voice back → emit cameo_complete
 */
import { EventEmitter } from 'events';
import type { CameoPersonaId, CameoRequest, CameoResult, CameoSessionState, CanonicalPersonaId } from './types.js';
/**
 * Event emitter for cameo lifecycle events.
 * Voice agent and frontend subscribe to these events.
 *
 * Events:
 * - 'cameo_starting': Fired when cameo is about to start (frontend visual prep)
 * - 'cameo_started': Fired when cameo has started (voice switch)
 * - 'cameo_ending': Fired when cameo is about to end
 * - 'cameo_complete': Fired when cameo has ended
 * - 'cameo_cancelled': Fired if cameo was cancelled
 * - 'cameoHandlerComplete': Fired by handler when greeting is spoken (for sync waiting)
 */
export declare const cameoEvents: EventEmitter<[never]>;
/**
 * Reset session state (call on session end)
 * FIX ISSUE #2: Clear maxDurationTimer to prevent timer firing after session cleanup
 */
export declare function resetSessionState(sessionId: string): void;
/**
 * Get current session state (for external inspection)
 */
export declare function getCameoSessionState(sessionId: string): CameoSessionState | null;
/**
 * Execute a team member cameo
 *
 * @param request - The cameo request details
 * @param options - Session context
 * @returns Result of the cameo attempt
 */
export declare function executeCameo(request: CameoRequest, options: {
    sessionId: string;
    userId?: string;
    returnToPersona?: CanonicalPersonaId;
}): Promise<CameoResult>;
/**
 * End the current cameo and return to host persona
 */
export declare function endCameo(sessionId: string, cameoId?: string): Promise<CameoResult>;
/**
 * Cancel a cameo in progress
 */
export declare function cancelCameo(sessionId: string, reason?: string): Promise<CameoResult>;
/**
 * Check if a cameo is currently in progress
 */
export declare function isInCameo(sessionId: string): boolean;
/**
 * Get the current cameo persona (if in cameo)
 */
export declare function getCurrentCameoPersona(sessionId: string): CameoPersonaId | null;
/**
 * Check if a persona has done a cameo this session
 */
export declare function hasPersonaCameoed(sessionId: string, personaId: CameoPersonaId): boolean;
/**
 * Get cooldown status
 */
export declare function getCooldownStatus(sessionId: string, priority?: 'normal' | 'high' | 'celebration'): {
    isOnCooldown: boolean;
    remainingMs: number;
};
/**
 * Get cameo statistics for a session
 */
export declare function getCameoStats(sessionId: string): {
    totalCameos: number;
    personasCameoed: CameoPersonaId[];
    averageDuration: number;
    lastCameoTime: number;
};
declare const _default: {
    executeCameo: typeof executeCameo;
    endCameo: typeof endCameo;
    cancelCameo: typeof cancelCameo;
    resetSessionState: typeof resetSessionState;
    getCameoSessionState: typeof getCameoSessionState;
    isInCameo: typeof isInCameo;
    getCurrentCameoPersona: typeof getCurrentCameoPersona;
    hasPersonaCameoed: typeof hasPersonaCameoed;
    getCooldownStatus: typeof getCooldownStatus;
    getCameoStats: typeof getCameoStats;
    cameoEvents: EventEmitter<[never]>;
};
export default _default;
//# sourceMappingURL=cameo-orchestrator.d.ts.map