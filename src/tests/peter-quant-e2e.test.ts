/**
 * Peter Quant E2E Tests
 *
 * End-to-end tests for Peter's Triple Quant capabilities.
 * Tests realistic conversation flows that a user might have with Peter.
 *
 * Run with: pnpm vitest run src/tests/peter-quant-e2e.test.ts
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadBundleById } from '../personas/bundles/loader.js';
import { autoRegisterAllDomains, initializeToolRegistry, loadToolDomain } from '../tools/registry/loader.js';
import { toolRegistry } from '../tools/registry/index.js';
import type { ToolDefinition } from '../tools/registry/types.js';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Peter Quant E2E', () => {
  let peterBundle: Awaited<ReturnType<typeof loadBundleById>>;
  let researchTools: ToolDefinition[];

  beforeAll(async () => {
    // Initialize tool registry
    autoRegisterAllDomains();
    await initializeToolRegistry({ lazyLoading: false });

    // Load Peter's bundle
    peterBundle = await loadBundleById('peter-john');

    // Ensure research domain is loaded
    await loadToolDomain('research');

    // Get research domain tools
    researchTools = toolRegistry.getByDomain('research');
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Peter Bundle Validation', () => {
    it('should load Peter bundle successfully', () => {
      expect(peterBundle).toBeDefined();
      expect(peterBundle?.manifest?.identity?.id).toBe('peter-john');
    });

    it('should have Triple Quant identity', () => {
      const manifest = peterBundle?.manifest;
      expect(manifest?.llm_context?.identity_reminder).toContain('Quant');
      expect(manifest?.llm_context?.role_summary).toContain('Triple Quant');
    });

    it('should have all quant tools in tool guidance', () => {
      const toolGuidance = peterBundle?.manifest?.llm_context?.tool_guidance;

      expect(toolGuidance?.market_quant).toContain('technicalIndicators');
      expect(toolGuidance?.market_quant).toContain('riskAnalysis');
      expect(toolGuidance?.personal_finance_quant).toContain('analyzeSavingsRate');
      expect(toolGuidance?.personal_finance_quant).toContain('calculateFIRE');
      expect(toolGuidance?.personal_finance_quant).toContain('retirementReadiness');
      expect(toolGuidance?.coaching_quant).toContain('behavioralScore');
      expect(toolGuidance?.coaching_quant).toContain('peerComparison');
    });
  });

  describe('Research Domain Tools', () => {
    it('should have all 21 research tools registered', () => {
      // 15 original + 6 new persistent tools
      expect(researchTools.length).toBe(21);
    });

    it('should include all quant tools', () => {
      const toolIds = researchTools.map((t) => t.id);

      // Market Quant
      expect(toolIds).toContain('technicalIndicators');
      expect(toolIds).toContain('riskAnalysis');

      // Personal Finance Quant
      expect(toolIds).toContain('analyzeSavingsRate');
      expect(toolIds).toContain('calculateFIRE');
      expect(toolIds).toContain('retirementReadiness');

      // Coaching Quant
      expect(toolIds).toContain('behavioralScore');
      expect(toolIds).toContain('peerComparison');
    });

    it('should include legacy research tools', () => {
      const toolIds = researchTools.map((t) => t.id);

      expect(toolIds).toContain('analyzeStock');
      expect(toolIds).toContain('findStocks');
      expect(toolIds).toContain('marketData');
      expect(toolIds).toContain('marketAwareness');
      expect(toolIds).toContain('analyzePatterns');
      expect(toolIds).toContain('behavioralInsights');
      expect(toolIds).toContain('insightBriefing');
      expect(toolIds).toContain('proactiveInsights');
    });
  });

  describe('Conversation Flow: Stock Analysis Journey', () => {
    it('should support full stock analysis workflow', () => {
      const toolIds = researchTools.map((t) => t.id);

      // User asks about a stock -> analyzeStock
      expect(toolIds).toContain('analyzeStock');

      // User wants technical analysis -> technicalIndicators
      expect(toolIds).toContain('technicalIndicators');

      // User wants risk metrics -> riskAnalysis
      expect(toolIds).toContain('riskAnalysis');

      // User wants market context -> marketData, marketAwareness
      expect(toolIds).toContain('marketData');
      expect(toolIds).toContain('marketAwareness');
    });
  });

  describe('Conversation Flow: Personal Finance Journey', () => {
    it('should support full personal finance workflow', () => {
      const toolIds = researchTools.map((t) => t.id);

      // User asks about savings -> analyzeSavingsRate
      expect(toolIds).toContain('analyzeSavingsRate');

      // User wants FIRE number -> calculateFIRE
      expect(toolIds).toContain('calculateFIRE');

      // User wants retirement check -> retirementReadiness
      expect(toolIds).toContain('retirementReadiness');
    });
  });

  describe('Conversation Flow: Behavioral Coaching Journey', () => {
    it('should support full behavioral coaching workflow', () => {
      const toolIds = researchTools.map((t) => t.id);

      // User wants behavior analysis -> behavioralScore
      expect(toolIds).toContain('behavioralScore');

      // User wants peer comparison -> peerComparison
      expect(toolIds).toContain('peerComparison');

      // User wants insights -> behavioralInsights
      expect(toolIds).toContain('behavioralInsights');
    });
  });

  describe('Tool Execution: Market Quant', () => {
    it('should execute technicalIndicators tool', async () => {
      const tool = researchTools.find((t) => t.id === 'technicalIndicators');
      expect(tool).toBeDefined();

      // Mock Yahoo Finance response
      const mockPrices = Array.from({ length: 100 }, (_, i) => 150 + Math.sin(i / 10) * 10);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{ indicators: { quote: [{ close: mockPrices }] } }],
          },
        }),
      });

      const ctx = {
        userId: 'test-user',
        agentId: 'peter-john',
        agentDisplayName: 'Peter',
        services: { has: () => false, get: () => { throw new Error(); }, getOptional: () => undefined },
      };

      const toolInstance = tool!.create(ctx);
      const result = await toolInstance.execute({ symbol: 'AAPL', indicators: ['rsi'] });

      expect(result).toContain('RSI');
    });
  });

  describe('Tool Execution: Personal Finance Quant', () => {
    it('should execute analyzeSavingsRate tool', async () => {
      const tool = researchTools.find((t) => t.id === 'analyzeSavingsRate');
      expect(tool).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'peter-john',
        agentDisplayName: 'Peter',
        services: { has: () => false, get: () => { throw new Error(); }, getOptional: () => undefined },
      };

      const toolInstance = tool!.create(ctx);
      const result = await toolInstance.execute({
        monthlyIncome: 10000,
        monthlyExpenses: 6000,
      });

      expect(result).toContain('Savings Rate');
      expect(result).toContain('40%');
    });

    it('should execute calculateFIRE tool', async () => {
      const tool = researchTools.find((t) => t.id === 'calculateFIRE');
      expect(tool).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'peter-john',
        agentDisplayName: 'Peter',
        services: { has: () => false, get: () => { throw new Error(); }, getOptional: () => undefined },
      };

      const toolInstance = tool!.create(ctx);
      const result = await toolInstance.execute({
        annualExpenses: 50000,
        withdrawalRate: 4,
      });

      expect(result).toContain('FIRE Number');
      expect(result).toContain('$1,250,000'); // 50000 * 25
    });
  });

  describe('Tool Execution: Coaching Quant', () => {
    it('should execute behavioralScore tool', async () => {
      const tool = researchTools.find((t) => t.id === 'behavioralScore');
      expect(tool).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'peter-john',
        agentDisplayName: 'Peter',
        services: { has: () => false, get: () => { throw new Error(); }, getOptional: () => undefined },
      };

      const toolInstance = tool!.create(ctx);
      const result = await toolInstance.execute({
        panicSells: 0,
        timingAttempts: 1,
        impulsePurchases: 2,
        budgetAdherence: 80,
        savingsConsistency: 85,
        debtPaymentConsistency: 90,
      });

      expect(result).toContain('Financial Behavior Analysis');
      expect(result).toContain('Overall Score');
    });

    it('should execute peerComparison tool', async () => {
      const tool = researchTools.find((t) => t.id === 'peerComparison');
      expect(tool).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'peter-john',
        agentDisplayName: 'Peter',
        services: { has: () => false, get: () => { throw new Error(); }, getOptional: () => undefined },
      };

      const toolInstance = tool!.create(ctx);
      const result = await toolInstance.execute({
        ageGroup: '30s',
        savingsRate: 20,
        netWorth: 150000,
        debtToIncome: 0.3,
        emergencyFundMonths: 5,
      });

      expect(result).toContain('Peer Comparison');
      expect(result).toContain('30s');
      expect(result).toContain('percentile');
    });
  });
});

describe('Peter Manifest Validation', () => {
  let manifest: Record<string, unknown>;

  beforeAll(async () => {
    const bundle = await loadBundleById('peter-john');
    manifest = bundle?.manifest as Record<string, unknown>;
  });

  it('should have quant tools in required/optional arrays', () => {
    const tools = manifest.tools as { required: string[]; optional: string[] };

    // Check optional tools include quant tools
    expect(tools.optional).toContain('technicalIndicators');
    expect(tools.optional).toContain('riskAnalysis');
    expect(tools.optional).toContain('analyzeSavingsRate');
    expect(tools.optional).toContain('calculateFIRE');
    expect(tools.optional).toContain('retirementReadiness');
    expect(tools.optional).toContain('behavioralScore');
    expect(tools.optional).toContain('peerComparison');
  });
});

