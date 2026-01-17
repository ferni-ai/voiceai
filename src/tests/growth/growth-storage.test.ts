/**
 * Growth Storage Tests
 *
 * Tests for the growth state persistence layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import {
  getDashboard,
  getSettings,
  updateSettings,
  addTikTokAccount,
  getTikTokAccounts,
  addContent,
  getContentQueue,
  scheduleContent,
  updateContentStatus,
  addInfluencerLead,
  getInfluencerLeads,
  updateInfluencerStatus,
  addSEOArticle,
  getSEOArticles,
  scheduleTask,
  getPendingTasks,
  updateTaskStatus,
  createCampaign,
  getCampaigns,
  type GrowthState,
} from '../../../apps/cli/src/commands/growth/growth-storage.js';

// Mock fs to avoid writing actual files
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  };
});

describe('Growth Storage', () => {
  const mockState: GrowthState = {
    settings: {
      autoPost: false,
      autoEngage: false,
      autoGenerate: false,
      contentPerDay: 5,
      engagementPerDay: 10,
      openaiApiKey: null,
      anthropicApiKey: null,
    },
    tiktokAccounts: [],
    contentQueue: [],
    influencerLeads: [],
    seoArticles: [],
    scheduledTasks: [],
    campaigns: [],
    dailyMetrics: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(mockState));
    (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSettings', () => {
    it('should return current settings', async () => {
      const settings = await getSettings();

      expect(settings).toBeDefined();
      expect(settings.autoPost).toBe(false);
      expect(settings.contentPerDay).toBe(5);
    });

    it('should use default settings when state file does not exist', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const settings = await getSettings();

      expect(settings).toBeDefined();
      expect(settings.autoPost).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('should update specific settings', async () => {
      await updateSettings({ autoPost: true, contentPerDay: 10 });

      expect(fs.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse(
        (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(writtenData.settings.autoPost).toBe(true);
      expect(writtenData.settings.contentPerDay).toBe(10);
    });
  });

  describe('TikTok Accounts', () => {
    it('should add a TikTok account', async () => {
      const account = await addTikTokAccount('@ferni_ai', 'main', 'Main Ferni account');

      expect(account).toBeDefined();
      expect(account.handle).toBe('@ferni_ai');
      expect(account.angle).toBe('main');
      expect(account.id).toBeDefined();
    });

    it('should list TikTok accounts', async () => {
      const stateWithAccounts: GrowthState = {
        ...mockState,
        tiktokAccounts: [
          { id: '1', handle: '@ferni', angle: 'main', description: 'Main', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithAccounts));

      const accounts = await getTikTokAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0].handle).toBe('@ferni');
    });
  });

  describe('Content Queue', () => {
    it('should add content to queue', async () => {
      const content = await addContent({
        platform: 'tiktok',
        type: 'video_script',
        title: 'Test Script',
        content: 'This is a test script',
      });

      expect(content).toBeDefined();
      expect(content.platform).toBe('tiktok');
      expect(content.status).toBe('draft');
    });

    it('should filter content by platform', async () => {
      const stateWithContent: GrowthState = {
        ...mockState,
        contentQueue: [
          { id: '1', platform: 'tiktok', type: 'video_script', content: 'TikTok', status: 'draft', createdAt: new Date().toISOString() },
          { id: '2', platform: 'reddit', type: 'post', content: 'Reddit', status: 'draft', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithContent));

      const tiktokContent = await getContentQueue({ platform: 'tiktok' });
      const redditContent = await getContentQueue({ platform: 'reddit' });

      expect(tiktokContent).toHaveLength(1);
      expect(redditContent).toHaveLength(1);
    });

    it('should schedule content', async () => {
      const stateWithContent: GrowthState = {
        ...mockState,
        contentQueue: [
          { id: '1', platform: 'tiktok', type: 'video_script', content: 'Test', status: 'draft', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithContent));

      const scheduledFor = new Date(Date.now() + 3600000).toISOString();
      await scheduleContent('1', scheduledFor);

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should update content status', async () => {
      const stateWithContent: GrowthState = {
        ...mockState,
        contentQueue: [
          { id: '1', platform: 'tiktok', type: 'video_script', content: 'Test', status: 'draft', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithContent));

      await updateContentStatus('1', 'posted');

      const writtenData = JSON.parse(
        (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(writtenData.contentQueue[0].status).toBe('posted');
    });
  });

  describe('Influencer Leads', () => {
    it('should add an influencer lead', async () => {
      const lead = await addInfluencerLead({
        name: 'Test Creator',
        handle: '@testcreator',
        platform: 'tiktok',
        followers: 50000,
        tier: 'micro',
        category: 'self-improvement',
      });

      expect(lead).toBeDefined();
      expect(lead.name).toBe('Test Creator');
      expect(lead.tier).toBe('micro');
      expect(lead.status).toBe('researched');
    });

    it('should filter leads by tier', async () => {
      const stateWithLeads: GrowthState = {
        ...mockState,
        influencerLeads: [
          { id: '1', name: 'Nano', handle: '@nano', platform: 'tiktok', followers: 5000, tier: 'nano', category: 'test', status: 'researched', createdAt: new Date().toISOString() },
          { id: '2', name: 'Micro', handle: '@micro', platform: 'tiktok', followers: 50000, tier: 'micro', category: 'test', status: 'researched', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithLeads));

      const microLeads = await getInfluencerLeads({ tier: 'micro' });

      expect(microLeads).toHaveLength(1);
      expect(microLeads[0].name).toBe('Micro');
    });

    it('should update influencer status', async () => {
      const stateWithLeads: GrowthState = {
        ...mockState,
        influencerLeads: [
          { id: '1', name: 'Test', handle: '@test', platform: 'tiktok', followers: 5000, tier: 'nano', category: 'test', status: 'researched', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithLeads));

      await updateInfluencerStatus('1', 'contacted');

      const writtenData = JSON.parse(
        (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(writtenData.influencerLeads[0].status).toBe('contacted');
    });
  });

  describe('SEO Articles', () => {
    it('should add an SEO article', async () => {
      const article = await addSEOArticle({
        title: 'Best AI Companions 2026',
        slug: 'best-ai-companions-2026',
        targetKeyword: 'AI companion',
      });

      expect(article).toBeDefined();
      expect(article.title).toBe('Best AI Companions 2026');
      expect(article.status).toBe('planned');
    });

    it('should filter articles by status', async () => {
      const stateWithArticles: GrowthState = {
        ...mockState,
        seoArticles: [
          { id: '1', title: 'Draft', slug: 'draft', targetKeyword: 'test', status: 'drafted', createdAt: new Date().toISOString() },
          { id: '2', title: 'Published', slug: 'published', targetKeyword: 'test', status: 'published', createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithArticles));

      const published = await getSEOArticles({ status: 'published' });

      expect(published).toHaveLength(1);
      expect(published[0].title).toBe('Published');
    });
  });

  describe('Scheduled Tasks', () => {
    it('should schedule a task', async () => {
      const task = await scheduleTask(
        'generate_content',
        { platform: 'tiktok', count: 5 },
        new Date().toISOString()
      );

      expect(task).toBeDefined();
      expect(task.type).toBe('generate_content');
      expect(task.status).toBe('pending');
    });

    it('should get pending tasks', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 3600000).toISOString();
      const futureDate = new Date(now.getTime() + 3600000).toISOString();

      const stateWithTasks: GrowthState = {
        ...mockState,
        scheduledTasks: [
          { id: '1', type: 'generate_content', data: {}, status: 'pending', scheduledFor: pastDate, createdAt: now.toISOString() },
          { id: '2', type: 'post_content', data: {}, status: 'pending', scheduledFor: futureDate, createdAt: now.toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithTasks));

      const pending = await getPendingTasks();

      // Only past tasks should be returned
      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe('generate_content');
    });

    it('should update task status', async () => {
      const stateWithTasks: GrowthState = {
        ...mockState,
        scheduledTasks: [
          { id: '1', type: 'generate_content', data: {}, status: 'pending', scheduledFor: new Date().toISOString(), createdAt: new Date().toISOString() },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithTasks));

      await updateTaskStatus('1', 'completed', 'Done');

      const writtenData = JSON.parse(
        (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      );
      expect(writtenData.scheduledTasks[0].status).toBe('completed');
      expect(writtenData.scheduledTasks[0].result).toBe('Done');
    });
  });

  describe('Campaigns', () => {
    it('should create a campaign', async () => {
      const campaign = await createCampaign('Q1 TikTok', 'tiktok', [
        { metric: 'followers', target: 10000, current: 0 },
      ]);

      expect(campaign).toBeDefined();
      expect(campaign.name).toBe('Q1 TikTok');
      expect(campaign.channel).toBe('tiktok');
      expect(campaign.status).toBe('planning'); // Campaigns start in planning status
    });

    it('should list campaigns', async () => {
      const stateWithCampaigns: GrowthState = {
        ...mockState,
        campaigns: [
          { id: '1', name: 'TikTok', channel: 'tiktok', status: 'active', startDate: new Date().toISOString(), goals: [] },
          { id: '2', name: 'SEO', channel: 'seo', status: 'active', startDate: new Date().toISOString(), goals: [] },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithCampaigns));

      const campaigns = await getCampaigns();

      expect(campaigns).toHaveLength(2);
    });
  });

  describe('Dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const now = new Date();
      const stateWithData: GrowthState = {
        ...mockState,
        contentQueue: [
          { id: '1', platform: 'tiktok', type: 'video_script', content: 'Test', status: 'posted', createdAt: now.toISOString() },
        ],
        influencerLeads: [
          { id: '1', name: 'Test', handle: '@test', platform: 'tiktok', followers: 5000, tier: 'nano', category: 'test', status: 'live', createdAt: now.toISOString() },
        ],
        seoArticles: [
          { id: '1', title: 'Test', slug: 'test', targetKeyword: 'test', status: 'published', createdAt: now.toISOString() },
        ],
        campaigns: [
          { id: '1', name: 'Test', channel: 'tiktok', status: 'active', startDate: now.toISOString(), goals: [] },
        ],
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(stateWithData));

      const dashboard = await getDashboard();

      expect(dashboard.overview.totalContent).toBe(1);
      expect(dashboard.overview.postedContent).toBe(1);
      expect(dashboard.overview.totalInfluencers).toBe(1);
      expect(dashboard.overview.activePartnerships).toBe(1);
      expect(dashboard.overview.totalArticles).toBe(1);
      expect(dashboard.overview.publishedArticles).toBe(1);
      expect(dashboard.activeCampaigns).toHaveLength(1);
    });
  });
});
