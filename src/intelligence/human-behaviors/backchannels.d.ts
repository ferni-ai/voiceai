/**
 * Real-Time Backchannel System
 *
 * Determines when to inject backchannels ("Mmhmm", "Right", etc.)
 * during extended pauses in user speech.
 *
 * @module intelligence/human-behaviors/backchannels
 */
export interface BackchannelConfig {
    enabled: boolean;
    minUserSpeechDuration: number;
    silenceThreshold: number;
    maxBackchannelsPerTurn: number;
}
export interface BackchannelState {
    userSpeechStartTime: number | null;
    backchannelsThisTurn: number;
    lastBackchannelTime: number;
}
/**
 * Determine if a backchannel should be injected
 */
export declare function shouldInjectBackchannel(state: BackchannelState, silenceDurationMs: number, config?: BackchannelConfig): {
    inject: boolean;
    sound: string;
} | null;
export default shouldInjectBackchannel;
//# sourceMappingURL=backchannels.d.ts.map