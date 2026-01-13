/**
 * Maya Notification Service
 *
 * Connects Maya's proactive coaching system to actual notification delivery.
 * Bridges the gap between:
 * - Maya's proactive opportunity detection
 * - The reminder scheduler's delivery capabilities (SMS, email, etc.)
 *
 * Features:
 * - Scheduled habit reminders
 * - Streak-at-risk alerts
 * - Celebration messages
 * - Challenge day prompts
 * - Weekly reflection nudges
 *
 * PERSISTENCE: Scheduled notifications and user preferences are persisted to
 * Firestore via the unified persistence layer to survive server restarts.
 */
import { EventEmitter } from 'events';
export type MayaNotificationType = 'habit_reminder' | 'streak_at_risk' | 'streak_celebration' | 'challenge_day' | 'weekly_reflection' | 'proactive_checkin' | 'milestone_celebration' | 'comeback_welcome' | 'mood_checkin';
export interface MayaNotificationRequest {
    userId: string;
    type: MayaNotificationType;
    scheduledFor: Date;
    habitId?: string;
    habitName?: string;
    challengeType?: string;
    streakDays?: number;
    customMessage?: string;
    priority?: 'low' | 'normal' | 'high';
}
export interface MayaNotificationPreferences {
    userId: string;
    enabled: boolean;
    preferredTime?: string;
    preferredMethod: 'sms' | 'email';
    quietHoursStart?: number;
    quietHoursEnd?: number;
    enabledTypes: MayaNotificationType[];
    frequency: 'daily' | 'every_other_day' | 'weekly';
}
declare class MayaNotificationService extends EventEmitter {
    private scheduledNotifications;
    private userPreferences;
    private persistenceStore;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Load user data from persistence
     */
    private loadUserData;
    /**
     * Persist user data to Firestore
     */
    private persistUserData;
    getPreferences(userId: string): Promise<MayaNotificationPreferences>;
    setPreferences(userId: string, prefs: Partial<MayaNotificationPreferences>): Promise<void>;
    /**
     * Schedule a Maya notification
     */
    scheduleNotification(request: MayaNotificationRequest): Promise<string | null>;
    /**
     * Schedule daily habit reminders for a user
     */
    scheduleDailyHabitReminders(userId: string): Promise<void>;
    /**
     * Schedule streak-at-risk alert
     */
    scheduleStreakAlert(userId: string, habitId: string, habitName: string, currentStreak: number): Promise<void>;
    /**
     * Send immediate streak celebration
     */
    sendStreakCelebration(userId: string, habitName: string, streakDays: number): Promise<void>;
    /**
     * Schedule challenge day prompt
     */
    scheduleChallengePrompt(userId: string, challengeType: string, dayNumber: number, action: string): Promise<void>;
    /**
     * Schedule weekly reflection
     */
    scheduleWeeklyReflection(userId: string): Promise<void>;
    /**
     * Send proactive check-in after silence
     */
    sendSilenceCheckin(userId: string, daysSinceActive: number): Promise<void>;
    /**
     * Send milestone celebration
     */
    sendMilestoneCelebration(userId: string, milestone: string): Promise<void>;
    private startProactiveCheckLoop;
    private runProactiveChecks;
    private checkUserForProactiveOpportunities;
    private generateMessage;
    private getSubject;
    private isQuietHours;
    private adjustForQuietHours;
    /**
     * Adjust notification time based on calendar busy status.
     * A good friend doesn't call when you're in a meeting.
     */
    private adjustForCalendarBusy;
}
export declare function getMayaNotificationService(): MayaNotificationService;
export declare function initializeMayaNotificationService(): Promise<MayaNotificationService>;
export declare function shutdownEngagementNotificationService(): Promise<void>;
export default MayaNotificationService;
//# sourceMappingURL=engagement-notification-service.d.ts.map