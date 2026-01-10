/**
 * Webhooks Domain Tests
 *
 * Tests for voice-controlled automation triggers for IFTTT, Zapier,
 * Home Assistant, and custom webhooks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('../../../../services/performance-instrumentation.js', () => ({
  traceToolCall: vi.fn((name, fn) => fn()),
  traceHandoff: vi.fn((name, fn) => fn()),
  traceServiceCall: vi.fn((name, fn) => fn()),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock webhooks service with default implementations
vi.mock('../../../../services/webhooks/index.js', () => ({
  findWebhookByTrigger: vi.fn().mockResolvedValue({
    id: 'webhook-123',
    name: 'Test Webhook',
    enabled: true,
  }),
  executeWebhook: vi.fn().mockResolvedValue({ success: true }),
  listWebhooks: vi.fn().mockResolvedValue({
    success: true,
    data: { webhooks: [] },
  }),
  getWebhookStats: vi.fn().mockResolvedValue({
    totalWebhooks: 0,
    enabledWebhooks: 0,
  }),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, definitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Webhooks Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all webhook tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBe(3);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('triggerWebhook');
      expect(toolIds).toContain('listWebhooks');
      expect(toolIds).toContain('getWebhookStatus');
    });

    it('should have domain set to webhooks for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('webhooks');
      }
    });
  });

  // ============================================================================
  // TRIGGER WEBHOOK TESTS
  // ============================================================================

  describe('triggerWebhook', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'triggerWebhook');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have automation-related tags', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'triggerWebhook');
      expect(toolDef?.tags).toContain('webhook');
      expect(toolDef?.tags).toContain('automation');
    });
  });

  // ============================================================================
  // LIST WEBHOOKS TESTS
  // ============================================================================

  describe('listWebhooks', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'listWebhooks');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have list tag', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'listWebhooks');
      expect(toolDef?.tags).toContain('list');
    });
  });

  // ============================================================================
  // GET WEBHOOK STATUS TESTS
  // ============================================================================

  describe('getWebhookStatus', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWebhookStatus');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should have status tag', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getWebhookStatus');
      expect(toolDef?.tags).toContain('status');
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have webhook tag on trigger tool', () => {
      const triggerDef = toolDefinitions.find((t) => t.id === 'triggerWebhook');
      expect(triggerDef?.tags).toContain('webhook');
    });

    it('should have appropriate semantic tags', () => {
      const listDef = toolDefinitions.find((t) => t.id === 'listWebhooks');
      expect(listDef?.tags).toContain('list');

      const statusDef = toolDefinitions.find((t) => t.id === 'getWebhookStatus');
      expect(statusDef?.tags).toContain('status');
    });
  });
});
