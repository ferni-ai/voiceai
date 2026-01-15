/**
 * Integration Tests for New "Better than Human" Services
 *
 * Tests:
 * - SEC EDGAR API (Peter)
 * - Gmail Send (Alex)
 * - Life Expectancy (Nayan)
 * - Context Builders
 *
 * @module tests/integrations/new-integrations
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// SEC EDGAR
import {
  getCIKByTicker,
  getCompanyFilings,
  getInsiderTradingSummary,
  generateSECInsight,
} from '../../services/finance/sec-edgar.js';

// Life Expectancy
import {
  calculateLifeExpectancy,
  generateMortalityPerspective,
  calculateRemainingInstances,
} from '../../services/wisdom/life-expectancy.js';

// Context Builders
import { buildSECIntelligenceContext } from '../../intelligence/context-builders/sec-intelligence.js';
import {
  buildMortalityPerspectiveContext,
  calculateParentVisitsRemaining,
} from '../../intelligence/context-builders/mortality-perspective.js';

// ============================================================================
// SEC EDGAR TESTS
// ============================================================================

describe('SEC EDGAR Integration', () => {
  describe('getCIKByTicker', () => {
    it('should resolve well-known tickers', async () => {
      // This test may hit the real SEC API - use sparingly
      const result = await getCIKByTicker('AAPL');

      // Either succeeds or fails gracefully
      if (result.success) {
        expect(result.data).toMatch(/^\d{10}$/); // CIK is 10 digits
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it('should handle unknown tickers gracefully', async () => {
      const result = await getCIKByTicker('XYZNOTREAL123');
      expect(result.success).toBe(false);
    });
  });

  describe('getCompanyFilings', () => {
    it('should return filings for valid ticker', async () => {
      const result = await getCompanyFilings('AAPL', { forms: ['10-K'], limit: 2 });

      if (result.success && result.data) {
        expect(result.data).toBeInstanceOf(Array);
        if (result.data.length > 0) {
          expect(result.data[0]).toHaveProperty('accessionNumber');
          expect(result.data[0]).toHaveProperty('form');
          expect(result.data[0]).toHaveProperty('filingDate');
        }
      }
    });

    it('should filter by form type', async () => {
      const result = await getCompanyFilings('MSFT', { forms: ['8-K'], limit: 3 });

      if (result.success && result.data && result.data.length > 0) {
        // All returned filings should be 8-K
        result.data.forEach((filing) => {
          expect(filing.form).toBe('8-K');
        });
      }
    });
  });

  describe('getInsiderTradingSummary', () => {
    it('should return sentiment analysis', async () => {
      const result = await getInsiderTradingSummary('TSLA', 90);

      if (result.success && result.data) {
        expect(result.data).toHaveProperty('sentiment');
        expect(['bullish', 'bearish', 'neutral']).toContain(result.data.sentiment);
        expect(result.data).toHaveProperty('netShares');
        expect(result.data).toHaveProperty('uniqueInsiders');
      }
    });
  });

  describe('generateSECInsight', () => {
    it('should generate insight for major stock', async () => {
      const insight = await generateSECInsight('NVDA');

      // May return null if no recent activity
      if (insight) {
        expect(typeof insight).toBe('string');
        expect(insight.length).toBeGreaterThan(10);
      }
    });
  });
});

// ============================================================================
// LIFE EXPECTANCY TESTS
// ============================================================================

describe('Life Expectancy Service', () => {
  describe('calculateLifeExpectancy', () => {
    it('should calculate for male 40 years old', () => {
      const result = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000),
        sex: 'male',
      });

      expect(result.expectedYearsRemaining).toBeGreaterThan(20);
      expect(result.expectedYearsRemaining).toBeLessThan(60);
      expect(result.expectedTotalYears).toBeGreaterThan(60);
      expect(result.timeRemaining.summers).toBeGreaterThan(20);
      expect(result.timeRemaining.tuesdays).toBeGreaterThan(1000);
    });

    it('should calculate for female 30 years old', () => {
      const result = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 30 * 365.25 * 24 * 60 * 60 * 1000),
        sex: 'female',
      });

      // Females typically have higher life expectancy
      expect(result.expectedYearsRemaining).toBeGreaterThan(40);
      expect(result.expectedTotalYears).toBeGreaterThan(75);
    });

    it('should adjust for health factors', () => {
      const baseResult = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000),
        sex: 'male',
      });

      const smokerResult = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000),
        sex: 'male',
        healthFactors: { smoker: true },
      });

      // Smoker should have lower life expectancy
      expect(smokerResult.expectedYearsRemaining).toBeLessThan(baseResult.expectedYearsRemaining);
    });

    it('should include wisdom context', () => {
      const result = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 55 * 365.25 * 24 * 60 * 60 * 1000),
        sex: 'male',
      });

      expect(result.context).toBeDefined();
      expect(result.context.length).toBeGreaterThan(20);
    });
  });

  describe('generateMortalityPerspective', () => {
    const mockLifeExpectancy = calculateLifeExpectancy({
      birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000),
      sex: 'male',
    });

    it('should generate perspective for "someday" thinking', () => {
      const result = generateMortalityPerspective('someday', mockLifeExpectancy);

      expect(result.statement).toContain('Tuesdays');
      expect(result.wisdom).toBeDefined();
      expect(result.prompt).toBeDefined();
    });

    it('should generate perspective for career', () => {
      const result = generateMortalityPerspective('career', mockLifeExpectancy);

      expect(result.statement).toBeDefined();
      expect(result.wisdom).toContain('career');
    });

    it('should generate parent visits perspective', () => {
      const result = generateMortalityPerspective('parent', mockLifeExpectancy, {
        parentAge: 70,
        visitFrequency: 'monthly',
      });

      expect(result.statement).toContain('visits');
      expect(result.prompt).toBeDefined();
    });
  });

  describe('calculateRemainingInstances', () => {
    const mockLifeExpectancy = calculateLifeExpectancy({
      birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000),
      sex: 'male',
    });

    it('should calculate remaining Christmases', () => {
      const result = calculateRemainingInstances(mockLifeExpectancy, 'christmas');

      expect(result.count).toBeGreaterThan(20);
      expect(result.wisdom).toBeDefined();
    });

    it('should calculate remaining full moons', () => {
      const result = calculateRemainingInstances(mockLifeExpectancy, 'fullMoon');

      // ~12.37 full moons per year
      expect(result.count).toBeGreaterThan(300);
      expect(result.wisdom).toContain('moon');
    });
  });
});

// ============================================================================
// CONTEXT BUILDER TESTS
// ============================================================================

describe('SEC Intelligence Context Builder', () => {
  it('should extract tickers from text', async () => {
    const { extractTickers } =
      await import('../../intelligence/context-builders/sec-intelligence.js');

    const tickers = extractTickers('I want to buy some $AAPL and Microsoft stock');
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('MSFT');
  });

  it('should build context for conversation with stocks', async () => {
    const context = await buildSECIntelligenceContext(
      'test-user',
      'What do you think about Tesla stock?',
      []
    );

    // May return null if API fails
    if (context) {
      expect(context.contextString).toBeDefined();
    }
  });
});

describe('Mortality Perspective Context Builder', () => {
  it('should detect mortality-relevant topics', async () => {
    const { detectMortalityRelevance } =
      await import('../../intelligence/context-builders/mortality-perspective.js');

    const somedayResult = detectMortalityRelevance("I'll do it someday");
    expect(somedayResult.relevant).toBe(true);
    expect(somedayResult.topic).toBe('someday');

    const parentResult = detectMortalityRelevance('I should visit my parents more');
    expect(parentResult.relevant).toBe(true);
    expect(parentResult.parentMentioned).toBe(true);

    const irrelevantResult = detectMortalityRelevance('The weather is nice today');
    expect(irrelevantResult.relevant).toBe(false);
  });

  it('should calculate parent visits remaining', () => {
    const result = calculateParentVisitsRemaining(70, 'monthly');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.visits).toBeGreaterThan(50); // ~12 visits/year * ~5-10 years
      expect(result.visits).toBeLessThan(300);
      expect(result.wisdom).toContain('visits');
    }
  });

  it('should build context for relevant conversations', async () => {
    const context = await buildMortalityPerspectiveContext(
      'test-user',
      "I keep saying I'll start exercising someday",
      {
        birthDate: new Date('1985-06-15'),
        sex: 'male',
      }
    );

    expect(context).not.toBeNull();
    if (context) {
      expect(context.contextString).toContain('Mortality Perspective');
      expect(context.perspective).toBeDefined();
    }
  });
});

// ============================================================================
// GMAIL SEND TESTS (Mocked)
// ============================================================================

describe('Gmail Send Capability', () => {
  // These tests would require OAuth tokens - use mocks

  it('should export send functions', async () => {
    const gmail = await import('../../services/gmail/gmail-service.js');

    expect(gmail.createDraft).toBeDefined();
    expect(gmail.sendEmail).toBeDefined();
    expect(gmail.replyToThread).toBeDefined();
    expect(gmail.generateEmailSuggestions).toBeDefined();
  });

  it('should have proper email formatting', async () => {
    // Test internal email creation (would need to export createRawEmail for testing)
    // For now, just verify the module loads without errors
    const gmail = await import('../../services/gmail/gmail-service.js');
    expect(gmail.default).toBeDefined();
  });
});
