/**
 * A teammate's briefing builder reads; it never writes (#3044). Alex's
 * recorded a communication debt with contact "Unknown" whenever the caller's
 * words looked like one, and all four recorded team observations built from
 * defaults (Nayan: "Current life chapter: unknown" for everyone).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => ({
  observe: vi.fn(),
  recordDebt: vi.fn(async () => undefined),
}));

vi.mock('../../../../services/cross-persona/observation-recorder.js', () => {
  const observer = {
    concern: writes.observe,
    pattern: writes.observe,
    opportunity: writes.observe,
    milestone: writes.observe,
    insight: writes.observe,
  };
  return {
    maya: observer,
    alex: observer,
    jordan: observer,
    nayan: observer,
    peter: observer,
    ferni: observer,
    recordConcern: writes.observe,
    recordPersonaObservation: writes.observe,
  };
});

vi.mock('../../../../tools/domains/communication/superhuman-tools/index.js', () => ({
  buildSuperhumanCommunicationContext: async () => '',
  buildQuickCommunicationContext: async () => '',
  communicationArchaeology: {
    detectMention: () => ({ detected: false }),
    recordEvent: writes.observe,
  },
  relationshipTemperature: { getNeedingAttention: async () => [], update: writes.observe },
  unsaidWordsDetector: {
    get: async () => [],
    detect: () => ({ wasDeflected: false }),
    track: writes.observe,
    endSession: async () => undefined,
  },
  communicationDebt: {
    getPending: async () => [],
    detect: () => [{ type: 'call', description: 'call Dana back', contactName: undefined }],
    record: writes.recordDebt,
  },
  strategicSilence: { getReadyMessages: () => [] },
  unspokenNeeds: { detect: () => null },
}));

// A fictional member with no data in any store.
vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getUserSavingsGoals: () => [],
    getActiveSavingsGoals: () => [],
    getUserSpendingTriggers: () => [],
    getRecentSpendingTriggers: () => [],
    getMainBudget: () => undefined,
  }),
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getFullUserData: () => ({}),
  }),
}));
vi.mock('../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => [] }),
}));
vi.mock('../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getActiveBlockers: async () => [],
  getRecentWins: async () => [],
}));
vi.mock('../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));

import { buildAlexCommunicationInsightsContext } from '../alex-communication-insights/index.js';
import { buildJordanMilestoneInsightsContext } from '../jordan-milestone-insights/index.js';
import { buildMayaCoachingInsightsContext } from '../maya-coaching-insights/index.js';
import { buildNayanWisdomInsightsContext } from '../nayan-wisdom-insights/index.js';

const input = (personaId: string) =>
  ({
    services: { userId: 'member-fictional-0177', sessionId: `call-${personaId}`, personaId },
    userData: { turnCount: 0 },
    userText: 'I need to call Dana back about the lease',
  }) as never;

beforeEach(() => vi.clearAllMocks());

describe('teammate briefing builders write nothing', () => {
  it.each([
    ['alex-chen', buildAlexCommunicationInsightsContext],
    ['maya-santos', buildMayaCoachingInsightsContext],
    ['jordan-taylor', buildJordanMilestoneInsightsContext],
    ['nayan-patel', buildNayanWisdomInsightsContext],
  ])('%s', async (personaId, build) => {
    await build(input(personaId));
    // The fire-and-forget writes ran synchronously up to their first await; let them settle.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(writes.observe).not.toHaveBeenCalled();
    expect(writes.recordDebt).not.toHaveBeenCalled();
  });
});
