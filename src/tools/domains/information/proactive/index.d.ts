/**
 * Proactive Intelligence Engine
 *
 * The core "Better Than Human" feature: we reach out BEFORE you ask.
 *
 * This orchestrator runs periodic checks and generates alerts when:
 * - Weather threatens your outdoor plans
 * - Traffic is building before your commute
 * - Air quality is bad for your morning run
 * - Your favorite team is playing
 * - A friend's birthday is coming up
 *
 * TOOLS:
 *   checkAllAlerts       - Run all alert checks (called by background job)
 *   getMyAlerts          - Get pending alerts for a user
 *   acknowledgeAlert     - Mark an alert as seen
 *   setAlertPreferences  - Configure what alerts to receive
 */
import type { ToolDefinition } from '../../../registry/types.js';
import type { ProactiveAlert, AlertGenerationContext } from './types.js';
export * from './types.js';
export { checkWeatherCalendarConflicts, checkWeatherAlerts } from './weather-calendar.js';
/**
 * Run all alert checks for a user
 * This should be called periodically (e.g., every 15 minutes)
 */
export declare function checkAllAlerts(context: AlertGenerationContext): Promise<ProactiveAlert[]>;
export declare const proactiveToolDefinitions: ToolDefinition[];
/**
 * Get proactive tool definitions
 */
export declare function getProactiveToolDefinitions(): ToolDefinition[];
//# sourceMappingURL=index.d.ts.map