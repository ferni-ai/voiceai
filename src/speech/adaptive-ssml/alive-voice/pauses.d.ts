/**
 * Dynamic Pause Scaling
 *
 * Applies pause durations based on topic weight.
 * Heavier topics get longer pauses for processing and presence.
 *
 * @module speech/adaptive-ssml/alive-voice/pauses
 */
import type { AliveVoiceContext, PauseScale, TopicWeight } from './types.js';
/**
 * Pause durations by topic weight and context.
 */
export declare const PAUSE_SCALES: Record<TopicWeight, PauseScale>;
/**
 * Apply dynamic pause scaling based on topic weight.
 * Heavier topics get longer pauses for processing and presence.
 */
export declare function applyDynamicPauses(text: string, context: AliveVoiceContext): string;
//# sourceMappingURL=pauses.d.ts.map