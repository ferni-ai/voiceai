/**
 * A failed LLM handoff rolls the app back to the persona that was on the call right
 * before it, not to the one the handoff tools' state names (a tap never updates it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handoffEvents } from '../../../handoff/index.js';
import { runLlmHandoff, type LlmHandoffCall } from '../llm-handoff.js';

/** A call whose orchestrator knows who is on, and whose handoffs to `failing` fail */
function call(failing: string) {
  let current = 'ferni';
  const published: Array<Record<string, unknown>> = [];
  const orchestrator = { getCurrentPersonaId: () => current };
  const runHandoff = vi.fn(async (_o: unknown, target: string) => {
    if (target === failing) return { success: false, error: "The next persona didn't start" };
    current = target;
    return { success: true };
  });
  const parts = {
    orchestrator,
    services: { sessionId: 'call-1' },
    lock: { acquire: async () => true, release: () => undefined },
    publish: async (m: Record<string, unknown>) => {
      published.push(m);
    },
    runHandoff,
  } as unknown as LlmHandoffCall;
  const tap = (persona: string) => {
    current = persona; // a tap goes straight to the orchestrator
  };
  return { parts, published, tap, runHandoff };
}

const ofType = (published: Array<Record<string, unknown>>, type: string) =>
  published.filter((m) => m.type === type);

afterEach(() => {
  handoffEvents.removeAllListeners('handoffHandlerComplete');
});

describe('a handoff the LLM asked for that fails', () => {
  it('after Ferni, a tap to Maya and a failed handoff to Peter, rolls back to Maya', async () => {
    const { parts, published, tap } = call('peter-john');
    tap('maya-santos');

    // The tool's state never saw the tap: it still says Ferni was on
    await runLlmHandoff(parts, { persona: { id: 'peter-john' }, previousAgentId: 'ferni' });

    const [failed] = ofType(published, 'handoff_failed');
    expect(failed).toMatchObject({ target: 'peter-john', rollbackTo: 'maya-santos' });
    expect(ofType(published, 'handoff_started')[0]).toMatchObject({
      previousAgent: 'maya-santos',
    });
  });

  it("after Ferni to Maya to Peter (fails), rolls back to Maya, not the call's first persona", async () => {
    const { parts, published } = call('peter-john');
    await runLlmHandoff(parts, { persona: { id: 'maya-santos' }, previousAgentId: 'ferni' });
    expect(ofType(published, 'handoff_failed')).toHaveLength(0);

    // As the tool's state stands after an earlier failure left it behind
    await runLlmHandoff(parts, { persona: { id: 'peter-john' }, previousAgentId: 'ferni' });

    expect(ofType(published, 'handoff_failed')[0]?.rollbackTo).toBe('maya-santos');
  });

  it('tells the waiting handoff tool it failed', async () => {
    const { parts } = call('peter-john');
    const answers: Array<{ success: boolean }> = [];
    handoffEvents.on('handoffHandlerComplete', (a: { success: boolean }) => answers.push(a));

    await runLlmHandoff(parts, { persona: { id: 'peter-john' } });

    expect(answers).toEqual([expect.objectContaining({ targetId: 'peter-john', success: false })]);
  });
});
