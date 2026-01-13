/**
 * Unified Backchanneling Module
 *
 * Consolidated backchanneling implementation that supports three modes:
 * - **Standard**: Basic verbal nods (5-8s triggers)
 * - **Enhanced**: Context-aware, research-backed (3-5s triggers)
 * - **Live**: Real-time during speech (breath-pause detection)
 *
 * @example
 * ```typescript
 * import {
 *   getBackchannelEngine,
 *   getSessionBreathPauseDetector,
 *   type BackchannelContext
 * } from './backchanneling/index.js';
 *
 * // Standard mode
 * const engine = getBackchannelEngine(sessionId, 'standard');
 * const decision = engine.decide(context);
 *
 * // Enhanced mode
 * const enhanced = getBackchannelEngine(sessionId, 'enhanced');
 *
 * // Live mode with breath pause detection
 * const live = getBackchannelEngine(sessionId, 'live');
 * const detector = getSessionBreathPauseDetector(sessionId);
 * detector.processAudioFrame(audioFrame);
 * const isBreathPause = detector.isBreathPause();
 * ```
 *
 * @module backchanneling
 */
export type { AudioFrameData, BackchannelContext, BackchannelDecision, BackchannelEngineOptions, BackchannelMode, BackchannelTiming, BreathPauseConfig, BreathPauseStats, LegacyBackchannelContext, LegacyBackchannelResult, } from './types.js';
export { DEFAULT_BREATH_PAUSE_CONFIG, ENHANCED_TIMING, HEAVY_TOPIC_ADJUSTMENT, LIGHT_TOPIC_ADJUSTMENT, LIVE_TIMING, STANDARD_TIMING, adjustTimingForTopic, getTimingForMode, mergeTimingConfig, } from './timing-config.js';
export { BackchannelEngine, createBackchannelEngine } from './decision-engine.js';
export { SessionBackchannelManager, getActiveBackchannelSessionCount, getBackchannelEngine, getBackchannelManager, getSessionBreathPauseDetector, resetAllBackchanneling, resetBackchanneling, signalNewTurn, } from './session.js';
export { BreathPauseDetector } from '../live-backchanneling/breath-pause.js';
export { BACKCHANNEL_LIBRARY, PERSONA_BACKCHANNEL_STYLE, SOFT_BACKCHANNELS, getBackchannelPhrase, getPersonaBackchannelStyle, getSoftBackchannel, type BackchannelCategory, type BackchannelEmotionType, type PersonaBackchannelStyle, } from '../persona-phrases.js';
//# sourceMappingURL=index.d.ts.map