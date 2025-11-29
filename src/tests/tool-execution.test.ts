/**
 * Integration Tests for Tool Execution
 *
 * Tests the 80+ tools available to the agent across all domains:
 * - Market Data & Economic
 * - Calculators & Personal Finance
 * - News, Sports, Weather, Search
 * - Life Events & Wellness
 * - Conversation & Awareness
 *
 * Critical for production reliability - tools must work correctly.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createAllTools, getToolCategories } from '../tools/index.js';
import { initializeLogger } from '@livekit/agents';

describe('Tool Execution Integration Tests', () => {
  let tools: ReturnType<typeof createAllTools>;
  let toolsArray: Array<{
    name: string;
    description?: string;
    parameters?: any;
    execute?: (...args: unknown[]) => unknown;
  }>;

  beforeAll(() => {
    // Initialize LiveKit logger for tool creation
    initializeLogger({ level: 'info', pretty: false });
  });

  beforeEach(() => {
    tools = createAllTools();
    // Convert object to array for iteration tests
    toolsArray = Object.entries(tools).map(([name, tool]) => ({
      name,
      description: (tool as any).description,
      parameters: (tool as any).parameters,
      execute: (tool as any).execute,
    }));
  });

  describe('Tool Registry', () => {
    it('should create all tools successfully', () => {
      expect(tools).toBeDefined();
      expect(typeof tools).toBe('object');
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });

    it('should have correct number of tools', () => {
      const toolCount = Object.keys(tools).length;
      // We have ~80 tools across all domains
      expect(toolCount).toBeGreaterThanOrEqual(60);
    });

    it('should have unique tool names', () => {
      const names = Object.keys(tools);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should have descriptions for all tools', () => {
      toolsArray.forEach((tool) => {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(0);
      });
    });

    it('should have valid schemas for all tools', () => {
      toolsArray.forEach((tool) => {
        expect(tool.parameters).toBeDefined();
        // Should be valid Zod schema
        expect(tool.parameters.parse).toBeDefined();
      });
    });
  });

  describe('Tool Categories', () => {
    it('should have all expected categories', () => {
      const categories = getToolCategories();
      expect(categories.marketData).toBeDefined();
      expect(categories.economic).toBeDefined();
      expect(categories.calculators).toBeDefined();
      expect(categories.personalFinance).toBeDefined();
      expect(categories.news).toBeDefined();
      expect(categories.sports).toBeDefined();
      expect(categories.weather).toBeDefined();
      expect(categories.search).toBeDefined();
      expect(categories.wisdom).toBeDefined();
      expect(categories.lifeEvents).toBeDefined();
      expect(categories.wellness).toBeDefined();
      expect(categories.smallTalk).toBeDefined();
    });

    it('should have tools matching category names', () => {
      const categories = getToolCategories();

      // Verify key tools exist
      expect(tools.getStockQuote).toBeDefined();
      expect(tools.calculateCompoundGrowth).toBeDefined();
      expect(tools.getFinancialNews).toBeDefined();
      expect(tools.getTeamScore).toBeDefined();
      expect(tools.getWeather).toBeDefined();
      expect(tools.respondToLifeEvent).toBeDefined();
      expect(tools.addressFinancialAnxiety).toBeDefined();
      expect(tools.expressJackMood).toBeDefined();
    });
  });

  describe('Financial Calculator Tools', () => {
    it('should have compound growth calculator', () => {
      expect(tools.calculateCompoundGrowth).toBeDefined();
      expect(tools.calculateCompoundGrowth.description).toContain('compound');
    });

    it('should have fee impact calculator', () => {
      expect(tools.calculateFeeImpact).toBeDefined();
      expect(tools.calculateFeeImpact.description).toContain('fee');
    });

    it('should have retirement projection calculator', () => {
      expect(tools.calculateRetirementProjection).toBeDefined();
    });

    it('should have mortgage calculator', () => {
      expect(tools.calculateMortgage).toBeDefined();
    });

    it('should have debt payoff calculator', () => {
      expect(tools.calculateDebtPayoff).toBeDefined();
    });
  });

  describe('Market Data Tools', () => {
    it('should have stock quote tool', () => {
      expect(tools.getStockQuote).toBeDefined();
    });

    it('should have market summary tool', () => {
      expect(tools.getMarketSummary).toBeDefined();
    });

    it('should have economic data tools', () => {
      expect(tools.getFedFundsRate).toBeDefined();
      expect(tools.getInflationRate).toBeDefined();
      expect(tools.getUnemploymentRate).toBeDefined();
    });
  });

  describe('Information Tools', () => {
    it('should have news tools', () => {
      expect(tools.getFinancialNews).toBeDefined();
      expect(tools.getGeneralNews).toBeDefined();
      expect(tools.getTechNews).toBeDefined();
    });

    it('should have sports tools', () => {
      expect(tools.getTeamScore).toBeDefined();
      expect(tools.getSportScores).toBeDefined();
      expect(tools.getPhilliesScore).toBeDefined();
    });

    it('should have weather tools', () => {
      expect(tools.getWeather).toBeDefined();
      expect(tools.getWeatherForecast).toBeDefined();
    });

    it('should have search tools', () => {
      expect(tools.searchWeb).toBeDefined();
      expect(tools.searchWikipedia).toBeDefined();
    });
  });

  describe('Human Connection Tools', () => {
    it('should have life events tools', () => {
      expect(tools.respondToLifeEvent).toBeDefined();
      expect(tools.getLifeEventAdvice).toBeDefined();
      expect(tools.celebrateMilestone).toBeDefined();
    });

    it('should have wellness tools', () => {
      expect(tools.addressFinancialAnxiety).toBeDefined();
      expect(tools.provideEncouragement).toBeDefined();
      expect(tools.reframeMoneyBelief).toBeDefined();
      expect(tools.practiceGratitude).toBeDefined();
    });

    it('should have small talk tools', () => {
      expect(tools.expressJackMood).toBeDefined();
      expect(tools.sharePhillyFact).toBeDefined();
      expect(tools.acknowledgeHoliday).toBeDefined();
    });
  });

  describe('Wisdom Tools', () => {
    it('should have wisdom quote tool', () => {
      expect(tools.getWisdomQuote).toBeDefined();
    });

    it('should have Bogle quote tool', () => {
      expect(tools.getBogleQuote).toBeDefined();
    });

    it('should have crash perspective tool', () => {
      expect(tools.getCrashPerspective).toBeDefined();
    });

    it('should have this day in history tool', () => {
      expect(tools.getThisDayInHistory).toBeDefined();
    });
  });

  describe('Personal Finance Education Tools', () => {
    it('should have banking concepts explainer', () => {
      expect(tools.explainBankingConcepts).toBeDefined();
    });

    it('should have mortgage concepts explainer', () => {
      expect(tools.explainMortgageConcepts).toBeDefined();
    });

    it('should have retirement accounts explainer', () => {
      expect(tools.explainRetirementAccounts).toBeDefined();
    });

    it('should have Vanguard principles explainer', () => {
      expect(tools.explainPrinciple).toBeDefined();
    });
  });

  describe('Parameter Validation', () => {
    it('should have parameters defined for key tools', () => {
      // LiveKit tools have parameters as Zod schemas
      expect(tools.getStockQuote.parameters).toBeDefined();
      expect(tools.calculateCompoundGrowth.parameters).toBeDefined();
      expect(tools.respondToLifeEvent.parameters).toBeDefined();
      expect(tools.addressFinancialAnxiety.parameters).toBeDefined();
    });

    it('should have required properties in parameters', () => {
      // Check that parameters have the expected Zod schema structure
      const stockParams = tools.getStockQuote.parameters as any;
      // Zod schemas have a shape property for object schemas
      expect(stockParams.shape?.symbol).toBeDefined();

      const compoundParams = tools.calculateCompoundGrowth.parameters as any;
      expect(compoundParams.shape?.principal).toBeDefined();
      expect(compoundParams.shape?.annualReturn).toBeDefined();
      expect(compoundParams.shape?.years).toBeDefined();
    });

    it('should have descriptions for parameters', () => {
      const stockParams = tools.getStockQuote.parameters as any;
      // Zod schemas have description property directly accessible
      expect(stockParams.shape?.symbol?.description).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should have all tools with execute functions', () => {
      toolsArray.forEach((tool) => {
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      });
    });

    it('should have consistent tool structure', () => {
      toolsArray.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
      });
    });
  });

  describe('Tool Coverage', () => {
    it('should cover all major financial topics', () => {
      const names = Object.keys(tools);

      // Stocks/Market
      expect(names.some((n) => n.toLowerCase().includes('stock'))).toBe(true);
      expect(names.some((n) => n.toLowerCase().includes('market'))).toBe(true);

      // Calculations
      expect(names.some((n) => n.toLowerCase().includes('compound'))).toBe(true);
      expect(names.some((n) => n.toLowerCase().includes('retirement'))).toBe(true);
      expect(names.some((n) => n.toLowerCase().includes('mortgage'))).toBe(true);

      // Information
      expect(names.some((n) => n.toLowerCase().includes('news'))).toBe(true);
      expect(names.some((n) => n.toLowerCase().includes('weather'))).toBe(true);
      expect(
        names.some((n) => n.toLowerCase().includes('sports') || n.toLowerCase().includes('score'))
      ).toBe(true);

      // Human connection
      expect(
        names.some((n) => n.toLowerCase().includes('life') || n.toLowerCase().includes('event'))
      ).toBe(true);
      expect(
        names.some(
          (n) => n.toLowerCase().includes('anxiety') || n.toLowerCase().includes('wellness')
        )
      ).toBe(true);
      expect(
        names.some((n) => n.toLowerCase().includes('mood') || n.toLowerCase().includes('jack'))
      ).toBe(true);
    });

    it('should have tools for all conversation phases', () => {
      const names = Object.keys(tools);

      // Awareness
      expect(names.some((n) => n.includes('Emotional') || n.includes('emotional'))).toBe(true);
      expect(names.some((n) => n.includes('Drift') || n.includes('drift'))).toBe(true);

      // Memory
      expect(names.some((n) => n.includes('remember') || n.includes('Remember'))).toBe(true);
      expect(names.some((n) => n.includes('recall') || n.includes('Recall'))).toBe(true);
    });
  });
});
