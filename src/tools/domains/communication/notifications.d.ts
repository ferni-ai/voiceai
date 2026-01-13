/**
 * Notification Tools
 *
 * Tools to manage and configure user notifications.
 * Allows users to:
 * - Set notification preferences
 * - Schedule habit reminders
 * - Enable/disable notification types
 * - View scheduled notifications
 *
 * NOTE: This is the agent-agnostic version. The original maya-notification-tools.ts
 * re-exports from this file for backward compatibility.
 */
import { llm } from '@livekit/agents';
import { type MayaNotificationType } from '../../../services/engagement/engagement-notification-service.js';
export declare function createNotificationTools(): {
    /**
     * Get notification status and preferences
     */
    getNotifications: llm.FunctionTool<Record<string, never>, unknown, {
        enabled: boolean;
        preferredTime: string;
        quietHours: string;
        enabledTypes: string;
        message: string;
        error?: undefined;
    } | {
        error: string;
        enabled?: undefined;
        preferredTime?: undefined;
        quietHours?: undefined;
        enabledTypes?: undefined;
        message?: undefined;
    }>;
    /**
     * Get notification preferences
     */
    getNotificationPreferences: llm.FunctionTool<Record<string, never>, unknown, {
        enabled: boolean;
        preferredMethod: "email" | "sms";
        preferredTime: string;
        quietHours: string;
        enabledTypes: MayaNotificationType[];
        frequency: "weekly" | "daily" | "every_other_day";
    }>;
    /**
     * Enable or disable notifications
     */
    setNotificationsEnabled: llm.FunctionTool<{
        enabled: boolean;
    }, unknown, {
        success: boolean;
        message: string;
    }>;
    /**
     * Set preferred notification time
     */
    setPreferredTime: llm.FunctionTool<{
        time: string;
    }, unknown, {
        error: string;
        success?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        error?: undefined;
    }>;
    /**
     * Set notification delivery method
     */
    setDeliveryMethod: llm.FunctionTool<{
        method: "email" | "sms";
    }, unknown, {
        success: boolean;
        message: string;
    }>;
    /**
     * Set quiet hours
     */
    setQuietHours: llm.FunctionTool<{
        startHour: number;
        endHour: number;
    }, unknown, {
        success: boolean;
        message: string;
    }>;
    /**
     * Enable/disable specific notification types
     */
    configureNotificationTypes: llm.FunctionTool<{
        types: ("streak_celebration" | "streak_at_risk" | "milestone_celebration" | "habit_reminder" | "challenge_day" | "weekly_reflection" | "proactive_checkin" | "comeback_welcome" | "mood_checkin")[];
    }, unknown, {
        success: boolean;
        enabledTypes: ("streak_celebration" | "streak_at_risk" | "milestone_celebration" | "habit_reminder" | "challenge_day" | "weekly_reflection" | "proactive_checkin" | "comeback_welcome" | "mood_checkin")[];
        message: string;
    }>;
    /**
     * Schedule a custom reminder
     */
    scheduleCustomReminder: llm.FunctionTool<{
        message: string;
        minutesFromNow: number;
    }, unknown, {
        error: string;
        success?: undefined;
        reminderId?: undefined;
        scheduledFor?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        reminderId: string;
        scheduledFor: string;
        message: string;
        error?: undefined;
    }>;
    /**
     * Setup daily habit reminders
     */
    setupDailyReminders: llm.FunctionTool<Record<string, never>, unknown, {
        success: boolean;
        message: string;
    }>;
    /**
     * Setup weekly reflection reminder
     */
    setupWeeklyReflection: llm.FunctionTool<Record<string, never>, unknown, {
        success: boolean;
        message: string;
    }>;
};
export default createNotificationTools;
//# sourceMappingURL=notifications.d.ts.map