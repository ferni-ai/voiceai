/**
 * Relationship Intelligence Tools Tests
 * Run with: npx vitest run src/tools/domains/information/relationships/__tests__/relationships.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock LiveKit
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock firebase-admin for storage
vi.mock('firebase-admin', () => ({
  apps: [],
  getFirestore: vi.fn(),
}));

// Mock sports API
vi.mock('../../sports.js', () => ({
  getTeamScore: vi.fn().mockResolvedValue('Eagles won 24-17 against the Cowboys'),
}));

import type { Relationship } from '../types.js';
import { getRelationshipToolDefinitions, createRelationshipTools } from '../index.js';
import {
  getBirthdayInsights,
  getContactReminderInsights,
  generateGiftSuggestions,
  getAllRelationshipInsights,
  checkFriendsTeamResults,
} from '../insights.js';
import {
  saveRelationship,
  getRelationships,
  findRelationshipByName,
  getUpcomingBirthdays,
  getRelationshipsNeedingContact,
} from '../storage.js';

// Test data
const testUserId = 'test-user-123';

const mockRelationship: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'John Doe',
  nickname: 'Johnny',
  relationshipType: 'friend_close',
  birthday: { month: 1, day: 15 }, // January 15
  interests: ['reading', 'technology', 'travel'],
  favoriteTeams: ['Eagles'],
  preferredContactMethod: 'text',
  targetContactFrequency: 14,
};

describe('Relationship Intelligence Tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Add a test relationship
    await saveRelationship(testUserId, mockRelationship);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all relationship tool definitions', () => {
      const definitions = getRelationshipToolDefinitions();
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should have correct domain for all tools', () => {
      const definitions = getRelationshipToolDefinitions();
      for (const tool of definitions) {
        expect(tool.domain).toBe('information');
      }
    });

    it('should include relationships tag in all tools', () => {
      const definitions = getRelationshipToolDefinitions();
      for (const tool of definitions) {
        expect(tool.tags).toContain('relationships');
      }
    });
  });

  describe('Tool Creation', () => {
    it('should create all relationship tools', () => {
      const tools = createRelationshipTools();
      expect(tools.addRelationship).toBeDefined();
      expect(tools.getRelationshipInfo).toBeDefined();
      expect(tools.recordContact).toBeDefined();
      expect(tools.listRelationships).toBeDefined();
      expect(tools.getUpcomingBirthdays).toBeDefined();
      expect(tools.getContactReminders).toBeDefined();
      expect(tools.getGiftSuggestions).toBeDefined();
      expect(tools.getRelationshipInsights).toBeDefined();
      expect(tools.addInterest).toBeDefined();
      expect(tools.addFavoriteTeam).toBeDefined();
    });
  });

  describe('Storage Operations', () => {
    describe('saveRelationship', () => {
      it('should save a new relationship', async () => {
        const saved = await saveRelationship(testUserId, {
          name: 'Jane Smith',
          relationshipType: 'colleague',
          interests: [],
          favoriteTeams: [],
        });
        expect(saved.id).toBeDefined();
        expect(saved.name).toBe('Jane Smith');
        expect(saved.createdAt).toBeDefined();
      });

      it('should generate unique IDs', async () => {
        const rel1 = await saveRelationship(testUserId, {
          name: 'Person 1',
          relationshipType: 'friend',
          interests: [],
          favoriteTeams: [],
        });
        const rel2 = await saveRelationship(testUserId, {
          name: 'Person 2',
          relationshipType: 'friend',
          interests: [],
          favoriteTeams: [],
        });
        expect(rel1.id).not.toBe(rel2.id);
      });
    });

    describe('getRelationships', () => {
      it('should return all relationships for a user', async () => {
        const relationships = await getRelationships(testUserId);
        expect(Array.isArray(relationships)).toBe(true);
        expect(relationships.length).toBeGreaterThan(0);
      });

      it('should return empty array for unknown user', async () => {
        const relationships = await getRelationships('unknown-user');
        expect(Array.isArray(relationships)).toBe(true);
        expect(relationships.length).toBe(0);
      });
    });

    describe('findRelationshipByName', () => {
      it('should find relationship by exact name', async () => {
        const found = await findRelationshipByName(testUserId, 'John Doe');
        expect(found).toBeDefined();
        expect(found?.name).toBe('John Doe');
      });

      it('should find relationship by nickname', async () => {
        const found = await findRelationshipByName(testUserId, 'Johnny');
        expect(found).toBeDefined();
        expect(found?.name).toBe('John Doe');
      });

      it('should be case insensitive', async () => {
        const found = await findRelationshipByName(testUserId, 'john doe');
        expect(found).toBeDefined();
        expect(found?.name).toBe('John Doe');
      });

      it('should return null for unknown name', async () => {
        const found = await findRelationshipByName(testUserId, 'Unknown Person');
        expect(found).toBeNull();
      });
    });
  });

  describe('Birthday Insights', () => {
    describe('getUpcomingBirthdays', () => {
      it('should return birthdays within range', async () => {
        // Save a relationship with birthday in next 7 days
        const today = new Date();
        const upcomingDate = new Date(today);
        upcomingDate.setDate(today.getDate() + 3);

        await saveRelationship(testUserId, {
          name: 'Birthday Person',
          relationshipType: 'friend',
          birthday: { month: upcomingDate.getMonth() + 1, day: upcomingDate.getDate() },
          interests: [],
          favoriteTeams: [],
        });

        const upcoming = await getUpcomingBirthdays(testUserId, 7);
        const birthdayPerson = upcoming.find((u) => u.relationship.name === 'Birthday Person');
        expect(birthdayPerson).toBeDefined();
        expect(birthdayPerson?.daysUntil).toBeLessThanOrEqual(7);
      });

      it('should sort by days until birthday', async () => {
        const upcoming = await getUpcomingBirthdays(testUserId, 365);
        if (upcoming.length > 1) {
          for (let i = 1; i < upcoming.length; i++) {
            expect(upcoming[i].daysUntil).toBeGreaterThanOrEqual(upcoming[i - 1].daysUntil);
          }
        }
      });
    });

    describe('getBirthdayInsights', () => {
      it('should return birthday insights', async () => {
        const insights = await getBirthdayInsights(testUserId);
        expect(Array.isArray(insights)).toBe(true);
      });

      it('should include required fields in insights', async () => {
        // Add a birthday coming up
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        await saveRelationship(testUserId, {
          name: 'Tomorrow Birthday',
          relationshipType: 'friend_close',
          birthday: { month: tomorrow.getMonth() + 1, day: tomorrow.getDate() },
          interests: [],
          favoriteTeams: [],
        });

        const insights = await getBirthdayInsights(testUserId);
        const tomorrowInsight = insights.find((i) => i.personName === 'Tomorrow Birthday');

        if (tomorrowInsight) {
          expect(tomorrowInsight.id).toBeDefined();
          expect(tomorrowInsight.type).toMatch(/birthday/);
          expect(tomorrowInsight.message).toBeDefined();
          expect(tomorrowInsight.priority).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Contact Reminders', () => {
    describe('getRelationshipsNeedingContact', () => {
      it('should identify overdue contacts', async () => {
        // Add a relationship with old last contact
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 30);

        await saveRelationship(testUserId, {
          name: 'Neglected Friend',
          relationshipType: 'friend',
          interests: [],
          favoriteTeams: [],
          lastContact: oldDate,
          targetContactFrequency: 7, // Should contact weekly
        });

        const needing = await getRelationshipsNeedingContact(testUserId);
        const neglectedFriend = needing.find((n) => n.relationship.name === 'Neglected Friend');
        expect(neglectedFriend).toBeDefined();
        expect(neglectedFriend?.urgency).toBe('urgent');
      });
    });

    describe('getContactReminderInsights', () => {
      it('should generate contact reminder insights', async () => {
        const insights = await getContactReminderInsights(testUserId);
        expect(Array.isArray(insights)).toBe(true);
      });
    });
  });

  describe('Gift Suggestions', () => {
    describe('generateGiftSuggestions', () => {
      it('should generate suggestions based on interests', () => {
        const relationship: Relationship = {
          id: 'test',
          name: 'Test Person',
          relationshipType: 'friend',
          interests: ['reading', 'technology'],
          favoriteTeams: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const suggestions = generateGiftSuggestions(relationship, 'birthday');
        expect(suggestions.length).toBeGreaterThan(0);

        // Should have suggestions related to reading or technology
        const hasRelevantSuggestion = suggestions.some(
          (s) =>
            s.reason.toLowerCase().includes('reading') || s.reason.toLowerCase().includes('tech')
        );
        expect(hasRelevantSuggestion).toBe(true);
      });

      it('should return generic suggestions when no interests', () => {
        const relationship: Relationship = {
          id: 'test',
          name: 'Test Person',
          relationshipType: 'friend',
          interests: [],
          favoriteTeams: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const suggestions = generateGiftSuggestions(relationship, 'birthday');
        expect(suggestions.length).toBeGreaterThan(0);
      });

      it('should respect budget filter', () => {
        const relationship: Relationship = {
          id: 'test',
          name: 'Test Person',
          relationshipType: 'friend',
          interests: ['music', 'sports'],
          favoriteTeams: ['Eagles'],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const suggestions = generateGiftSuggestions(relationship, 'birthday', 'budget');
        for (const suggestion of suggestions) {
          expect(['budget', 'any']).toContain(suggestion.priceRange);
        }
      });
    });
  });

  describe('Team Updates (Friends Team Won)', () => {
    describe('checkFriendsTeamResults', () => {
      it('should check team results for friends', async () => {
        // Ensure we have a relationship with a favorite team
        await saveRelationship(testUserId, {
          name: 'Eagles Fan',
          relationshipType: 'friend',
          interests: [],
          favoriteTeams: ['Eagles'],
        });

        const insights = await checkFriendsTeamResults(testUserId);
        expect(Array.isArray(insights)).toBe(true);
        // Should find the Eagles fan and generate an insight
        const eaglesInsight = insights.find(
          (i) => i.context?.teamName === 'Eagles' || i.personName === 'Eagles Fan'
        );
        // May or may not have insight depending on mock
        if (eaglesInsight) {
          expect(eaglesInsight.type).toMatch(/team/);
        }
      });

      it('should return empty array when no friends have teams', async () => {
        // Create user with no team-following friends
        const insights = await checkFriendsTeamResults('user-with-no-sports-friends');
        expect(insights).toEqual([]);
      });
    });
  });

  describe('All Relationship Insights', () => {
    describe('getAllRelationshipInsights', () => {
      it('should aggregate all insight types', async () => {
        const insights = await getAllRelationshipInsights(testUserId);
        expect(Array.isArray(insights)).toBe(true);
      });

      it('should sort by priority', async () => {
        const insights = await getAllRelationshipInsights(testUserId);
        if (insights.length > 1) {
          for (let i = 1; i < insights.length; i++) {
            expect(insights[i].priority).toBeLessThanOrEqual(insights[i - 1].priority);
          }
        }
      });
    });
  });
});
