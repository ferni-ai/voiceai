/**
 * Peter's handoff briefing stays off until PERSONA_BRIEFING_PETER_HANDOFF is on
 * (#3066 round 1). It never ran in prod before #3066 made the arrival signal per
 * call, and for a member with no data it is a "(Real Data)" dashboard of
 * defaults (Decision Quality Index: 50/100), so it must not start running
 * unflagged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// A fictional member with no data in any store. Nothing here reaches Firestore.
vi.mock('../../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getMainBudget: () => undefined,
    getActiveSavingsGoals: () => [],
    getUserSavingsGoals: () => [],
    getRecentSpendingTriggers: () => [],
    getUserSpendingTriggers: () => [],
  }),
}));
vi.mock('../../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getFullUserData: () => ({ enhancedHabits: [] }),
  }),
}));
vi.mock('../../../../../services/engagement/gamification-store.js', () => ({
  getGamificationStore: () => ({ getMoodLogs: async () => [] }),
}));
vi.mock('../../../../../memory/orchestrator.js', () => ({
  getMemoryOrchestrator: () => ({ getMemoryHealth: async () => ({ totalMemories: 0 }) }),
}));
vi.mock('../../../../../tools/domains/ceo-coaching/storage.js', () => ({
  getPendingDecisions: async () => [],
}));
vi.mock('../../../superhuman/superhuman-integration.js', () => ({ getSuperhuman: async () => '' }));
vi.mock('../../../../../services/superhuman/index.js', () => ({
  buildCausalInferenceContext: async () => '',
  buildFinancialPatternContext: async () => '',
}));
vi.mock('../../../../../services/cross-persona/observation-recorder.js', () => ({
  peter: { concern: vi.fn(), pattern: vi.fn(), insight: vi.fn() },
}));

import {
  captureHandoffContext,
  clearHandoffArrivals,
} from '../../../../../tools/handoff/handoff-arrival.js';
import { buildPeterResearchInsightsContext } from '../index.js';

const arrivalTurn = () =>
  buildPeterResearchInsightsContext({
    services: { userId: 'member-fictional-0511', sessionId: 'call-1', personaId: 'peter-john' },
    userData: { turnCount: 5 },
  } as never);

afterEach(() => {
  clearHandoffArrivals();
  vi.unstubAllEnvs();
});

describe('Peter handoff briefing behind PERSONA_BRIEFING_PETER_HANDOFF', () => {
  it('flag off: a handoff to Peter injects no handoff briefing, as on main', async () => {
    captureHandoffContext({ summary: 'wants research on index funds' }, 'call-1', 'peter-john');

    const out = await arrivalTurn();
    expect(out.map((i) => i.source)).not.toContain('peter_handoff_briefing');
    expect(out).toEqual([]); // turn 5, no handoff: Peter's builder has nothing to add
  });

  it('flag on: the same arrival turn gets the handoff briefing (the path the flag holds back)', async () => {
    vi.stubEnv('PERSONA_BRIEFING_PETER_HANDOFF', 'on');
    captureHandoffContext({ summary: 'wants research on index funds' }, 'call-1', 'peter-john');

    const out = await arrivalTurn();
    expect(out.map((i) => i.source)).toContain('peter_handoff_briefing');
  });
});
