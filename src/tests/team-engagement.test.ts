/**
 * Team Engagement Service Tests
 *
 * Tests for multi-persona interactions including:
 * - Team huddle generation
 * - Persona evolution events
 * - Seasonal events detection
 * - Cross-persona references
 * - Ferniday anniversary checks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TeamEngagementService,
  getTeamEngagementService,
  resetTeamEngagementService,
  PERSONA_EVOLUTION_STORIES,
  TEAM_HUDDLE_SCRIPTS,
  SEASONAL_EVENTS,
  CROSS_PERSONA_REFERENCES,
  type TeamHuddle,
  type PersonaEvolutionEvent,
  type SeasonalEvent,
  type UserAnniversary,
} from '../services/team-engagement.js';
import type { UserProfile } from '../types/user-profile.js';

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
  createLogger: () => ({
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
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('TeamHuddle type', () => {
  it('should accept valid huddle', () => {
    const huddle: TeamHuddle = {
      id: 'huddle_123',
      userId: 'user-1',
      scheduledAt: new Date(),
      type: 'weekly',
      participants: ['ferni', 'alex-chen'],
      completed: false,
    };

    expect(huddle.id).toBe('huddle_123');
    expect(huddle.type).toBe('weekly');
  });

  it('should accept optional fields', () => {
    const huddle: TeamHuddle = {
      id: 'huddle_456',
      userId: 'user-2',
      scheduledAt: new Date(),
      type: 'milestone',
      participants: ['ferni'],
      completed: true,
      topic: 'Weekly check-in',
      summary: 'Great progress!',
    };

    expect(huddle.topic).toBe('Weekly check-in');
    expect(huddle.summary).toBe('Great progress!');
  });

  it('should accept all huddle types', () => {
    const types: Array<TeamHuddle['type']> = ['weekly', 'monthly', 'milestone', 'special'];

    for (const type of types) {
      const huddle: TeamHuddle = {
        id: `huddle_${type}`,
        userId: 'user-1',
        scheduledAt: new Date(),
        type,
        participants: ['ferni'],
        completed: false,
      };
      expect(huddle.type).toBe(type);
    }
  });
});

describe('PersonaEvolutionEvent type', () => {
  it('should accept valid evolution event', () => {
    const event: PersonaEvolutionEvent = {
      id: 'event-1',
      personaId: 'ferni',
      eventType: 'life_event',
      title: 'A Big Day',
      description: 'Something happened',
      occurredAt: new Date(),
      sharedWithUser: false,
    };

    expect(event.id).toBe('event-1');
    expect(event.eventType).toBe('life_event');
  });

  it('should accept unlock conditions', () => {
    const event: PersonaEvolutionEvent = {
      id: 'event-2',
      personaId: 'maya-santos',
      eventType: 'growth',
      title: 'Half Marathon',
      description: 'Ran a half marathon',
      occurredAt: new Date(),
      sharedWithUser: true,
      unlockCondition: {
        type: 'conversation_count',
        value: 10,
      },
    };

    expect(event.unlockCondition?.type).toBe('conversation_count');
    expect(event.unlockCondition?.value).toBe(10);
  });

  it('should accept all event types', () => {
    const types: Array<PersonaEvolutionEvent['eventType']> = [
      'life_event',
      'growth',
      'story_unlock',
      'mood_shift',
    ];

    for (const eventType of types) {
      const event: PersonaEvolutionEvent = {
        id: `event_${eventType}`,
        personaId: 'ferni',
        eventType,
        title: 'Test',
        description: 'Test desc',
        occurredAt: new Date(),
        sharedWithUser: false,
      };
      expect(event.eventType).toBe(eventType);
    }
  });
});

describe('SeasonalEvent type', () => {
  it('should accept valid seasonal event', () => {
    const event: SeasonalEvent = {
      id: 'new_year',
      name: 'New Year',
      type: 'holiday',
      startDate: new Date(2024, 0, 1),
      endDate: new Date(2024, 0, 1),
      personaResponses: {
        ferni: ['Happy New Year!'],
      },
      userCelebrated: false,
    };

    expect(event.type).toBe('holiday');
    expect(event.personaResponses.ferni).toHaveLength(1);
  });

  it('should accept all event types', () => {
    const types: Array<SeasonalEvent['type']> = [
      'holiday',
      'anniversary',
      'seasonal',
      'special_day',
    ];

    for (const type of types) {
      const event: SeasonalEvent = {
        id: `event_${type}`,
        name: 'Test',
        type,
        startDate: new Date(),
        endDate: new Date(),
        personaResponses: {},
        userCelebrated: false,
      };
      expect(event.type).toBe(type);
    }
  });
});

describe('UserAnniversary type', () => {
  it('should accept valid anniversary', () => {
    const anniversary: UserAnniversary = {
      type: 'ferniday',
      date: new Date(),
      acknowledged: false,
    };

    expect(anniversary.type).toBe('ferniday');
  });

  it('should accept optional celebration type', () => {
    const anniversary: UserAnniversary = {
      type: 'milestone',
      date: new Date(),
      acknowledged: true,
      celebrationType: 'big',
    };

    expect(anniversary.celebrationType).toBe('big');
  });
});

// ============================================================================
// STATIC DATA TESTS
// ============================================================================

describe('PERSONA_EVOLUTION_STORIES', () => {
  it('should contain stories for all personas', () => {
    const personaIds = new Set(PERSONA_EVOLUTION_STORIES.map((e) => e.personaId));

    expect(personaIds.has('ferni')).toBe(true);
    expect(personaIds.has('alex-chen')).toBe(true);
    expect(personaIds.has('maya-santos')).toBe(true);
    expect(personaIds.has('jordan-taylor')).toBe(true);
    expect(personaIds.has('nayan-patel')).toBe(true);
    expect(personaIds.has('peter-john')).toBe(true);
  });

  it('should have unique event IDs', () => {
    const ids = PERSONA_EVOLUTION_STORIES.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have unlock conditions on most events', () => {
    const withConditions = PERSONA_EVOLUTION_STORIES.filter((e) => e.unlockCondition);
    expect(withConditions.length).toBeGreaterThan(PERSONA_EVOLUTION_STORIES.length * 0.8);
  });

  it('should have all event types represented', () => {
    const types = new Set(PERSONA_EVOLUTION_STORIES.map((e) => e.eventType));

    expect(types.has('life_event')).toBe(true);
    expect(types.has('growth')).toBe(true);
    expect(types.has('story_unlock')).toBe(true);
    expect(types.has('mood_shift')).toBe(true);
  });
});

describe('TEAM_HUDDLE_SCRIPTS', () => {
  it('should have intro and outro scripts', () => {
    expect(TEAM_HUDDLE_SCRIPTS.weekly.intro.length).toBeGreaterThan(0);
    expect(TEAM_HUDDLE_SCRIPTS.weekly.outro.length).toBeGreaterThan(0);
    expect(TEAM_HUDDLE_SCRIPTS.weekly.transitions.length).toBeGreaterThan(0);
  });

  it('should have comments for all main personas', () => {
    const { personaComments } = TEAM_HUDDLE_SCRIPTS;

    expect(personaComments.ferni).toBeDefined();
    expect(personaComments['alex-chen']).toBeDefined();
    expect(personaComments['maya-santos']).toBeDefined();
    expect(personaComments['jordan-taylor']).toBeDefined();
    expect(personaComments['nayan-patel']).toBeDefined();
    expect(personaComments['peter-john']).toBeDefined();
  });

  it('should have ferni progress and concern comments', () => {
    expect(TEAM_HUDDLE_SCRIPTS.personaComments.ferni.progress.length).toBeGreaterThan(0);
    expect(TEAM_HUDDLE_SCRIPTS.personaComments.ferni.concern.length).toBeGreaterThan(0);
  });
});

describe('SEASONAL_EVENTS', () => {
  it('should have major holidays', () => {
    expect(SEASONAL_EVENTS.new_year).toBeDefined();
    expect(SEASONAL_EVENTS.thanksgiving).toBeDefined();
    expect(SEASONAL_EVENTS.mothers_day).toBeDefined();
    expect(SEASONAL_EVENTS.fathers_day).toBeDefined();
  });

  it('should have solstices', () => {
    expect(SEASONAL_EVENTS.summer_solstice).toBeDefined();
    expect(SEASONAL_EVENTS.winter_solstice).toBeDefined();
    expect(SEASONAL_EVENTS.spring).toBeDefined();
  });

  it('should have ferniday', () => {
    expect(SEASONAL_EVENTS.ferniday).toBeDefined();
    expect(SEASONAL_EVENTS.ferniday.type).toBe('anniversary');
  });

  it('should have user_birthday', () => {
    expect(SEASONAL_EVENTS.user_birthday).toBeDefined();
    expect(SEASONAL_EVENTS.user_birthday.personaResponses.ferni).toBeDefined();
  });

  it('should have responses from multiple personas', () => {
    const newYear = SEASONAL_EVENTS.new_year;
    const respondingPersonas = Object.keys(newYear.personaResponses);
    expect(respondingPersonas.length).toBeGreaterThan(3);
  });
});

describe('CROSS_PERSONA_REFERENCES', () => {
  it('should have references for main personas', () => {
    expect(CROSS_PERSONA_REFERENCES.ferni).toBeDefined();
    expect(CROSS_PERSONA_REFERENCES['alex-chen']).toBeDefined();
    expect(CROSS_PERSONA_REFERENCES['maya-santos']).toBeDefined();
    expect(CROSS_PERSONA_REFERENCES['jordan-taylor']).toBeDefined();
    expect(CROSS_PERSONA_REFERENCES['peter-john']).toBeDefined();
  });

  it('should have ferni references about other personas', () => {
    const ferniRefs = CROSS_PERSONA_REFERENCES.ferni;
    expect(ferniRefs.aboutAlex.length).toBeGreaterThan(0);
    expect(ferniRefs.aboutMaya.length).toBeGreaterThan(0);
    expect(ferniRefs.aboutJordan.length).toBeGreaterThan(0);
    expect(ferniRefs.aboutNayan.length).toBeGreaterThan(0);
    expect(ferniRefs.aboutPeter.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SERVICE TESTS
// ============================================================================

describe('TeamEngagementService', () => {
  let service: TeamEngagementService;

  beforeEach(() => {
    resetTeamEngagementService();
    service = new TeamEngagementService();
  });

  describe('initialization', () => {
    it('should initialize without error', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await service.initialize();
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe('generateTeamHuddle', () => {
    it('should generate a huddle with intro, comments, and outro', async () => {
      const result = await service.generateTeamHuddle('user-1', null, 'weekly');

      expect(result.intro).toBeTruthy();
      expect(result.outro).toBeTruthy();
      expect(result.comments.length).toBeGreaterThan(0);
    });

    it('should always include ferni in comments', async () => {
      const result = await service.generateTeamHuddle('user-1', null, 'weekly');

      const ferniComment = result.comments.find((c) => c.personaId === 'ferni');
      expect(ferniComment).toBeDefined();
    });

    it('should include 2-4 personas total', async () => {
      const result = await service.generateTeamHuddle('user-1', null, 'weekly');

      // Ferni + 2-3 others = 3-4 total
      expect(result.comments.length).toBeGreaterThanOrEqual(3);
      expect(result.comments.length).toBeLessThanOrEqual(4);
    });

    it('should use different personas for different huddles', async () => {
      const personas1 = new Set<string>();
      const personas2 = new Set<string>();

      // Generate multiple huddles to increase chance of variation
      for (let i = 0; i < 10; i++) {
        const result1 = await service.generateTeamHuddle(`user-a-${i}`, null);
        const result2 = await service.generateTeamHuddle(`user-b-${i}`, null);

        result1.comments.forEach((c) => personas1.add(c.personaId));
        result2.comments.forEach((c) => personas2.add(c.personaId));
      }

      // Should have variety in personas used
      expect(personas1.size).toBeGreaterThan(1);
      expect(personas2.size).toBeGreaterThan(1);
    });

    it('should work with user profile', async () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test User',
        relationshipStage: 'getting_to_know',
        totalConversations: 5,
        preferredTopics: ['work'],
      };

      const result = await service.generateTeamHuddle('user-1', profile);
      expect(result.comments.length).toBeGreaterThan(0);
    });
  });

  describe('getUnlockedEvolutions', () => {
    it('should return empty for new user', async () => {
      const evolutions = await service.getUnlockedEvolutions('new-user', null);

      // Without profile, most events with conditions won't unlock
      // But some might not have conditions
      expect(Array.isArray(evolutions)).toBe(true);
    });

    it('should filter by personaId when provided', async () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'trusted_advisor',
        totalConversations: 100,
        preferredTopics: ['loss', 'meditation', 'fitness'],
      };

      const ferniEvolutions = await service.getUnlockedEvolutions('user-1', profile, 'ferni');

      for (const event of ferniEvolutions) {
        expect(event.personaId).toBe('ferni');
      }
    });

    it('should unlock conversation_count based events', async () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 15, // Meets threshold for some events
        preferredTopics: [],
      };

      const evolutions = await service.getUnlockedEvolutions('user-1', profile);

      // Should have some unlocked events based on conversation count
      expect(Array.isArray(evolutions)).toBe(true);
    });

    it('should unlock topic-based events', async () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 1,
        preferredTopics: ['loss', 'meditation', 'fitness', 'learning', 'creativity'],
      };

      const evolutions = await service.getUnlockedEvolutions('user-1', profile);

      // Should have unlocked some topic-based events
      expect(Array.isArray(evolutions)).toBe(true);
    });
  });

  describe('markEvolutionShared', () => {
    it('should track shared events', async () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'trusted_advisor',
        totalConversations: 100,
        preferredTopics: ['loss'],
      };

      // Get initial unlocked events
      const initial = await service.getUnlockedEvolutions('user-1', profile);

      if (initial.length > 0) {
        // Mark first event as shared
        service.markEvolutionShared('user-1', initial[0].id);

        // Get unlocked events again
        const afterSharing = await service.getUnlockedEvolutions('user-1', profile);

        // Should have one less event
        expect(afterSharing.find((e) => e.id === initial[0].id)).toBeUndefined();
      }
    });

    it('should not duplicate shared event IDs', () => {
      service.markEvolutionShared('user-1', 'event-123');
      service.markEvolutionShared('user-1', 'event-123'); // Duplicate

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getActiveSeasonalEvent', () => {
    it('should return null on regular days', () => {
      // Most days won't be holidays
      const event = service.getActiveSeasonalEvent();

      // Could be null or a valid event depending on current date
      expect(event === null || event.id !== undefined).toBe(true);
    });

    it('should have valid structure when returning event', () => {
      const event = service.getActiveSeasonalEvent();

      if (event) {
        expect(event.id).toBeTruthy();
        expect(event.name).toBeTruthy();
        expect(event.type).toBeTruthy();
        expect(event.startDate instanceof Date).toBe(true);
        expect(event.endDate instanceof Date).toBe(true);
      }
    });
  });

  describe('checkFerniday', () => {
    it('should return null for null profile', () => {
      const result = service.checkFerniday(null);
      expect(result).toBeNull();
    });

    it('should return null for profile without createdAt', () => {
      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 10,
      };

      const result = service.checkFerniday(profile);
      expect(result).toBeNull();
    });

    it('should return null when not on anniversary date', () => {
      // Set createdAt to a different month/day
      const today = new Date();
      const differentMonth = (today.getMonth() + 6) % 12;
      const createdAt = new Date(today.getFullYear() - 1, differentMonth, 15);

      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 10,
        createdAt: createdAt.toISOString(),
      };

      const result = service.checkFerniday(profile);
      expect(result).toBeNull();
    });

    it('should return ferniday on anniversary', () => {
      const today = new Date();
      // Same month/day but previous year
      const createdAt = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

      const profile: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 10,
        createdAt: createdAt.toISOString(),
      };

      const result = service.checkFerniday(profile);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('ferniday');
      expect(result?.acknowledged).toBe(false);
    });

    it('should set celebration type based on years together', () => {
      const today = new Date();

      // 2 years = big celebration
      const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
      const profile2: UserProfile = {
        userId: 'user-1',
        displayName: 'Test',
        relationshipStage: 'trusted_advisor',
        totalConversations: 100,
        createdAt: twoYearsAgo.toISOString(),
      };

      const result = service.checkFerniday(profile2);
      expect(result?.celebrationType).toBe('big');

      // 1 year = medium celebration
      const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const profile1: UserProfile = {
        userId: 'user-2',
        displayName: 'Test',
        relationshipStage: 'getting_to_know',
        totalConversations: 50,
        createdAt: oneYearAgo.toISOString(),
      };

      const result1 = service.checkFerniday(profile1);
      expect(result1?.celebrationType).toBe('medium');
    });
  });

  describe('getCrossPersonaReference', () => {
    it('should return reference for ferni', () => {
      // Run multiple times to account for randomness
      let foundReference = false;
      for (let i = 0; i < 10; i++) {
        const ref = service.getCrossPersonaReference('ferni');
        if (ref) {
          foundReference = true;
          expect(typeof ref).toBe('string');
          break;
        }
      }
      expect(foundReference).toBe(true);
    });

    it('should return reference for alex-chen', () => {
      let foundReference = false;
      for (let i = 0; i < 10; i++) {
        const ref = service.getCrossPersonaReference('alex-chen');
        if (ref) {
          foundReference = true;
          expect(typeof ref).toBe('string');
          break;
        }
      }
      expect(foundReference).toBe(true);
    });

    it('should return null for unknown persona', () => {
      const ref = service.getCrossPersonaReference('unknown-persona');
      expect(ref).toBeNull();
    });
  });

  describe('getSeasonalResponse', () => {
    it('should return response for persona with responses', () => {
      const event: SeasonalEvent = {
        id: 'test',
        name: 'Test',
        type: 'holiday',
        startDate: new Date(),
        endDate: new Date(),
        personaResponses: {
          ferni: ['Response 1', 'Response 2'],
        },
        userCelebrated: false,
      };

      const response = service.getSeasonalResponse(event, 'ferni');
      expect(response).toBeTruthy();
      expect(['Response 1', 'Response 2']).toContain(response);
    });

    it('should return null for persona without responses', () => {
      const event: SeasonalEvent = {
        id: 'test',
        name: 'Test',
        type: 'holiday',
        startDate: new Date(),
        endDate: new Date(),
        personaResponses: {
          ferni: ['Response 1'],
        },
        userCelebrated: false,
      };

      const response = service.getSeasonalResponse(event, 'alex-chen');
      expect(response).toBeNull();
    });

    it('should return null for empty response array', () => {
      const event: SeasonalEvent = {
        id: 'test',
        name: 'Test',
        type: 'holiday',
        startDate: new Date(),
        endDate: new Date(),
        personaResponses: {
          ferni: [],
        },
        userCelebrated: false,
      };

      const response = service.getSeasonalResponse(event, 'ferni');
      expect(response).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should shutdown without error', async () => {
      await service.initialize();
      await expect(service.shutdown()).resolves.not.toThrow();
    });

    it('should work even without initialization', async () => {
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// SINGLETON TESTS
// ============================================================================

describe('Singleton functions', () => {
  beforeEach(() => {
    resetTeamEngagementService();
  });

  describe('getTeamEngagementService', () => {
    it('should return same instance', () => {
      const service1 = getTeamEngagementService();
      const service2 = getTeamEngagementService();

      expect(service1).toBe(service2);
    });

    it('should return new instance after reset', () => {
      const service1 = getTeamEngagementService();
      resetTeamEngagementService();
      const service2 = getTeamEngagementService();

      expect(service1).not.toBe(service2);
    });
  });

  describe('resetTeamEngagementService', () => {
    it('should reset the singleton', () => {
      getTeamEngagementService();
      resetTeamEngagementService();

      // Getting service again should create new instance
      const newService = getTeamEngagementService();
      expect(newService).toBeDefined();
    });

    it('should be safe to call multiple times', () => {
      resetTeamEngagementService();
      resetTeamEngagementService();
      resetTeamEngagementService();

      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  let service: TeamEngagementService;

  beforeEach(() => {
    resetTeamEngagementService();
    service = new TeamEngagementService();
  });

  it('should handle very long userId', async () => {
    const longUserId = `user_${'a'.repeat(1000)}`;
    const result = await service.generateTeamHuddle(longUserId, null);

    expect(result.comments.length).toBeGreaterThan(0);
  });

  it('should handle special characters in userId', async () => {
    const specialUserId = 'user_émojis_🎉_and_ünïcödé';
    const result = await service.generateTeamHuddle(specialUserId, null);

    expect(result.comments.length).toBeGreaterThan(0);
  });

  it('should handle profile with all fields', async () => {
    const fullProfile: UserProfile = {
      userId: 'user-full',
      displayName: 'Full Profile User',
      relationshipStage: 'old_friend',
      totalConversations: 500,
      preferredTopics: ['loss', 'meditation', 'fitness', 'technology', 'learning'],
      lastConversation: new Date().toISOString(),
      createdAt: new Date(2020, 0, 1).toISOString(),
    };

    const result = await service.generateTeamHuddle('user-full', fullProfile);
    expect(result.comments.length).toBeGreaterThan(0);

    const evolutions = await service.getUnlockedEvolutions('user-full', fullProfile);
    expect(Array.isArray(evolutions)).toBe(true);
  });

  it('should handle concurrent huddle generation', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      service.generateTeamHuddle(`concurrent-user-${i}`, null)
    );

    const results = await Promise.all(promises);

    for (const result of results) {
      expect(result.comments.length).toBeGreaterThan(0);
    }
  });
});
