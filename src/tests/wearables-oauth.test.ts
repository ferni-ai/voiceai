/**
 * Wearables OAuth Tests
 *
 * Tests for wearable device OAuth integration:
 * - Provider configuration validation
 * - Token caching and persistence
 * - Auth URL building
 * - Token refresh logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the persistence store before importing
vi.mock('../services/persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setImmediate: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock encryption
vi.mock('../servers/shared/encryption.js', () => ({
  encryptData: vi.fn((data) => JSON.stringify(data)),
  decryptData: vi.fn((data) => JSON.parse(data)),
}));

// Store original env
const originalEnv = { ...process.env };

describe('Wearables OAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    // Set up test environment variables
    process.env.OURA_CLIENT_ID = 'test-oura-id';
    process.env.OURA_CLIENT_SECRET = 'test-oura-secret';
    process.env.TOKEN_SERVER_PORT = '3001';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('isProviderConfigured', () => {
    it('should return true for configured providers', async () => {
      const { isProviderConfigured } = await import('../servers/token/oauth/wearables.js');

      expect(isProviderConfigured('oura')).toBe(true);
    });

    it('should return false for unconfigured providers', async () => {
      const { isProviderConfigured } = await import('../servers/token/oauth/wearables.js');

      // Garmin and Whoop not configured in test env
      expect(isProviderConfigured('garmin')).toBe(false);
      expect(isProviderConfigured('whoop')).toBe(false);
    });

    it('should return true for apple_health (always native)', async () => {
      const { isProviderConfigured } = await import('../servers/token/oauth/wearables.js');

      expect(isProviderConfigured('apple_health')).toBe(true);
    });
  });

  describe('getConfiguredProviders', () => {
    it('should return list of configured providers', async () => {
      const { getConfiguredProviders } = await import('../servers/token/oauth/wearables.js');

      const providers = getConfiguredProviders();

      expect(providers).toContain('oura');
      expect(providers).not.toContain('garmin');
      expect(providers).not.toContain('whoop');
    });
  });

  describe('getProviderConfig', () => {
    it('should return config for configured provider', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('oura');

      expect(config).not.toBeNull();
      expect(config?.clientId).toBe('test-oura-id');
      expect(config?.authorizeUrl).toBe('https://cloud.ouraring.com/oauth/authorize');
      expect(config?.scopes).toContain('daily');
    });

    it('should return null for unconfigured provider', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('garmin');

      expect(config).toBeNull();
    });
  });

  describe('buildAuthUrl', () => {
    it('should build correct OAuth authorization URL', async () => {
      const { buildAuthUrl } = await import('../servers/token/oauth/wearables.js');

      const url = buildAuthUrl('oura', 'test-state-123');

      expect(url).not.toBeNull();
      expect(url).toContain('https://cloud.ouraring.com/oauth/authorize');
      expect(url).toContain('client_id=test-oura-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('scope=');
    });

    it('should return null for unconfigured provider', async () => {
      const { buildAuthUrl } = await import('../servers/token/oauth/wearables.js');

      const url = buildAuthUrl('garmin', 'test-state');

      expect(url).toBeNull();
    });
  });

  describe('getTokens', () => {
    it('should return null for apple_health', async () => {
      const { getTokens } = await import('../servers/token/oauth/wearables.js');

      const tokens = await getTokens('apple_health', 'user-123');

      expect(tokens).toBeNull();
    });

    it('should return null when no tokens stored', async () => {
      const { getTokens } = await import('../servers/token/oauth/wearables.js');

      const tokens = await getTokens('oura', 'user-123');

      expect(tokens).toBeNull();
    });
  });

  describe('saveTokens', () => {
    it('should not save tokens for apple_health', async () => {
      const { saveTokens, getTokens } = await import('../servers/token/oauth/wearables.js');

      await saveTokens('apple_health', 'user-123', {
        access_token: 'test',
        refresh_token: 'test',
        expires_at: Date.now() + 3600000,
      });

      // Should still be null
      const tokens = await getTokens('apple_health', 'user-123');
      expect(tokens).toBeNull();
    });
  });

  describe('getAllConnectionStatuses', () => {
    it('should return status for all providers', async () => {
      const { getAllConnectionStatuses } = await import('../servers/token/oauth/wearables.js');

      const statuses = await getAllConnectionStatuses('user-123');

      // apple_health + the 3 web OAuth providers, and nothing retired
      expect(statuses.map((s) => s.provider)).toEqual(['apple_health', 'oura', 'garmin', 'whoop']);
    });

    it('should include login URLs for configured providers', async () => {
      const { getAllConnectionStatuses } = await import('../servers/token/oauth/wearables.js');

      const statuses = await getAllConnectionStatuses('user-123');

      const ouraStatus = statuses.find((s) => s.provider === 'oura');
      expect(ouraStatus?.login_url).toContain('/wearables/oura/login');

      // Unconfigured providers should have null login_url
      const garminStatus = statuses.find((s) => s.provider === 'garmin');
      expect(garminStatus?.login_url).toBeNull();
    });

    it('should show apple_health with deep link', async () => {
      const { getAllConnectionStatuses } = await import('../servers/token/oauth/wearables.js');

      const statuses = await getAllConnectionStatuses('user-123');

      const appleStatus = statuses.find((s) => s.provider === 'apple_health');
      expect(appleStatus?.login_url).toBe('ferniapp://healthkit/authorize');
      expect(appleStatus?.configured).toBe(true);
    });
  });

  describe('Oura scopes', () => {
    it('should include all required health scopes', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('oura');

      expect(config?.scopes).toContain('daily'); // covers sleep and readiness
      expect(config?.scopes).toContain('heartrate');
      expect(config?.scopes).toContain('workout');
      expect(config?.scopes).toContain('spo2');
    });

    it('does not ask for "sleep", which is not an Oura v2 scope', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      expect(getProviderConfig('oura')?.scopes).not.toContain('sleep');
    });
  });
});
