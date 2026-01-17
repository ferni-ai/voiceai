/**
 * Platform Clients Tests
 *
 * Tests for platform API integrations (Reddit, TikTok, Email).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureReddit,
  configureTikTok,
  configureEmail,
  generateTikTokInstructions,
  getPlatformManager,
} from '../../../apps/cli/src/commands/growth/platform-clients.js';
import * as storage from '../../../apps/cli/src/commands/growth/growth-storage.js';

// Mock storage
vi.mock('../../../apps/cli/src/commands/growth/growth-storage.js', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

describe('Platform Clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configureReddit', () => {
    it('should save Reddit credentials to storage', async () => {
      await configureReddit({
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      });

      expect(storage.updateSettings).toHaveBeenCalledWith({
        redditClientId: 'test-client-id',
        redditClientSecret: 'test-secret',
        redditUsername: 'testuser',
        redditPassword: 'testpass',
      });
    });
  });

  describe('configureTikTok', () => {
    it('should save TikTok credentials to storage', async () => {
      await configureTikTok({
        accessToken: 'test-token',
        openId: 'test-open-id',
      });

      expect(storage.updateSettings).toHaveBeenCalledWith({
        tiktokAccessToken: 'test-token',
        tiktokOpenId: 'test-open-id',
      });
    });
  });

  describe('configureEmail', () => {
    it('should save email credentials to storage', async () => {
      await configureEmail({
        apiKey: 'resend-api-key',
        fromEmail: 'hello@ferni.ai',
        fromName: 'Ferni',
      });

      expect(storage.updateSettings).toHaveBeenCalledWith({
        resendApiKey: 'resend-api-key',
        emailFromAddress: 'hello@ferni.ai',
        emailFromName: 'Ferni',
      });
    });
  });

  describe('generateTikTokInstructions', () => {
    it('should generate manual posting instructions', () => {
      const instructions = generateTikTokInstructions(
        'This is my script about morning routines',
        ['morning', 'routine', 'productivity'],
        'ferni_ai'
      );

      expect(instructions).toContain('TikTok');
      expect(instructions).toContain('@ferni_ai');
      expect(instructions).toContain('morning');
      expect(instructions).toContain('#morning');
      expect(instructions).toContain('SCRIPT');
    });

    it('should include all hashtags', () => {
      const hashtags = ['ai', 'companion', 'mentalhealth', 'selfimprovement'];
      const instructions = generateTikTokInstructions('Test script', hashtags, 'test_account');

      for (const tag of hashtags) {
        expect(instructions).toContain(`#${tag}`);
      }
    });

    it('should include the account handle', () => {
      const instructions = generateTikTokInstructions('Test', [], 'myaccount');
      expect(instructions).toContain('@myaccount');
    });

    it('should include posting steps', () => {
      const instructions = generateTikTokInstructions('Test', [], 'account');
      expect(instructions).toContain('STEPS');
      expect(instructions).toContain('TikTok app');
    });
  });

  describe('getPlatformManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getPlatformManager();
      const manager2 = getPlatformManager();

      expect(manager1).toBe(manager2);
    });

    it('should have initialization methods', () => {
      const manager = getPlatformManager();

      expect(typeof manager.initializeReddit).toBe('function');
      expect(typeof manager.initializeTikTok).toBe('function');
      expect(typeof manager.initializeEmail).toBe('function');
    });

    it('should have getter methods', () => {
      const manager = getPlatformManager();

      expect(typeof manager.getReddit).toBe('function');
      expect(typeof manager.getTikTok).toBe('function');
      expect(typeof manager.getEmail).toBe('function');
    });
  });
});
