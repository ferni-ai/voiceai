/**
 * Insight Generators Index
 *
 * Exports all 10 insight generators that power "Better Than Human" insights.
 *
 * Each generator is self-registering via registerInsightGenerator(),
 * so importing this file activates all generators.
 *
 * @module services/superhuman/insight-generation/generators
 */
export { crossDomainCorrelationGenerator } from './cross-domain-correlation.js';
export { unspokenAwarenessGenerator } from './unspoken-awareness.js';
export { voiceContentMismatchGenerator } from './voice-content-mismatch.js';
export { growthTrajectoryGenerator } from './growth-trajectory.js';
export { relationshipNetworkGenerator } from './relationship-network.js';
export { commitmentPatternGenerator } from './commitment-pattern.js';
export { temporalRhythmGenerator } from './temporal-rhythm.js';
export { dreamDecayGenerator } from './dream-decay.js';
export { anticipatoryGenerator } from './anticipatory.js';
export { firstTimeCelebrationGenerator } from './first-time-celebration.js';
export { generateObservations as personaVoicedObservations, PERSONA_VOICES, OBSERVATION_TEMPLATES, } from './persona-voiced-observations.js';
/**
 * Initialize all generators (import side-effects register them)
 */
export declare function initializeGenerators(): void;
//# sourceMappingURL=index.d.ts.map