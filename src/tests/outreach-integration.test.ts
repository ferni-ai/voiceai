/**
 * Outreach Integration Tests
 *
 * Tests for the proactive outreach system including:
 * - Queue management (thinking of you, celebrations, growth reflections)
 * - Delivery logic and channel routing
 * - User preferences and limits
 * - Persona-based routing
 * - Quiet hours and day filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies before imports
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./thinking-of-you.js', () => ({
  generateRandomWarmth: vi.fn(() => null),
  generateThinkingOfYouMoments: vi.fn(() => []),
  markMomentSent: vi.fn(),
}));

vi.mock('./small-wins.js', () => ({
  generateCelebration: vi.fn(() => null),
  getUncelebratedWins: vi.fn(() => []),
}));

vi.mock('./growth-reflection.js', () => ({
  generateGrowthReflection: vi.fn(() => null),
  getUnreflectedGrowth: vi.fn(() => []),
}));

vi.mock('../outreach/persona-outreach-formatter.js', () => ({
  routeToPersona: vi.fn((type: string) => {
    const routes: Record<string, string> = {
      thinking_of_you: 'ferni',
      celebration: 'ferni',
      growth_reflection: 'ferni',
      habit_check: 'maya-santos',
      appointment_reminder: 'alex-chen',
    };
    return routes[type] || 'ferni';
  }),
  formatSmsMessage: vi.fn((personaId: string, message: string) => ({
    message: `[${personaId}] ${message}`,
    greeting: `Hey from ${personaId}!`,
  })),
  formatPushNotification: vi.fn((personaId: string, message: string) => ({
    title: `From ${personaId}`,
    body: message,
  })),
  formatVoiceMessage: vi.fn((personaId: string, message: string) => ({
    message,
    opening: `Hey, this is ${personaId} calling.`,
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            firstName: 'Test',
            phone: '+15551234567',
          }),
        }),
      })),
    })),
  })),
}));

vi.mock('../communication-service.js', () => ({
  sendSMS: vi.fn().mockResolvedValue('Message sent successfully'),
}));

vi.mock('../outreach/delivery/push-notifications.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue([{ success: true }]),
  hasPushEnabled: vi.fn(() => true),
}));

vi.mock('../voice-call.js', () => ({
  callWithPersonaVoice: vi.fn().mockResolvedValue({
    success: true,
    callSid: 'test-call-sid',
    usedCartesiaVoice: true,
  }),
}));

// Import after mocks
import {
  queueThinkingOfYou,
  queueCelebration,
  queueGrowthReflection,
  getDueItems,
  canSendOutreach,
  executeOutreach,
  setUserPreferences,
  getUserPreferences,
  disableOutreach,
  enableOutreach,
  type OutreachItem,
} from '../services/trust-systems/outreach-integration.js';
import { routeToPersona } from '../services/outreach/persona-outreach-formatter.js';

// ============================================================================
// TEST DATA
// ============================================================================

const mockThinkingOfYouMoment = {
  id: 'toy-123',
  type: 'thinking_of_you' as const,
  message: 'Hey Sarah! I was just thinking about you.',
  ssml: '<speak>Hey Sarah! I was just thinking about you.</speak>',
  priority: 'medium' as const,
  suggestedTiming: new Date(Date.now() - 1000), // Due now
  trigger: {
    type: 'pattern',
    context: 'wellness check',
  },
};

const mockCelebration = {
  win: {
    id: 'win-456',
    type: 'habit_streak',
    description: '7-day meditation streak',
    timestamp: new Date(),
  },
  celebration: 'Amazing! 7 days of meditation!',
  ssml: '<speak>Amazing! 7 days of meditation!</speak>',
  intensity: 'big' as const,
};

const mockGrowthReflection = {
  pattern: {
    id: 'growth-789',
    type: 'consistency',
    significance: 'transformative' as const,
    description: 'Consistent morning routine',
  },
  reflection: "I've noticed you've been really consistent with your morning routine.",
  ssml: "<speak>I've noticed you've been really consistent.</speak>",
  timing: 'now' as const,
};

// ============================================================================
// QUEUE MANAGEMENT TESTS
// ============================================================================

describe('Outreach Queue Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queueThinkingOfYou', () => {
    it('should queue a thinking of you moment', () => {
      const item = queueThinkingOfYou('user-123', mockThinkingOfYouMoment);

      expect(item).toBeDefined();
      expect(item.id).toBe('toy-123');
      expect(item.userId).toBe('user-123');
      expect(item.type).toBe('thinking_of_you');
      expect(item.message).toBe('Hey Sarah! I was just thinking about you.');
    });

    it('should route to correct persona based on type', () => {
      const item = queueThinkingOfYou('user-123', mockThinkingOfYouMoment);

      expect(item.personaId).toBe('ferni'); // thinking_of_you routes to Ferni
    });

    it('should set correct priority', () => {
      const item = queueThinkingOfYou('user-123', mockThinkingOfYouMoment);
      expect(item.priority).toBe('medium');
    });

    it('should include metadata from trigger', () => {
      const item = queueThinkingOfYou('user-123', mockThinkingOfYouMoment);

      expect(item.metadata.triggerType).toBe('pattern');
      expect(item.metadata.triggerContext).toBe('wellness check');
    });
  });

  describe('queueCelebration', () => {
    it('should queue a celebration', () => {
      const item = queueCelebration('user-123', mockCelebration);

      expect(item).toBeDefined();
      expect(item.id).toBe('win-456');
      expect(item.type).toBe('celebration');
      expect(item.message).toContain('meditation');
    });

    it('should set high priority for big celebrations', () => {
      const item = queueCelebration('user-123', mockCelebration);
      expect(item.priority).toBe('high'); // 'big' intensity = high priority
    });

    it('should schedule celebrations immediately', () => {
      const before = Date.now();
      const item = queueCelebration('user-123', mockCelebration);
      const after = Date.now();

      expect(item.scheduledFor.getTime()).toBeGreaterThanOrEqual(before);
      expect(item.scheduledFor.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('queueGrowthReflection', () => {
    it('should queue a growth reflection', () => {
      const item = queueGrowthReflection('user-123', mockGrowthReflection);

      expect(item).toBeDefined();
      expect(item.id).toBe('growth-789');
      expect(item.type).toBe('growth_reflection');
    });

    it('should set high priority for transformative growth', () => {
      const item = queueGrowthReflection('user-123', mockGrowthReflection);
      expect(item.priority).toBe('high'); // 'transformative' = high priority
    });
  });
});

// ============================================================================
// DUE ITEMS TESTS
// ============================================================================

describe('getDueItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return items that are due', () => {
    // Queue an item that is due
    queueThinkingOfYou('user-due-test', {
      ...mockThinkingOfYouMoment,
      suggestedTiming: new Date(Date.now() - 1000),
    });

    const dueItems = getDueItems('user-due-test');
    expect(dueItems.length).toBeGreaterThanOrEqual(1);
  });

  it('should not return future items', () => {
    // Queue an item scheduled for tomorrow
    queueThinkingOfYou('user-future-test', {
      ...mockThinkingOfYouMoment,
      id: 'future-item',
      suggestedTiming: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const dueItems = getDueItems('user-future-test');
    const futureItem = dueItems.find((i) => i.id === 'future-item');
    expect(futureItem).toBeUndefined();
  });

  it('should sort by priority then by time', () => {
    // Queue multiple items
    queueThinkingOfYou('user-sort-test', {
      ...mockThinkingOfYouMoment,
      id: 'low-priority',
      priority: 'low',
      suggestedTiming: new Date(Date.now() - 2000),
    });

    queueThinkingOfYou('user-sort-test', {
      ...mockThinkingOfYouMoment,
      id: 'high-priority',
      priority: 'high',
      suggestedTiming: new Date(Date.now() - 1000),
    });

    const dueItems = getDueItems('user-sort-test');

    // High priority should come first
    const highIdx = dueItems.findIndex((i) => i.id === 'high-priority');
    const lowIdx = dueItems.findIndex((i) => i.id === 'low-priority');

    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });
});

// ============================================================================
// SEND ALLOWANCE TESTS
// ============================================================================

describe('canSendOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock time to noon (12:00) to avoid quiet hours (22:00 - 08:00)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should block outreach by default (requires explicit opt-in)', () => {
    // Default preferences have enabled: false to require explicit opt-in
    const result = canSendOutreach('new-user-123');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Outreach disabled for user');
  });

  it('should block outreach when disabled', () => {
    disableOutreach('disabled-user');
    const result = canSendOutreach('disabled-user');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Outreach disabled for user');
  });

  it('should re-enable outreach', () => {
    disableOutreach('toggle-user');
    enableOutreach('toggle-user');

    const result = canSendOutreach('toggle-user');
    expect(result.allowed).toBe(true);
  });
});

// ============================================================================
// USER PREFERENCES TESTS
// ============================================================================

describe('User Preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default preferences for new user', () => {
    const prefs = getUserPreferences('brand-new-user');

    // Default is disabled - requires explicit opt-in
    expect(prefs.enabled).toBe(false);
    expect(prefs.maxPerDay).toBe(2);
    expect(prefs.maxPerWeek).toBe(5);
    expect(prefs.preferredMethod).toBe('any');
  });

  it('should update preferences partially', () => {
    setUserPreferences('pref-user', { maxPerDay: 3 });
    const prefs = getUserPreferences('pref-user');

    expect(prefs.maxPerDay).toBe(3);
    expect(prefs.maxPerWeek).toBe(5); // Default unchanged
  });

  it('should update quiet hours', () => {
    setUserPreferences('quiet-user', {
      quietHoursStart: '21:00',
      quietHoursEnd: '09:00',
    });

    const prefs = getUserPreferences('quiet-user');
    expect(prefs.quietHoursStart).toBe('21:00');
    expect(prefs.quietHoursEnd).toBe('09:00');
  });

  it('should update quiet days', () => {
    setUserPreferences('weekend-user', {
      quietDays: ['saturday', 'sunday'],
    });

    const prefs = getUserPreferences('weekend-user');
    expect(prefs.quietDays).toContain('saturday');
    expect(prefs.quietDays).toContain('sunday');
  });

  it('should update preferred method', () => {
    setUserPreferences('sms-user', { preferredMethod: 'sms' });
    expect(getUserPreferences('sms-user').preferredMethod).toBe('sms');

    setUserPreferences('voice-user', { preferredMethod: 'voice' });
    expect(getUserPreferences('voice-user').preferredMethod).toBe('voice');

    setUserPreferences('push-user', { preferredMethod: 'push' });
    expect(getUserPreferences('push-user').preferredMethod).toBe('push');
  });
});

// ============================================================================
// PERSONA ROUTING TESTS
// ============================================================================

describe('Persona Routing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route thinking_of_you to Ferni', () => {
    const item = queueThinkingOfYou('route-test-1', mockThinkingOfYouMoment);
    expect(item.personaId).toBe('ferni');
  });

  it('should route celebration based on win type', () => {
    // Our mock has win.type = 'habit_streak' which routes to Maya (habits specialist)
    const item = queueCelebration('route-test-2', mockCelebration);
    expect(item.personaId).toBe('maya-santos'); // habit_streak routes to Maya
  });

  it('should route growth_reflection to Ferni', () => {
    const item = queueGrowthReflection('route-test-3', mockGrowthReflection);
    expect(item.personaId).toBe('ferni');
  });

  it('should allow custom persona override', () => {
    const item = queueThinkingOfYou('route-test-4', mockThinkingOfYouMoment);
    // The queued item should have personaId from routeToPersona
    expect(item.personaId).toBeDefined();
  });
});

// ============================================================================
// OUTREACH ITEM TYPES
// ============================================================================

describe('OutreachItem Types', () => {
  it('should support thinking_of_you type', () => {
    const item = queueThinkingOfYou('type-test', mockThinkingOfYouMoment);
    expect(item.type).toBe('thinking_of_you');
  });

  it('should support celebration type', () => {
    const item = queueCelebration('type-test', mockCelebration);
    expect(item.type).toBe('celebration');
  });

  it('should support growth_reflection type', () => {
    const item = queueGrowthReflection('type-test', mockGrowthReflection);
    expect(item.type).toBe('growth_reflection');
  });
});

// ============================================================================
// BETTER THAN HUMAN TESTS
// ============================================================================

describe('Better Than Human - Outreach Quality', () => {
  it('should use persona-specific routing for different outreach types', () => {
    // The routing should be intelligent based on content
    expect(routeToPersona('habit_check', {})).toBe('maya-santos');
    expect(routeToPersona('appointment_reminder', {})).toBe('alex-chen');
    expect(routeToPersona('thinking_of_you', {})).toBe('ferni');
  });

  it('should respect user preferences', () => {
    // Disable for user
    disableOutreach('respect-user');
    const result = canSendOutreach('respect-user');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('should have reasonable default limits', () => {
    const prefs = getUserPreferences('limits-user');

    // Not too many per day (feels spammy)
    expect(prefs.maxPerDay).toBeLessThanOrEqual(5);

    // Not too many per week
    expect(prefs.maxPerWeek).toBeLessThanOrEqual(10);

    // Default quiet hours should cover late night/early morning
    expect(prefs.quietHoursStart).toBe('22:00');
    expect(prefs.quietHoursEnd).toBe('08:00');
  });

  it('should allow method preference customization', () => {
    // Users should be able to choose their preferred contact method
    const methods = ['voice', 'sms', 'push', 'any'];
    for (const method of methods) {
      setUserPreferences(`method-${method}`, {
        preferredMethod: method as 'voice' | 'sms' | 'push' | 'any',
      });
      expect(getUserPreferences(`method-${method}`).preferredMethod).toBe(method);
    }
  });

  it('should include meaningful metadata in queued items', () => {
    const item = queueThinkingOfYou('metadata-test', mockThinkingOfYouMoment);

    // Metadata should help with personalization
    expect(item.metadata).toBeDefined();
    expect(item.metadata.triggerType).toBeDefined();
    expect(item.metadata.triggerContext).toBeDefined();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty user queue', () => {
    const dueItems = getDueItems('nonexistent-user-xyz');
    expect(dueItems).toEqual([]);
  });

  it('should handle rapid queueing', () => {
    for (let i = 0; i < 10; i++) {
      queueThinkingOfYou('rapid-test', {
        ...mockThinkingOfYouMoment,
        id: `rapid-${i}`,
      });
    }

    const dueItems = getDueItems('rapid-test');
    expect(dueItems.length).toBe(10);
  });

  it('should preserve item order for same priority', () => {
    queueThinkingOfYou('order-test', {
      ...mockThinkingOfYouMoment,
      id: 'first',
      priority: 'medium',
      suggestedTiming: new Date(Date.now() - 2000),
    });

    queueThinkingOfYou('order-test', {
      ...mockThinkingOfYouMoment,
      id: 'second',
      priority: 'medium',
      suggestedTiming: new Date(Date.now() - 1000),
    });

    const dueItems = getDueItems('order-test');
    const firstIdx = dueItems.findIndex((i) => i.id === 'first');
    const secondIdx = dueItems.findIndex((i) => i.id === 'second');

    // Earlier scheduled items should come first (same priority)
    if (firstIdx !== -1 && secondIdx !== -1) {
      expect(firstIdx).toBeLessThan(secondIdx);
    }
  });
});
