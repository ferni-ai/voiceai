/**
 * Live Backchanneling Service
 *
 * Provides real-time verbal feedback during user speech.
 */
import type { LiveBackchannelContext, LiveBackchannelResult } from './types.js';
export declare class LiveBackchannelingService {
    private lastBackchannelTime;
    private backchannelCount;
    private recentBackchannels;
    /**
     * Determine if we should emit a live backchannel
     */
    shouldEmitLiveBackchannel(ctx: LiveBackchannelContext): LiveBackchannelResult;
    /**
     * Select appropriate backchannel phrase
     */
    private selectBackchannel;
    /**
     * Wrap phrase with SSML for soft volume
     * HUMANIZATION FIX: Add variation in speed/volume to prevent static delivery
     */
    private wrapWithSoftVolume;
    /**
     * Get the last backchannel time
     */
    getLastBackchannelTime(): number;
    /**
     * Reset service state
     */
    reset(): void;
}
//# sourceMappingURL=service.d.ts.map