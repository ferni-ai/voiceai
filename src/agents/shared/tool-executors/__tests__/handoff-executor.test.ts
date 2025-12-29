/**
 * Handoff Executor Tests
 *
 * Tests for persona handoff routing, alias resolution, and target extraction.
 *
 * @module agents/shared/tool-executors/__tests__/handoff-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handoffExecutor } from '../handoff-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock the handoff executor from tools/handoff
vi.mock('../../../../tools/handoff/executor.js', () => ({
  executeHandoff: vi.fn().mockResolvedValue({
    success: true,
    greeting: 'Hi there! Maya here, ready to help with your habits.',
  }),
}));

describe('HandoffExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(handoffExecutor.domain).toBe('handoff');
    });

    it('should handle all persona-specific handoff tools', () => {
      const personas = ['maya', 'alex', 'peter', 'jordan', 'nayan', 'ferni'];
      const prefixes = ['handoffto', 'transferto', 'switchto'];

      for (const persona of personas) {
        for (const prefix of prefixes) {
          expect(handoffExecutor.handles).toContain(`${prefix}${persona}`);
        }
      }
    });

    it('should handle generic handoff tools', () => {
      const genericTools = [
        'handoffto',
        'transferto',
        'handoff',
        'transfer',
        'switchto',
        'connectto',
      ];

      for (const tool of genericTools) {
        expect(handoffExecutor.handles).toContain(tool);
      }
    });
  });

  describe('target extraction from tool name', () => {
    it('should extract Maya from handoffToMaya', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffToMaya', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'maya',
      });
    });

    it('should extract Alex from transferToAlex', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('transferToAlex', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'alex',
      });
    });

    it('should extract Peter from switchToPeter', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('switchToPeter', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'peter',
      });
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await handoffExecutor.execute('HANDOFFTOMAYA', {}, ctx);
      const result2 = await handoffExecutor.execute('HandoffToMaya', {}, ctx);
      const result3 = await handoffExecutor.execute('handofftomaya', {}, ctx);

      expect(result1).toMatchObject({ target: 'maya' });
      expect(result2).toMatchObject({ target: 'maya' });
      expect(result3).toMatchObject({ target: 'maya' });
    });
  });

  describe('target extraction from args', () => {
    it('should use target arg for generic handoff', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffTo', { target: 'jordan' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'jordan',
      });
    });

    it('should use persona arg', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('transfer', { persona: 'nayan' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'nayan',
      });
    });

    it('should use to arg', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoff', { to: 'alex' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'alex',
      });
    });

    it('should default to ferni when no target specified', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoff', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'ferni',
      });
    });
  });

  describe('persona alias resolution', () => {
    it('should resolve maya-santos to maya', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffTo', { target: 'maya-santos' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'maya',
      });
    });

    it('should resolve alex-chen to alex', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('transferTo', { target: 'alex-chen' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'alex',
      });
    });

    it('should resolve peter-lynch to peter', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffTo', { target: 'peter-lynch' }, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'peter',
      });
    });
  });

  describe('reason handling', () => {
    it('should pass reason to executor', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute(
        'handoffToMaya',
        { reason: 'User wants help with habits' },
        ctx
      );

      expect(result).toMatchObject({
        success: true,
        reason: 'User wants help with habits',
      });
    });

    it('should use default reason when not provided', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffToMaya', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        reason: 'User requested handoff',
      });
    });
  });

  describe('onHandoff callback', () => {
    it('should use onHandoff callback when provided', async () => {
      const onHandoff = vi.fn().mockResolvedValue(undefined);
      const ctx = createContext({ onHandoff });

      const result = await handoffExecutor.execute(
        'handoffToMaya',
        { reason: 'Test handoff' },
        ctx
      );

      expect(onHandoff).toHaveBeenCalledWith('maya', 'Test handoff');
      expect(result).toMatchObject({
        success: true,
        target: 'maya',
        action: 'handoff',
      });
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('playMusic', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for other domain tools', async () => {
      const ctx = createContext();

      const otherTools = ['addTask', 'getWeather', 'rememberAboutUser'];

      for (const tool of otherTools) {
        const result = await handoffExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });

  describe('error handling', () => {
    it('should handle executor failure gracefully', async () => {
      // Re-mock to simulate failure
      const { executeHandoff } = await import('../../../../tools/handoff/executor.js');
      (executeHandoff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Connection timeout',
      });

      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffToMaya', {}, ctx);

      expect(result).toMatchObject({
        success: false,
        target: 'maya',
        error: 'Connection timeout',
      });
    });
  });

  describe('handoff result structure', () => {
    it('should return proper handoff result with greeting', async () => {
      const ctx = createContext();
      const result = await handoffExecutor.execute('handoffToMaya', {}, ctx);

      expect(result).toMatchObject({
        success: true,
        target: 'maya',
        action: 'handoff',
        handoffComplete: true,
      });

      // Should include greeting from the mock
      expect((result as { greeting?: string }).greeting).toContain('Maya');
    });
  });
});
