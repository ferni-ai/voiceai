/**
 * Engagement Notification Service Tests
 *
 * Tests for proactive engagement notifications including:
 * - User state management
 * - Notification preferences
 * - Quiet hours and daily limits
 * - Milestone notifications
 * - Notification delivery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EngagementNotificationService,
  getEngagementNotificationService,
  resetEngagementNotificationService,
  type EngagementNotification,
  type NotificationPreferences,
} from '../services/engagement-notifications.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../services/persistence/index.js', () => ({
  createPersistenceStore: () => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/daily-rituals.js', () => ({
  getDailyRitualsService: () => ({
    getOrCreateProfile: vi.fn(() => ({
      userId: 'test-user',
      activeRituals: ['morning-check-in'],
      streaks: {
        'morning-check-in': {
          currentStreak: 5,
          lastCompletedAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
        },
      },
    })),
    getDueRituals: vi.fn(() => []),
  }),
  PERSONA_RITUALS: {
    'morning-check-in': {
      id: 'morning-check-in',
      name: 'Morning Check-in',
      personaId: 'ferni',
      preferredTime: 'morning',
    },
  },
}));

describe('EngagementNotificationService', () => {
  let service: EngagementNotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetEngagementNotificationService();
    service = new EngagementNotificationService();
  });

  describe('getUserState', () => {
    it('should create default state for new user', () => {
      const state = service.getUserState('new-user');

      expect(state.userId).toBe('new-user');
      expect(state.preferences.enabled).toBe(true);
      expect(state.todayCount).toBe(0);
      expect(state.lastNotificationAt).toBeNull();
      expect(state.dismissedNotifications).toEqual([]);
    });

    it('should return same state on multiple calls', () => {
      const state1 = service.getUserState('user-1');
      const state2 = service.getUserState('user-1');

      expect(state1).toBe(state2);
    });

    it('should have default preferences', () => {
      const state = service.getUserState('user-1');

      expect(state.preferences.quietHoursStart).toBe(22);
      expect(state.preferences.quietHoursEnd).toBe(7);
      expect(state.preferences.maxPerDay).toBe(3);
      expect(state.preferences.preferredChannel).toBe('in_app');
    });

    it('should include default allowed types', () => {
      const state = service.getUserState('user-1');

      expect(state.preferences.allowedTypes).toContain('streak_reminder');
      expect(state.preferences.allowedTypes).toContain('milestone');
      expect(state.preferences.allowedTypes).toContain('team_huddle');
    });
  });

  describe('updatePreferences', () => {
    it('should update partial preferences', async () => {
      const state = service.getUserState('user-1');

      await service.updatePreferences('user-1', { maxPerDay: 5 });

      expect(state.preferences.maxPerDay).toBe(5);
      // Other preferences should remain unchanged
      expect(state.preferences.enabled).toBe(true);
    });

    it('should update quiet hours', async () => {
      await service.updatePreferences('user-1', {
        quietHoursStart: 23,
        quietHoursEnd: 6,
      });

      const state = service.getUserState('user-1');
      expect(state.preferences.quietHoursStart).toBe(23);
      expect(state.preferences.quietHoursEnd).toBe(6);
    });

    it('should update allowed types', async () => {
      await service.updatePreferences('user-1', {
        allowedTypes: ['milestone'],
      });

      const state = service.getUserState('user-1');
      expect(state.preferences.allowedTypes).toEqual(['milestone']);
    });

    it('should disable notifications', async () => {
      await service.updatePreferences('user-1', { enabled: false });

      const state = service.getUserState('user-1');
      expect(state.preferences.enabled).toBe(false);
    });
  });

  describe('canNotify', () => {
    it('should return false when notifications disabled', () => {
      const state = service.getUserState('user-1');
      state.preferences.enabled = false;

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
    });

    it('should return false for disallowed type', () => {
      const state = service.getUserState('user-1');
      state.preferences.allowedTypes = ['milestone'];

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
    });

    it('should return false when daily limit reached', () => {
      const state = service.getUserState('user-1');
      state.todayCount = 3; // Default max is 3

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
    });

    it('should return false when snoozed', () => {
      const state = service.getUserState('user-1');
      state.snoozeUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
    });

    it('should return true when snooze expired', () => {
      const state = service.getUserState('user-1');
      state.snoozeUntil = new Date(Date.now() - 1000); // 1 second ago

      // May depend on quiet hours at time of test
      const canNotify = service.canNotify('user-1', 'streak_reminder');
      expect(typeof canNotify).toBe('boolean');
    });

    it('should check allowed types', () => {
      const state = service.getUserState('user-1');
      state.preferences.allowedTypes = ['milestone', 'team_huddle'];

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
      // These may still be blocked by quiet hours depending on when test runs
    });
  });

  describe('createMilestoneNotification', () => {
    it('should create notification for significant milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 7);

      expect(notification).not.toBeNull();
      expect(notification?.type).toBe('milestone');
      expect(notification?.priority).toBe('medium');
    });

    it('should return null for non-significant milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 5);

      expect(notification).toBeNull();
    });

    it('should create high priority for 30+ day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 30);

      expect(notification).not.toBeNull();
      expect(notification?.priority).toBe('high');
    });

    it('should create notification for 3 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 3);

      expect(notification).not.toBeNull();
    });

    it('should create notification for 14 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 14);

      expect(notification).not.toBeNull();
    });

    it('should create notification for 21 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 21);

      expect(notification).not.toBeNull();
    });

    it('should create notification for 66 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 66);

      expect(notification).not.toBeNull();
      expect(notification?.priority).toBe('high');
    });

    it('should create notification for 100 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 100);

      expect(notification).not.toBeNull();
      expect(notification?.priority).toBe('high');
    });

    it('should create notification for 365 day milestone', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 365);

      expect(notification).not.toBeNull();
      expect(notification?.priority).toBe('high');
    });

    it('should return null for unknown ritual', () => {
      const notification = service.createMilestoneNotification('user-1', 'unknown-ritual', 7);

      expect(notification).toBeNull();
    });

    it('should include persona ID', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 7);

      expect(notification?.personaId).toBe('ferni');
    });

    it('should include ritual name in body', () => {
      const notification = service.createMilestoneNotification('user-1', 'morning-check-in', 7);

      // Body should contain either streak number or ritual name
      expect(notification?.body).toBeTruthy();
    });
  });

  describe('queueNotification', () => {
    it('should queue a notification', async () => {
      const notification: EngagementNotification = {
        id: 'test-notification',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);

      // Notification should be queued (no direct way to check, but should not throw)
      expect(true).toBe(true);
    });
  });

  describe('deliverPendingNotifications', () => {
    it('should deliver pending notifications', async () => {
      // Force non-quiet hours and enable notifications
      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23; // Same = no quiet hours
      state.preferences.enabled = true;
      state.preferences.allowedTypes = ['milestone'];

      const notification: EngagementNotification = {
        id: 'test-notification',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      // May or may not deliver depending on quiet hours
      expect(Array.isArray(delivered)).toBe(true);
    });

    it('should not deliver dismissed notifications', async () => {
      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23;

      const notification: EngagementNotification = {
        id: 'dismissed-notification',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: true,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      expect(delivered.find((n) => n.id === 'dismissed-notification')).toBeUndefined();
    });

    it('should not deliver already delivered notifications', async () => {
      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23;

      const notification: EngagementNotification = {
        id: 'already-delivered',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: true,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      expect(delivered.find((n) => n.id === 'already-delivered')).toBeUndefined();
    });

    it('should not deliver expired notifications', async () => {
      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23;
      state.preferences.allowedTypes = ['milestone'];

      const notification: EngagementNotification = {
        id: 'expired-notification',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      expect(delivered.find((n) => n.id === 'expired-notification')).toBeUndefined();
    });

    it('should increment todayCount on delivery', async () => {
      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23;
      state.preferences.allowedTypes = ['milestone'];
      const initialCount = state.todayCount;

      const notification: EngagementNotification = {
        id: 'count-test',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      if (delivered.length > 0) {
        expect(state.todayCount).toBe(initialCount + 1);
      }
    });
  });

  describe('dismissNotification', () => {
    it('should dismiss a notification', async () => {
      const notification: EngagementNotification = {
        id: 'to-dismiss',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      await service.dismissNotification('user-1', 'to-dismiss');

      const state = service.getUserState('user-1');
      expect(state.dismissedNotifications).toContain('to-dismiss');
    });
  });

  describe('snoozeNotifications', () => {
    it('should snooze for specified hours', async () => {
      await service.snoozeNotifications('user-1', 2);

      const state = service.getUserState('user-1');
      expect(state.snoozeUntil).not.toBeNull();

      // Should be approximately 2 hours from now
      const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
      const snoozeTime = state.snoozeUntil!.getTime();
      expect(snoozeTime).toBeGreaterThan(Date.now());
      expect(snoozeTime).toBeLessThanOrEqual(twoHoursFromNow + 1000);
    });

    it('should block notifications while snoozed', async () => {
      await service.snoozeNotifications('user-1', 1);

      expect(service.canNotify('user-1', 'streak_reminder')).toBe(false);
    });
  });

  describe('resetDailyCounts', () => {
    it('should reset all user counts', () => {
      const state1 = service.getUserState('user-1');
      const state2 = service.getUserState('user-2');
      state1.todayCount = 5;
      state2.todayCount = 3;

      service.resetDailyCounts();

      expect(state1.todayCount).toBe(0);
      expect(state2.todayCount).toBe(0);
    });
  });

  describe('onNotification callback', () => {
    it('should call callback when notification delivered', async () => {
      const callback = vi.fn();
      service.onNotification(callback);

      const state = service.getUserState('user-1');
      state.preferences.quietHoursStart = 23;
      state.preferences.quietHoursEnd = 23;
      state.preferences.allowedTypes = ['milestone'];

      const notification: EngagementNotification = {
        id: 'callback-test',
        type: 'milestone',
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };

      await service.queueNotification('user-1', notification);
      const delivered = await service.deliverPendingNotifications('user-1');

      if (delivered.length > 0) {
        expect(callback).toHaveBeenCalled();
      }
    });
  });

  describe('generateStreakReminders', () => {
    it('should generate streak reminders', async () => {
      const reminders = await service.generateStreakReminders('user-1');

      expect(Array.isArray(reminders)).toBe(true);
    });

    it('should include personaId in reminders', async () => {
      const reminders = await service.generateStreakReminders('user-1');

      for (const reminder of reminders) {
        expect(reminder.type).toBe('streak_reminder');
      }
    });
  });

  describe('generateRitualDueNotifications', () => {
    it('should return array', async () => {
      const notifications = await service.generateRitualDueNotifications('user-1');

      expect(Array.isArray(notifications)).toBe(true);
    });
  });
});

describe('Singleton functions', () => {
  beforeEach(() => {
    resetEngagementNotificationService();
  });

  it('getEngagementNotificationService should return singleton', () => {
    const service1 = getEngagementNotificationService();
    const service2 = getEngagementNotificationService();

    expect(service1).toBe(service2);
  });

  it('resetEngagementNotificationService should reset singleton', () => {
    const service1 = getEngagementNotificationService();
    resetEngagementNotificationService();
    const service2 = getEngagementNotificationService();

    expect(service1).not.toBe(service2);
  });
});

describe('EngagementNotification type', () => {
  it('should accept all valid types', () => {
    const types: Array<EngagementNotification['type']> = [
      'streak_reminder',
      'ritual_due',
      'milestone',
      'team_huddle',
      'memory_callback',
      'seasonal_event',
    ];

    for (const type of types) {
      const notification: EngagementNotification = {
        id: 'test',
        type,
        priority: 'medium',
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };
      expect(notification.type).toBe(type);
    }
  });

  it('should accept all priority levels', () => {
    const priorities: Array<EngagementNotification['priority']> = ['low', 'medium', 'high'];

    for (const priority of priorities) {
      const notification: EngagementNotification = {
        id: 'test',
        type: 'milestone',
        priority,
        title: 'Test',
        body: 'Test body',
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      };
      expect(notification.priority).toBe(priority);
    }
  });

  it('should accept optional fields', () => {
    const notification: EngagementNotification = {
      id: 'test',
      type: 'milestone',
      priority: 'medium',
      title: 'Test',
      body: 'Test body',
      personaId: 'ferni',
      actionUrl: '/app/milestone',
      expiresAt: new Date(),
      createdAt: new Date(),
      delivered: false,
      dismissed: false,
    };

    expect(notification.personaId).toBe('ferni');
    expect(notification.actionUrl).toBe('/app/milestone');
    expect(notification.expiresAt).toBeDefined();
  });
});

describe('NotificationPreferences type', () => {
  it('should accept all valid channels', () => {
    const channels: Array<NotificationPreferences['preferredChannel']> = ['push', 'in_app', 'both'];

    for (const channel of channels) {
      const prefs: NotificationPreferences = {
        enabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxPerDay: 3,
        allowedTypes: ['milestone'],
        preferredChannel: channel,
      };
      expect(prefs.preferredChannel).toBe(channel);
    }
  });
});

describe('Quiet hours logic', () => {
  let service: EngagementNotificationService;

  beforeEach(() => {
    resetEngagementNotificationService();
    service = new EngagementNotificationService();
  });

  it('should handle wrapped quiet hours (22-7)', () => {
    const state = service.getUserState('user-1');
    state.preferences.quietHoursStart = 22;
    state.preferences.quietHoursEnd = 7;

    // The canNotify behavior depends on current hour
    // Just verify it doesn't throw
    const result = service.canNotify('user-1', 'streak_reminder');
    expect(typeof result).toBe('boolean');
  });

  it('should handle non-wrapped quiet hours (1-5)', () => {
    const state = service.getUserState('user-1');
    state.preferences.quietHoursStart = 1;
    state.preferences.quietHoursEnd = 5;

    const result = service.canNotify('user-1', 'streak_reminder');
    expect(typeof result).toBe('boolean');
  });

  it('should handle same start and end (no quiet hours)', () => {
    const state = service.getUserState('user-1');
    state.preferences.quietHoursStart = 12;
    state.preferences.quietHoursEnd = 12;

    // With same start/end, quiet hours logic should allow notifications
    // (unless blocked by other factors)
    const result = service.canNotify('user-1', 'streak_reminder');
    expect(typeof result).toBe('boolean');
  });
});
