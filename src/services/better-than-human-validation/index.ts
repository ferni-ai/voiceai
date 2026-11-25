/**
 * Better-than-human validation: what code outside this folder imports.
 * Today only the telemetry lifecycle the call processes start and stop (#4069).
 *
 * @module services/better-than-human-validation
 */

export { startBTHTelemetryIfEnabled, stopBTHTelemetry } from './telemetry-lifecycle.js';
