/**
 * Tests for Smart Home User Credentials Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before imports - need to handle nested collection/doc chains
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

// Create a recursive mock that handles any depth of collection/doc chains
function createChainedMock() {
  const mock: Record<string, unknown> = {
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  };
  mock.doc = vi.fn(() => mock);
  mock.collection = vi.fn(() => mock);
  return mock;
}

const mockDb = createChainedMock();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  getUserSmartHomeCredentials,
  getCredential,
  saveCredential,
  deleteCredential,
  hasAnySmartHomeIntegration,
  getSetupState,
  isIntegrationConfigured,
} from '../user-credentials.js';

describe('user-credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserSmartHomeCredentials', () => {
    it('should return empty credentials when no data exists', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await getUserSmartHomeCredentials('test-user');

      expect(result).toEqual({
        hue: null,
        lifx: null,
        sonos: null,
        homeKit: null,
      });
    });

    it('should return credentials when data exists', async () => {
      const hueData = { bridgeIp: '192.168.1.100', username: 'test-user' };
      const lifxData = { token: 'test-token' };

      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => hueData })
        .mockResolvedValueOnce({ exists: true, data: () => lifxData })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false });

      const result = await getUserSmartHomeCredentials('test-user');

      expect(result.hue).toEqual(hueData);
      expect(result.lifx).toEqual(lifxData);
      expect(result.sonos).toBeNull();
      expect(result.homeKit).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));

      const result = await getUserSmartHomeCredentials('test-user');

      expect(result).toEqual({
        hue: null,
        lifx: null,
        sonos: null,
        homeKit: null,
      });
    });
  });

  describe('getCredential', () => {
    it('should return null when credential does not exist', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await getCredential('test-user', 'hue');

      expect(result).toBeNull();
    });

    it('should return credential when it exists', async () => {
      const hueData = { bridgeIp: '192.168.1.100', username: 'test-user' };
      mockGet.mockResolvedValue({ exists: true, data: () => hueData });

      const result = await getCredential('test-user', 'hue');

      expect(result).toEqual(hueData);
    });
  });

  describe('saveCredential', () => {
    it('should save credential and return true', async () => {
      mockGet.mockResolvedValue({ exists: false, data: () => null });
      mockSet.mockResolvedValue(undefined);

      const result = await saveCredential('test-user', 'hue', {
        bridgeIp: '192.168.1.100',
        username: 'test-user',
      });

      expect(result).toBe(true);
      expect(mockSet).toHaveBeenCalled();
    });

    it('should return false on error', async () => {
      mockSet.mockRejectedValue(new Error('Firestore error'));
      mockGet.mockResolvedValue({ exists: false, data: () => null });

      const result = await saveCredential('test-user', 'hue', {
        bridgeIp: '192.168.1.100',
        username: 'test-user',
      });

      expect(result).toBe(false);
    });
  });

  describe('deleteCredential', () => {
    it('should delete credential and return true', async () => {
      mockDelete.mockResolvedValue(undefined);
      mockGet.mockResolvedValue({ exists: false, data: () => null });

      const result = await deleteCredential('test-user', 'hue');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('hasAnySmartHomeIntegration', () => {
    it('should return false when no integrations configured', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const result = await hasAnySmartHomeIntegration('test-user');

      expect(result).toBe(false);
    });

    it('should return true when at least one integration configured', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ bridgeIp: '192.168.1.100', username: 'test' }),
        })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false });

      const result = await hasAnySmartHomeIntegration('test-user');

      expect(result).toBe(true);
    });
  });

  describe('isIntegrationConfigured', () => {
    it('should return true when integration is configured', async () => {
      const tokenData = { token: 'test' };
      mockGet.mockResolvedValue({ exists: true, data: () => tokenData });

      const result = await isIntegrationConfigured('test-user', 'lifx');

      // The function returns the credential value, not a boolean
      expect(result).toBe(true);
    });

    it('should return false when integration is not configured', async () => {
      mockGet.mockResolvedValue({ exists: false, data: () => null });

      const result = await isIntegrationConfigured('test-user', 'sonos');

      expect(result).toBe(false);
    });
  });

  describe('getSetupState', () => {
    it('should return default state when no setup data exists', async () => {
      mockGet.mockResolvedValue({ exists: false, data: () => null });

      const result = await getSetupState('test-user');

      expect(result).toEqual({
        completedIntegrations: [],
        lastSetupDate: null,
        setupStartedAt: null,
        setupAbandoned: false,
      });
    });

    it('should merge saved state with defaults', async () => {
      const setupState = {
        completedIntegrations: ['hue'],
        lastSetupDate: '2024-01-01',
      };
      mockGet.mockResolvedValue({ exists: true, data: () => setupState });

      const result = await getSetupState('test-user');

      // Should merge with defaults
      expect(result.completedIntegrations).toEqual(['hue']);
      expect(result.lastSetupDate).toBe('2024-01-01');
      expect(result.setupAbandoned).toBe(false);
    });
  });
});
