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
    process.env.FITBIT_CLIENT_ID = 'test-fitbit-id';
    process.env.FITBIT_CLIENT_SECRET = 'test-fitbit-secret';
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

      expect(isProviderConfigured('fitbit')).toBe(true);
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

      expect(providers).toContain('fitbit');
      expect(providers).toContain('oura');
      expect(providers).not.toContain('garmin');
      expect(providers).not.toContain('whoop');
    });
  });

  describe('getProviderConfig', () => {
    it('should return config for configured provider', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('fitbit');

      expect(config).not.toBeNull();
      expect(config?.clientId).toBe('test-fitbit-id');
      expect(config?.authorizeUrl).toBe('https://www.fitbit.com/oauth2/authorize');
      expect(config?.scopes).toContain('activity');
      expect(config?.scopes).toContain('sleep');
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

      const url = buildAuthUrl('fitbit', 'test-state-123');

      expect(url).not.toBeNull();
      expect(url).toContain('https://www.fitbit.com/oauth2/authorize');
      expect(url).toContain('client_id=test-fitbit-id');
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

      const tokens = await getTokens('fitbit', 'user-123');

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

      expect(statuses).toHaveLength(5); // apple_health + 4 OAuth providers
      expect(statuses.find((s) => s.provider === 'apple_health')).toBeDefined();
      expect(statuses.find((s) => s.provider === 'fitbit')).toBeDefined();
      expect(statuses.find((s) => s.provider === 'oura')).toBeDefined();
    });

    it('should include login URLs for configured providers', async () => {
      const { getAllConnectionStatuses } = await import('../servers/token/oauth/wearables.js');

      const statuses = await getAllConnectionStatuses('user-123');

      const fitbitStatus = statuses.find((s) => s.provider === 'fitbit');
      expect(fitbitStatus?.login_url).toContain('/wearables/fitbit/login');

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

  describe('Fitbit scopes', () => {
    it('should include all required health scopes', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('fitbit');

      expect(config?.scopes).toContain('activity');
      expect(config?.scopes).toContain('heartrate');
      expect(config?.scopes).toContain('sleep');
      expect(config?.scopes).toContain('oxygen_saturation');
      expect(config?.scopes).toContain('respiratory_rate');
      expect(config?.scopes).toContain('temperature');
    });
  });

  describe('Oura scopes', () => {
    it('should include all required health scopes', async () => {
      const { getProviderConfig } = await import('../servers/token/oauth/wearables.js');

      const config = getProviderConfig('oura');

      expect(config?.scopes).toContain('daily');
      expect(config?.scopes).toContain('heartrate');
      expect(config?.scopes).toContain('sleep');
      expect(config?.scopes).toContain('workout');
    });
  });
});
