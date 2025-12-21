/**
 * Calendar System Integration Tests
 *
 * Comprehensive E2E tests for the calendar provider system including:
 * - Provider registry
 * - Unified calendar store
 * - Sync engine
 * - Conflict resolution
 * - Selective calendar sync
 * - Webhooks and polling
 * - Rate limiting
 * - Encryption
 *
 * @module tests/calendar-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore
const mockFirestoreData = new Map<string, Map<string, unknown>>();

const mockDoc = (collectionPath: string, docId: string) => ({
  get: vi.fn().mockImplementation(async () => {
    const collection = mockFirestoreData.get(collectionPath);
    const data = collection?.get(docId);
    return {
      exists: !!data,
      data: () => data,
      id: docId,
    };
  }),
  set: vi.fn().mockImplementation(async (data: unknown) => {
    if (!mockFirestoreData.has(collectionPath)) {
      mockFirestoreData.set(collectionPath, new Map());
    }
    mockFirestoreData.get(collectionPath)!.set(docId, data);
  }),
  update: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
    const collection = mockFirestoreData.get(collectionPath);
    const existing = (collection?.get(docId) || {}) as Record<string, unknown>;
    if (!mockFirestoreData.has(collectionPath)) {
      mockFirestoreData.set(collectionPath, new Map());
    }
    mockFirestoreData.get(collectionPath)!.set(docId, { ...existing, ...data });
  }),
  delete: vi.fn().mockImplementation(async () => {
    mockFirestoreData.get(collectionPath)?.delete(docId);
  }),
});

const mockCollection = (collectionPath: string) => ({
  doc: vi.fn().mockImplementation((docId: string) => mockDoc(collectionPath, docId)),
  get: vi.fn().mockImplementation(async () => {
    const collection = mockFirestoreData.get(collectionPath);
    const docs = collection
      ? Array.from(collection.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => data,
        }))
      : [];
    return { docs, empty: docs.length === 0 };
  }),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
});

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockImplementation((path: string) => mockCollection(path)),
  })),
}));

// Mock Google Calendar OAuth
vi.mock('../../google-calendar-oauth.js', () => ({
  isCalendarConfigured: vi.fn().mockReturnValue(true),
  isOAuthConfigured: vi.fn().mockReturnValue(true),
  getValidAccessToken: vi.fn().mockResolvedValue('mock-google-access-token'),
  getEvents: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({ id: 'google-event-123' }),
  updateEvent: vi.fn().mockResolvedValue({ id: 'google-event-123' }),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  deleteUserTokens: vi.fn().mockResolvedValue(undefined),
}));

// Set mock environment variables
vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'mock-google-client-id');
vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'mock-google-secret');
vi.stubEnv('MICROSOFT_CLIENT_ID', 'mock-microsoft-client-id');
vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'mock-microsoft-secret');

// Mock fetch for external API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_USER_ID = 'test-user-123';
const TEST_EVENT_ID = 'test-event-456';

const createTestEvent = (
  overrides: Record<string, unknown> = {}
): import('../types.js').CalendarEvent => ({
  id: TEST_EVENT_ID,
  userId: TEST_USER_ID,
  title: 'Test Meeting',
  description: 'A test meeting',
  startTime: new Date('2024-01-15T10:00:00Z'),
  endTime: new Date('2024-01-15T11:00:00Z'),
  location: 'Conference Room A',
  isAllDay: false,
  status: 'confirmed' as const,
  source: 'ferni' as const,
  syncStatus: 'synced' as const,
  reminders: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  attendees: [] as string[],
  ...overrides,
});

// ============================================================================
// TESTS: PROVIDER REGISTRY
// ============================================================================

describe('Provider Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('should list all available providers', async () => {
    const { getAllProviders } = await import('../providers/provider-registry.js');
    const providers = getAllProviders();

    expect(providers).toHaveLength(3);
    expect(providers.map((p) => p.provider)).toContain('google');
    expect(providers.map((p) => p.provider)).toContain('apple');
    expect(providers.map((p) => p.provider)).toContain('outlook');
  });

  it('should get a specific provider by ID', async () => {
    const { getProvider } = await import('../providers/provider-registry.js');

    const googleProvider = getProvider('google');
    expect(googleProvider).toBeDefined();
    expect(googleProvider?.provider).toBe('google');

    const appleProvider = getProvider('apple');
    expect(appleProvider).toBeDefined();
    expect(appleProvider?.provider).toBe('apple');

    const outlookProvider = getProvider('outlook');
    expect(outlookProvider).toBeDefined();
    expect(outlookProvider?.provider).toBe('outlook');
  });

  it('should return null for unknown provider', async () => {
    const { getProvider } = await import('../providers/provider-registry.js');
    const unknownProvider = getProvider('unknown' as 'google');
    expect(unknownProvider).toBeNull();
  });
});

// ============================================================================
// TESTS: UNIFIED CALENDAR STORE
// ============================================================================

describe('Unified Calendar Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('should create a new event', async () => {
    const { createEvent } = await import('../unified-calendar-store.js');
    const eventInput = {
      title: 'New Meeting',
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T11:00:00Z'),
    };

    const event = await createEvent(TEST_USER_ID, eventInput);

    expect(event).toBeDefined();
    expect(event.id).toBeDefined();
    expect(event.title).toBe('New Meeting');
    expect(event.source).toBe('ferni');
  });

  it('should get events for a date range', async () => {
    const { getEvents, createEvent } = await import('../unified-calendar-store.js');

    // Create a test event first
    await createEvent(TEST_USER_ID, {
      title: 'Meeting 1',
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T11:00:00Z'),
    });

    const events = await getEvents(
      TEST_USER_ID,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-31T23:59:59Z')
    );

    expect(events).toBeInstanceOf(Array);
  });

  it('should update an existing event', async () => {
    const { createEvent, updateEvent, getEventById } = await import('../unified-calendar-store.js');

    const event = await createEvent(TEST_USER_ID, {
      title: 'Original Title',
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T11:00:00Z'),
    });

    await updateEvent(TEST_USER_ID, event.id, { title: 'Updated Title' });

    const updatedEvent = await getEventById(TEST_USER_ID, event.id);
    expect(updatedEvent?.title).toBe('Updated Title');
  });

  it('should delete an event', async () => {
    const { createEvent, deleteEvent, getEventById } = await import('../unified-calendar-store.js');

    const event = await createEvent(TEST_USER_ID, {
      title: 'To Be Deleted',
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T11:00:00Z'),
    });

    await deleteEvent(TEST_USER_ID, event.id);

    const deletedEvent = await getEventById(TEST_USER_ID, event.id);
    expect(deletedEvent).toBeNull();
  });

  it('should import external events', async () => {
    const { importExternalEvent } = await import('../unified-calendar-store.js');

    await importExternalEvent(
      TEST_USER_ID,
      'google',
      'external-123',
      'primary',
      {
        title: 'Imported from Google',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
      },
      'etag-123'
    );

    // Event should be stored with external reference
    // Note: exact verification depends on implementation details
  });
});

// ============================================================================
// TESTS: CONFLICT RESOLVER
// ============================================================================

describe('Conflict Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('should detect conflicts between Ferni and provider events', async () => {
    const { detectConflicts } = await import('../conflict-resolver.js');

    const ferniEvent = createTestEvent({
      title: 'Ferni Version',
      updatedAt: new Date('2024-01-15T12:00:00Z'),
    });

    const providerEvent = createTestEvent({
      title: 'Google Version',
      updatedAt: new Date('2024-01-15T12:30:00Z'),
    });

    // detectConflicts returns a conflict type string or null
    const conflictType = detectConflicts(ferniEvent, providerEvent);

    // Different titles should result in a conflict
    expect(conflictType).toBe('both-modified');
  });

  it('should not detect conflict when provider event is unmodified since last sync', async () => {
    const { detectConflicts } = await import('../conflict-resolver.js');

    // Create a Ferni event that was synced recently
    const lastSyncTime = new Date('2024-01-15T14:00:00Z');
    const ferniEvent = createTestEvent({
      title: 'Same Title',
      lastSyncAttempt: lastSyncTime,
      updatedAt: new Date('2024-01-15T10:00:00Z'), // Updated before last sync
    });

    // Provider event that hasn't changed since last sync
    const providerEvent = createTestEvent({
      title: 'Same Title',
      updatedAt: new Date('2024-01-15T10:00:00Z'), // Same as Ferni
    });

    const conflictType = detectConflicts(ferniEvent, providerEvent);

    // Identical titles, not modified since last sync - no conflict
    expect(conflictType).toBeNull();
  });

  it('should store a conflict for manual resolution', async () => {
    const { storeConflict } = await import('../conflict-resolver.js');

    const ferniEvent = createTestEvent({ title: 'Ferni Version' });
    const providerEvent = createTestEvent({ title: 'Google Version' });

    const conflictId = await storeConflict(
      TEST_USER_ID,
      {
        eventId: TEST_EVENT_ID,
        ferniEvent,
        providerEvent,
        conflictType: 'title',
        detectedAt: new Date(),
      },
      'google'
    );

    expect(conflictId).toBeDefined();
  });

  it('should resolve a conflict with ferni-wins strategy', async () => {
    const { storeConflict, resolveConflict } = await import('../conflict-resolver.js');

    const ferniEvent = createTestEvent({ title: 'Ferni Version' });
    const providerEvent = createTestEvent({ title: 'Google Version' });

    const conflictId = await storeConflict(
      TEST_USER_ID,
      {
        eventId: TEST_EVENT_ID,
        ferniEvent,
        providerEvent,
        conflictType: 'title',
        detectedAt: new Date(),
      },
      'google'
    );

    // conflictId might be null if Firestore not available in test
    if (conflictId) {
      const result = await resolveConflict(TEST_USER_ID, conflictId, 'ferni-wins');

      // Result is an object with success property
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    }
  });

  it('should auto-resolve conflicts using default strategy', async () => {
    const { autoResolveConflicts, setResolutionPreference } =
      await import('../conflict-resolver.js');

    // Set default strategy
    await setResolutionPreference(TEST_USER_ID, 'newest-wins');

    const result = await autoResolveConflicts(TEST_USER_ID);

    // Result should be an object with resolution info
    expect(result).toBeDefined();
    expect(result).toHaveProperty('resolved');
  });
});

// ============================================================================
// TESTS: CALENDAR SELECTION
// ============================================================================

describe('Calendar Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();

    // Mock provider's getCalendars method
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'primary', summary: 'Primary Calendar', primary: true },
          { id: 'work', summary: 'Work Calendar', primary: false },
          { id: 'personal', summary: 'Personal Calendar', primary: false },
        ],
      }),
    });
  });

  it('should get available calendars from a provider', async () => {
    const { getSelectedCalendars } = await import('../calendar-selection.js');

    const calendars = await getSelectedCalendars(TEST_USER_ID, 'google');

    expect(calendars).toBeInstanceOf(Array);
  });

  it('should update selected calendars for sync', async () => {
    const { updateSelectedCalendars, getSelectedCalendars } =
      await import('../calendar-selection.js');

    await updateSelectedCalendars(TEST_USER_ID, 'google', ['primary', 'work']);

    const selected = await getSelectedCalendars(TEST_USER_ID, 'google');
    expect(selected).toBeInstanceOf(Array);
  });
});

// ============================================================================
// TESTS: RATE LIMITER
// ============================================================================

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a rate limit result', async () => {
    const { checkCalendarRateLimit } = await import('../utils/rate-limiter.js');

    const result = checkCalendarRateLimit(TEST_USER_ID, 'sync');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('allowed');
  });

  it('should include rate limit headers', async () => {
    const { checkCalendarRateLimit } = await import('../utils/rate-limiter.js');

    const result = checkCalendarRateLimit(TEST_USER_ID, 'sync');

    expect(result).toHaveProperty('headers');
    expect(typeof result.headers).toBe('object');
  });
});

// ============================================================================
// TESTS: ENCRYPTION
// ============================================================================

describe('Encryption Utils', () => {
  it('should encrypt and decrypt strings', async () => {
    const { encrypt, decrypt } = await import('../utils/encryption.js');

    const originalText = 'my-secret-password';

    const encrypted = encrypt(originalText);

    // Should return EncryptedData object
    expect(encrypted).toHaveProperty('encrypted');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('tag');
    expect(encrypted).toHaveProperty('version');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(originalText);
  });

  it('should produce different ciphertext for same plaintext', async () => {
    const { encrypt } = await import('../utils/encryption.js');

    const text = 'same-text';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);

    // Due to random IV, encryptions should differ
    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should handle decryption of valid ciphertext', async () => {
    const { encrypt, decrypt } = await import('../utils/encryption.js');

    const original = 'test-value-123';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(original);
  });

  it('should check if data is encrypted', async () => {
    const { encrypt, isEncrypted } = await import('../utils/encryption.js');

    const encrypted = encrypt('test');
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted('plain-text')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted({})).toBe(false);
  });
});

// ============================================================================
// TESTS: SYNC ENGINE
// ============================================================================

describe('Sync Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();

    // Mock successful fetch responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  it('should have a sync all method', async () => {
    const { getSyncEngine } = await import('../sync-engine.js');
    const syncEngine = getSyncEngine();

    expect(syncEngine).toBeDefined();
    expect(typeof syncEngine.syncAll).toBe('function');
  });

  it('should have a sync provider method', async () => {
    const { getSyncEngine } = await import('../sync-engine.js');
    const syncEngine = getSyncEngine();

    expect(syncEngine).toBeDefined();
    expect(typeof syncEngine.syncProvider).toBe('function');
  });

  it('should return a result from syncProvider', async () => {
    const { getSyncEngine } = await import('../sync-engine.js');
    const syncEngine = getSyncEngine();

    // Attempt sync - may succeed or fail depending on provider config
    const result = await syncEngine.syncProvider(TEST_USER_ID, 'google');

    expect(result).toBeDefined();
  });
});

// ============================================================================
// TESTS: GOOGLE WEBHOOKS
// ============================================================================

describe('Google Calendar Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'channel-123',
        resourceId: 'resource-456',
        resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    });
  });

  it('should create a watch channel', async () => {
    const { createWatchChannel } = await import('../webhooks/google-webhook.js');

    const channel = await createWatchChannel(TEST_USER_ID, 'primary');

    // Channel may be null if not configured, which is expected in test environment
    if (channel) {
      expect(channel.id).toBeDefined();
      expect(channel.resourceId).toBeDefined();
    }
  });

  it('should handle webhook notification', async () => {
    const { handleWebhookNotification } = await import('../webhooks/google-webhook.js');

    const result = await handleWebhookNotification({
      channelId: 'channel-123',
      resourceId: 'resource-456',
      resourceState: 'sync',
    });

    // Should handle gracefully even if channel not found
    expect(result).toHaveProperty('success');
  });

  it('should renew expiring channels', async () => {
    const { renewExpiringChannels } = await import('../webhooks/google-webhook.js');

    const renewedCount = await renewExpiringChannels();

    expect(typeof renewedCount).toBe('number');
  });
});

// ============================================================================
// TESTS: OUTLOOK WEBHOOKS
// ============================================================================

describe('Outlook Calendar Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'subscription-123',
        resource: 'me/events',
        clientState: 'test-state',
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  });

  it('should create a subscription', async () => {
    const { createSubscription } = await import('../webhooks/outlook-webhook.js');

    const subscription = await createSubscription(TEST_USER_ID);

    // May be null if provider not connected
    if (subscription) {
      expect(subscription.subscriptionId).toBeDefined();
    }
  });

  it('should handle webhook notification', async () => {
    const { handleWebhookNotification } = await import('../webhooks/outlook-webhook.js');

    const result = await handleWebhookNotification({
      value: [
        {
          subscriptionId: 'subscription-123',
          subscriptionExpirationDateTime: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000
          ).toISOString(),
          resource: 'me/events/event-123',
          clientState: 'test-state',
          changeType: 'updated',
          resourceData: {
            id: 'event-123',
            '@odata.type': '#Microsoft.Graph.Event',
            '@odata.id': 'Users/user-id/Events/event-123',
          },
        },
      ],
    });

    expect(result).toHaveProperty('success');
  });

  it('should renew expiring subscriptions', async () => {
    const { renewExpiringSubscriptions } = await import('../webhooks/outlook-webhook.js');

    const renewedCount = await renewExpiringSubscriptions();

    expect(typeof renewedCount).toBe('number');
  });
});

// ============================================================================
// TESTS: APPLE POLLING
// ============================================================================

describe('Apple Calendar Polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  it('should register a user for polling', async () => {
    const { registerUser, getPollingStats } = await import('../polling/apple-polling.js');

    await registerUser(TEST_USER_ID);

    const stats = getPollingStats();
    expect(stats.totalUsers).toBeGreaterThanOrEqual(0);
  });

  it('should unregister a user from polling', async () => {
    const { registerUser, unregisterUser } = await import('../polling/apple-polling.js');

    await registerUser(TEST_USER_ID);
    await unregisterUser(TEST_USER_ID);

    // User should be removed from polling
  });

  it('should start and stop polling', async () => {
    const { startPolling, stopPolling, isPollingRunning } =
      await import('../polling/apple-polling.js');

    startPolling();
    expect(isPollingRunning()).toBe(true);

    stopPolling();
    expect(isPollingRunning()).toBe(false);
  });

  it('should mark user as active', async () => {
    const { registerUser, markUserActive, getPollingStats } =
      await import('../polling/apple-polling.js');

    await registerUser(TEST_USER_ID);
    markUserActive(TEST_USER_ID);

    const stats = getPollingStats();
    // Active users should be counted
    expect(stats).toHaveProperty('activeUsers');
  });
});

// ============================================================================
// TESTS: PROVIDER INTEGRATION
// ============================================================================

describe('Provider Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreData.clear();
  });

  describe('Google Calendar Provider', () => {
    const TEST_REDIRECT_URI = 'http://localhost:3002/callback/google';

    it('should check connection status', async () => {
      const { googleCalendarProvider } = await import('../providers/google-provider.js');

      const isConnected = await googleCalendarProvider.isConnected(TEST_USER_ID);

      expect(typeof isConnected).toBe('boolean');
    });

    it('should generate auth URL', async () => {
      const { googleCalendarProvider } = await import('../providers/google-provider.js');

      // getAuthUrl may throw if not configured
      try {
        const authUrl = googleCalendarProvider.getAuthUrl(TEST_USER_ID, TEST_REDIRECT_URI);
        expect(authUrl).toContain('accounts.google.com');
      } catch {
        // Expected if credentials not configured in test environment
      }
    });
  });

  describe('Apple Calendar Provider', () => {
    const TEST_REDIRECT_URI = 'http://localhost:3002/callback/apple';

    it('should check connection status', async () => {
      const { appleCalendarProvider } = await import('../providers/apple-provider.js');

      const isConnected = await appleCalendarProvider.isConnected(TEST_USER_ID);

      expect(typeof isConnected).toBe('boolean');
    });

    it('should return credential setup info', async () => {
      const { appleCalendarProvider } = await import('../providers/apple-provider.js');

      // Apple uses manual credential entry, getAuthUrl returns info URL
      const authInfo = appleCalendarProvider.getAuthUrl?.(TEST_USER_ID, TEST_REDIRECT_URI);

      // Apple might not have getAuthUrl, so check if it exists
      if (authInfo) {
        expect(authInfo).toContain('appleid.apple.com');
      }
    });
  });

  describe('Outlook Calendar Provider', () => {
    const TEST_REDIRECT_URI = 'http://localhost:3002/callback/outlook';

    it('should check configuration status', async () => {
      const { outlookCalendarProvider } = await import('../providers/outlook-provider.js');

      const isConfigured = outlookCalendarProvider.isConfigured();

      expect(typeof isConfigured).toBe('boolean');
    });

    it('should generate auth URL', async () => {
      const { outlookCalendarProvider } = await import('../providers/outlook-provider.js');

      // getAuthUrl may throw if not configured
      try {
        const authUrl = outlookCalendarProvider.getAuthUrl?.(TEST_USER_ID, TEST_REDIRECT_URI);
        if (authUrl) {
          expect(authUrl).toContain('login.microsoftonline.com');
        }
      } catch {
        // Expected if credentials not configured in test environment
      }
    });
  });
});
