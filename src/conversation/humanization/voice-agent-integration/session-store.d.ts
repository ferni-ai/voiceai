/**
 * Voice Agent Integration Session Store
 *
 * Manages humanization session state.
 *
 * @module @ferni/humanization/voice-agent-integration/session-store
 */
import type { HumanizationSessionState } from './types.js';
export declare function getSession(sessionId: string): HumanizationSessionState | undefined;
export declare function setSession(sessionId: string, state: HumanizationSessionState): void;
export declare function deleteSession(sessionId: string): void;
export declare function hasSession(sessionId: string): boolean;
//# sourceMappingURL=session-store.d.ts.map