/**
 * Marketplace Registry Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
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

import {
  registerTool,
  getTool,
  listTools,
  registerAgent,
  getAgent,
  listAgents,
  installItem,
  getInstallation,
  listInstallations,
  hasPermission,
  uninstallItem,
  recordExecution,
  getExecutionHistory,
  getListing,
  searchListings,
  clearRegistry,
} from '../registry.js';
import type { ToolManifest, AgentManifest } from '../schema/types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockToolManifest(overrides: Partial<ToolManifest> = {}): ToolManifest {
  return {
    manifestVersion: '1.0.0',
    id: 'test-tool',
    name: 'Test Tool',
    version: '1.0.0',
    publisher: {
      id: 'pub_test',
      name: 'Test Publisher',
      verified: false,
    },
    description: {
      short: 'A test tool',
      long: 'A tool for testing',
    },
    metadata: {
      category: 'test',
      tags: ['test', 'mock'],
    },
    licensing: {
      type: 'free',
    },
    verification: {
      trustLevel: 'community',
      verified: false,
    },
    permissions: {
      required: [
        {
          scope: 'external:http:read',
          reason: 'Fetches data',
          required: true,
        },
      ],
      optional: [],
    },
    execution: {
      mode: 'isolated',
      runtime: {
        type: 'http',
        endpoint: 'https://api.test.com',
      },
      limits: {
        timeoutMs: 5000,
        networkAccess: true,
        filesystemAccess: false,
      },
    },
    interface: {
      llmDescription: 'Test tool for testing',
      parametersSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
    },
    compatibility: {
      minPlatformVersion: '1.0.0',
    },
    ...overrides,
  };
}

function createMockAgentManifest(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    manifestVersion: '1.0.0',
    id: 'test-agent',
    name: 'Test Agent',
    displayName: 'Test Agent - Your Helper',
    version: '1.0.0',
    publisher: {
      id: 'pub_test',
      name: 'Test Publisher',
      verified: true,
    },
    description: {
      short: 'A test agent',
      long: 'An agent for testing',
    },
    metadata: {
      category: 'productivity',
      tags: ['test', 'helper'],
      icon: '🧪',
      colors: {
        primary: '#4a90d9',
        secondary: '#2c5282',
      },
    },
    licensing: {
      type: 'premium',
    },
    verification: {
      trustLevel: 'verified',
      verified: true,
      verifiedAt: '2025-01-01T00:00:00Z',
    },
    permissions: {
      required: [
        {
          scope: 'user:profile:read',
          reason: 'To personalize responses',
          required: true,
        },
      ],
      optional: [],
    },
    persona: {
      voice: {
        provider: 'cartesia',
        voiceId: 'voice-123',
      },
      personality: {
        warmth: 0.8,
        humorLevel: 0.4,
        formality: 0.3,
        traits: ['helpful', 'curious'],
      },
      cognitive: {
        profile: 'analytical',
      },
      knowledge: {
        domains: ['productivity'],
        expertise: ['task management'],
        outOfScopeTopics: [],
      },
    },
    tools: {
      platform: ['memory', 'calendar'],
      marketplace: [],
    },
    behavior: {
      greetings: {
        returning: ['Welcome back!'],
        new: ['Nice to meet you!'],
      },
    },
    compatibility: {
      minPlatformVersion: '1.0.0',
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Marketplace Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
  });

  describe('Tool Registry', () => {
    it('should register and retrieve a tool', () => {
      const manifest = createMockToolManifest();
      registerTool(manifest);

      const retrieved = getTool('test-tool');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Tool');
    });

    it('should list tools by category', () => {
      registerTool(createMockToolManifest({ id: 'tool1', metadata: { category: 'test', tags: [] } }));
      registerTool(createMockToolManifest({ id: 'tool2', metadata: { category: 'other', tags: [] } }));

      const testTools = listTools({ category: 'test' });
      expect(testTools).toHaveLength(1);
      expect(testTools[0].id).toBe('tool1');
    });

    it('should list tools by tags', () => {
      registerTool(createMockToolManifest({ id: 'tool1', metadata: { category: 'test', tags: ['weather'] } }));
      registerTool(createMockToolManifest({ id: 'tool2', metadata: { category: 'test', tags: ['finance'] } }));

      const weatherTools = listTools({ tags: ['weather'] });
      expect(weatherTools).toHaveLength(1);
      expect(weatherTools[0].id).toBe('tool1');
    });

    it('should not overwrite with older version', () => {
      registerTool(createMockToolManifest({ version: '2.0.0' }));
      registerTool(createMockToolManifest({ version: '1.0.0' }));

      const tool = getTool('test-tool');
      expect(tool?.version).toBe('2.0.0');
    });
  });

  describe('Agent Registry', () => {
    it('should register and retrieve an agent', () => {
      const manifest = createMockAgentManifest();
      registerAgent(manifest);

      const retrieved = getAgent('test-agent');
      expect(retrieved).toBeDefined();
      expect(retrieved?.displayName).toBe('Test Agent - Your Helper');
    });

    it('should filter agents by trust level', () => {
      registerAgent(createMockAgentManifest({ id: 'agent1', verification: { trustLevel: 'verified', verified: true } }));
      registerAgent(createMockAgentManifest({ id: 'agent2', verification: { trustLevel: 'community', verified: false } }));

      const verifiedAgents = listAgents({ trustLevel: 'verified' });
      expect(verifiedAgents).toHaveLength(1);
      expect(verifiedAgents[0].id).toBe('agent1');
    });
  });

  describe('Installation Management', () => {
    it('should install a tool for a user', async () => {
      registerTool(createMockToolManifest());

      const installation = await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      expect(installation.id).toBeDefined();
      expect(installation.itemId).toBe('test-tool');
      expect(installation.userId).toBe('user123');
      expect(installation.status).toBe('active');
    });

    it('should throw if required permissions missing', async () => {
      registerTool(createMockToolManifest());

      await expect(
        installItem({
          itemType: 'tool',
          itemId: 'test-tool',
          userId: 'user123',
          permissions: [], // Missing required permission
        })
      ).rejects.toThrow('Missing required permissions');
    });

    it('should track permission grants', async () => {
      registerTool(createMockToolManifest());

      await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      expect(hasPermission('user123', 'test-tool', 'external:http:read')).toBe(true);
      expect(hasPermission('user123', 'test-tool', 'user:profile:read')).toBe(false);
    });

    it('should list user installations', async () => {
      registerTool(createMockToolManifest({ id: 'tool1' }));
      registerTool(createMockToolManifest({ id: 'tool2' }));

      await installItem({
        itemType: 'tool',
        itemId: 'tool1',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      await installItem({
        itemType: 'tool',
        itemId: 'tool2',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      const installations = listInstallations('user123');
      expect(installations).toHaveLength(2);
    });

    it('should uninstall items', async () => {
      registerTool(createMockToolManifest());

      const installation = await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      await uninstallItem(installation.id);

      const retrieved = getInstallation('user123', 'test-tool');
      expect(retrieved).toBeUndefined(); // Active installations only
    });
  });

  describe('Execution Tracking', () => {
    it('should record executions', async () => {
      registerTool(createMockToolManifest());
      await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      const execution = recordExecution({
        toolId: 'test-tool',
        toolVersion: '1.0.0',
        installationId: 'inst_123',
        userId: 'user123',
        sessionId: 'session_456',
        executedAt: new Date().toISOString(),
        durationMs: 150,
        status: 'success',
        resources: {},
        permissionsUsed: ['external:http:read'],
      });

      expect(execution.id).toBeDefined();
      expect(execution.status).toBe('success');
    });

    it('should retrieve execution history', async () => {
      registerTool(createMockToolManifest());
      await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      recordExecution({
        toolId: 'test-tool',
        toolVersion: '1.0.0',
        installationId: 'inst_123',
        userId: 'user123',
        sessionId: 'session_1',
        executedAt: new Date().toISOString(),
        durationMs: 100,
        status: 'success',
        resources: {},
        permissionsUsed: [],
      });

      recordExecution({
        toolId: 'test-tool',
        toolVersion: '1.0.0',
        installationId: 'inst_123',
        userId: 'user123',
        sessionId: 'session_2',
        executedAt: new Date().toISOString(),
        durationMs: 200,
        status: 'failure',
        errorCode: 'TIMEOUT',
        errorMessage: 'Request timed out',
        resources: {},
        permissionsUsed: [],
      });

      const history = getExecutionHistory('user123');
      expect(history).toHaveLength(2);
    });

    it('should update installation usage on execution', async () => {
      registerTool(createMockToolManifest());
      const installation = await installItem({
        itemType: 'tool',
        itemId: 'test-tool',
        userId: 'user123',
        permissions: ['external:http:read'],
      });

      recordExecution({
        toolId: 'test-tool',
        toolVersion: '1.0.0',
        installationId: installation.id,
        userId: 'user123',
        sessionId: 'session_1',
        executedAt: new Date().toISOString(),
        durationMs: 150,
        status: 'success',
        resources: {},
        permissionsUsed: [],
      });

      const updated = getInstallation('user123', 'test-tool');
      expect(updated?.usage.totalExecutions).toBe(1);
      expect(updated?.usage.totalExecutionTimeMs).toBe(150);
    });
  });

  describe('Marketplace Listings', () => {
    it('should generate listing from tool manifest', () => {
      registerTool(createMockToolManifest());

      const listing = getListing('test-tool');
      expect(listing).toBeDefined();
      expect(listing?.type).toBe('tool');
      expect(listing?.name).toBe('Test Tool');
      expect(listing?.trustLevel).toBe('community');
    });

    it('should search listings by query', () => {
      registerTool(createMockToolManifest({ id: 'weather-tool', name: 'Weather Tool', description: { short: 'Get weather', long: '' } }));
      registerTool(createMockToolManifest({ id: 'finance-tool', name: 'Finance Tool', description: { short: 'Track money', long: '' } }));

      const results = searchListings('weather');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('weather-tool');
    });

    it('should filter listings by type', () => {
      registerTool(createMockToolManifest());
      registerAgent(createMockAgentManifest());

      const toolListings = searchListings('', { type: 'tool' });
      expect(toolListings).toHaveLength(1);
      expect(toolListings[0].type).toBe('tool');

      const agentListings = searchListings('', { type: 'agent' });
      expect(agentListings).toHaveLength(1);
      expect(agentListings[0].type).toBe('agent');
    });
  });
});
