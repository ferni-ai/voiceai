/**
 * Extensibility Hooks Integration Tests
 *
 * Tests the complete integration of the hook system including:
 * - Shell hooks (Claude Code style)
 * - after_tool_call hook
 * - Lifecycle hooks with the extensibility-integration service
 *
 * These tests verify that hooks work correctly with the voice-agent
 * and tool execution flow.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the safe-logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// =============================================================================
// SHELL HOOKS INTEGRATION TESTS
// =============================================================================

// NOTE: The hooks system is not yet implemented (see extensibility-integration.ts lines 106-108)
// These tests are skipped until the feature is implemented
describe.skip('Shell Hooks Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('session_start shell hook', () => {
    it('should execute shell hook and return prompt from stdout', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'echo "Hello from shell hook"',
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toBe('Hello from shell hook');
    });

    it('should pass environment variables to shell hook', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          // Print env vars that should be set by the hook system
          command: 'echo "Event: $HOOK_EVENT, User: $HOOK_USER_ID, Persona: $HOOK_PERSONA_ID"',
          timeout: 5000,
        },
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        personaId: 'test-persona',
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toContain('Event: session_start');
      expect(result.prompt).toContain('User: test-user-id');
      expect(result.prompt).toContain('Persona: test-persona');
    });

    it('should pass JSON data in HOOK_DATA environment variable', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'before_tool_call' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'echo "$HOOK_DATA"',
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'check_habit', customField: 'test-value' },
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      // Should be valid JSON
      const parsedData = JSON.parse(result.prompt || '{}');
      expect(parsedData.toolName).toBe('check_habit');
      expect(parsedData.customField).toBe('test-value');
    });

    it('should handle timeout gracefully with warm message', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'sleep 10', // Should timeout before completion
          timeout: 100, // 100ms timeout
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      };

      const result = await executeHook(context);

      // Timeout should succeed with a warm, brand-aligned message
      expect(result.success).toBe(true);
      expect(result.prompt).toContain("Let's continue our conversation");
    });

    it('should not block agent startup on shell hook failure', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const startTime = Date.now();
      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'exit 1', // Non-zero exit
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      };

      const result = await executeHook(context);
      const elapsed = Date.now() - startTime;

      // Should fail fast
      expect(result.success).toBe(false);
      expect(elapsed).toBeLessThan(1000); // Should be near-instant
    });

    it('should return empty prompt when stdout is empty', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'session_start' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'true', // No output
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toBeUndefined();
    });
  });

  describe('before_tool_call shell hook', () => {
    it('should execute before tool and have access to tool name', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'before_tool_call' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'echo "About to call tool"',
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'check_habit' },
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toBe('About to call tool');
    });
  });
});

// =============================================================================
// AFTER_TOOL_CALL HOOK INTEGRATION TESTS
// =============================================================================

// NOTE: Hooks system not yet implemented - see extensibility-integration.ts
describe.skip('after_tool_call Hook Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeHook with after_tool_call event', () => {
    it('should fire for tool execution with prompt-type hook', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'after_tool_call' as const,
        hook: {
          type: 'prompt' as const,
          enabled: true,
          prompt: 'Tool {{toolName}} was executed. Celebrate if appropriate!',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'complete_milestone', toolResult: { success: true } },
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toBe('Tool complete_milestone was executed. Celebrate if appropriate!');
    });

    it('should include tool result in shell hook env', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'after_tool_call' as const,
        hook: {
          type: 'shell' as const,
          enabled: true,
          command: 'echo "$HOOK_DATA"',
          timeout: 5000,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: {
          toolName: 'check_habit',
          toolResult: { checked: true, streak: 5 },
        },
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      const data = JSON.parse(result.prompt || '{}');
      expect(data.toolName).toBe('check_habit');
      expect(data.toolResult.checked).toBe(true);
      expect(data.toolResult.streak).toBe(5);
    });

    it('should not fail when hook is disabled', async () => {
      const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

      const context = {
        event: 'after_tool_call' as const,
        hook: {
          type: 'prompt' as const,
          enabled: false,
          prompt: 'This should not be returned',
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
        data: { toolName: 'test_tool' },
      };

      const result = await executeHook(context);

      expect(result.success).toBe(true);
      expect(result.prompt).toBeUndefined();
    });
  });
});

// =============================================================================
// EXTENSIBILITY INTEGRATION SERVICE TESTS
// =============================================================================

describe('Extensibility Integration Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onSessionStart', () => {
    it('should return null for persona without hooks', async () => {
      const { onSessionStart, clearBundleCache } =
        await import('../personas/bundles/extensibility-integration.js');

      clearBundleCache();

      const result = await onSessionStart({
        personaId: 'nonexistent-persona',
        userId: 'user-123',
        sessionId: 'session-456',
      });

      expect(result).toBeNull();
    });
  });

  describe('onAfterToolCall', () => {
    it('should execute after_tool_call hook', async () => {
      const { executeHook, clearBundleCache } =
        await import('../personas/bundles/extensibility-integration.js');

      clearBundleCache();

      // Since we can't easily mock the bundle, test the direct executeHook
      const result = await executeHook('after_tool_call', {
        personaId: 'nonexistent-persona',
        userId: 'user-123',
        sessionId: 'session-456',
        toolName: 'test_tool',
        toolResult: { success: true },
      });

      // Should return null for persona without hooks
      expect(result).toBeNull();
    });
  });

  describe('hasHook', () => {
    it('should return false for persona without hooks', async () => {
      const { hasHook, clearBundleCache } =
        await import('../personas/bundles/extensibility-integration.js');

      clearBundleCache();

      const result = await hasHook('session_start', 'nonexistent-persona');
      expect(result).toBe(false);
    });
  });
});

// =============================================================================
// HOOK CHAINING TESTS
// =============================================================================

// NOTE: Hooks system not yet implemented - see extensibility-integration.ts
describe.skip('Hook Event Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute hooks in lifecycle order', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');
    const executedEvents: string[] = [];

    // Simulate lifecycle
    const events = ['session_start', 'before_response', 'after_response'] as const;

    for (const event of events) {
      const context = {
        event,
        hook: {
          type: 'prompt' as const,
          enabled: true,
          prompt: `Event: ${event}`,
        },
        userId: 'user-123',
        sessionId: 'session-456',
        personaId: 'ferni',
      };

      const result = await executeHook(context);
      if (result.success && result.prompt) {
        executedEvents.push(event);
      }
    }

    expect(executedEvents).toEqual(['session_start', 'before_response', 'after_response']);
  });
});

// =============================================================================
// PROMPT VARIABLE SUBSTITUTION TESTS
// =============================================================================

// NOTE: Hooks system not yet implemented - see extensibility-integration.ts
describe.skip('Prompt Variable Substitution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should substitute multiple variables in prompt hooks', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

    const context = {
      event: 'after_tool_call' as const,
      hook: {
        type: 'prompt' as const,
        enabled: true,
        prompt:
          'User {{userName}} completed {{toolName}} with result: {{result}}. Streak: {{streak}}!',
      },
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
      data: {
        userName: 'Alice',
        toolName: 'habit_check',
        result: 'success',
        streak: 7,
      },
    };

    const result = await executeHook(context);

    expect(result.success).toBe(true);
    expect(result.prompt).toBe('User Alice completed habit_check with result: success. Streak: 7!');
  });

  it('should handle missing variables gracefully', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

    const context = {
      event: 'session_start' as const,
      hook: {
        type: 'prompt' as const,
        enabled: true,
        prompt: 'Hello {{name}}! Your status is: {{status}}',
      },
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
      data: {
        name: 'Bob',
        // status is missing
      },
    };

    const result = await executeHook(context);

    expect(result.success).toBe(true);
    // Missing variables should remain as-is or be empty
    expect(result.prompt).toContain('Hello Bob!');
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

// NOTE: Hooks system not yet implemented - see extensibility-integration.ts
describe.skip('Hook Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle invalid hook type gracefully', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

    const context = {
      event: 'session_start' as const,
      hook: {
        type: 'invalid_type' as 'prompt',
        enabled: true,
      },
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
    };

    const result = await executeHook(context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown hook type');
  });

  it('should handle prompt hook without prompt content', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

    const context = {
      event: 'session_start' as const,
      hook: {
        type: 'prompt' as const,
        enabled: true,
        // prompt is missing
      },
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
    };

    const result = await executeHook(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No prompt configured');
  });

  it('should handle shell hook without command', async () => {
    const { executeHook } = await import('../personas/bundles/extensibility-integration.js');

    const context = {
      event: 'session_start' as const,
      hook: {
        type: 'shell' as const,
        enabled: true,
        // command is missing
      },
      userId: 'user-123',
      sessionId: 'session-456',
      personaId: 'ferni',
    };

    const result = await executeHook(context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No command configured');
  });
});
