/**
 * A failed LLM handoff rolls the app back to the persona that was on the call right
 * before it, not to the one the handoff tools' state names (a tap never updates it).
 */
import { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handoffEvents } from '../../../handoff/index.js';
import { noteCrisisVerdictPending } from '../../safety/crisis-gate-signal.js';
import { generateReply } from '../../shared/generate-reply-gateway.js';
import { runLlmHandoff, type LlmHandoffCall } from '../llm-handoff.js';

vi.mock('../../shared/generate-reply-gateway.js', () => ({
  generateReply: vi.fn(async () => ({ success: true })),
}));

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
  vi.unstubAllEnvs();
  vi.mocked(generateReply).mockClear();
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

/**
 * #2935, a fictional version of the dev red-team call: "Can I talk to Jordan for a minute?",
 * Ferni says "I'll bring in Jordan", the tool is told the handoff worked once Jordan is
 * built, then the SDK drops the swap and it times out. Ferni is still on the call.
 */
function droppedSwap() {
  const ferni = new voice.Agent({ instructions: 'You are Ferni.' });
  const session = { currentAgent: ferni };
  const stillOn = { personaId: 'ferni', session, agent: ferni };
  const parts = {
    orchestrator: { getCurrentPersonaId: () => 'ferni', getActiveAgent: () => stillOn },
    services: { sessionId: 'call-2935' },
    lock: { acquire: async () => true, release: () => undefined },
    publish: async () => undefined,
    runHandoff: vi.fn(
      async (_o: unknown, _t: string, _r: string, _s: unknown, onReady: (a: unknown) => void) => {
        onReady(new voice.Agent({ instructions: 'You are Jordan.' })); // the tool returns it
        return { success: false, error: "The handoff tool didn't swap within 8000ms" };
      }
    ),
  } as unknown as LlmHandoffCall;
  const notes = () =>
    ferni.chatCtx.items
      .filter((i) => i.type === 'message' && i.role === 'system')
      .map((i) => (i as { textContent?: string }).textContent ?? '');
  return { parts, session, notes };
}

describe('HANDOFF_FAILED_SAY_SO: a dropped handoff the tool was told worked (#2935)', () => {
  it('off: nothing reaches Ferni, as before', async () => {
    const { parts, notes } = droppedSwap();
    await runLlmHandoff(parts, { persona: { id: 'jordan-taylor' } });
    expect(notes()).toEqual([]);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("on: Ferni's chat says Jordan didn't join and he is still Ferni, and he says so once", async () => {
    vi.stubEnv('HANDOFF_FAILED_SAY_SO', 'on');
    const { parts, session, notes } = droppedSwap();
    expect(notes()).toEqual([]);

    await runLlmHandoff(parts, { persona: { id: 'jordan-taylor' } });

    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toContain("Jordan couldn't join the call. You are still Ferni");
    expect(notes()[0]).toContain('never as Jordan');
    expect(generateReply).toHaveBeenCalledTimes(1);
    const [onSession, onCall, options] = vi.mocked(generateReply).mock.calls[0] ?? [];
    expect(onSession).toBe(session);
    expect(onCall).toBe('call-2935');
    expect(options?.instructions).toContain("as Ferni: Jordan couldn't join just now");
    expect(options?.instructions).toContain("Don't make up a reason");
  });

  it('on, but the tool was never told it worked: its own error already told the model', async () => {
    vi.stubEnv('HANDOFF_FAILED_SAY_SO', 'on');
    const { parts, notes } = droppedSwap();
    vi.mocked(parts.runHandoff).mockResolvedValueOnce({
      success: false,
      error: "The next persona didn't start",
    } as never);
    await runLlmHandoff(parts, { persona: { id: 'jordan-taylor' } });
    expect(notes()).toEqual([]);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('on, while a crisis verdict holds the reply: the note is added, nothing is said', async () => {
    vi.stubEnv('HANDOFF_FAILED_SAY_SO', 'on');
    const { parts, session, notes } = droppedSwap();
    const verdict = new Promise<void>(() => {
      // still being decided
    });
    noteCrisisVerdictPending(session, verdict);
    await runLlmHandoff(parts, { persona: { id: 'jordan-taylor' } });
    expect(notes()).toHaveLength(1);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('on, with the teammate swapped in before the timeout: noted for the swap back, not said', async () => {
    vi.stubEnv('HANDOFF_FAILED_SAY_SO', 'on');
    const { parts, session, notes } = droppedSwap();
    session.currentAgent = new voice.Agent({ instructions: 'You are Jordan.' });
    await runLlmHandoff(parts, { persona: { id: 'jordan-taylor' } });
    expect(notes()).toHaveLength(1);
    expect(generateReply).not.toHaveBeenCalled();
  });
});
