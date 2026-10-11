/**
 * The deprecated handoff session-state helpers read the unified handoff state
 * through a bare require(), which throws ReferenceError under plain Node ESM
 * (how the agent runs). Run the real module there.
 */
import { describe, expect, it } from 'vitest';
import { runPlainEsm } from '../../../tests/helpers/plain-esm.js';

describe('handoff session-state under plain ESM', () => {
  it('answers from the unified handoff state instead of throwing', () => {
    const result = runPlainEsm(`
const s = await import('./src/agents/shared/handoff/session-state.ts');
const { getHandoffQueueState } = await import('./src/handoff/unified-state.ts');
let ticks = 0;
s.startProgressHeartbeat('esm-test', () => ticks++, 5);
await new Promise((r) => setTimeout(r, 30));
clearInterval(getHandoffQueueState('esm-test').progressInterval);
report({
  pending: s.hasPendingHandoffs('esm-test'),
  count: s.getPendingHandoffCount('esm-test'),
  summary: s.getHandoffStateSummary('esm-test'),
  persona: s.getHandoffPersonaInfo('esm-test'),
  heartbeatTicked: ticks > 0,
});
`);
    expect(result).toEqual({
      pending: false,
      count: 0,
      summary: {
        isInProgress: false,
        pendingCount: 0,
        targetPersonaId: null,
        previousPersonaId: null,
        messageSeq: 0,
      },
      persona: { targetPersonaId: null, previousPersonaId: null },
      heartbeatTicked: true,
    });
  });
});
