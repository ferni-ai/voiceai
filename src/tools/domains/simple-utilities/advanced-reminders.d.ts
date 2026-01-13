/**
 * Advanced Reminder Tools
 *
 * Extended reminder capabilities beyond basic time-based reminders:
 * - Location-based reminders (geofencing)
 * - Recurring reminders with patterns
 * - Smart reminders that learn optimal timing
 *
 * These fill gaps identified in synthetic LLM testing.
 *
 * @module simple-utilities/advanced-reminders
 */
import type { ToolDefinition } from '../../registry/types.js';
export interface LocationReminder {
    id: string;
    userId: string;
    message: string;
    location: {
        name: string;
        address?: string;
        latitude?: number;
        longitude?: number;
        radius?: number;
    };
    triggerOn: 'arrive' | 'leave';
    active: boolean;
    createdAt: number;
    lastTriggered?: number;
}
export interface RecurringReminder {
    id: string;
    userId: string;
    message: string;
    pattern: RecurrencePattern;
    time: string;
    timezone: string;
    active: boolean;
    nextOccurrence: number;
    lastTriggered?: number;
    createdAt: number;
}
export type RecurrencePattern = {
    type: 'daily';
} | {
    type: 'weekdays';
} | {
    type: 'weekends';
} | {
    type: 'weekly';
    dayOfWeek: number;
} | {
    type: 'biweekly';
    dayOfWeek: number;
} | {
    type: 'monthly';
    dayOfMonth: number;
} | {
    type: 'custom';
    days: number[];
};
declare const locationReminderDef: ToolDefinition;
declare const listLocationRemindersDef: ToolDefinition;
declare const recurringReminderDef: ToolDefinition;
declare const listRecurringRemindersDef: ToolDefinition;
declare const cancelReminderDef: ToolDefinition;
export declare const advancedReminderDefinitions: ToolDefinition[];
export { locationReminderDef, listLocationRemindersDef, recurringReminderDef, listRecurringRemindersDef, cancelReminderDef, };
//# sourceMappingURL=advanced-reminders.d.ts.map