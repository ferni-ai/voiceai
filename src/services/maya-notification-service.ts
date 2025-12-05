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
 */

import { getLogger } from '../utils/safe-logger.js';

import { EventEmitter } from 'events';
import type { ScheduledReminder } from './reminder-scheduler.js';
import { createReminder } from './reminder-scheduler.js';
import { getProductivityStore } from './productivity-store.js';
import { getMayaGamificationStore } from './maya-gamification-store.js';
import { getDefaultStore } from '../memory/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type MayaNotificationType =
  | 'habit_reminder'
  | 'streak_at_risk'
  | 'streak_celebration'
  | 'challenge_day'
  | 'weekly_reflection'
  | 'proactive_checkin'
  | 'milestone_celebration'
  | 'comeback_welcome'
  | 'mood_checkin';

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
  preferredTime?: string; // e.g., "09:00"
  preferredMethod: 'sms' | 'email';
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number;
  enabledTypes: MayaNotificationType[];
  frequency: 'daily' | 'every_other_day' | 'weekly';
}

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

const MESSAGE_TEMPLATES: Record<MayaNotificationType, (data: Record<string, unknown>) => string> = {
  habit_reminder: (data) =>
    `🌱 Hey! Time for your "${data.habitName}" habit. Remember: small steps, big changes! — Maya`,

  streak_at_risk: (data) =>
    `🔥 Your ${data.streakDays}-day streak on "${data.habitName}" needs you today! Don't let it slip - you've got this! — Maya`,

  streak_celebration: (data) =>
    `🎉 ${data.streakDays} days strong on "${data.habitName}"! You're building something real. Keep showing up! — Maya`,

  challenge_day: (data) =>
    `💪 Day ${data.dayNumber} of your ${data.challengeType} challenge! Today's action: ${data.action}. Let's go! — Maya`,

  weekly_reflection: () =>
    `📝 It's reflection time! How did your week go? I'd love to hear about your wins (and learn from any struggles). — Maya`,

  proactive_checkin: (data) =>
    (data.customMessage as string) ||
    `👋 Hey! Haven't heard from you in a bit. Everything okay? I'm here when you're ready. — Maya`,

  milestone_celebration: (data) =>
    `🏆 WOW! ${data.milestone}! This is huge! Take a moment to really feel this achievement. So proud of you! — Maya`,

  comeback_welcome: (data) =>
    `🌟 Welcome back! Life happens - what matters is you're here now. Ready to pick up where we left off? ${data.daysSinceActive ? `(It's been ${data.daysSinceActive} days - no judgment!)` : ''} — Maya`,

  mood_checkin: () =>
    `💚 Quick mood check: How are you feeling today (1-10)? And energy level? This helps me understand your patterns! — Maya`,
};

// ============================================================================
// MAYA NOTIFICATION SERVICE
// ============================================================================

class MayaNotificationService extends EventEmitter {
  private scheduledNotifications = new Map<string, ScheduledReminder>();
  private userPreferences = new Map<string, MayaNotificationPreferences>();
  private checkInterval: NodeJS.Timeout | null = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    getLogger().info({}, '🌱 Maya Notification Service initializing...');

    // Start the proactive check loop
    this.startProactiveCheckLoop();

    getLogger().info({}, '🌱 Maya Notification Service ready');
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    getLogger().info({}, '🌱 Maya Notification Service shut down');
  }

  // ============================================================================
  // PREFERENCE MANAGEMENT
  // ============================================================================

  async getPreferences(userId: string): Promise<MayaNotificationPreferences> {
    // Check cache
    const cached = this.userPreferences.get(userId);
    if (cached) return cached;

    // Load from productivity store
    const store = getProductivityStore();
    const prefs = store.getUserPreference(userId, 'mayaNotificationPrefs') as
      | MayaNotificationPreferences
      | undefined;

    if (prefs) {
      this.userPreferences.set(userId, prefs);
      return prefs;
    }

    // Default preferences
    const defaultPrefs: MayaNotificationPreferences = {
      userId,
      enabled: true,
      preferredMethod: 'sms',
      enabledTypes: [
        'habit_reminder',
        'streak_at_risk',
        'streak_celebration',
        'challenge_day',
        'weekly_reflection',
      ],
      frequency: 'daily',
    };

    return defaultPrefs;
  }

  async setPreferences(userId: string, prefs: Partial<MayaNotificationPreferences>): Promise<void> {
    const current = await this.getPreferences(userId);
    const updated = { ...current, ...prefs };

    this.userPreferences.set(userId, updated);

    const store = getProductivityStore();
    store.setUserPreference(userId, 'mayaNotificationPrefs', updated);

    getLogger().info(
      { userId, enabled: updated.enabled },
      '🔔 Maya notification preferences updated'
    );
  }

  // ============================================================================
  // NOTIFICATION SCHEDULING
  // ============================================================================

  /**
   * Schedule a Maya notification
   */
  async scheduleNotification(request: MayaNotificationRequest): Promise<string | null> {
    const prefs = await this.getPreferences(request.userId);

    // Check if notifications are enabled
    if (!prefs.enabled) {
      getLogger().debug({ userId: request.userId }, 'Notifications disabled for user');
      return null;
    }

    // Check if this notification type is enabled
    if (!prefs.enabledTypes.includes(request.type)) {
      getLogger().debug(
        { userId: request.userId, type: request.type },
        'Notification type disabled'
      );
      return null;
    }

    // Get user's contact info
    const store = getDefaultStore();
    const profile = await store.getProfile(request.userId);

    const deliveryAddress =
      prefs.preferredMethod === 'sms' ? profile?.contactInfo?.phone : profile?.contactInfo?.email;

    if (!deliveryAddress) {
      getLogger().warn({ userId: request.userId }, 'No contact info for Maya notification');
      return null;
    }

    // Check quiet hours
    if (this.isQuietHours(prefs, request.scheduledFor)) {
      // Reschedule to after quiet hours
      request.scheduledFor = this.adjustForQuietHours(prefs, request.scheduledFor);
    }

    // Generate message
    const message = this.generateMessage(request);

    // Create the reminder
    const reminder = await createReminder({
      userId: request.userId,
      message,
      subject: this.getSubject(request.type),
      context: `Maya Habit Coach - ${request.type}`,
      scheduledFor: request.scheduledFor,
      timezone: profile?.contactInfo?.timezone || 'America/New_York',
      deliveryMethod: prefs.preferredMethod,
      deliveryAddress,
      createdBy: 'maya',
    });

    this.scheduledNotifications.set(reminder.id, reminder);

    getLogger().info(
      {
        userId: request.userId,
        type: request.type,
        scheduledFor: request.scheduledFor.toISOString(),
      },
      '📅 Maya notification scheduled'
    );

    this.emit('notification_scheduled', {
      userId: request.userId,
      type: request.type,
      reminderId: reminder.id,
    });

    return reminder.id;
  }

  /**
   * Schedule daily habit reminders for a user
   */
  async scheduleDailyHabitReminders(userId: string): Promise<void> {
    const store = getProductivityStore();
    const habits = store.getUserEnhancedHabits(userId);
    const prefs = await this.getPreferences(userId);

    if (!prefs.enabled || habits.length === 0) return;

    const now = new Date();
    const reminderTime = prefs.preferredTime || '09:00';
    const [hours, minutes] = reminderTime.split(':').map(Number);

    const scheduledFor = new Date(now);
    scheduledFor.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledFor <= now) {
      scheduledFor.setDate(scheduledFor.getDate() + 1);
    }

    for (const habit of habits) {
      // Remind for habits with active streaks or recent activity
      if (habit.currentStreak > 0 || habit.totalCompletions > 0) {
        await this.scheduleNotification({
          userId,
          type: 'habit_reminder',
          scheduledFor,
          habitId: habit.id,
          habitName: habit.name,
        });
      }
    }

    getLogger().info({ userId, habitCount: habits.length }, '📅 Scheduled daily habit reminders');
  }

  /**
   * Schedule streak-at-risk alert
   */
  async scheduleStreakAlert(
    userId: string,
    habitId: string,
    habitName: string,
    currentStreak: number
  ): Promise<void> {
    const now = new Date();
    // Alert at 6 PM if they haven't completed the habit
    const alertTime = new Date(now);
    alertTime.setHours(18, 0, 0, 0);

    if (alertTime <= now) return; // Too late today

    await this.scheduleNotification({
      userId,
      type: 'streak_at_risk',
      scheduledFor: alertTime,
      habitId,
      habitName,
      streakDays: currentStreak,
      priority: 'high',
    });
  }

  /**
   * Send immediate streak celebration
   */
  async sendStreakCelebration(
    userId: string,
    habitName: string,
    streakDays: number
  ): Promise<void> {
    // Send immediately or in 1 minute
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);

    await this.scheduleNotification({
      userId,
      type: 'streak_celebration',
      scheduledFor: now,
      habitName,
      streakDays,
    });
  }

  /**
   * Schedule challenge day prompt
   */
  async scheduleChallengePrompt(
    userId: string,
    challengeType: string,
    dayNumber: number,
    action: string
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    const reminderTime = prefs.preferredTime || '08:00';
    const [hours, minutes] = reminderTime.split(':').map(Number);

    const now = new Date();
    const scheduledFor = new Date(now);
    scheduledFor.setHours(hours, minutes, 0, 0);

    if (scheduledFor <= now) {
      scheduledFor.setDate(scheduledFor.getDate() + 1);
    }

    await this.scheduleNotification({
      userId,
      type: 'challenge_day',
      scheduledFor,
      challengeType,
      customMessage: MESSAGE_TEMPLATES.challenge_day({
        dayNumber,
        challengeType,
        action,
      }),
    });
  }

  /**
   * Schedule weekly reflection
   */
  async scheduleWeeklyReflection(userId: string): Promise<void> {
    const now = new Date();
    // Schedule for Sunday at 7 PM
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const scheduledFor = new Date(now);
    scheduledFor.setDate(now.getDate() + daysUntilSunday);
    scheduledFor.setHours(19, 0, 0, 0);

    await this.scheduleNotification({
      userId,
      type: 'weekly_reflection',
      scheduledFor,
    });
  }

  /**
   * Send proactive check-in after silence
   */
  async sendSilenceCheckin(userId: string, daysSinceActive: number): Promise<void> {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Small delay

    await this.scheduleNotification({
      userId,
      type: 'proactive_checkin',
      scheduledFor: now,
      customMessage: MESSAGE_TEMPLATES.comeback_welcome({ daysSinceActive }),
    });
  }

  /**
   * Send milestone celebration
   */
  async sendMilestoneCelebration(userId: string, milestone: string): Promise<void> {
    const now = new Date();

    await this.scheduleNotification({
      userId,
      type: 'milestone_celebration',
      scheduledFor: now,
      customMessage: MESSAGE_TEMPLATES.milestone_celebration({ milestone }),
      priority: 'high',
    });
  }

  // ============================================================================
  // PROACTIVE CHECK LOOP
  // ============================================================================

  private startProactiveCheckLoop(): void {
    // Check every hour for proactive opportunities
    this.checkInterval = setInterval(
      () => {
        this.runProactiveChecks();
      },
      60 * 60 * 1000
    ); // 1 hour

    // Also run immediately
    this.runProactiveChecks();
  }

  private async runProactiveChecks(): Promise<void> {
    try {
      const store = getDefaultStore();
      const profiles = await store.listProfiles({ limit: 100 });

      for (const profile of profiles) {
        await this.checkUserForProactiveOpportunities(profile.id);
      }
    } catch (error) {
      getLogger().warn({ error }, 'Error in proactive check loop');
    }
  }

  private async checkUserForProactiveOpportunities(userId: string): Promise<void> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.enabled) return;

    const store = getProductivityStore();
    const gamificationStore = getMayaGamificationStore();

    try {
      // Check for silence (no activity in 3+ days)
      const profile = await gamificationStore.getProfile(userId);
      const lastActive = new Date(profile.lastActiveAt);
      const daysSinceActive = Math.floor(
        (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceActive >= 3 && daysSinceActive <= 7) {
        await this.sendSilenceCheckin(userId, daysSinceActive);
      }

      // Check for streaks at risk
      const habits = store.getUserEnhancedHabits(userId);
      const now = new Date();

      for (const habit of habits) {
        // Check habits with active streaks
        if (habit.currentStreak > 0 && habit.totalCompletions > 0) {
          // Use reminderTime or bestPerformanceTime as a proxy for when they usually complete
          // If neither exists, assume evening completion
          const usualTime = habit.reminderTime || habit.bestPerformanceTime || '18:00';
          const [usualHour] = usualTime.split(':').map(Number);

          // If it's past their usual time + 2 hours and they have an active streak, alert
          const currentHour = now.getHours();
          if (currentHour >= usualHour + 2 && currentHour < 22) {
            await this.scheduleStreakAlert(userId, habit.id, habit.name, habit.currentStreak);
          }
        }
      }
    } catch (error) {
      getLogger().debug({ error, userId }, 'Error checking proactive opportunities');
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private generateMessage(request: MayaNotificationRequest): string {
    const template = MESSAGE_TEMPLATES[request.type];
    return template({
      habitName: request.habitName,
      streakDays: request.streakDays,
      dayNumber: request.customMessage ? undefined : 1,
      challengeType: request.challengeType,
      action: request.customMessage,
      customMessage: request.customMessage,
      milestone: request.customMessage,
      daysSinceActive: undefined,
    });
  }

  private getSubject(type: MayaNotificationType): string {
    const subjects: Record<MayaNotificationType, string> = {
      habit_reminder: '🌱 Habit Reminder from Maya',
      streak_at_risk: '🔥 Your Streak Needs You!',
      streak_celebration: '🎉 Streak Milestone!',
      challenge_day: '💪 Challenge Day!',
      weekly_reflection: '📝 Weekly Reflection Time',
      proactive_checkin: '👋 Checking In',
      milestone_celebration: '🏆 Achievement Unlocked!',
      comeback_welcome: '🌟 Welcome Back!',
      mood_checkin: '💚 Mood Check',
    };
    return subjects[type];
  }

  private isQuietHours(prefs: MayaNotificationPreferences, time: Date): boolean {
    if (prefs.quietHoursStart === undefined || prefs.quietHoursEnd === undefined) {
      return false;
    }

    const hour = time.getHours();

    if (prefs.quietHoursStart < prefs.quietHoursEnd) {
      // Normal range (e.g., 22:00 to 06:00 wouldn't wrap)
      return hour >= prefs.quietHoursStart && hour < prefs.quietHoursEnd;
    } else {
      // Wrapping range (e.g., 22:00 to 08:00)
      return hour >= prefs.quietHoursStart || hour < prefs.quietHoursEnd;
    }
  }

  private adjustForQuietHours(prefs: MayaNotificationPreferences, time: Date): Date {
    const adjusted = new Date(time);

    if (prefs.quietHoursEnd !== undefined) {
      adjusted.setHours(prefs.quietHoursEnd, 0, 0, 0);

      // If that time is still in the past, add a day
      if (adjusted <= time) {
        adjusted.setDate(adjusted.getDate() + 1);
      }
    }

    return adjusted;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let serviceInstance: MayaNotificationService | null = null;

export function getMayaNotificationService(): MayaNotificationService {
  if (!serviceInstance) {
    serviceInstance = new MayaNotificationService();
  }
  return serviceInstance;
}

export async function initializeMayaNotificationService(): Promise<MayaNotificationService> {
  const service = getMayaNotificationService();
  await service.initialize();
  return service;
}

export function shutdownMayaNotificationService(): void {
  if (serviceInstance) {
    serviceInstance.shutdown();
    serviceInstance = null;
  }
}

export default MayaNotificationService;
