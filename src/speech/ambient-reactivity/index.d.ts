/**
 * Ambient Reactivity Module
 *
 * Detects environmental audio changes and adjusts voice agent behavior.
 *
 * Key capabilities:
 * - Maintain rolling noise baseline
 * - Detect noise increases/decreases (doorbell, crowd, etc.)
 * - Trigger TTS adjustments (volume, clarity, speed)
 * - Generate verbal acknowledgments for major interruptions
 *
 * @module ambient-reactivity
 */
export type { AudioSnapshot, EnvironmentAcknowledgment, EnvironmentEvent, EnvironmentEventType, EnvironmentTrackerState, EnvironmentTtsAdjustment, EventSeverity, } from './types.js';
export { ENVIRONMENT_CONFIG, EnvironmentTracker, environmentTracker, getActiveEnvironmentTrackerCount, getEnvironmentTracker, resetEnvironmentTracker, } from './environment-tracker.js';
//# sourceMappingURL=index.d.ts.map