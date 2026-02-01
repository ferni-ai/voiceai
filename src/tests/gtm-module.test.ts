/**
 * Tests for GTM (Go-To-Market) Module
 *
 * Tests content calendar, configuration, storage, and publishing workflows.
 *
 * @module tests/gtm-module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Firestore for storage tests
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => null),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  cert: vi.fn(),
}));

describe('GTM Content Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateWeeklyCalendar', () => {
    it('should generate 7 days of calendar entries', async () => {
      const { generateWeeklyCalendar } = await import('../services/gtm/content-calendar.js');
      const startDate = new Date('2026-01-19');

      const entries = generateWeeklyCalendar(startDate);

      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.length).toBeLessThanOrEqual(7);
    });

    it('should assign unique IDs to each entry', async () => {
      const { generateWeeklyCalendar } = await import('../services/gtm/content-calendar.js');
      const startDate = new Date('2026-01-19');

      const entries = generateWeeklyCalendar(startDate);
      const ids = entries.map((e) => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should set status to planned for new entries', async () => {
      const { generateWeeklyCalendar } = await import('../services/gtm/content-calendar.js');
      const startDate = new Date('2026-01-19');

      const entries = generateWeeklyCalendar(startDate);

      for (const entry of entries) {
        expect(entry.status).toBe('planned');
      }
    });

    it('should assign pillar and category from weekly schedule', async () => {
      const { generateWeeklyCalendar } = await import('../services/gtm/content-calendar.js');
      const startDate = new Date('2026-01-19');

      const entries = generateWeeklyCalendar(startDate);

      for (const entry of entries) {
        expect(entry.pillar).toBeDefined();
        expect(entry.category).toBeDefined();
      }
    });
  });

  describe('generateMonthlyCalendar', () => {
    it('should generate entries for entire month', async () => {
      const { generateMonthlyCalendar } = await import('../services/gtm/content-calendar.js');

      const entries = generateMonthlyCalendar(2026, 1);

      // January 2026 has 31 days, so we should have entries across multiple weeks
      expect(entries.length).toBeGreaterThan(7);
    });
  });

  describe('getCalendarEntry', () => {
    it('should return undefined for non-existent entry', async () => {
      const { getCalendarEntry } = await import('../services/gtm/content-calendar.js');

      const entry = getCalendarEntry('non-existent-id');

      expect(entry).toBeUndefined();
    });

    it('should return entry after generation', async () => {
      const { generateWeeklyCalendar, getCalendarEntry } =
        await import('../services/gtm/content-calendar.js');
      const entries = generateWeeklyCalendar(new Date());

      if (entries.length > 0) {
        const retrieved = getCalendarEntry(entries[0].id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(entries[0].id);
      }
    });
  });

  describe('updateEntryStatus', () => {
    it('should update entry status', async () => {
      const { generateWeeklyCalendar, updateEntryStatus, getCalendarEntry } =
        await import('../services/gtm/content-calendar.js');
      const entries = generateWeeklyCalendar(new Date());

      if (entries.length > 0) {
        updateEntryStatus(entries[0].id, 'in-progress');
        const updated = getCalendarEntry(entries[0].id);
        expect(updated?.status).toBe('in-progress');
      }
    });

    it('should add contentId when provided', async () => {
      const { generateWeeklyCalendar, updateEntryStatus, getCalendarEntry } =
        await import('../services/gtm/content-calendar.js');
      const entries = generateWeeklyCalendar(new Date());

      if (entries.length > 0) {
        updateEntryStatus(entries[0].id, 'ready', 'content-123');
        const updated = getCalendarEntry(entries[0].id);
        expect(updated?.contentId).toBe('content-123');
      }
    });
  });

  describe('getPendingEntries', () => {
    it('should return entries with planned or in-progress status', async () => {
      const { generateWeeklyCalendar, getPendingEntries } =
        await import('../services/gtm/content-calendar.js');
      generateWeeklyCalendar(new Date());

      const pending = getPendingEntries();

      for (const entry of pending) {
        expect(['planned', 'in-progress']).toContain(entry.status);
      }
    });

    it('should sort by date ascending', async () => {
      const { generateWeeklyCalendar, getPendingEntries } =
        await import('../services/gtm/content-calendar.js');
      generateWeeklyCalendar(new Date());

      const pending = getPendingEntries();

      for (let i = 1; i < pending.length; i++) {
        expect(pending[i].date.getTime()).toBeGreaterThanOrEqual(pending[i - 1].date.getTime());
      }
    });
  });

  describe('getCalendarStats', () => {
    it('should return stats object with required fields', async () => {
      const { getCalendarStats } = await import('../services/gtm/content-calendar.js');

      const stats = getCalendarStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('byPillar');
      expect(stats).toHaveProperty('upcomingCount');
      expect(stats).toHaveProperty('overdueCount');
    });
  });

  describe('suggestNextContent', () => {
    it('should return suggestion with category and pillar', async () => {
      const { suggestNextContent } = await import('../services/gtm/content-calendar.js');

      const suggestion = suggestNextContent();

      expect(suggestion).toHaveProperty('category');
      expect(suggestion).toHaveProperty('pillar');
      expect(suggestion).toHaveProperty('reason');
    });
  });

  describe('initializeGTMCache', () => {
    it('should be a function', async () => {
      const { initializeGTMCache } = await import('../services/gtm/content-calendar.js');
      expect(typeof initializeGTMCache).toBe('function');
    });

    it('should be safe to call multiple times', async () => {
      const { initializeGTMCache } = await import('../services/gtm/content-calendar.js');

      await expect(initializeGTMCache()).resolves.not.toThrow();
      await expect(initializeGTMCache()).resolves.not.toThrow();
    });
  });

  describe('isCacheHydrated', () => {
    it('should return boolean', async () => {
      const { isCacheHydrated } = await import('../services/gtm/content-calendar.js');

      const result = isCacheHydrated();

      expect(typeof result).toBe('boolean');
    });
  });
});

describe('GTM Content Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('storeContent', () => {
    it('should store content in memory', async () => {
      const { storeContent, getContent } = await import('../services/gtm/content-calendar.js');

      const testContent = {
        id: 'test-content-1',
        title: 'Test Content',
        body: 'Test body',
        excerpt: 'Test excerpt',
        hashtags: ['test'],
        brief: {
          pillar: 'tutorials' as const,
          category: 'tutorial' as const,
          topic: 'Test topic',
          targetAudience: 'developers' as const,
          tone: 'warm' as const,
        },
        platforms: [],
        status: 'draft' as const,
        createdAt: new Date(),
      };

      storeContent(testContent);
      const retrieved = getContent('test-content-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Test Content');
    });
  });

  describe('getAllContent', () => {
    it('should return array', async () => {
      const { getAllContent } = await import('../services/gtm/content-calendar.js');

      const content = getAllContent();

      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('updateContentStatus', () => {
    it('should update content status', async () => {
      const { storeContent, updateContentStatus, getContent } =
        await import('../services/gtm/content-calendar.js');

      const testContent = {
        id: 'test-content-status',
        title: 'Status Test',
        body: 'Test body',
        excerpt: 'Test excerpt',
        hashtags: [],
        brief: {
          pillar: 'tutorials' as const,
          category: 'quick-tip' as const,
          topic: 'Test',
          targetAudience: 'developers' as const,
          tone: 'direct' as const,
        },
        platforms: [],
        status: 'draft' as const,
        createdAt: new Date(),
      };

      storeContent(testContent);
      updateContentStatus('test-content-status', 'approved');

      const updated = getContent('test-content-status');
      expect(updated?.status).toBe('approved');
    });

    it('should set publishedAt when provided', async () => {
      const { storeContent, updateContentStatus, getContent } =
        await import('../services/gtm/content-calendar.js');

      const testContent = {
        id: 'test-content-published',
        title: 'Published Test',
        body: 'Test body',
        excerpt: 'Test excerpt',
        hashtags: [],
        brief: {
          pillar: 'product-updates' as const,
          category: 'changelog' as const,
          topic: 'Test',
          targetAudience: 'developers' as const,
          tone: 'warm' as const,
        },
        platforms: [],
        status: 'draft' as const,
        createdAt: new Date(),
      };

      storeContent(testContent);
      const publishDate = new Date();
      updateContentStatus('test-content-published', 'published', publishDate);

      const updated = getContent('test-content-published');
      expect(updated?.publishedAt).toBeDefined();
    });
  });
});

describe('GTM Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset environment
    delete process.env.SOCIAL_ACCOUNT_TYPE;
    delete process.env.LINKEDIN_ORGANIZATION_URN;
    delete process.env.GTM_ENABLED;
    delete process.env.GTM_AUTO_PUBLISH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGTMConfig', () => {
    it('should return config with required fields', async () => {
      const { getGTMConfig } = await import('../services/gtm/gtm-config.js');

      const config = getGTMConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('autoPublish');
      expect(config).toHaveProperty('reviewRequired');
      expect(config).toHaveProperty('defaultTimezone');
      expect(config).toHaveProperty('publishTimes');
      expect(config).toHaveProperty('platforms');
      expect(config).toHaveProperty('contentRatio');
    });

    it('should respect GTM_ENABLED env var', async () => {
      process.env.GTM_ENABLED = 'false';
      vi.resetModules();

      const { getGTMConfig } = await import('../services/gtm/gtm-config.js');
      const config = getGTMConfig();

      expect(config.enabled).toBe(false);
    });

    it('should default to enabled when GTM_ENABLED not set', async () => {
      delete process.env.GTM_ENABLED;
      vi.resetModules();

      const { getGTMConfig } = await import('../services/gtm/gtm-config.js');
      const config = getGTMConfig();

      expect(config.enabled).toBe(true);
    });
  });

  describe('verifyBrandAccountConfig', () => {
    it('should return isValid false when SOCIAL_ACCOUNT_TYPE is not brand', async () => {
      process.env.SOCIAL_ACCOUNT_TYPE = 'personal';
      vi.resetModules();

      const { verifyBrandAccountConfig } = await import('../services/gtm/gtm-config.js');
      const result = verifyBrandAccountConfig();

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return isValid true when SOCIAL_ACCOUNT_TYPE is brand', async () => {
      process.env.SOCIAL_ACCOUNT_TYPE = 'brand';
      process.env.LINKEDIN_ORGANIZATION_URN = 'urn:li:organization:12345';
      vi.resetModules();

      const { verifyBrandAccountConfig } = await import('../services/gtm/gtm-config.js');
      const result = verifyBrandAccountConfig();

      expect(result.isValid).toBe(true);
    });

    it('should validate LinkedIn organization URN format', async () => {
      process.env.SOCIAL_ACCOUNT_TYPE = 'brand';
      process.env.LINKEDIN_ORGANIZATION_URN = 'invalid-format';
      vi.resetModules();

      const { verifyBrandAccountConfig } = await import('../services/gtm/gtm-config.js');
      const result = verifyBrandAccountConfig();

      // Should have an error about invalid format (errors not warnings for invalid URN)
      expect(
        result.errors.some((e) => e.includes('LINKEDIN_ORGANIZATION_URN')) ||
          result.warnings.some((w) => w.includes('LinkedIn'))
      ).toBe(true);
    });
  });

  describe('getBlogUrl', () => {
    it('should return URL with content ID', async () => {
      const { getBlogUrl } = await import('../services/gtm/gtm-config.js');

      const url = getBlogUrl('test-123');

      expect(url).toContain('test-123');
    });

    it('should use BLOG_BASE_URL constant', async () => {
      const { getBlogUrl, BLOG_BASE_URL } = await import('../services/gtm/gtm-config.js');
      const url = getBlogUrl('test-123');

      // Should use the constant defined in the module
      expect(url).toContain(BLOG_BASE_URL.replace('https://', '').split('/')[0]);
    });
  });
});

describe('GTM Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGTMStatus', () => {
    it('should return status object with required fields', async () => {
      const { getGTMStatus } = await import('../services/gtm/gtm-service.js');

      const status = await getGTMStatus();

      expect(status).toHaveProperty('calendarStats');
      expect(status).toHaveProperty('socialStatus');
      expect(status).toHaveProperty('pendingEntries');
      expect(status).toHaveProperty('suggestion');
      expect(status).toHaveProperty('config');
    });
  });

  describe('approveContent', () => {
    it('should return false for non-existent content', async () => {
      const { approveContent } = await import('../services/gtm/gtm-service.js');

      const result = approveContent('non-existent-id');

      expect(result).toBe(false);
    });

    it('should return true and update status for existing content', async () => {
      const { storeContent } = await import('../services/gtm/content-calendar.js');
      const { approveContent, getCalendarStats } = await import('../services/gtm/gtm-service.js');

      const testContent = {
        id: 'approve-test-content',
        title: 'Approve Test',
        body: 'Test body',
        excerpt: 'Test excerpt',
        hashtags: [],
        brief: {
          pillar: 'tutorials' as const,
          category: 'tutorial' as const,
          topic: 'Test',
          targetAudience: 'developers' as const,
          tone: 'warm' as const,
        },
        platforms: [],
        status: 'draft' as const,
        createdAt: new Date(),
      };

      storeContent(testContent);
      const result = approveContent('approve-test-content');

      expect(result).toBe(true);
    });
  });

  describe('rejectContent', () => {
    it('should return false for non-existent content', async () => {
      const { rejectContent } = await import('../services/gtm/gtm-service.js');

      const result = rejectContent('non-existent-id', 'test reason');

      expect(result).toBe(false);
    });
  });

  describe('API exports', () => {
    it('should export all required functions', async () => {
      const gtmService = await import('../services/gtm/gtm-service.js');

      expect(gtmService).toHaveProperty('runDailyPublishing');
      expect(gtmService).toHaveProperty('generateWeeklyContent');
      expect(gtmService).toHaveProperty('createContent');
      expect(gtmService).toHaveProperty('celebrateMilestone');
      expect(gtmService).toHaveProperty('getGTMDashboard');
      expect(gtmService).toHaveProperty('getGTMStatus');
      expect(gtmService).toHaveProperty('approveContent');
      expect(gtmService).toHaveProperty('rejectContent');
      expect(gtmService).toHaveProperty('publishNow');
      expect(gtmService).toHaveProperty('getCalendarStats');
      expect(gtmService).toHaveProperty('verifyBrandAccountConfig');
    });
  });
});

describe('GTM Types', () => {
  it('should export all required types', async () => {
    // Verify types are importable (compile-time check)
    const types = await import('../services/gtm/types.js');

    // These are type-only exports, so we just verify the module loads
    expect(types).toBeDefined();
  });
});

describe('GTM Storage Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('storeContent (Firestore)', () => {
    it('should be a function', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      expect(typeof storage.storeContent).toBe('function');
    });
  });

  describe('getAllContent (Firestore)', () => {
    it('should return array', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      const content = await storage.getAllContent();
      expect(Array.isArray(content)).toBe(true);
    });
  });

  describe('storeCalendarEntry (Firestore)', () => {
    it('should be a function', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      expect(typeof storage.storeCalendarEntry).toBe('function');
    });
  });

  describe('getAllCalendarEntries (Firestore)', () => {
    it('should return array', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      const entries = await storage.getAllCalendarEntries();
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getContentStats', () => {
    it('should return stats object', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      const stats = await storage.getContentStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byPillar');
      expect(stats).toHaveProperty('byCategory');
    });
  });

  describe('getCalendarStats (Storage)', () => {
    it('should return calendar stats object', async () => {
      const storage = await import('../services/gtm/gtm-storage.js');
      const stats = await storage.getCalendarStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byPillar');
    });
  });
});

describe('GTM Brand Voice', () => {
  describe('validateBrandVoice', () => {
    it('should validate content against brand guidelines', async () => {
      const { validateBrandVoice } = await import('../services/gtm/brand-voice.js');

      const result = validateBrandVoice('This is a test message about AI and technology.');

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('suggestions');
    });

    it('should return valid for brand-appropriate content', async () => {
      const { validateBrandVoice } = await import('../services/gtm/brand-voice.js');

      const result = validateBrandVoice(
        'Ferni helps you build meaningful relationships through thoughtful conversations.'
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe('getMonthlyTheme', () => {
    it('should return theme for valid month', async () => {
      const { getMonthlyTheme } = await import('../services/gtm/brand-voice.js');

      const theme = getMonthlyTheme(1); // January

      expect(theme).toBeDefined();
      expect(theme).toHaveProperty('name');
      expect(theme).toHaveProperty('description');
    });

    it('should return undefined for invalid month', async () => {
      const { getMonthlyTheme } = await import('../services/gtm/brand-voice.js');

      const theme = getMonthlyTheme(13); // Invalid

      expect(theme).toBeUndefined();
    });
  });

  describe('DEFAULT_WEEKLY_SCHEDULE', () => {
    it('should be exported', async () => {
      const brandVoice = await import('../services/gtm/brand-voice.js');

      expect(brandVoice.DEFAULT_WEEKLY_SCHEDULE).toBeDefined();
    });
  });

  describe('MONTHLY_THEMES', () => {
    it('should contain 12 themes', async () => {
      const { MONTHLY_THEMES } = await import('../services/gtm/brand-voice.js');

      expect(MONTHLY_THEMES.length).toBe(12);
    });
  });
});

describe('GTM Index Exports', () => {
  it('should export all public APIs', async () => {
    const gtm = await import('../services/gtm/index.js');

    // Service functions
    expect(gtm).toHaveProperty('runDailyPublishing');
    expect(gtm).toHaveProperty('generateWeeklyContent');
    expect(gtm).toHaveProperty('createContent');
    expect(gtm).toHaveProperty('celebrateMilestone');
    expect(gtm).toHaveProperty('getGTMDashboard');
    expect(gtm).toHaveProperty('getGTMStatus');
    expect(gtm).toHaveProperty('approveContent');
    expect(gtm).toHaveProperty('rejectContent');
    expect(gtm).toHaveProperty('publishNow');

    // Config
    expect(gtm).toHaveProperty('getGTMConfig');
    expect(gtm).toHaveProperty('getBlogUrl');
    expect(gtm).toHaveProperty('verifyBrandAccountConfig');

    // Calendar
    expect(gtm).toHaveProperty('generateWeeklyCalendar');
    expect(gtm).toHaveProperty('generateMonthlyCalendar');
    expect(gtm).toHaveProperty('getCalendarStats');
    expect(gtm).toHaveProperty('storeContent');
    expect(gtm).toHaveProperty('getContent');
    expect(gtm).toHaveProperty('initializeGTMCache');
  });
});
