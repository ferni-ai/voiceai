/**
 * Scheduler Tests
 *
 * Tests for autonomous task scheduling and execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runPendingTasks,
  scheduleDailyTasks,
  quickGenerate,
} from '../../../apps/cli/src/commands/growth/scheduler.js';
import * as storage from '../../../apps/cli/src/commands/growth/growth-storage.js';
import * as contentEngine from '../../../apps/cli/src/commands/growth/content-engine.js';

// Mock dependencies
vi.mock('../../../apps/cli/src/commands/growth/growth-storage.js', () => ({
  getSettings: vi.fn(),
  getPendingTasks: vi.fn(),
  updateTaskStatus: vi.fn(),
  scheduleTask: vi.fn(),
  getTikTokAccounts: vi.fn(),
  getInfluencerLeads: vi.fn(),
  getSEOArticles: vi.fn(),
  getContentQueue: vi.fn(),
}));

vi.mock('../../../apps/cli/src/commands/growth/content-engine.js', () => ({
  generateTikTokScript: vi.fn(),
  generateSEOArticle: vi.fn(),
  generateRedditPost: vi.fn(),
  generateInfluencerEmail: vi.fn(),
  batchGenerateTikTokScripts: vi.fn(),
  TIKTOK_TOPIC_BANK: {
    main: ['Topic 1', 'Topic 2'],
    motivation: ['Motivation topic'],
    productivity: ['Productivity topic'],
    emotional: ['Emotional topic'],
    comparison: ['Comparison topic'],
  },
  SEO_KEYWORD_BANK: [
    { keyword: 'AI companion', topic: 'Best AI companions' },
  ],
  REDDIT_TOPICS: {
    selfimprovement: ['Self improvement topic'],
  },
}));

describe('Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (storage.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      autoPost: true,
      autoEngage: true,
      autoGenerate: true,
      contentPerDay: 5,
      engagementPerDay: 10,
      openaiApiKey: 'test-key',
    });

    (storage.getPendingTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.updateTaskStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (storage.scheduleTask as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'task-1' });
    (storage.getTikTokAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', handle: '@ferni', angle: 'main', description: 'Main', createdAt: new Date().toISOString() },
    ]);
    (storage.getInfluencerLeads as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.getSEOArticles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.getContentQueue as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (contentEngine.generateTikTokScript as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'content-1',
      platform: 'tiktok',
      type: 'video_script',
      content: 'Test content',
      status: 'draft',
    });
    (contentEngine.generateSEOArticle as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'article-1',
    });
    (contentEngine.generateRedditPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'content-2',
    });
    // Mock batchGenerateTikTokScripts - used by runPendingTasks for generate_content
    ((contentEngine as Record<string, ReturnType<typeof vi.fn>>).batchGenerateTikTokScripts).mockResolvedValue([
      { id: 'batch-1', platform: 'tiktok', type: 'video_script', content: 'Batch content 1', status: 'draft' },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runPendingTasks', () => {
    it('should return stats object when no pending tasks', async () => {
      (storage.getPendingTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await runPendingTasks();

      // Should return a stats object
      expect(result).toBeDefined();
      expect(typeof result.tasksExecuted).toBe('number');
      expect(typeof result.tasksFailed).toBe('number');
    });

    it('should update task status when executing pending tasks', async () => {
      (storage.getPendingTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'task-1',
          type: 'generate_content',
          data: { platform: 'tiktok', count: 1 },
          status: 'pending',
          scheduledFor: new Date().toISOString(),
        },
      ]);

      await runPendingTasks();

      // Should at least mark task as running
      expect(storage.updateTaskStatus).toHaveBeenCalledWith('task-1', 'running');
    });

    it('should handle task errors without throwing', async () => {
      (storage.getPendingTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'task-1',
          type: 'generate_content',
          data: { platform: 'tiktok', count: 1 },
          status: 'pending',
          scheduledFor: new Date().toISOString(),
        },
      ]);

      // Mock batchGenerateTikTokScripts to throw
      ((contentEngine as Record<string, ReturnType<typeof vi.fn>>).batchGenerateTikTokScripts).mockRejectedValue(
        new Error('API error')
      );

      // Should not throw - handles errors gracefully
      const result = await runPendingTasks();

      expect(result).toBeDefined();
      expect(result.tasksFailed).toBeGreaterThanOrEqual(0);
    });

    it('should skip content generation in dry run mode', async () => {
      (storage.getPendingTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'task-1',
          type: 'generate_content',
          data: { platform: 'tiktok' },
          status: 'pending',
          scheduledFor: new Date().toISOString(),
        },
      ]);

      await runPendingTasks(true); // dry run

      // In dry run, batchGenerateTikTokScripts should not be called
      expect((contentEngine as Record<string, ReturnType<typeof vi.fn>>).batchGenerateTikTokScripts).not.toHaveBeenCalled();
    });
  });

  describe('scheduleDailyTasks', () => {
    it('should schedule content generation tasks', async () => {
      await scheduleDailyTasks();

      expect(storage.scheduleTask).toHaveBeenCalled();
    });

    it('should schedule based on settings', async () => {
      (storage.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        autoGenerate: true,
        autoEngage: true,
        contentPerDay: 3,
        engagementPerDay: 5,
        openaiApiKey: 'key',
      });

      await scheduleDailyTasks();

      // Should schedule content tasks
      expect(storage.scheduleTask).toHaveBeenCalled();
    });

    it('should still schedule metrics check even when content automation disabled', async () => {
      // The implementation always schedules a metrics check regardless of other settings
      (storage.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        autoGenerate: false,
        autoEngage: false,
        contentPerDay: 0,
        engagementPerDay: 0,
      });

      await scheduleDailyTasks();

      // At minimum, metrics check is always scheduled
      expect(storage.scheduleTask).toHaveBeenCalled();
    });
  });

  describe('quickGenerate', () => {
    it('should generate TikTok content', async () => {
      // Suppress console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await quickGenerate('tiktok', 2);

      expect(contentEngine.generateTikTokScript).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('should generate Reddit content', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await quickGenerate('reddit', 1);

      expect(contentEngine.generateRedditPost).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });

    it('should return gracefully when no TikTok accounts configured', async () => {
      // quickGenerate doesn't throw - it logs an error and returns
      (storage.getTikTokAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await quickGenerate('tiktok', 1);

      // Should not call generateTikTokScript since no accounts
      expect(contentEngine.generateTikTokScript).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle unimplemented platforms gracefully', async () => {
      // 'seo' is in type but not implemented in quickGenerate
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await quickGenerate('seo', 1);
      consoleSpy.mockRestore();
      // Function completes without error
    });
  });
});
