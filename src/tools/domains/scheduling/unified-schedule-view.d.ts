/**
 * Unified Schedule View Tool
 *
 * A "Better than Human" capability that provides a comprehensive view of ALL
 * scheduled items across the user's life:
 * - Calendar events (meetings, appointments)
 * - Reminders
 * - Scheduled messages (text, email, call)
 * - Pending appointments (restaurant reservations, doctor visits, etc.)
 *
 * No human assistant could maintain this level of visibility across all
 * scheduling systems. This is true superhuman intelligence.
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const getUnifiedScheduleDef: ToolDefinition;
declare const checkScheduleConflictsDef: ToolDefinition;
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getUnifiedScheduleDef, checkScheduleConflictsDef };
//# sourceMappingURL=unified-schedule-view.d.ts.map