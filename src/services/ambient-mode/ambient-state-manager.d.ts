/**
 * Ambient State Manager
 *
 * > "Better than human means being there even when we're not talking."
 *
 * Manages user's ambient state and generates contextual nudges.
 *
 * @module services/ambient-mode/ambient-state-manager
 */
import type { AmbientState, AmbientNudge, AmbientPreferences, AmbientContext, AmbientSyncRequest, AmbientSyncResponse } from './types.js';
/**
 * Store ambient state for user
 */
export declare function storeAmbientState(state: AmbientState): Promise<void>;
/**
 * Get current ambient state for user
 */
export declare function getAmbientState(userId: string): Promise<AmbientState | null>;
/**
 * Get ambient preferences
 */
export declare function getAmbientPreferences(userId: string): Promise<AmbientPreferences | null>;
/**
 * Update ambient preferences
 */
export declare function updateAmbientPreferences(userId: string, prefs: Partial<AmbientPreferences>): Promise<void>;
/**
 * Evaluate and generate nudge based on ambient state
 */
export declare function evaluateNudge(state: AmbientState): Promise<AmbientNudge | null>;
/**
 * Handle ambient state sync from mobile app
 */
export declare function handleAmbientSync(request: AmbientSyncRequest): Promise<AmbientSyncResponse>;
/**
 * Build ambient context for LLM injection
 */
export declare function buildAmbientContext(userId: string): Promise<AmbientContext>;
/**
 * Format ambient context for LLM injection
 */
export declare function getAmbientContextInjection(userId: string): Promise<string>;
export declare const ambientStateManager: {
    storeAmbientState: typeof storeAmbientState;
    getAmbientState: typeof getAmbientState;
    getAmbientPreferences: typeof getAmbientPreferences;
    updateAmbientPreferences: typeof updateAmbientPreferences;
    evaluateNudge: typeof evaluateNudge;
    handleAmbientSync: typeof handleAmbientSync;
    buildAmbientContext: typeof buildAmbientContext;
    getAmbientContextInjection: typeof getAmbientContextInjection;
};
//# sourceMappingURL=ambient-state-manager.d.ts.map