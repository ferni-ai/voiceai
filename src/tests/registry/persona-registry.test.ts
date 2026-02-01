/**
 * Unit Tests for PersonaRegistry
 *
 * Tests the OCP-compliant PersonaRegistry for runtime persona registration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPersonaRegistry,
  resetPersonaRegistry,
} from '../../personas/registry/persona-registry-impl.js';
import type {
  PersonaDefinition,
  IPersonaRegistry,
} from '../../personas/registry/persona-registry-interface.js';

// Mock the AgentRegistry (underlying bundle discovery)
vi.mock('../../personas/registry/unified-registry.js', () => ({
  AgentRegistry: {
    hasAgent: vi.fn().mockResolvedValue(false),
    getAgentOrNull: vi.fn().mockResolvedValue(null),
    getAllAgents: vi.fn().mockResolvedValue([]),
    getCoordinator: vi.fn().mockResolvedValue({
      id: 'ferni',
      name: 'Ferni',
      description: 'Life coach',
      voiceId: 'test-voice',
      voiceProvider: 'cartesia',
      role: 'coach',
      isCoordinator: true,
      canHandoff: true,
      handoffTargets: [],
      handoffTriggers: [],
      aliases: ['coach'],
      enabled: true,
      handoffToolName: 'handoffToFerni',
      manifest: { role: { domains: ['life'] } },
      ui: { initials: 'FE', subtitle: 'Coach' },
    }),
    resolveAgentId: vi.fn().mockResolvedValue(null),
  },
}));

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

describe('PersonaRegistry', () => {
  let registry: IPersonaRegistry;

  const testPersona: PersonaDefinition = {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'A test agent for unit tests',
    voice: {
      voiceId: 'test-voice-123',
      provider: 'cartesia',
    },
    role: 'team',
    aliases: ['tester', 'test'],
  };

  beforeEach(async () => {
    await resetPersonaRegistry();
    registry = getPersonaRegistry();
  });

  describe('register()', () => {
    it('should register a new persona successfully', async () => {
      const result = await registry.register(testPersona);

      expect(result.success).toBe(true);
      expect(result.personaId).toBe('test-agent');
      expect(result.message).toContain('registered');
    });

    it('should reject invalid persona definitions', async () => {
      const invalid = { ...testPersona, id: '' };
      const result = await registry.register(invalid);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Validation failed');
    });

    it('should reject persona with invalid ID format', async () => {
      const invalid = { ...testPersona, id: '123-starts-with-number' };
      const result = await registry.register(invalid);

      expect(result.success).toBe(false);
      expect(result.message).toContain('must start with a letter');
    });

    it('should reject duplicate registration without overwrite flag', async () => {
      await registry.register(testPersona);
      const result = await registry.register(testPersona);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already registered');
    });

    it('should allow overwrite with flag', async () => {
      await registry.register(testPersona);
      const updated = { ...testPersona, description: 'Updated description' };
      const result = await registry.register(updated, { overwrite: true });

      expect(result.success).toBe(true);
      expect(result.replaced).toBe(true);
    });

    it('should normalize persona ID to lowercase', async () => {
      const upper = { ...testPersona, id: 'TEST-AGENT' };
      const result = await registry.register(upper);

      expect(result.success).toBe(true);
      expect(result.personaId).toBe('test-agent');
    });
  });

  describe('get()', () => {
    it('should return registered persona by ID', async () => {
      await registry.register(testPersona);
      const persona = await registry.get('test-agent');

      expect(persona).not.toBeNull();
      expect(persona?.name).toBe('Test Agent');
      expect(persona?.source).toBe('runtime');
    });

    it('should return persona by alias', async () => {
      await registry.register(testPersona);
      const persona = await registry.get('tester');

      expect(persona).not.toBeNull();
      expect(persona?.id).toBe('test-agent');
    });

    it('should return null for unknown persona', async () => {
      const persona = await registry.get('unknown');
      expect(persona).toBeNull();
    });

    it('should be case-insensitive', async () => {
      await registry.register(testPersona);
      const persona = await registry.get('TEST-AGENT');

      expect(persona).not.toBeNull();
      expect(persona?.id).toBe('test-agent');
    });
  });

  describe('has()', () => {
    it('should return true for registered persona', async () => {
      await registry.register(testPersona);
      const exists = await registry.has('test-agent');
      expect(exists).toBe(true);
    });

    it('should return false for unknown persona', async () => {
      const exists = await registry.has('unknown');
      expect(exists).toBe(false);
    });

    it('should check aliases', async () => {
      await registry.register(testPersona);
      const exists = await registry.has('tester');
      expect(exists).toBe(true);
    });
  });

  describe('unregister()', () => {
    it('should remove a registered persona', async () => {
      await registry.register(testPersona);
      const removed = await registry.unregister('test-agent');

      expect(removed).toBe(true);
      expect(await registry.has('test-agent')).toBe(false);
    });

    it('should return false for unknown persona', async () => {
      const removed = await registry.unregister('unknown');
      expect(removed).toBe(false);
    });

    it('should also remove aliases', async () => {
      await registry.register(testPersona);
      await registry.unregister('test-agent');

      expect(await registry.has('tester')).toBe(false);
    });
  });

  describe('getAll()', () => {
    it('should return all registered personas', async () => {
      await registry.register(testPersona);
      await registry.register({
        ...testPersona,
        id: 'another-agent',
        name: 'Another Agent',
        aliases: [],
      });

      const all = await registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by role', async () => {
      await registry.register(testPersona);
      await registry.register({
        ...testPersona,
        id: 'standalone-agent',
        name: 'Standalone',
        role: 'standalone',
        aliases: [],
      });

      const teamOnly = await registry.getAll({ role: 'team' });
      expect(teamOnly.every((p) => p.role === 'team')).toBe(true);
    });

    it('should filter by source', async () => {
      await registry.register(testPersona);

      const runtimeOnly = await registry.getAll({ source: 'runtime' });
      expect(runtimeOnly.every((p) => p.source === 'runtime')).toBe(true);
    });
  });

  describe('registerBatch()', () => {
    it('should register multiple personas', async () => {
      const personas = [
        testPersona,
        { ...testPersona, id: 'agent-two', name: 'Agent Two', aliases: [] },
        { ...testPersona, id: 'agent-three', name: 'Agent Three', aliases: [] },
      ];

      const results = await registry.registerBatch(personas);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should report individual failures', async () => {
      const personas = [
        testPersona,
        { ...testPersona, id: '', name: 'Invalid' }, // Invalid ID
      ];

      const results = await registry.registerBatch(personas);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return accurate statistics', async () => {
      await registry.register(testPersona);
      await registry.register(
        {
          ...testPersona,
          id: 'plugin-agent',
          name: 'Plugin Agent',
          aliases: [],
        },
        { source: 'plugin' }
      );

      const stats = await registry.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.fromRuntime).toBeGreaterThanOrEqual(1);
      expect(stats.fromPlugins).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clearRuntime()', () => {
    it('should remove all runtime personas', async () => {
      await registry.register(testPersona);
      await registry.register({
        ...testPersona,
        id: 'another',
        name: 'Another',
        aliases: [],
      });

      const count = await registry.clearRuntime();

      expect(count).toBe(2);
      expect(await registry.has('test-agent')).toBe(false);
      expect(await registry.has('another')).toBe(false);
    });
  });

  describe('getOrDefault()', () => {
    it('should return coordinator for unknown persona', async () => {
      const persona = await registry.getOrDefault('unknown');

      expect(persona).not.toBeNull();
      expect(persona.id).toBe('ferni');
      expect(persona.isCoordinator).toBe(true);
    });

    it('should return requested persona if exists', async () => {
      await registry.register(testPersona);
      const persona = await registry.getOrDefault('test-agent');

      expect(persona.id).toBe('test-agent');
    });
  });

  describe('resolveId()', () => {
    it('should resolve alias to canonical ID', async () => {
      await registry.register(testPersona);
      const id = await registry.resolveId('tester');

      expect(id).toBe('test-agent');
    });

    it('should return null for unknown', async () => {
      const id = await registry.resolveId('unknown');
      expect(id).toBeNull();
    });
  });

  describe('isSamePersona()', () => {
    it('should return true for same persona via different aliases', async () => {
      await registry.register(testPersona);
      const same = await registry.isSamePersona('test-agent', 'tester');

      expect(same).toBe(true);
    });

    it('should return false for different personas', async () => {
      await registry.register(testPersona);
      await registry.register({
        ...testPersona,
        id: 'other-agent',
        name: 'Other',
        aliases: ['other'],
      });

      const same = await registry.isSamePersona('test-agent', 'other-agent');
      expect(same).toBe(false);
    });
  });

  describe('getVoiceId() and getVoiceProvider()', () => {
    it('should return voice configuration', async () => {
      await registry.register(testPersona);

      const voiceId = await registry.getVoiceId('test-agent');
      const provider = await registry.getVoiceProvider('test-agent');

      expect(voiceId).toBe('test-voice-123');
      expect(provider).toBe('cartesia');
    });
  });
});
