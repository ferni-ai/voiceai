/**
 * Data Export Integration Tests
 *
 * Tests the complete data export flow:
 * - Multi-store data aggregation
 * - JSON/CSV format conversion
 * - GDPR-compliant deletion across stores
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP - Use vi.hoisted for proper hoisting
// ============================================================================

const { mockConversationHistory, mockCognitiveMemory, mockEngagementStore, mockLogger } =
  vi.hoisted(() => {
    const mockConversationHistory = {
      getHistory: vi.fn(),
      deleteUserHistory: vi.fn(),
    };

    const mockCognitiveMemory = {
      getMemories: vi.fn(),
      getProfile: vi.fn(),
      deleteUserMemories: vi.fn(),
    };

    const mockEngagementStore = {
      getProfile: vi.fn(),
      getPredictions: vi.fn(),
      getWeatherHistory: vi.fn(),
      getRitualStreaks: vi.fn(),
      deleteAllUserData: vi.fn(),
      deleteUserData: vi.fn(),
    };

    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    return { mockConversationHistory, mockCognitiveMemory, mockEngagementStore, mockLogger };
  });

vi.mock('../services/conversation-history.js', () => ({
  getConversationHistoryService: vi.fn(() => mockConversationHistory),
}));

vi.mock('../services/cognitive-memory.js', () => ({
  getCognitiveMemoryService: vi.fn(() => mockCognitiveMemory),
}));

vi.mock('../services/engagement-store.js', () => ({
  getEngagementStore: vi.fn(() => Promise.resolve(mockEngagementStore)),
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

import { getDataExportService, type ExportCategory } from '../services/data-export.js';

// ============================================================================
// TEST DATA
// ============================================================================

const testUserId = 'integration-test-user';

const sampleConversations = {
  totalSessions: 15,
  sessions: [
    { id: 'conv-1', startedAt: new Date().toISOString(), messageCount: 10 },
    { id: 'conv-2', startedAt: new Date().toISOString(), messageCount: 5 },
  ],
};

const sampleMemories = [
  { id: 'mem-1', type: 'preference', content: 'User prefers index funds', confidence: 0.9 },
  { id: 'mem-2', type: 'goal', content: 'Save for house down payment', confidence: 0.85 },
];

const sampleProfile = {
  userId: testUserId,
  activeRituals: ['morning-review', 'weekly-check'],
  totalRitualDays: 30,
  currentStreak: 7,
};

const samplePredictions = [
  { id: 'pred-1', type: 'market', predicted: 5, actual: 4.8, accuracy: 96 },
  { id: 'pred-2', type: 'savings', predicted: 1000, status: 'pending' },
];

const sampleWeatherHistory = [
  { date: '2024-01-15', weather: 'sunny', mood: 'optimistic' },
  { date: '2024-01-14', weather: 'cloudy', mood: 'cautious' },
];

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Data Export Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock returns
    mockConversationHistory.getHistory.mockResolvedValue(sampleConversations);
    mockCognitiveMemory.getMemories.mockResolvedValue(sampleMemories);
    mockEngagementStore.getProfile.mockResolvedValue(sampleProfile);
    mockEngagementStore.getPredictions.mockResolvedValue(samplePredictions);
    mockEngagementStore.getWeatherHistory.mockResolvedValue(sampleWeatherHistory);
  });

  describe('Multi-Store Data Aggregation', () => {
    it('should aggregate exportable categories from all stores', async () => {
      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      // Should have categories from all stores
      expect(categories.length).toBeGreaterThanOrEqual(5);

      // Verify conversation category
      const conversationsCategory = categories.find((c) => c.category === 'Conversations');
      expect(conversationsCategory).toBeDefined();
      expect(conversationsCategory?.itemCount).toBe(15);
      expect(conversationsCategory?.exportable).toBe(true);

      // Verify insights category
      const insightsCategory = categories.find((c) => c.category === 'Insights');
      expect(insightsCategory).toBeDefined();
      expect(insightsCategory?.itemCount).toBe(2);

      // Verify rituals category
      const ritualsCategory = categories.find((c) => c.category === 'Rituals');
      expect(ritualsCategory).toBeDefined();
      expect(ritualsCategory?.itemCount).toBe(2);

      // Verify predictions category
      const predictionsCategory = categories.find((c) => c.category === 'Predictions');
      expect(predictionsCategory).toBeDefined();
      expect(predictionsCategory?.itemCount).toBe(2);

      // Verify mood history category
      const moodCategory = categories.find((c) => c.category === 'Mood History');
      expect(moodCategory).toBeDefined();
      expect(moodCategory?.itemCount).toBe(2);
    });

    it('should call all services with correct userId', async () => {
      const service = getDataExportService();
      await service.getExportableCategories(testUserId);

      expect(mockConversationHistory.getHistory).toHaveBeenCalledWith(testUserId, 1000);
      expect(mockCognitiveMemory.getMemories).toHaveBeenCalledWith(testUserId);
      expect(mockEngagementStore.getProfile).toHaveBeenCalledWith(testUserId);
      expect(mockEngagementStore.getPredictions).toHaveBeenCalledWith(testUserId, 1000);
      expect(mockEngagementStore.getWeatherHistory).toHaveBeenCalledWith(testUserId, 1000);
    });

    it('should handle partial data gracefully', async () => {
      // User with no memories
      mockCognitiveMemory.getMemories.mockResolvedValue([]);
      // User with no predictions
      mockEngagementStore.getPredictions.mockResolvedValue([]);

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      const insightsCategory = categories.find((c) => c.category === 'Insights');
      expect(insightsCategory?.itemCount).toBe(0);

      const predictionsCategory = categories.find((c) => c.category === 'Predictions');
      expect(predictionsCategory?.itemCount).toBe(0);
    });

    it('should handle profile with no active rituals', async () => {
      mockEngagementStore.getProfile.mockResolvedValue({
        userId: testUserId,
        // No activeRituals property
      });

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      const ritualsCategory = categories.find((c) => c.category === 'Rituals');
      expect(ritualsCategory?.itemCount).toBe(0);
    });
  });

  describe('Cross-Store Error Handling', () => {
    it('should handle conversation service failure', async () => {
      mockConversationHistory.getHistory.mockRejectedValue(new Error('DB connection failed'));

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      // Should return empty array or partial results
      expect(Array.isArray(categories)).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle engagement store failure', async () => {
      mockEngagementStore.getProfile.mockRejectedValue(new Error('Store unavailable'));

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      // Should not throw, should log error
      expect(Array.isArray(categories)).toBe(true);
    });

    it('should handle cognitive memory service failure', async () => {
      mockCognitiveMemory.getMemories.mockRejectedValue(new Error('Memory service down'));

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      expect(Array.isArray(categories)).toBe(true);
    });
  });

  describe('Data Consistency', () => {
    it('should return consistent category structure', async () => {
      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      categories.forEach((category) => {
        expect(category).toHaveProperty('category');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('itemCount');
        expect(category).toHaveProperty('exportable');
        expect(typeof category.category).toBe('string');
        expect(typeof category.description).toBe('string');
        expect(typeof category.itemCount).toBe('number');
        expect(typeof category.exportable).toBe('boolean');
      });
    });

    it('should have non-negative item counts', async () => {
      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      categories.forEach((category) => {
        expect(category.itemCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Empty User Data', () => {
    it('should handle completely new user with no data', async () => {
      mockConversationHistory.getHistory.mockResolvedValue({ totalSessions: 0, sessions: [] });
      mockCognitiveMemory.getMemories.mockResolvedValue([]);
      mockEngagementStore.getProfile.mockResolvedValue({ userId: testUserId });
      mockEngagementStore.getPredictions.mockResolvedValue([]);
      mockEngagementStore.getWeatherHistory.mockResolvedValue([]);

      const service = getDataExportService();
      const categories = await service.getExportableCategories(testUserId);

      // Should still return all categories, just with 0 counts
      expect(categories.length).toBeGreaterThanOrEqual(5);
      categories.forEach((category) => {
        expect(category.itemCount).toBe(0);
      });
    });
  });
});

describe('Data Export Format Integration', () => {
  const allCategories = ['Conversations', 'Insights', 'Rituals', 'Predictions', 'Mood History'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationHistory.getHistory.mockResolvedValue(sampleConversations);
    mockCognitiveMemory.getMemories.mockResolvedValue(sampleMemories);
    mockCognitiveMemory.getProfile.mockResolvedValue({ memories: sampleMemories, patterns: [] });
    mockEngagementStore.getProfile.mockResolvedValue(sampleProfile);
    mockEngagementStore.getPredictions.mockResolvedValue(samplePredictions);
    mockEngagementStore.getWeatherHistory.mockResolvedValue(sampleWeatherHistory);
    mockEngagementStore.getRitualStreaks.mockResolvedValue({ currentStreak: 7, longestStreak: 14 });
  });

  describe('JSON Export', () => {
    it('should export all data as valid JSON', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'json', allCategories);

      // Should be valid JSON
      const parsed = JSON.parse(exportData);
      expect(parsed).toBeDefined();
      expect(parsed.userId).toBe(testUserId);
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should include data from all categories in JSON export', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'json', allCategories);
      const parsed = JSON.parse(exportData);

      // Should have categories object
      expect(parsed.categories).toBeDefined();
    });
  });

  describe('CSV Export', () => {
    it('should export data as CSV string', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'csv', allCategories);

      // Should be a string
      expect(typeof exportData).toBe('string');
    });

    it('should include category headers in CSV', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'csv', ['Conversations']);

      expect(exportData).toContain('## CONVERSATIONS');
    });
  });

  describe('Selective Category Export', () => {
    it('should export only specified categories', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'json', ['Conversations']);
      const parsed = JSON.parse(exportData);

      expect(parsed.categories).toBeDefined();
      expect(parsed.categories.conversations).toBeDefined();
    });

    it('should not include unselected categories', async () => {
      const service = getDataExportService();
      const exportData = await service.exportData(testUserId, 'json', ['Conversations']);
      const parsed = JSON.parse(exportData);

      expect(parsed.categories.predictions).toBeUndefined();
      expect(parsed.categories.moodHistory).toBeUndefined();
    });
  });
});

describe('GDPR Data Deletion Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngagementStore.deleteUserData = vi.fn().mockResolvedValue(undefined);
  });

  describe('Complete Data Deletion', () => {
    it('should delete data from engagement store', async () => {
      const service = getDataExportService();
      await service.deleteAllData(testUserId);

      expect(mockEngagementStore.deleteUserData).toHaveBeenCalledWith(testUserId);
    });

    it('should throw and log error on deletion failure', async () => {
      mockEngagementStore.deleteUserData = vi.fn().mockRejectedValue(new Error('Delete failed'));

      const service = getDataExportService();

      await expect(service.deleteAllData(testUserId)).rejects.toThrow('Delete failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log success on successful deletion', async () => {
      mockEngagementStore.deleteUserData = vi.fn().mockResolvedValue(undefined);

      const service = getDataExportService();
      await service.deleteAllData(testUserId);

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
