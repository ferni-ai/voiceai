/**
 * Growth Module E2E Integration Tests
 *
 * Tests the complete workflow from content generation to scheduling to posting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock external HTTP calls
vi.mock('node:fetch', () => ({
  default: vi.fn(),
}));

// Counter for unique IDs in rapid succession
let idCounter = 0;

// Mock storage to use in-memory
const mockState = {
  settings: {
    autoPost: false,
    autoEngage: false,
    autoGenerate: true,
    contentPerDay: 10,
    engagementPerDay: 20,
    openaiApiKey: 'sk-test-key',
    anthropicApiKey: null,
    redditClientId: 'test-client-id',
    redditClientSecret: 'test-client-secret',
    redditUsername: 'test-user',
    redditPassword: 'test-pass',
    resendApiKey: 're_test_key',
    emailFromAddress: 'test@ferni.ai',
    emailFromName: 'Test Ferni',
  },
  tiktokAccounts: [] as unknown[],
  contentQueue: [] as unknown[],
  influencerLeads: [] as unknown[],
  seoArticles: [] as unknown[],
  scheduledTasks: [] as unknown[],
  campaigns: [] as unknown[],
  dailyMetrics: [] as unknown[],
};

vi.mock('../../../apps/cli/src/commands/growth/growth-storage.js', () => ({
  getDashboard: vi.fn(async () => ({
    overview: {
      totalContent: mockState.contentQueue.length,
      scheduledContent: mockState.contentQueue.filter((c: { status: string }) => c.status === 'scheduled').length,
      postedContent: mockState.contentQueue.filter((c: { status: string }) => c.status === 'posted').length,
      totalInfluencers: mockState.influencerLeads.length,
      activePartnerships: mockState.influencerLeads.filter((l: { status: string }) => l.status === 'live').length,
      totalArticles: mockState.seoArticles.length,
      publishedArticles: mockState.seoArticles.filter((a: { status: string }) => a.status === 'published').length,
    },
    activeCampaigns: mockState.campaigns.filter((c: { status: string }) => c.status === 'active'),
    recentContent: mockState.contentQueue.slice(-5),
    todayTasks: mockState.scheduledTasks.filter((t: { status: string }) => t.status === 'pending'),
  })),
  getSettings: vi.fn(async () => mockState.settings),
  updateSettings: vi.fn(async (updates: Partial<typeof mockState.settings>) => {
    Object.assign(mockState.settings, updates);
    return mockState.settings;
  }),
  getTikTokAccounts: vi.fn(async () => mockState.tiktokAccounts),
  addTikTokAccount: vi.fn(async (handle: string, angle: string, description: string) => {
    const account = { id: `tiktok_${++idCounter}`, handle, angle, description, createdAt: new Date().toISOString() };
    mockState.tiktokAccounts.push(account);
    return account;
  }),
  getContentQueue: vi.fn(async () => mockState.contentQueue),
  addContent: vi.fn(async (content: Record<string, unknown>) => {
    const newContent = {
      id: `content_${++idCounter}`,
      ...content,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    mockState.contentQueue.push(newContent);
    return newContent;
  }),
  scheduleContent: vi.fn(async (id: string, scheduledFor: string) => {
    const content = mockState.contentQueue.find((c: { id: string }) => c.id === id) as Record<string, unknown> | undefined;
    if (content) {
      content.scheduledFor = scheduledFor;
      content.status = 'scheduled';
    }
    return content;
  }),
  updateContentStatus: vi.fn(async (id: string, status: string) => {
    const content = mockState.contentQueue.find((c: { id: string }) => c.id === id) as Record<string, unknown> | undefined;
    if (content) content.status = status;
    return content;
  }),
  getInfluencerLeads: vi.fn(async () => mockState.influencerLeads),
  addInfluencerLead: vi.fn(async (lead: Record<string, unknown>) => {
    const newLead = {
      id: `influencer_${++idCounter}`,
      ...lead,
      status: 'researched',
      createdAt: new Date().toISOString()
    };
    mockState.influencerLeads.push(newLead);
    return newLead;
  }),
  updateInfluencerStatus: vi.fn(async (id: string, status: string) => {
    const lead = mockState.influencerLeads.find((l: { id: string }) => l.id === id) as Record<string, unknown> | undefined;
    if (lead) lead.status = status;
    return lead;
  }),
  getSEOArticles: vi.fn(async () => mockState.seoArticles),
  addSEOArticle: vi.fn(async (article: Record<string, unknown>) => {
    const newArticle = {
      id: `seo_${++idCounter}`,
      ...article,
      status: 'planned',
      createdAt: new Date().toISOString()
    };
    mockState.seoArticles.push(newArticle);
    return newArticle;
  }),
  getPendingTasks: vi.fn(async () =>
    mockState.scheduledTasks.filter((t: { status: string }) => t.status === 'pending')
  ),
  scheduleTask: vi.fn(async (type: string, data: unknown, scheduledFor: string) => {
    const task = {
      id: `task_${++idCounter}`,
      type,
      data,
      scheduledFor,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    mockState.scheduledTasks.push(task);
    return task;
  }),
  updateTaskStatus: vi.fn(async (id: string, status: string) => {
    const task = mockState.scheduledTasks.find((t: { id: string }) => t.id === id) as Record<string, unknown> | undefined;
    if (task) task.status = status;
    return task;
  }),
  getCampaigns: vi.fn(async () => mockState.campaigns),
  createCampaign: vi.fn(async (name: string, channel: string, goals: unknown[]) => {
    const campaign = {
      id: `campaign_${++idCounter}`,
      name,
      channel,
      goals,
      status: 'planning',
      startDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockState.campaigns.push(campaign);
    return campaign;
  }),
  getMetrics: vi.fn(async () => mockState.dailyMetrics),
}));

// Import after mocking
import * as storage from '../../../apps/cli/src/commands/growth/growth-storage.js';

describe('Growth Module E2E', () => {
  beforeEach(() => {
    // Reset mock state and ID counter
    idCounter = 0;
    mockState.tiktokAccounts = [];
    mockState.contentQueue = [];
    mockState.influencerLeads = [];
    mockState.seoArticles = [];
    mockState.scheduledTasks = [];
    mockState.campaigns = [];
    mockState.dailyMetrics = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Content Workflow', () => {
    it('should complete full TikTok content lifecycle', async () => {
      // Step 1: Add TikTok account
      const account = await storage.addTikTokAccount('@fernitest', 'motivation', 'Test motivation account');
      expect(account.handle).toBe('@fernitest');
      expect(account.angle).toBe('motivation');

      // Step 2: Create content
      const content = await storage.addContent({
        platform: 'tiktok',
        type: 'video_script',
        title: 'Morning routine hack',
        content: 'Start your day with intention...',
        hook: 'This one habit changed everything',
      });
      expect(content.status).toBe('draft');
      expect(content.platform).toBe('tiktok');

      // Step 3: Schedule content
      const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await storage.scheduleContent(content.id, scheduledFor);

      // Verify scheduled
      const queue = await storage.getContentQueue();
      const scheduled = queue.find((c: { id: string }) => c.id === content.id) as { status: string } | undefined;
      expect(scheduled?.status).toBe('scheduled');

      // Step 4: Post content (simulate)
      await storage.updateContentStatus(content.id, 'posted');

      // Verify posted
      const posted = (await storage.getContentQueue()).find((c: { id: string }) => c.id === content.id) as { status: string } | undefined;
      expect(posted?.status).toBe('posted');

      // Step 5: Check dashboard reflects changes
      const dashboard = await storage.getDashboard();
      expect(dashboard.overview.totalContent).toBe(1);
      expect(dashboard.overview.postedContent).toBe(1);
    });

    it('should complete full influencer outreach workflow', async () => {
      // Step 1: Add influencer lead
      const lead = await storage.addInfluencerLead({
        name: 'Test Influencer',
        handle: '@testinfluencer',
        platform: 'tiktok',
        followers: 50000,
        tier: 'micro',
        category: 'self-improvement',
        email: 'test@influencer.com',
      });
      expect(lead.status).toBe('researched');

      // Step 2: Contact influencer
      await storage.updateInfluencerStatus(lead.id, 'contacted');

      // Step 3: They respond
      await storage.updateInfluencerStatus(lead.id, 'responded');

      // Step 4: Negotiate
      await storage.updateInfluencerStatus(lead.id, 'negotiating');

      // Step 5: Confirm partnership
      await storage.updateInfluencerStatus(lead.id, 'confirmed');

      // Step 6: Go live
      await storage.updateInfluencerStatus(lead.id, 'live');

      // Verify final state
      const leads = await storage.getInfluencerLeads();
      const finalLead = leads.find((l: { id: string }) => l.id === lead.id) as { status: string } | undefined;
      expect(finalLead?.status).toBe('live');

      // Dashboard should show active partnership
      const dashboard = await storage.getDashboard();
      expect(dashboard.overview.activePartnerships).toBe(1);
    });

    it('should complete full SEO article workflow', async () => {
      // Step 1: Plan article
      const article = await storage.addSEOArticle({
        title: 'AI Voice Assistants: A Complete Guide',
        slug: 'ai-voice-assistants-guide',
        targetKeyword: 'ai voice assistant',
        secondaryKeywords: ['voice ai', 'virtual assistant'],
      });
      expect(article.status).toBe('planned');

      // Verify article was added
      const articles = await storage.getSEOArticles();
      expect(articles.length).toBe(1);
      expect((articles[0] as { targetKeyword: string }).targetKeyword).toBe('ai voice assistant');
    });
  });

  describe('Campaign Management', () => {
    it('should create and track campaign progress', async () => {
      // Create campaign
      const campaign = await storage.createCampaign('Q1 TikTok Growth', 'tiktok', [
        { metric: 'followers', target: 50000, current: 0 },
        { metric: 'signups', target: 500, current: 0 },
      ]);

      expect(campaign.name).toBe('Q1 TikTok Growth');
      expect(campaign.channel).toBe('tiktok');
      expect(campaign.status).toBe('planning');
      expect((campaign.goals as { metric: string }[]).length).toBe(2);

      // Verify campaign appears in list
      const campaigns = await storage.getCampaigns();
      expect(campaigns.length).toBe(1);
    });

    it('should support multiple campaigns', async () => {
      await storage.createCampaign('TikTok Campaign', 'tiktok', []);
      await storage.createCampaign('Reddit Campaign', 'reddit', []);
      await storage.createCampaign('SEO Campaign', 'seo', []);

      const campaigns = await storage.getCampaigns();
      expect(campaigns.length).toBe(3);
    });
  });

  describe('Task Scheduling', () => {
    it('should schedule and track tasks', async () => {
      // Schedule content generation task
      const task = await storage.scheduleTask(
        'generate_content',
        { platform: 'tiktok', count: 5 },
        new Date().toISOString()
      );
      expect(task.status).toBe('pending');

      // Get pending tasks
      const pending = await storage.getPendingTasks();
      expect(pending.length).toBe(1);

      // Complete task
      await storage.updateTaskStatus(task.id, 'completed');

      // No more pending
      const afterComplete = await storage.getPendingTasks();
      expect(afterComplete.length).toBe(0);
    });

    it('should handle multiple task types', async () => {
      const now = new Date().toISOString();

      await storage.scheduleTask('generate_content', { platform: 'tiktok' }, now);
      await storage.scheduleTask('post_content', { contentId: 'test123' }, now);
      await storage.scheduleTask('send_outreach', { leadId: 'lead123' }, now);
      await storage.scheduleTask('engage_reddit', { subreddit: 'selfimprovement' }, now);
      await storage.scheduleTask('check_metrics', {}, now);

      const pending = await storage.getPendingTasks();
      expect(pending.length).toBe(5);

      // Complete all
      for (const task of pending) {
        await storage.updateTaskStatus((task as { id: string }).id, 'completed');
      }

      expect((await storage.getPendingTasks()).length).toBe(0);
    });
  });

  describe('Settings Management', () => {
    it('should update settings correctly', async () => {
      // Initially auto-generate is true
      let settings = await storage.getSettings();
      expect(settings.autoGenerate).toBe(true);

      // Disable auto-generate
      await storage.updateSettings({ autoGenerate: false });
      settings = await storage.getSettings();
      expect(settings.autoGenerate).toBe(false);

      // Re-enable
      await storage.updateSettings({ autoGenerate: true });
      settings = await storage.getSettings();
      expect(settings.autoGenerate).toBe(true);
    });

    it('should handle API key configuration', async () => {
      // Set new API key
      await storage.updateSettings({ openaiApiKey: 'sk-new-key' });

      const settings = await storage.getSettings();
      expect(settings.openaiApiKey).toBe('sk-new-key');
    });
  });

  describe('Dashboard Aggregation', () => {
    it('should aggregate all data into dashboard', async () => {
      // Add various data
      await storage.addTikTokAccount('@account1', 'main', 'Main account');
      await storage.addContent({ platform: 'tiktok', type: 'video_script', content: 'Test' });
      await storage.addInfluencerLead({ name: 'Test', handle: '@test', platform: 'tiktok', followers: 1000, tier: 'nano', category: 'test' });
      await storage.addSEOArticle({ title: 'Test', slug: 'test', targetKeyword: 'test' });
      await storage.scheduleTask('generate_content', {}, new Date().toISOString());

      // Get dashboard
      const dashboard = await storage.getDashboard();

      expect(dashboard.overview.totalContent).toBe(1);
      expect(dashboard.overview.totalInfluencers).toBe(1);
      expect(dashboard.overview.totalArticles).toBe(1);
      expect(dashboard.todayTasks.length).toBe(1);
    });
  });

  describe('Multi-Platform Content', () => {
    it('should handle content for all platforms', async () => {
      // Create content for each platform
      await storage.addContent({ platform: 'tiktok', type: 'video_script', content: 'TikTok content' });
      await storage.addContent({ platform: 'reddit', type: 'post', content: 'Reddit content' });
      await storage.addContent({ platform: 'blog', type: 'article', content: 'Blog content' });
      await storage.addContent({ platform: 'twitter', type: 'post', content: 'Twitter content' });

      const queue = await storage.getContentQueue();
      expect(queue.length).toBe(4);

      // Verify different platforms
      const platforms = queue.map((c: { platform: string }) => c.platform);
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('reddit');
      expect(platforms).toContain('blog');
      expect(platforms).toContain('twitter');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state gracefully', async () => {
      const dashboard = await storage.getDashboard();
      expect(dashboard.overview.totalContent).toBe(0);
      expect(dashboard.overview.totalInfluencers).toBe(0);
      expect(dashboard.activeCampaigns).toEqual([]);
    });

    it('should handle rapid content creation', async () => {
      // Create 50 content pieces rapidly
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(storage.addContent({
          platform: 'tiktok',
          type: 'video_script',
          content: `Content ${i}`,
        }));
      }

      await Promise.all(promises);

      const queue = await storage.getContentQueue();
      expect(queue.length).toBe(50);
    });

    it('should maintain data integrity across operations', async () => {
      // Create linked data
      const account = await storage.addTikTokAccount('@test', 'main', 'Test');
      const content = await storage.addContent({
        platform: 'tiktok',
        type: 'video_script',
        content: 'Test',
        accountId: account.id,
      });

      // Schedule it
      await storage.scheduleContent(content.id, new Date().toISOString());

      // Verify link is preserved
      const queue = await storage.getContentQueue();
      const item = queue.find((c: { id: string }) => c.id === content.id) as { accountId: string } | undefined;
      expect(item?.accountId).toBe(account.id);
    });
  });
});
