/**
 * Quant Firestore Types and Schema Tests
 *
 * Tests for the Firestore type definitions and schema structure.
 *
 * Run with: pnpm vitest run src/tools/domains/research/__tests__/quant-firestore.test.ts
 */

import { describe, expect, it } from 'vitest';

import type {
  FinancialProfile,
  PortfolioHoldings,
  BehavioralTracking,
  FIRESnapshot,
  QuantInsight,
  Holding,
  BehaviorEvent,
  MonthlyMetric,
} from '../quant-firestore.js';

describe('Quant Firestore Schema', () => {
  describe('FinancialProfile', () => {
    it('should have correct structure', () => {
      const profile: FinancialProfile = {
        userId: 'test-user',
        monthlyIncome: 10000,
        monthlyExpenses: 6000,
        monthlyDebtPayments: 500,
        emergencyFundMonths: 6,
        retirementContribution: 1500,
        currentAge: 35,
        targetRetirementAge: 55,
        currentRetirementSavings: 250000,
        riskTolerance: 'moderate',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(profile.userId).toBe('test-user');
      expect(profile.monthlyIncome).toBe(10000);
      expect(profile.riskTolerance).toBe('moderate');
    });

    it('should support all risk tolerance levels', () => {
      const profiles: FinancialProfile[] = [
        { ...createBaseProfile(), riskTolerance: 'conservative' },
        { ...createBaseProfile(), riskTolerance: 'moderate' },
        { ...createBaseProfile(), riskTolerance: 'aggressive' },
      ];

      expect(profiles[0].riskTolerance).toBe('conservative');
      expect(profiles[1].riskTolerance).toBe('moderate');
      expect(profiles[2].riskTolerance).toBe('aggressive');
    });

    it('should calculate savings rate correctly', () => {
      const profile: FinancialProfile = createBaseProfile();
      const savingsRate = ((profile.monthlyIncome - profile.monthlyExpenses) / profile.monthlyIncome) * 100;

      expect(savingsRate).toBe(40); // (10000 - 6000) / 10000 = 40%
    });
  });

  describe('PortfolioHoldings', () => {
    it('should store multiple holdings', () => {
      const portfolio: PortfolioHoldings = {
        userId: 'test-user',
        holdings: [
          createHolding('AAPL', 100, 15000, 'taxable'),
          createHolding('VTI', 50, 10000, '401k'),
          createHolding('BND', 100, 10000, 'ira'),
        ],
        lastUpdated: new Date(),
      };

      expect(portfolio.holdings).toHaveLength(3);
      expect(portfolio.holdings[0].symbol).toBe('AAPL');
    });

    it('should support all account types', () => {
      const accountTypes: Holding['accountType'][] = ['taxable', 'ira', '401k', 'roth', 'other'];

      for (const accountType of accountTypes) {
        const holding = createHolding('TEST', 10, 1000, accountType);
        expect(holding.accountType).toBe(accountType);
      }
    });

    it('should calculate total cost basis', () => {
      const portfolio: PortfolioHoldings = {
        userId: 'test-user',
        holdings: [
          createHolding('AAPL', 100, 15000, 'taxable'),
          createHolding('VTI', 50, 10000, '401k'),
        ],
        lastUpdated: new Date(),
      };

      const totalCostBasis = portfolio.holdings.reduce((sum, h) => sum + h.costBasis, 0);
      expect(totalCostBasis).toBe(25000);
    });

    it('should calculate average price per share', () => {
      const holding = createHolding('AAPL', 100, 15000, 'taxable');
      const avgPrice = holding.costBasis / holding.shares;

      expect(avgPrice).toBe(150);
    });
  });

  describe('BehavioralTracking', () => {
    it('should track negative behaviors', () => {
      const tracking: BehavioralTracking = createBaseTracking();
      tracking.panicSells.push(createBehaviorEvent('Sold during crash'));
      tracking.timingAttempts.push(createBehaviorEvent('Tried to time bottom'));
      tracking.impulsePurchases.push(createBehaviorEvent('Bought meme stock'));

      expect(tracking.panicSells).toHaveLength(1);
      expect(tracking.timingAttempts).toHaveLength(1);
      expect(tracking.impulsePurchases).toHaveLength(1);
    });

    it('should track monthly metrics', () => {
      const tracking: BehavioralTracking = createBaseTracking();
      tracking.budgetAdherence.push({ month: '2024-01', value: 95 });
      tracking.budgetAdherence.push({ month: '2024-02', value: 88 });
      tracking.budgetAdherence.push({ month: '2024-03', value: 92 });

      expect(tracking.budgetAdherence).toHaveLength(3);
      expect(tracking.budgetAdherence[0].value).toBe(95);
    });

    it('should calculate average monthly metrics', () => {
      const tracking: BehavioralTracking = createBaseTracking();
      tracking.budgetAdherence = [
        { month: '2024-01', value: 90 },
        { month: '2024-02', value: 85 },
        { month: '2024-03', value: 95 },
      ];

      const avg = tracking.budgetAdherence.reduce((sum, m) => sum + m.value, 0) / tracking.budgetAdherence.length;
      expect(avg).toBe(90);
    });

    it('should store behavior scores', () => {
      const tracking: BehavioralTracking = createBaseTracking();
      tracking.currentEmotionalControlScore = 85;
      tracking.currentDisciplineScore = 90;
      tracking.currentPatienceScore = 75;

      expect(tracking.currentEmotionalControlScore).toBe(85);
      expect(tracking.currentDisciplineScore).toBe(90);
      expect(tracking.currentPatienceScore).toBe(75);
    });
  });

  describe('FIRESnapshot', () => {
    it('should track FIRE progress', () => {
      const snapshot: FIRESnapshot = {
        date: new Date(),
        netWorth: 500000,
        fireNumber: 1500000,
        percentToFire: 33.3,
        projectedFireDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
        savingsRate: 40,
        monthlyPassiveIncome: 500,
      };

      expect(snapshot.percentToFire).toBeCloseTo(33.3);
      expect(snapshot.fireNumber).toBe(1500000);
    });

    it('should calculate percent to FIRE correctly', () => {
      const netWorth = 500000;
      const fireNumber = 1500000;
      const percentToFire = (netWorth / fireNumber) * 100;

      expect(percentToFire).toBeCloseTo(33.33, 1);
    });

    it('should handle null projected date for very early savers', () => {
      const snapshot: FIRESnapshot = {
        date: new Date(),
        netWorth: 10000,
        fireNumber: 2000000,
        percentToFire: 0.5,
        projectedFireDate: null,
        savingsRate: 10,
        monthlyPassiveIncome: 0,
      };

      expect(snapshot.projectedFireDate).toBeNull();
    });
  });

  describe('QuantInsight', () => {
    it('should have correct structure', () => {
      const insight: QuantInsight = {
        id: 'insight-123',
        date: new Date(),
        type: 'portfolio',
        title: 'AAPL May Be Overvalued',
        summary: 'P/E ratio above historical average',
        details: 'Detailed analysis...',
        actionable: true,
        priority: 'high',
        symbols: ['AAPL'],
        metrics: { peRatio: 35 },
        acknowledged: false,
      };

      expect(insight.type).toBe('portfolio');
      expect(insight.priority).toBe('high');
      expect(insight.symbols).toContain('AAPL');
    });

    it('should support all insight types', () => {
      const types: QuantInsight['type'][] = ['technical', 'risk', 'behavioral', 'fire', 'portfolio', 'market'];

      for (const type of types) {
        const insight: QuantInsight = { ...createBaseInsight(), type };
        expect(insight.type).toBe(type);
      }
    });

    it('should support all priority levels', () => {
      const priorities: QuantInsight['priority'][] = ['low', 'medium', 'high'];

      for (const priority of priorities) {
        const insight: QuantInsight = { ...createBaseInsight(), priority };
        expect(insight.priority).toBe(priority);
      }
    });

    it('should track acknowledgment status', () => {
      const insight: QuantInsight = createBaseInsight();
      expect(insight.acknowledged).toBe(false);

      insight.acknowledged = true;
      expect(insight.acknowledged).toBe(true);
    });
  });

  describe('Schema Relationships', () => {
    it('should connect profile to portfolio', () => {
      const userId = 'test-user-123';
      const profile: FinancialProfile = { ...createBaseProfile(), userId };
      const portfolio: PortfolioHoldings = {
        userId,
        holdings: [createHolding('VTI', 100, 20000, '401k')],
        lastUpdated: new Date(),
      };

      expect(profile.userId).toBe(portfolio.userId);
    });

    it('should connect profile to FIRE calculations', () => {
      const profile: FinancialProfile = createBaseProfile();
      const annualExpenses = profile.monthlyExpenses * 12;
      const fireNumber = annualExpenses * 25; // 4% rule

      const snapshot: FIRESnapshot = {
        date: new Date(),
        netWorth: profile.currentRetirementSavings,
        fireNumber,
        percentToFire: (profile.currentRetirementSavings / fireNumber) * 100,
        projectedFireDate: null,
        savingsRate: ((profile.monthlyIncome - profile.monthlyExpenses) / profile.monthlyIncome) * 100,
        monthlyPassiveIncome: 0,
      };

      expect(snapshot.fireNumber).toBe(annualExpenses * 25);
    });
  });
});

// ============================================================================
// TEST HELPERS
// ============================================================================

function createBaseProfile(): FinancialProfile {
  return {
    userId: 'test-user',
    monthlyIncome: 10000,
    monthlyExpenses: 6000,
    monthlyDebtPayments: 500,
    emergencyFundMonths: 6,
    retirementContribution: 1500,
    currentAge: 35,
    targetRetirementAge: 55,
    currentRetirementSavings: 250000,
    riskTolerance: 'moderate',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createHolding(
  symbol: string,
  shares: number,
  costBasis: number,
  accountType: Holding['accountType']
): Holding {
  return {
    symbol,
    shares,
    costBasis,
    purchaseDate: new Date(),
    accountType,
  };
}

function createBaseTracking(): BehavioralTracking {
  return {
    userId: 'test-user',
    panicSells: [],
    timingAttempts: [],
    impulsePurchases: [],
    budgetAdherence: [],
    savingsConsistency: [],
    debtPaymentConsistency: [],
    currentEmotionalControlScore: 100,
    currentDisciplineScore: 100,
    currentPatienceScore: 100,
    lastCalculated: new Date(),
  };
}

function createBehaviorEvent(description: string): BehaviorEvent {
  return {
    date: new Date(),
    description,
  };
}

function createBaseInsight(): QuantInsight {
  return {
    id: 'insight-test',
    date: new Date(),
    type: 'portfolio',
    title: 'Test Insight',
    summary: 'Test summary',
    details: 'Test details',
    actionable: true,
    priority: 'medium',
    acknowledged: false,
  };
}
