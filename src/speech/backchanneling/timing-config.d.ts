/**
 * Backchanneling Timing Configurations
 *
 * All timing constants consolidated in one place.
 *
 * @module backchanneling/timing-config
 */
import type { BackchannelMode, BackchannelTiming, BreathPauseConfig } from './types.js';
/**
 * Standard mode - Conservative, waits for clear pauses
 *
 * HUMANIZATION FIX (Dec 2025): Reduced probabilities and increased cooldowns
 * to prevent robotic over-backchanneling. Real humans backchannel about
 * once per 10-15 seconds, not after every pause.
 *
 * TIMING FIX (Jan 2026): Further reductions based on production feedback.
 * Target: ~3-4 backchannels per minute (human parity) instead of ~6-8.
 */
export declare const STANDARD_TIMING: BackchannelTiming;
/**
 * Enhanced mode - Research-backed, context-aware
 *
 * HUMANIZATION FIX (Dec 2025): More conservative settings to feel natural.
 * Even "enhanced" listening shouldn't feel like constant verbal feedback.
 *
 * TIMING FIX (Jan 2026): Significantly reduced to fix "all over the place" feel.
 * Root cause: 45% probability + 1s trigger + 8s cooldown = ~7-8 backchannels/min.
 * Target: ~3-4 backchannels/min to match human conversation patterns.
 */
export declare const ENHANCED_TIMING: BackchannelTiming;
/**
 * Live mode - Real-time during speech (breath-pause detection)
 * Soft overlays during natural breath pauses
 *
 * HUMANIZATION FIX (Dec 2025): Live mode was already more conservative,
 * but increased cooldown and reduced probability slightly for naturalness.
 *
 * TIMING FIX (Jan 2026): Increased cooldown to match other modes.
 */
export declare const LIVE_TIMING: BackchannelTiming;
/**
 * Heavy topic timing - More space for emotional content
 */
export declare const HEAVY_TOPIC_ADJUSTMENT: Partial<BackchannelTiming>;
/**
 * Light topic timing - More responsive
 */
export declare const LIGHT_TOPIC_ADJUSTMENT: Partial<BackchannelTiming>;
/**
 * Default breath pause detection configuration
 */
export declare const DEFAULT_BREATH_PAUSE_CONFIG: BreathPauseConfig;
/**
 * Get timing configuration for a mode
 */
export declare function getTimingForMode(mode: BackchannelMode): BackchannelTiming;
/**
 * Adjust timing based on topic weight
 */
export declare function adjustTimingForTopic(baseTiming: BackchannelTiming, topicWeight: 'light' | 'medium' | 'heavy'): BackchannelTiming;
/**
 * Merge custom timing with base timing
 */
export declare function mergeTimingConfig(base: BackchannelTiming, custom: Partial<BackchannelTiming>): BackchannelTiming;
//# sourceMappingURL=timing-config.d.ts.map