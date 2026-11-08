/**
 * Alex's handoff briefing goes in on his first turn after a handoff in this
 * call, and only then (#3044). It compared getHandoffContext()'s null with
 * undefined, so every briefing went in as a high-priority handoff briefing,
 * and the context was module-global, so it never cleared.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stores: a fictional member with no data. Nothing here reaches Firestore.
vi.mock('../../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getUserSavingsGoals: () => [],
    getUserSpendingTriggers: () => [],
  }),
}));
vi.mock('../../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getFullUserData: () => ({ enhancedHabits: [], weeklyReflections: [] }),
  }),
}));
vi.mock('../../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => [] }),
}));
vi.mock('../../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getActiveBlockers: async () => [],
}));
vi.mock('../../../superhuman/superhuman-integration.js', () => ({
  getSuperhuman: async () => '',
}));
vi.mock('../../../../../services/superhuman/index.js', () => ({
  buildCommunicationIntelligenceContext: async () => '',
}));
vi.mock('../superhuman-context.js', () => ({
  buildAlexSuperhumanContext: async () => ({ contextString: '' }),
  processTranscriptForSuperhuman: async () => ({}),
}));

import {
  captureHandoffContext,
  clearHandoffArrivals,
} from '../../../../../tools/handoff/handoff-arrival.js';
import { buildAlexCommunicationInsightsContext } from '../index.js';

const input = (sessionId: string, turnCount: number) =>
  ({
    services: { userId: 'member-fictional-0142', sessionId, personaId: 'alex-chen' },
    userData: { turnCount },
    userText: 'can you help me write to my landlord',
  }) as never;

afterEach(() => clearHandoffArrivals());

describe('Alex handoff briefing', () => {
  it('goes in on the first turn after a handoff, and not on the next', async () => {
    captureHandoffContext({ summary: 'wants help writing to her landlord' }, 'call-1', 'alex-chen');

    const arrival = await buildAlexCommunicationInsightsContext(input('call-1', 3));
    expect(arrival.map((i) => i.source)).toContain('alex_handoff_briefing');
    expect(arrival.find((i) => i.source === 'alex_handoff_briefing')?.content).toContain(
      'wants help writing to her landlord'
    );

    const next = await buildAlexCommunicationInsightsContext(input('call-1', 4));
    expect(next).toEqual([]);
  });

  it('a handoff to Alex in another call is not a handoff in this one', async () => {
    captureHandoffContext({ summary: 'the other call' }, 'call-2', 'alex-chen');

    const mine = await buildAlexCommunicationInsightsContext(input('call-1', 3));
    expect(mine).toEqual([]);
  });
});
