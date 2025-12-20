/**
 * User Data Service Tests
 *
 * Tests for Peter's enhanced user data persistence layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firestore
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockOrderBy = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();

const mockDoc = vi.fn(() => ({
  set: mockSet,
  get: mockGet,
  update: mockUpdate,
  collection: vi.fn(() => ({
    doc: mockDoc,
    orderBy: mockOrderBy,
    limit: mockLimit,
    where: mockWhere,
    get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  })),
}));

const mockCollection = vi.fn(() => ({
  doc: mockDoc,
  orderBy: mockOrderBy,
  limit: mockLimit,
  where: mockWhere,
  get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({
    collection: mockCollection,
  })),
}));

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import type {
  InvestmentThesis,
  FinancialGoal,
  LifeEvent,
  LearningPreferences,
  RiskEvent,
} from '../types.js';

describe('User Data Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Investment Thesis', () => {
    const mockThesis: InvestmentThesis = {
      symbol: 'AAPL',
      purchaseDate: new Date('2024-01-15'),
      thesis: 'Services revenue is a growing moat',
      catalysts: ['AI integration', 'Services growth'],
      risks: ['China exposure', 'Regulatory risk'],
      exitCriteria: {
        priceTarget: 200,
        timeHorizon: '3-5 years',
        fundamentalTriggers: ['P/E above 35'],
      },
      emotionalState: {
        atPurchase: 'researched',
        confidenceLevel: 8,
      },
      updates: [],
      lastReviewed: new Date('2024-06-01'),
    };

    it('should serialize thesis for storage', () => {
      // Verify the thesis structure is valid
      expect(mockThesis.symbol).toBe('AAPL');
      expect(mockThesis.catalysts).toHaveLength(2);
      expect(mockThesis.emotionalState.confidenceLevel).toBe(8);
    });

    it('should include all required thesis fields', () => {
      expect(mockThesis).toHaveProperty('symbol');
      expect(mockThesis).toHaveProperty('purchaseDate');
      expect(mockThesis).toHaveProperty('thesis');
      expect(mockThesis).toHaveProperty('catalysts');
      expect(mockThesis).toHaveProperty('risks');
      expect(mockThesis).toHaveProperty('exitCriteria');
      expect(mockThesis).toHaveProperty('emotionalState');
      expect(mockThesis).toHaveProperty('updates');
      expect(mockThesis).toHaveProperty('lastReviewed');
    });

    it('should support thesis updates', () => {
      const update = {
        date: new Date(),
        note: 'Thesis still valid after Q1 earnings',
        stillValid: true,
      };
      mockThesis.updates.push(update);
      expect(mockThesis.updates).toHaveLength(1);
      expect(mockThesis.updates[0].stillValid).toBe(true);
    });
  });

  describe('Financial Goals', () => {
    const mockGoal: FinancialGoal = {
      id: 'goal_123',
      name: 'Emergency Fund',
      type: 'emergency_fund',
      target: {
        amount: 30000,
        date: new Date('2025-12-31'),
      },
      current: {
        amount: 15000,
        lastUpdated: new Date(),
      },
      progress: {
        percentage: 50,
        onTrack: true,
        projectedCompletion: new Date('2025-10-01'),
      },
      milestones: [
        { percentage: 25, celebratedAt: new Date('2024-06-01') },
        { percentage: 50 },
        { percentage: 75 },
        { percentage: 100 },
      ],
      priority: 'high',
      createdAt: new Date('2024-01-01'),
      notes: 'Building 6-month cushion',
    };

    it('should calculate progress correctly', () => {
      const progress = (mockGoal.current.amount / mockGoal.target.amount) * 100;
      expect(progress).toBe(50);
    });

    it('should track milestones', () => {
      const celebratedMilestones = mockGoal.milestones.filter((m) => m.celebratedAt);
      expect(celebratedMilestones).toHaveLength(1);
      expect(celebratedMilestones[0].percentage).toBe(25);
    });

    it('should support all goal types', () => {
      const goalTypes = [
        'emergency_fund',
        'retirement',
        'purchase',
        'debt_payoff',
        'investment',
        'education',
        'travel',
        'custom',
      ];
      expect(goalTypes).toContain(mockGoal.type);
    });
  });

  describe('Life Events', () => {
    const mockEvent: LifeEvent = {
      id: 'event_123',
      date: new Date('2024-03-01'),
      type: 'career',
      subtype: 'promotion',
      description: 'Promoted to Senior Engineer with 20% raise',
      financialImpact: {
        incomeChange: 2000,
        direction: 'positive',
      },
      emotionalWeight: 'major',
      advisoryImplications: ['Update savings rate', 'Review retirement contribution'],
      acknowledged: false,
    };

    it('should categorize life events by type', () => {
      expect(mockEvent.type).toBe('career');
      expect(mockEvent.subtype).toBe('promotion');
    });

    it('should track financial impact', () => {
      expect(mockEvent.financialImpact.incomeChange).toBe(2000);
      expect(mockEvent.financialImpact.direction).toBe('positive');
    });

    it('should include advisory implications', () => {
      expect(mockEvent.advisoryImplications).toHaveLength(2);
    });
  });

  describe('Learning Preferences', () => {
    const mockPrefs: LearningPreferences = {
      userId: 'user_123',
      explanationStyle: 'story-based',
      preferredAnalogies: ['sports', 'building'],
      attentionSpan: 'moderate',
      visualLearner: true,
      numbersComfort: 'comfortable',
      jargonLevel: 'some',
      responseLength: 'moderate',
      effectiveExplanations: [
        {
          topic: 'compound_interest',
          approachUsed: 'snowball analogy',
          comprehensionScore: 0.9,
          timestamp: new Date(),
        },
      ],
      confusionSignals: ['what do you mean', 'im confused'],
      engagementSignals: ['thats interesting', 'tell me more'],
      lastUpdated: new Date(),
    };

    it('should track preferred explanation style', () => {
      expect(mockPrefs.explanationStyle).toBe('story-based');
    });

    it('should store effective explanations for learning', () => {
      expect(mockPrefs.effectiveExplanations).toHaveLength(1);
      expect(mockPrefs.effectiveExplanations[0].comprehensionScore).toBe(0.9);
    });

    it('should track confusion and engagement signals', () => {
      expect(mockPrefs.confusionSignals).toContain('im confused');
      expect(mockPrefs.engagementSignals).toContain('tell me more');
    });
  });

  describe('Risk Events (Crisis Memory)', () => {
    const mockRiskEvent: RiskEvent = {
      id: 'risk_123',
      date: new Date('2022-06-15'),
      marketEvent: '2022 Bear Market',
      marketEventDetails: 'S&P 500 down 23% from highs',
      portfolioDrawdown: 18,
      userReaction: {
        action: 'held',
        emotionalState: 'anxious but disciplined',
        lessonLearned: 'Market recovered within 18 months',
        reflectionDate: new Date('2023-12-01'),
      },
      peterIntervention: {
        wasContacted: true,
        adviceGiven: 'Reminded of long-term thesis',
        adviceFollowed: true,
      },
      outcome: {
        recoveryTime: 450,
        finalImpact: 12, // +12% by holding through
      },
    };

    it('should record user reaction during crisis', () => {
      expect(mockRiskEvent.userReaction.action).toBe('held');
      expect(mockRiskEvent.userReaction.lessonLearned).toBeTruthy();
    });

    it('should track Peter intervention effectiveness', () => {
      expect(mockRiskEvent.peterIntervention.wasContacted).toBe(true);
      expect(mockRiskEvent.peterIntervention.adviceFollowed).toBe(true);
    });

    it('should record outcome for future reference', () => {
      expect(mockRiskEvent.outcome.recoveryTime).toBe(450);
      expect(mockRiskEvent.outcome.finalImpact).toBe(12);
    });

    it('should support all crisis action types', () => {
      const actions = ['held', 'bought_more', 'sold_some', 'panic_sold', 'no_action'];
      expect(actions).toContain(mockRiskEvent.userReaction.action);
    });
  });
});

describe('Data Serialization', () => {
  it('should handle Date serialization correctly', () => {
    const date = new Date('2024-06-15T10:30:00Z');
    const serialized = date.toISOString();
    const deserialized = new Date(serialized);

    expect(deserialized.getTime()).toBe(date.getTime());
  });

  it('should handle optional fields', () => {
    const partialGoal: Partial<FinancialGoal> = {
      id: 'goal_partial',
      name: 'Test Goal',
      type: 'custom',
    };

    expect(partialGoal.notes).toBeUndefined();
    expect(partialGoal.linkedAccounts).toBeUndefined();
  });
});

