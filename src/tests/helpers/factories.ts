import type {
  UserProfile,
  ConversationSummary,
  FinancialGoal,
  KeyMoment,
} from '../../types/user-profile.js';
import { createUserProfile } from '../../types/user-profile.js';

export function createTestProfile(overrides?: Partial<UserProfile>): UserProfile {
  const testId = 'test-user-' + Math.random().toString(36).substring(7);
  const base = createUserProfile(testId, 'Test User');

  return {
    ...base,
    ...overrides,
  };
}

export function createTestSummary(overrides?: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: 'summary-' + Math.random().toString(36).substring(7),
    sessionId: 'session-' + Math.random().toString(36).substring(7),
    timestamp: new Date(),
    duration: 600,
    turnCount: 10,
    mainTopics: ['test'],
    keyPoints: ['test point'],
    emotionalArc: 'neutral',
    ...overrides,
  };
}

export function createTestGoal(overrides?: Partial<FinancialGoal>): FinancialGoal {
  const now = new Date();

  return {
    id: 'goal-' + Math.random().toString(36).substring(7),
    name: 'Test Goal',
    type: 'retirement',
    targetAmount: 100000,
    currentProgress: 0,
    progressPercent: 0,
    status: 'active',
    priority: 'medium',
    timeHorizon: 'long',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createTestMoment(overrides?: Partial<KeyMoment>): KeyMoment {
  return {
    id: 'moment-' + Math.random().toString(36).substring(7),
    timestamp: new Date(),
    type: 'milestone',
    summary: 'Test moment',
    emotionalWeight: 'light',
    topics: ['test'],
    ...overrides,
  };
}
