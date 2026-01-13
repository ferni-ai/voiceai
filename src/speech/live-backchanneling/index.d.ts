/**
 * Live Backchanneling Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Provides real-time verbal feedback ("mm-hmm", "yeah", "right") during user
 * speech WITHOUT interrupting the conversation flow.
 *
 * Key insight from Sesame's research:
 * "Conversational dynamics include natural timing, pauses, interruptions and emphasis."
 *
 * The difference between regular backchanneling and LIVE backchanneling:
 * - Regular: Wait for user to pause, then respond
 * - Live: Soft overlay during natural breath pauses without resetting VAD
 *
 * When a friend listens to you, they don't sit in silence until you're done.
 * They nod, they react, they show they're with you. This module brings
 * that same active listening to Ferni.
 *
 * @see https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 *
 * @module live-backchanneling
 */
export type { AudioFrameData, LiveBackchannelContext, LiveBackchannelResult, SimpleEmotion, } from './types.js';
export { BREATH_PAUSE_CONFIG, CONFIG, SOFT_BACKCHANNELS } from './constants.js';
export { LiveBackchannelingService } from './service.js';
export { BreathPauseDetector } from './breath-pause.js';
export { getActiveLiveBackchannelSessionCount, getBreathPauseDetector, getLiveBackchannelingService, resetAllLiveBackchanneling, resetLiveBackchanneling, } from './session-management.js';
//# sourceMappingURL=index.d.ts.map