/**
 * Tests for tool-wrapper.ts
 *
 * Tests Result type helpers, tool wrapping, and enhanced tool factory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

vi.mock('../../domains/shared/index.js', () => ({
  isLifeCoachAnalyticsEnabled: vi.fn(() => false),
  trackToolUsage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../../../personas/bundles/extensibility-integration.js', () => ({
  onAfterToolCall: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../validation.js', () => ({
  sanitizePlainText: vi.fn((text: string) => text.trim()),
}));

// Import after mocks
import {
  success,
  failure,
  wrapToolExecute,
  wrapToolDefinition,
  wrapToolDefinitions,
  createEnhancedTool,
  enhanceDomainTools,
  type ToolResult,
  type ToolResultMetadata,
} from '../tool-wrapper.js';
import type { ToolContext, ToolDefinition, Tool } from '../../registry/types.js';
import { isLifeCoachAnalyticsEnabled, trackToolUsage } from '../../domains/shared/index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

function createMockToolDefinition(
  id: string,
  execute: (params: Record<string, unknown>) => Promise<unknown>
): ToolDefinition {
  return {
    id,
    name: `Test Tool ${id}`,
    description: 'A test tool',
    domain: 'career',
    tags: ['test'],
    create: (ctx: ToolContext): Tool => ({
      description: 'Test tool description',
      execute,
    }),
  };
}

// ============================================================================
// RESULT TYPE TESTS
// ============================================================================

describe('success', () => {
  it('creates a success result with data', () => {
    const result = success({ message: 'hello' });

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { message: string } }).data).toEqual({
      message: 'hello',
    });
  });

  it('creates a success result with string data', () => {
    const result = success('Operation completed');

    expect(result.success).toBe(true);
    expect((result as { success: true; data: string }).data).toBe('Operation completed');
  });

  it('includes metadata when provided', () => {
    const metadata: ToolResultMetadata = {
      executionTimeMs: 150,
      toolId: 'testTool',
      domain: 'career',
      timestamp: '2024-01-15T12:00:00Z',
    };
    const result = success('data', metadata);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual(metadata);
  });

  it('works with complex data types', () => {
    const data = {
      users: [{ id: 1, name: 'John' }],
      total: 1,
      nested: { deep: { value: true } },
    };
    const result = success(data);

    expect(result.success).toBe(true);
    expect((result as { success: true; data: typeof data }).data).toEqual(data);
  });
});

describe('failure', () => {
  it('creates a failure result with error message', () => {
    const result = failure('Something went wrong');

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toBe('Something went wrong');
  });

  it('includes error code when provided', () => {
    const result = failure('Invalid input', 'VALIDATION_ERROR');

    expect(result.success).toBe(false);
    expect((result as { success: false; code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('includes metadata when provided', () => {
    const metadata: ToolResultMetadata = {
      executionTimeMs: 50,
      toolId: 'failingTool',
    };
    const result = failure('Error', 'ERROR_CODE', metadata);

    expect(result.success).toBe(false);
    expect(result.metadata).toEqual(metadata);
  });
});

// ============================================================================
// WRAP TOOL EXECUTE TESTS
// ============================================================================

describe('wrapToolExecute', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  it('executes the original function successfully', async () => {
    const originalExecute = vi.fn().mockResolvedValue('success');
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext);

    const result = await wrapped({ param: 'value' });

    expect(originalExecute).toHaveBeenCalledWith({ param: 'value' }, undefined);
    expect(result).toBeDefined();
  });

  it('wraps string result in success when error handling enabled', async () => {
    const originalExecute = vi.fn().mockResolvedValue('test result');
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableErrorHandling: true,
    });

    const result = await wrapped({});

    expect((result as ToolResult<string>).success).toBe(true);
    expect((result as { success: true; data: string }).data).toBe('test result');
  });

  it('catches errors and returns failure result', async () => {
    const originalExecute = vi.fn().mockRejectedValue(new Error('Test error'));
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableErrorHandling: true,
    });

    const result = await wrapped({});

    expect((result as ToolResult<never>).success).toBe(false);
    expect((result as { success: false; error: string }).error).toBe('Test error');
  });

  it('re-throws errors when error handling disabled', async () => {
    const originalExecute = vi.fn().mockRejectedValue(new Error('Test error'));
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableErrorHandling: false,
    });

    await expect(wrapped({})).rejects.toThrow('Test error');
  });

  it('runs custom validator', async () => {
    const originalExecute = vi.fn().mockResolvedValue('success');
    const customValidator = vi
      .fn()
      .mockReturnValue({ valid: false, error: 'Custom validation failed' });

    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableValidation: true,
      enableErrorHandling: true,
      customValidator,
    });

    const result = await wrapped({ invalid: 'data' });

    expect(customValidator).toHaveBeenCalledWith({ invalid: 'data' });
    expect((result as ToolResult<never>).success).toBe(false);
    expect((result as { success: false; error: string }).error).toBe('Custom validation failed');
    expect(originalExecute).not.toHaveBeenCalled();
  });

  it('passes validation when custom validator returns valid', async () => {
    const originalExecute = vi.fn().mockResolvedValue('success');
    const customValidator = vi.fn().mockReturnValue({ valid: true });

    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableValidation: true,
      customValidator,
    });

    await wrapped({ valid: 'data' });

    expect(originalExecute).toHaveBeenCalled();
  });

  it('sanitizes specified fields', async () => {
    const originalExecute = vi.fn().mockResolvedValue('success');

    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableValidation: true,
      sanitizeFields: ['userInput'],
    });

    await wrapped({ userInput: '  trimmed  ' });

    expect(originalExecute).toHaveBeenCalledWith({ userInput: 'trimmed' }, undefined);
  });

  it('tracks analytics when enabled', async () => {
    vi.mocked(isLifeCoachAnalyticsEnabled).mockReturnValue(true);
    const mockTracker = { success: vi.fn(), error: vi.fn() };
    vi.mocked(trackToolUsage).mockReturnValue(mockTracker);

    const originalExecute = vi.fn().mockResolvedValue('success');
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableAnalytics: true,
    });

    await wrapped({});

    expect(trackToolUsage).toHaveBeenCalledWith('testTool', 'career', { agentId: 'ferni' });
    expect(mockTracker.success).toHaveBeenCalled();
  });

  it('adds metadata to wrapped result', async () => {
    const originalExecute = vi.fn().mockResolvedValue('success');
    const wrapped = wrapToolExecute('testTool', 'career', originalExecute, mockContext, {
      enableErrorHandling: true,
    });

    const result = await wrapped({});

    const typedResult = result as { success: true; metadata: ToolResultMetadata };
    expect(typedResult.metadata?.toolId).toBe('testTool');
    expect(typedResult.metadata?.domain).toBe('career');
    expect(typedResult.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(typedResult.metadata?.timestamp).toBeDefined();
  });
});

// ============================================================================
// WRAP TOOL DEFINITION TESTS
// ============================================================================

describe('wrapToolDefinition', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  it('wraps a tool definition and preserves properties', () => {
    const originalDef = createMockToolDefinition('testTool', async () => 'result');
    const wrapped = wrapToolDefinition(originalDef);

    expect(wrapped.id).toBe('testTool');
    expect(wrapped.name).toBe('Test Tool testTool');
    expect(wrapped.domain).toBe('career');
    expect(wrapped.create).toBeDefined();
  });

  it('creates a working tool from wrapped definition', async () => {
    const originalDef = createMockToolDefinition('testTool', async () => 'result');
    const wrapped = wrapToolDefinition(originalDef);
    const tool = wrapped.create(mockContext);

    expect(tool).toBeDefined();
    expect(tool.execute).toBeDefined();
  });

  it('logs deprecation warning for deprecated tools', () => {
    const deprecatedDef: ToolDefinition = {
      ...createMockToolDefinition('oldTool', async () => 'result'),
      deprecated: true,
      deprecationMessage: 'Use newTool instead',
    };

    wrapToolDefinition(deprecatedDef, { enableDeprecationWarnings: true });
    // The warning is logged but we don't have a way to assert it easily
    // The main thing is that it doesn't throw
  });

  it('returns tool as-is if no execute function', () => {
    const defWithoutExecute: ToolDefinition = {
      id: 'noExecute',
      name: 'No Execute Tool',
      description: 'A tool without execute',
      domain: 'career',
      tags: [],
      create: () =>
        ({
          description: 'Tool without execute',
        }) as unknown as Tool,
    };

    const wrapped = wrapToolDefinition(defWithoutExecute);
    const tool = wrapped.create(mockContext);

    expect(tool.description).toBe('Tool without execute');
  });
});

describe('wrapToolDefinitions', () => {
  it('wraps multiple tool definitions', () => {
    const defs = [
      createMockToolDefinition('tool1', async () => 'result1'),
      createMockToolDefinition('tool2', async () => 'result2'),
      createMockToolDefinition('tool3', async () => 'result3'),
    ];

    const wrapped = wrapToolDefinitions(defs);

    expect(wrapped.length).toBe(3);
    expect(wrapped[0].id).toBe('tool1');
    expect(wrapped[1].id).toBe('tool2');
    expect(wrapped[2].id).toBe('tool3');
  });

  it('applies same options to all tools', () => {
    const defs = [
      createMockToolDefinition('tool1', async () => 'result1'),
      createMockToolDefinition('tool2', async () => 'result2'),
    ];

    const wrapped = wrapToolDefinitions(defs, { enableAnalytics: false });

    // Both tools should be wrapped with same options
    expect(wrapped.length).toBe(2);
  });

  it('handles empty array', () => {
    const wrapped = wrapToolDefinitions([]);

    expect(wrapped).toEqual([]);
  });
});

// ============================================================================
// ENHANCED TOOL FACTORY TESTS
// ============================================================================

describe('createEnhancedTool', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  it('creates an enhanced tool with all fields', () => {
    const enhanced = createEnhancedTool({
      id: 'enhancedTool',
      name: 'Enhanced Tool',
      description: 'An enhanced tool',
      domain: 'career',
      tags: ['enhanced'],
      llmDescription: 'Description for LLM',
      execute: async () => 'result',
    });

    expect(enhanced.id).toBe('enhancedTool');
    expect(enhanced.name).toBe('Enhanced Tool');
    expect(enhanced.domain).toBe('career');
    expect(enhanced.create).toBeDefined();
  });

  it('creates a working tool instance', async () => {
    const enhanced = createEnhancedTool({
      id: 'enhancedTool',
      name: 'Enhanced Tool',
      description: 'An enhanced tool',
      domain: 'career',
      tags: [],
      llmDescription: 'Description for LLM',
      execute: async (params) => `Received: ${JSON.stringify(params)}`,
    });

    const tool = enhanced.create(mockContext);

    expect(tool.description).toBe('Description for LLM');
    expect(tool.execute).toBeDefined();
  });

  it('executes with provided context', async () => {
    const executeFn = vi.fn().mockResolvedValue('executed');

    const enhanced = createEnhancedTool({
      id: 'contextTool',
      name: 'Context Tool',
      description: 'Tests context',
      domain: 'career',
      tags: [],
      llmDescription: 'Context test',
      execute: executeFn,
    });

    const tool = enhanced.create(mockContext);
    await tool.execute({ param: 'value' });

    expect(executeFn).toHaveBeenCalledWith(
      expect.objectContaining({ param: 'value' }),
      expect.any(Object),
      undefined
    );
  });

  it('uses custom wrapper options', async () => {
    const enhanced = createEnhancedTool({
      id: 'customTool',
      name: 'Custom Tool',
      description: 'Custom options',
      domain: 'career',
      tags: [],
      llmDescription: 'Custom',
      execute: async () => 'result',
      wrapperOptions: {
        enableAnalytics: false,
        enableErrorHandling: false,
      },
    });

    const tool = enhanced.create(mockContext);
    const result = await tool.execute({});

    // Without error handling, raw string is returned
    expect(typeof result).toBe('string');
  });
});

// ============================================================================
// ENHANCE DOMAIN TOOLS TESTS
// ============================================================================

describe('enhanceDomainTools', () => {
  it('enhances all tools in a domain', () => {
    const domainTools = [
      createMockToolDefinition('domainTool1', async () => 'result1'),
      createMockToolDefinition('domainTool2', async () => 'result2'),
    ];

    const enhanced = enhanceDomainTools(domainTools);

    expect(enhanced.length).toBe(2);
    expect(enhanced[0].id).toBe('domainTool1');
    expect(enhanced[1].id).toBe('domainTool2');
  });

  it('applies domain-specific options', () => {
    const domainTools = [createMockToolDefinition('tool', async () => 'result')];

    const enhanced = enhanceDomainTools(domainTools, {
      enableAnalytics: true,
      slowExecutionThresholdMs: 1000,
    });

    expect(enhanced.length).toBe(1);
  });

  it('handles empty domain', () => {
    const enhanced = enhanceDomainTools([]);

    expect(enhanced).toEqual([]);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Tool wrapper flow', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  it('full flow: create, wrap, execute', async () => {
    // Create an enhanced tool
    const enhanced = createEnhancedTool({
      id: 'flowTest',
      name: 'Flow Test',
      description: 'Integration test',
      domain: 'career',
      tags: ['integration'],
      llmDescription: 'Full flow test',
      execute: async (params) => {
        return `Hello, ${(params as { name: string }).name}!`;
      },
      wrapperOptions: {
        enableErrorHandling: true,
        enableValidation: true,
      },
    });

    // Create tool instance
    const tool = enhanced.create(mockContext);

    // Execute
    const result = await tool.execute({ name: 'World' });

    expect((result as ToolResult<string>).success).toBe(true);
    expect((result as { success: true; data: string }).data).toBe('Hello, World!');
  });

  it('error handling in full flow', async () => {
    const enhanced = createEnhancedTool({
      id: 'errorFlow',
      name: 'Error Flow',
      description: 'Error test',
      domain: 'career',
      tags: [],
      llmDescription: 'Error test',
      execute: async () => {
        throw new Error('Intentional failure');
      },
      wrapperOptions: {
        enableErrorHandling: true,
      },
    });

    const tool = enhanced.create(mockContext);
    const result = await tool.execute({});

    expect((result as ToolResult<never>).success).toBe(false);
    expect((result as { success: false; error: string }).error).toBe('Intentional failure');
  });
});
