/**
 * Calendar Providers Tests
 *
 * Tests for the provider-agnostic calendar system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

// Mock logger - must export both getLogger and createLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    serializeError: (e: unknown) => String(e),
  };
});

// Mock google-calendar-oauth (for Google provider)
vi.mock('../../identity/google-calendar-oauth.js', () => ({
  isCalendarConfigured: vi.fn().mockReturnValue(true),
  isOAuthConfigured: vi.fn().mockReturnValue(true),
  getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  getEvents: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({ id: 'google-event-123' }),
  updateEvent: vi.fn().mockResolvedValue({ id: 'google-event-123' }),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  deleteUserTokens: vi.fn().mockResolvedValue(undefined),
}));

describe('Calendar Provider Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProvider', () => {
    it('should return null for ferni (native calendar)', async () => {
      const { getProvider } = await import('../providers/provider-registry.js');
      const provider = getProvider('ferni');
      expect(provider).toBeNull();
    });

    it('should return Google provider', async () => {
      const { getProvider } = await import('../providers/provider-registry.js');
      const provider = getProvider('google');
      expect(provider).not.toBeNull();
      expect(provider?.provider).toBe('google');
    });

    it('should return Apple provider', async () => {
      const { getProvider } = await import('../providers/provider-registry.js');
      const provider = getProvider('apple');
      expect(provider).not.toBeNull();
      expect(provider?.provider).toBe('apple');
    });

    it('should return Outlook provider', async () => {
      const { getProvider } = await import('../providers/provider-registry.js');
      const provider = getProvider('outlook');
      expect(provider).not.toBeNull();
      expect(provider?.provider).toBe('outlook');
    });
  });

  describe('getAllProviders', () => {
    it('should return all three providers', async () => {
      const { getAllProviders } = await import('../providers/provider-registry.js');
      const providers = getAllProviders();
      expect(providers.length).toBe(3);
    });
  });

  describe('getProviderInfo', () => {
    it('should return correct info for each provider', async () => {
      const { getProviderInfo } = await import('../providers/provider-registry.js');

      const ferniInfo = getProviderInfo('ferni');
      expect(ferniInfo.name).toBe('Ferni Calendar');
      expect(ferniInfo.authType).toBe('native');

      const googleInfo = getProviderInfo('google');
      expect(googleInfo.name).toBe('Google Calendar');
      expect(googleInfo.authType).toBe('oauth');

      const appleInfo = getProviderInfo('apple');
      expect(appleInfo.name).toBe('Apple Calendar');
      expect(appleInfo.authType).toBe('credentials');

      const outlookInfo = getProviderInfo('outlook');
      expect(outlookInfo.name).toBe('Outlook Calendar');
      expect(outlookInfo.authType).toBe('oauth');
    });
  });
});

describe('Google Calendar Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check if configured', async () => {
    const { GoogleCalendarProvider } = await import('../providers/google-provider.js');
    const provider = new GoogleCalendarProvider();

    expect(provider.isConfigured()).toBe(true);
  });

  it('should fetch events', async () => {
    const { GoogleCalendarProvider } = await import('../providers/google-provider.js');
    const provider = new GoogleCalendarProvider();

    const events = await provider.fetchEvents('user-123', new Date(), new Date());
    expect(Array.isArray(events)).toBe(true);
  });

  it('should generate auth URL', async () => {
    // Set env vars for this test
    const originalEnv = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client-id';

    const { GoogleCalendarProvider } = await import('../providers/google-provider.js');
    const provider = new GoogleCalendarProvider();

    const url = provider.getAuthUrl('user-123', 'https://example.com/callback');
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('test-client-id');

    // Restore
    process.env.GOOGLE_CALENDAR_CLIENT_ID = originalEnv;
  });
});

describe('Apple Calendar Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should always be configured (user provides credentials)', async () => {
    const { AppleCalendarProvider } = await import('../providers/apple-provider.js');
    const provider = new AppleCalendarProvider();

    expect(provider.isConfigured()).toBe(true);
  });

  it('should not be connected without credentials', async () => {
    const { AppleCalendarProvider } = await import('../providers/apple-provider.js');
    const provider = new AppleCalendarProvider();

    const connected = await provider.isConnected('user-123');
    expect(connected).toBe(false);
  });

  it('should return Apple ID page URL for auth', async () => {
    const { AppleCalendarProvider } = await import('../providers/apple-provider.js');
    const provider = new AppleCalendarProvider();

    const url = provider.getAuthUrl('user-123', 'https://example.com/callback');
    expect(url).toContain('appleid.apple.com');
  });
});

describe('Outlook Calendar Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check configuration based on env vars', async () => {
    const { OutlookCalendarProvider } = await import('../providers/outlook-provider.js');
    const provider = new OutlookCalendarProvider();

    // Without env vars, should not be configured
    const originalClientId = process.env.MICROSOFT_CLIENT_ID;
    const originalSecret = process.env.MICROSOFT_CLIENT_SECRET;

    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;

    expect(provider.isConfigured()).toBe(false);

    // Restore
    process.env.MICROSOFT_CLIENT_ID = originalClientId;
    process.env.MICROSOFT_CLIENT_SECRET = originalSecret;
  });

  it('should not be connected without OAuth', async () => {
    const { OutlookCalendarProvider } = await import('../providers/outlook-provider.js');
    const provider = new OutlookCalendarProvider();

    const connected = await provider.isConnected('user-123');
    expect(connected).toBe(false);
  });
});

describe('Unified Calendar Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty events for new user', async () => {
    const { getEvents } = await import('../unified-calendar-store.js');

    const events = await getEvents('new-user', new Date(), new Date());
    expect(events).toEqual([]);
  });

  it('should create events with proper ID format', async () => {
    const { createEvent } = await import('../unified-calendar-store.js');

    const event = await createEvent('user-123', {
      title: 'Test Event',
      startTime: new Date(),
    });

    expect(event.id).toMatch(/^evt_/);
    expect(event.title).toBe('Test Event');
    expect(event.source).toBe('ferni');
  });

  it('should check provider connections', async () => {
    const { hasAnyProviderConnected } = await import('../unified-calendar-store.js');

    const hasProvider = await hasAnyProviderConnected('user-123');
    expect(hasProvider).toBe(false);
  });
});

describe('Sync Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create sync engine instance', async () => {
    const { getSyncEngine } = await import('../sync-engine.js');

    const engine = getSyncEngine();
    expect(engine).toBeDefined();
  });

  it('should return empty results when no providers connected', async () => {
    const { syncAllProviders } = await import('../sync-engine.js');

    const results = await syncAllProviders('user-123');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0); // No providers connected
  });
});

describe('Calendar Types', () => {
  it('should export all required types', async () => {
    const types = await import('../types.js');

    // Check that types are exported (they'll be undefined at runtime but the import should work)
    expect(types).toBeDefined();
  });
});
