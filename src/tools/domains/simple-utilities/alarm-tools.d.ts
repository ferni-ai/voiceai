/**
 * Alarm Tools
 *
 * Recurring wake-up alarms (different from one-time reminders).
 * Supports daily, weekdays, weekends, and custom day patterns.
 *
 * @module simple-utilities/alarm-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
export type AlarmRepeat = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';
export interface Alarm {
    id: string;
    userId: string;
    label: string;
    time: string;
    repeat: AlarmRepeat;
    customDays?: number[];
    enabled: boolean;
    snoozedUntil?: number;
    createdAt: number;
    updatedAt: number;
}
declare const setAlarmDef: ToolDefinition;
declare const getAlarmsDef: ToolDefinition;
declare const deleteAlarmDef: ToolDefinition;
declare const snoozeAlarmDef: ToolDefinition;
export declare const alarmToolDefinitions: ToolDefinition[];
export { setAlarmDef, getAlarmsDef, deleteAlarmDef, snoozeAlarmDef };
//# sourceMappingURL=alarm-tools.d.ts.map