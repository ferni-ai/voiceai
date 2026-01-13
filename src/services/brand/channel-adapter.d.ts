/**
 * Channel Adapter Service
 *
 * Adapts brand content for different channels while maintaining
 * consistent voice. Same warmth, optimized for the medium.
 *
 * @module @ferni/brand/channel-adapter
 */
import type { Channel, ChannelConfig, ContextType, PersonaId } from './types.js';
/**
 * Configuration for each supported channel
 */
export declare const CHANNEL_CONFIGS: Record<Channel, ChannelConfig>;
/**
 * Adapt content for a specific channel
 */
export declare function adaptForChannel(content: string, toChannel: Channel, options?: {
    fromChannel?: Channel;
    persona?: PersonaId;
    context?: ContextType;
}): string;
/**
 * Generate content for multiple channels at once
 */
export declare function generateForAllChannels(baseContent: string, options?: {
    persona?: PersonaId;
    context?: ContextType;
    channels?: Channel[];
}): Record<Channel, string>;
/**
 * Get channel configuration
 */
export declare function getChannelConfig(channel: Channel): ChannelConfig;
/**
 * Check if content fits channel constraints
 */
export declare function fitsChannelConstraints(content: string, channel: Channel): {
    fits: boolean;
    issues: string[];
};
/**
 * Check voice consistency across channels
 */
export declare function checkVoiceConsistency(contents: Record<Channel, string>): {
    consistent: boolean;
    score: number;
    issues: string[];
};
//# sourceMappingURL=channel-adapter.d.ts.map