/**
 * Marketplace Publisher Flow Tests
 *
 * Integration tests for the publisher portal:
 * - Tool/agent submission and validation
 * - Publisher item management
 * - Analytics retrieval
 * - Revenue share calculations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTool,
  updateTool,
  registerAgent,
  getTool,
  getAgent,
  listTools,
  listAgents,
  getExecutionHistory,
  recordExecution,
  clearRegistry,
} from '../marketplace/registry.js';
import {
  calculateRevenueShare,
  getPendingPayouts,
  clearBillingData,
} from '../marketplace/billing/index.js';
import type { ToolManifest, AgentManifest, TrustLevel } from '../marketplace/schema/types.js';

// Test fixtures
const createValidToolManifest = (overrides: Partial<ToolManifest> = {}): ToolManifest => ({
  manifestVersion: '1.0.0',
  id: `test-tool-${Date.now()}`,
  name: 'Test Tool',
  version: '1.0.0',
  publisher: {
    id: 'publisher_123',
    name: 'Test Publisher',
    website: 'https://publisher.example.com',
    verified: false,
  },
  description: {
    short: 'A test tool for validation',
    long: 'Extended description of the test tool for marketplace listing',
  },
  metadata: {
    category: 'testing',
    tags: ['test', 'validation'],
  },
  licensing: {
    type: 'free',
  },
  verification: {
    trustLevel: 'community' as TrustLevel,
    verified: false,
  },
  permissions: {
    required: [],
    optional: [],
  },
  interface: {
    llmDescription: 'This tool is used for testing the marketplace system',
    parametersSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' },
      },
    },
    examples: [
      {
        name: 'Basic Test',
        description: 'Basic usage',
        parameters: { input: 'test value' },
        expectedResponse: 'processed result',
      },
    ],
  },
  execution: {
    mode: 'platform',
    runtime: {
      type: 'http',
      endpoint: 'https://api.publisher.example.com/test-tool',
    },
    limits: {
      timeoutMs: 5000,
      networkAccess: true,
      filesystemAccess: false,
    },
    retry: {
      maxAttempts: 2,
      backoffMs: 1000,
      retryableErrors: ['TIMEOUT'],
    },
  },
  compatibility: {
    minPlatformVersion: '1.0.0',
  },
  ...overrides,
});

const createValidAgentManifest = (overrides: Partial<AgentManifest> = {}): AgentManifest => ({
  manifestVersion: '1.0.0',
  id: `test-agent-${Date.now()}`,
  name: 'Test Agent',
  displayName: 'Test Display Name',
  version: '1.0.0',
  publisher: {
    id: 'publisher_123',
    name: 'Test Publisher',
    verified: false,
  },
  description: {
    short: 'A test agent for marketplace validation',
    long: 'Extended description of the test agent for marketplace listing',
  },
  metadata: {
    category: 'testing',
    tags: ['test', 'validation'],
  },
  licensing: {
    type: 'free',
  },
  verification: {
    trustLevel: 'community' as TrustLevel,
    verified: false,
  },
  permissions: {
    required: [],
    optional: [],
  },
  persona: {
    voice: {
      provider: 'elevenlabs',
      voiceId: 'test-voice',
    },
    personality: {
      warmth: 0.7,
      humorLevel: 0.5,
      formality: 0.3,
      traits: ['helpful', 'friendly'],
    },
    cognitive: {
      profile: 'empathetic',
    },
    knowledge: {
      domains: ['testing'],
      expertise: ['test automation'],
      outOfScopeTopics: [],
    },
  },
  tools: {
    platform: [],
    marketplace: [],
  },
  behavior: {
    greetings: {
      returning: ['Welcome back!'],
      new: ['Hello, nice to meet you!'],
    },
  },
  compatibility: {
    minPlatformVersion: '1.0.0',
  },
  ...overrides,
});

describe('Marketplace Publisher Flow', () => {
  beforeEach(() => {
    clearRegistry();
    clearBillingData();
  });

  describe('Tool Submission', () => {
    it('should register a valid tool manifest', () => {
      const manifest = createValidToolManifest();
      registerTool(manifest);

      const retrieved = getTool(manifest.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe(manifest.id);
      expect(retrieved?.name).toBe(manifest.name);
      expect(retrieved?.publisher.id).toBe('publisher_123');
    });

    it('should update an existing tool', () => {
      const manifest = createValidToolManifest({ id: 'update-test-tool' });
      registerTool(manifest);

      // Update version
      const updatedManifest = { ...manifest, version: '1.1.0' };
      registerTool(updatedManifest);

      const retrieved = getTool('update-test-tool');
      expect(retrieved?.version).toBe('1.1.0');
    });

    it('should list tools by publisher', () => {
      const tool1 = createValidToolManifest({ id: 'tool-1' });
      const tool2 = createValidToolManifest({ id: 'tool-2' });
      const tool3 = createValidToolManifest({
        id: 'tool-3',
        publisher: { id: 'other_publisher', name: 'Other', verified: false },
      });

      registerTool(tool1);
      registerTool(tool2);
      registerTool(tool3);

      const allTools = listTools();
      const publisherTools = allTools.filter((t) => t.publisher.id === 'publisher_123');

      expect(allTools).toHaveLength(3);
      expect(publisherTools).toHaveLength(2);
    });
  });

  describe('Agent Submission', () => {
    it('should register a valid agent manifest', () => {
      const manifest = createValidAgentManifest();
      registerAgent(manifest);

      const retrieved = getAgent(manifest.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe(manifest.id);
      expect(retrieved?.displayName).toBe(manifest.displayName);
    });

    it('should list agents by publisher', () => {
      const agent1 = createValidAgentManifest({ id: 'agent-1' });
      const agent2 = createValidAgentManifest({
        id: 'agent-2',
        publisher: { id: 'other_publisher', name: 'Other', verified: false },
      });

      registerAgent(agent1);
      registerAgent(agent2);

      const allAgents = listAgents();
      const publisherAgents = allAgents.filter((a) => a.publisher.id === 'publisher_123');

      expect(allAgents).toHaveLength(2);
      expect(publisherAgents).toHaveLength(1);
    });
  });

  describe('Verification Status', () => {
    it('should register tool with unverified status', () => {
      const manifest = createValidToolManifest({
        verification: { trustLevel: 'unverified', verified: false },
      });
      registerTool(manifest);

      const retrieved = getTool(manifest.id);
      expect(retrieved?.verification.verified).toBe(false);
      expect(retrieved?.verification.trustLevel).toBe('unverified');
    });

    it('should upgrade trust level on verification', () => {
      const manifest = createValidToolManifest({
        id: 'verify-test',
        verification: { trustLevel: 'unverified', verified: false },
      });
      registerTool(manifest);

      // Simulate verification (in production, this would be an admin action)
      // Use updateTool to update in-place without version bump
      const result = updateTool('verify-test', {
        verification: {
          trustLevel: 'verified' as TrustLevel,
          verified: true,
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'admin-user',
        },
      });
      expect(result.success).toBe(true);

      const retrieved = getTool('verify-test');
      expect(retrieved?.verification.verified).toBe(true);
      expect(retrieved?.verification.trustLevel).toBe('verified');
    });
  });

  describe('Publisher Analytics', () => {
    it('should record and retrieve execution history', () => {
      const toolManifest = createValidToolManifest({ id: 'analytics-tool' });
      registerTool(toolManifest);

      // Record some executions - all with same userId for retrieval
      const testUserId = 'test-user-123';
      for (let i = 0; i < 5; i++) {
        const execution = {
          toolId: 'analytics-tool',
          toolVersion: '1.0.0',
          installationId: `inst-${i}`,
          userId: testUserId,
          sessionId: `session-${i}`,
          executedAt: new Date().toISOString(),
          durationMs: 100 + i * 10,
          status: i < 4 ? 'success' : 'failure',
          resources: {},
          permissionsUsed: [],
        } as Parameters<typeof recordExecution>[0];
        // Only add errorCode for failures (Firestore rejects undefined values)
        if (i === 4) {
          execution.errorCode = 'TIMEOUT';
        }
        recordExecution(execution);
      }

      // getExecutionHistory filters by userId, not publisherId
      const history = getExecutionHistory(testUserId, { toolId: 'analytics-tool' });

      expect(history).toHaveLength(5);
      expect(history.filter((e) => e.status === 'success')).toHaveLength(4);
      expect(history.filter((e) => e.status === 'failure')).toHaveLength(1);
    });

    it('should calculate analytics metrics from executions', () => {
      const toolManifest = createValidToolManifest({ id: 'metrics-tool' });
      registerTool(toolManifest);

      // Use consistent userIds so we can query by any of them
      const testUserId = 'metrics-test-user';
      const executions: Array<{
        status: 'success' | 'failure';
        durationMs: number;
        originalUserId: string; // For counting unique users in assertions
      }> = [
        { status: 'success', durationMs: 100, originalUserId: 'user-1' },
        { status: 'success', durationMs: 150, originalUserId: 'user-2' },
        { status: 'success', durationMs: 200, originalUserId: 'user-1' },
        { status: 'failure', durationMs: 50, originalUserId: 'user-3' },
      ];

      for (const exec of executions) {
        recordExecution({
          toolId: 'metrics-tool',
          toolVersion: '1.0.0',
          installationId: `inst-${Math.random()}`,
          userId: testUserId, // All use same userId for retrieval
          sessionId: `session-${Date.now()}`,
          executedAt: new Date().toISOString(),
          durationMs: exec.durationMs,
          status: exec.status,
          resources: {},
          permissionsUsed: [],
        });
      }

      // getExecutionHistory filters by userId
      const history = getExecutionHistory(testUserId, { toolId: 'metrics-tool' });

      // Calculate metrics
      const totalExecutions = history.length;
      const successfulExecutions = history.filter((e) => e.status === 'success').length;
      const totalTime = history.reduce((sum, e) => sum + e.durationMs, 0);

      expect(totalExecutions).toBe(4);
      expect(successfulExecutions).toBe(3);
      expect(totalTime).toBe(500);

      // Success rate
      const successRate = (successfulExecutions / totalExecutions) * 100;
      expect(successRate).toBe(75);

      // Average execution time
      const avgTime = totalTime / totalExecutions;
      expect(avgTime).toBe(125);
    });
  });

  describe('Revenue Share', () => {
    it('should calculate revenue share for publisher', () => {
      const share = calculateRevenueShare(
        'premium-tool',
        'publisher-123',
        '2024-01',
        5000 // $50 gross revenue
      );

      expect(share.grossRevenueCents).toBe(5000);
      expect(share.platformFeeCents).toBe(1000); // 20%
      expect(share.publisherShareCents).toBe(4000); // 80%
      expect(share.status).toBe('scheduled');
    });

    it('should aggregate pending payouts for publisher', () => {
      // Multiple tools with revenue
      calculateRevenueShare('tool-a', 'publisher-123', '2024-01', 1000);
      calculateRevenueShare('tool-b', 'publisher-123', '2024-01', 2000);
      calculateRevenueShare('tool-a', 'publisher-123', '2024-02', 1500);

      const payouts = getPendingPayouts('publisher-123');

      expect(payouts).toHaveLength(3);

      const totalPending = payouts.reduce((sum, p) => sum + p.publisherShareCents, 0);
      // (1000 + 2000 + 1500) * 0.8 = 3600
      expect(totalPending).toBe(3600);
    });

    it('should separate payouts by publisher', () => {
      calculateRevenueShare('tool-a', 'publisher-123', '2024-01', 1000);
      calculateRevenueShare('tool-b', 'publisher-456', '2024-01', 2000);

      const payouts123 = getPendingPayouts('publisher-123');
      const payouts456 = getPendingPayouts('publisher-456');

      expect(payouts123).toHaveLength(1);
      expect(payouts456).toHaveLength(1);
      expect(payouts123[0].publisherShareCents).toBe(800);
      expect(payouts456[0].publisherShareCents).toBe(1600);
    });
  });

  describe('Multi-Item Publisher', () => {
    it('should manage multiple tools and agents', () => {
      // Publisher submits multiple items
      const tool1 = createValidToolManifest({ id: 'multi-tool-1' });
      const tool2 = createValidToolManifest({ id: 'multi-tool-2' });
      const agent1 = createValidAgentManifest({ id: 'multi-agent-1' });

      registerTool(tool1);
      registerTool(tool2);
      registerAgent(agent1);

      const tools = listTools().filter((t) => t.publisher.id === 'publisher_123');
      const agents = listAgents().filter((a) => a.publisher.id === 'publisher_123');

      expect(tools).toHaveLength(2);
      expect(agents).toHaveLength(1);

      // All items should be tracked
      const allItems = [...tools, ...agents];
      expect(allItems).toHaveLength(3);
    });

    it('should track verification status across items', () => {
      const verifiedTool = createValidToolManifest({
        id: 'verified-item',
        verification: { trustLevel: 'verified', verified: true },
      });
      const pendingTool = createValidToolManifest({
        id: 'pending-item',
        verification: { trustLevel: 'unverified', verified: false },
      });

      registerTool(verifiedTool);
      registerTool(pendingTool);

      const tools = listTools().filter((t) => t.publisher.id === 'publisher_123');
      const approved = tools.filter((t) => t.verification.verified);
      const pending = tools.filter((t) => !t.verification.verified);

      expect(approved).toHaveLength(1);
      expect(pending).toHaveLength(1);
    });
  });
});
