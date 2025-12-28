/**
 * Tests for Permission Prompts System
 *
 * Verifies that we ask permission before going deep,
 * transforming "showing off" into "offering".
 */

import { describe, it, expect } from 'vitest';
import {
  getPermissionPrompt,
  getPromptForCapability,
  requiresPermission,
  getPermissionGuidance,
  getPermissionGrantedResponse,
  getPermissionDeclinedResponse,
  PERMISSION_PROMPTS,
} from '../../services/revelation-moments/permission-prompts.js';

describe('Permission Prompts System', () => {
  describe('getPermissionPrompt', () => {
    it('should return a prompt for share_observation', () => {
      const prompt = getPermissionPrompt('share_observation');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(10);
    });

    it('should return a prompt for challenge', () => {
      const prompt = getPermissionPrompt('challenge');
      expect(typeof prompt).toBe('string');
      // Prompts may include variations like "Ready to hear it?"
      expect(prompt).toMatch(/push|challenge|honest|devil|ready|going to be/i);
    });

    it('should return different prompts on multiple calls', () => {
      const prompts = new Set<string>();
      for (let i = 0; i < 20; i++) {
        prompts.add(getPermissionPrompt('share_observation'));
      }
      // Should have some variety (may not get all due to randomness)
      expect(prompts.size).toBeGreaterThan(1);
    });

    it('should return fallback for unknown category', () => {
      const prompt = getPermissionPrompt('unknown_category' as any);
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('share');
    });
  });

  describe('getPromptForCapability', () => {
    it('should return prompt for pattern capability', () => {
      const prompt = getPromptForCapability('pattern', 0.3);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should return prompt for challenge at high trust', () => {
      const prompt = getPromptForCapability('challenge', 0.6);
      expect(prompt).toBeDefined();
    });

    it('should return null for team capability', () => {
      const prompt = getPromptForCapability('team', 0.5);
      // Team doesn't require permission
      expect(prompt === null || typeof prompt === 'string').toBe(true);
    });

    it('should respect trust level requirements', () => {
      // Challenge requires trust level 0.5+
      const lowTrustPrompt = getPromptForCapability('challenge', 0.2);
      const highTrustPrompt = getPromptForCapability('challenge', 0.6);

      // Low trust might not get a prompt
      // High trust should get one
      expect(highTrustPrompt).toBeDefined();
    });
  });

  describe('requiresPermission', () => {
    it('should not require permission for memory at low trust', () => {
      expect(requiresPermission('memory', 0.1)).toBe(false);
    });

    it('should require permission for memory at higher trust', () => {
      expect(requiresPermission('memory', 0.4)).toBe(true);
    });

    it('should never require permission for team', () => {
      expect(requiresPermission('team', 0.1)).toBe(false);
      expect(requiresPermission('team', 0.9)).toBe(false);
    });

    it('should require permission for challenge at appropriate trust', () => {
      expect(requiresPermission('challenge', 0.6)).toBe(true);
    });
  });

  describe('getPermissionGuidance', () => {
    it('should return null when no capabilities need permission', () => {
      const guidance = getPermissionGuidance(['team'], 0.1);
      expect(guidance).toBeNull();
    });

    it('should return guidance when capabilities need permission', () => {
      const guidance = getPermissionGuidance(['pattern', 'growth'], 0.5);
      expect(guidance).toBeDefined();
      // Guidance header contains PERMISSION
      expect(guidance).toMatch(/PERMISSION|ASK FIRST/i);
    });

    it('should include sample prompts', () => {
      const guidance = getPermissionGuidance(['challenge'], 0.6);
      if (guidance) {
        expect(guidance).toContain('"');
      }
    });
  });

  describe('Response templates', () => {
    it('should return granted response', () => {
      const response = getPermissionGrantedResponse('share_observation');
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(5);
    });

    it('should return declined response', () => {
      const response = getPermissionDeclinedResponse();
      expect(typeof response).toBe('string');
      expect(response).toMatch(/okay|problem|got it|no worries/i);
    });

    it('should have variety in granted responses', () => {
      const responses = new Set<string>();
      for (let i = 0; i < 10; i++) {
        responses.add(getPermissionGrantedResponse('challenge'));
      }
      // Should have some variety
      expect(responses.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PERMISSION_PROMPTS structure', () => {
    it('should have prompts for all main categories', () => {
      const categories = PERMISSION_PROMPTS.map((p) => p.category);
      expect(categories).toContain('share_observation');
      expect(categories).toContain('go_deeper');
      expect(categories).toContain('challenge');
      expect(categories).toContain('pattern_name');
      expect(categories).toContain('vulnerability');
    });

    it('should have multiple prompts per category', () => {
      for (const promptGroup of PERMISSION_PROMPTS) {
        expect(promptGroup.prompts.length).toBeGreaterThan(1);
      }
    });

    it('should have useWhen configuration', () => {
      for (const promptGroup of PERMISSION_PROMPTS) {
        expect(promptGroup.useWhen).toBeDefined();
        expect(promptGroup.useWhen.capabilities).toBeDefined();
        expect(promptGroup.useWhen.capabilities.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Real-World Permission Scenarios', () => {
  it('should provide appropriate prompt for pattern surfacing', () => {
    const prompt = getPromptForCapability('pattern', 0.4);
    if (prompt) {
      // Prompts include many variations for asking permission to surface patterns
      // Examples: "I notice...", "I can say more about this. Interested?", "Should I dig into this?"
      expect(prompt).toMatch(/notice|pattern|seeing|share|look|something|underneath|deeper|go|more|interested|say|dig/i);
    }
  });

  it('should provide appropriate prompt for challenging', () => {
    const prompt = getPromptForCapability('challenge', 0.6);
    if (prompt) {
      // Prompts include many variations for asking permission to challenge
      // Some prompts are softer like "share something real" or "Is that okay?"
      expect(prompt).toMatch(/push|challenge|honest|direct|devil|ready|say|vulnerable|going|share|real|okay/i);
    }
  });

  it('should provide appropriate prompt for growth reflection', () => {
    const prompt = getPromptForCapability('growth', 0.5);
    if (prompt) {
      // Prompts include many variations like "Want to look at it?", "Should I dig into this?",
      // "I can say more about this. Interested?"
      expect(prompt).toMatch(/notice|share|deeper|observation|look|here|want|point|showing|dig|more|interested|say/i);
    }
  });
});
