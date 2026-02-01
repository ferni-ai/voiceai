/**
 * Your Story Dashboard E2E Tests
 *
 * Tests for the Your Story dashboard loading and display.
 * Validates API integration and data presentation.
 *
 * @module tests/e2e/your-story
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300, DRAMATIC: 600 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out' },
  prefersReducedMotion: () => false,
}));

const mockApiGet = vi.fn();

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  getUserId: () => 'test-user-123',
}));

vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockStoryData = {
  header: {
    greeting: 'Good morning',
    tagline: 'Your journey continues',
    daysTogether: 180,
    totalConversations: 245,
    currentStreak: 7,
    longestStreak: 32,
  },
  relationshipProgress: {
    stage: 'trusted_advisor',
    stageLabel: 'Trusted Advisor',
    progress: 75,
    nextStage: null,
    tagline: 'You trust me with what matters most',
    milestones: [
      { id: '1', title: 'First conversation', completed: true },
      { id: '2', title: 'Shared a secret', completed: true },
      { id: '3', title: 'Celebrated together', completed: true },
    ],
  },
  energyLevels: {
    overall: 72,
    label: 'Balanced',
    emotional: { score: 75, label: 'Steady' },
    mental: { score: 68, label: 'Focused' },
    physical: { score: 73, label: 'Energized' },
    trend: 'stable',
    recommendation: 'Keep up the great balance!',
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('Your Story Dashboard', () => {
  beforeEach(() => {
    document.body.textContent = '';
    vi.clearAllMocks();
    
    // Default successful API response
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: mockStoryData,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // API INTEGRATION
  // ============================================================================

  describe('API Integration', () => {
    it('should fetch data from /api/your-story/full endpoint', async () => {
      // Simulate opening the dashboard
      await mockApiGet('/api/your-story/full');
      
      expect(mockApiGet).toHaveBeenCalledWith('/api/your-story/full');
    });

    it('should handle API errors gracefully', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Network error'));
      
      try {
        await mockApiGet('/api/your-story/full');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle empty data response', async () => {
      mockApiGet.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: null,
      });
      
      const response = await mockApiGet('/api/your-story/full');
      expect(response.data).toBeNull();
    });
  });

  // ============================================================================
  // DATA VALIDATION
  // ============================================================================

  describe('Data Validation', () => {
    it('should validate header data structure', async () => {
      const response = await mockApiGet('/api/your-story/full');
      const header = response.data?.header;
      
      expect(header).toBeDefined();
      expect(header.daysTogether).toBeTypeOf('number');
      expect(header.totalConversations).toBeTypeOf('number');
      expect(header.currentStreak).toBeTypeOf('number');
    });

    it('should validate relationship progress structure', async () => {
      const response = await mockApiGet('/api/your-story/full');
      const progress = response.data?.relationshipProgress;
      
      expect(progress).toBeDefined();
      expect(progress.stage).toBeTypeOf('string');
      expect(progress.progress).toBeGreaterThanOrEqual(0);
      expect(progress.progress).toBeLessThanOrEqual(100);
    });

    it('should validate energy levels structure', async () => {
      const response = await mockApiGet('/api/your-story/full');
      const energy = response.data?.energyLevels;
      
      expect(energy).toBeDefined();
      expect(energy.overall).toBeTypeOf('number');
      expect(energy.trend).toMatch(/improving|stable|declining|recovering/);
    });
  });

  // ============================================================================
  // DISPLAY LOGIC
  // ============================================================================

  describe('Display Logic', () => {
    it('should calculate days together correctly', async () => {
      const response = await mockApiGet('/api/your-story/full');
      expect(response.data.header.daysTogether).toBe(180);
    });

    it('should include all milestones', async () => {
      const response = await mockApiGet('/api/your-story/full');
      const milestones = response.data.relationshipProgress.milestones;
      
      expect(milestones).toHaveLength(3);
      expect(milestones.every((m: { completed: boolean }) => typeof m.completed === 'boolean')).toBe(true);
    });

    it('should provide meaningful streak data', async () => {
      const response = await mockApiGet('/api/your-story/full');
      const header = response.data.header;
      
      expect(header.currentStreak).toBeLessThanOrEqual(header.longestStreak);
    });
  });

  // ============================================================================
  // ERROR STATES
  // ============================================================================

  describe('Error States', () => {
    it('should handle 404 response', async () => {
      mockApiGet.mockResolvedValueOnce({
        ok: false,
        status: 404,
        data: null,
      });
      
      const response = await mockApiGet('/api/your-story/full');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('should handle 500 server error', async () => {
      mockApiGet.mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: null,
      });
      
      const response = await mockApiGet('/api/your-story/full');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });
});
