/**
 * Frontend Signal Service
 *
 * Provides a mechanism for the voice agent to send signals to the frontend
 * (e.g., conversation_end, agent_exit). The signal callback is initialized
 * at session start and uses the data channel to communicate.
 */
type SignalCallback = (type: string, data?: Record<string, unknown>) => Promise<void>;
/**
 * Initialize the frontend signal callback.
 * Called once at session start to wire up the data channel publisher.
 */
export declare function initFrontendSignal(callback: SignalCallback): void;
/**
 * Send a signal to the frontend.
 * Returns true if the signal was sent, false if no callback is registered.
 */
export declare function sendFrontendSignal(type: string, data?: Record<string, unknown>): Promise<boolean>;
/**
 * Reset the signal callback (for testing or session cleanup).
 */
export declare function resetFrontendSignal(): void;
export {};
//# sourceMappingURL=frontend-signal.d.ts.map