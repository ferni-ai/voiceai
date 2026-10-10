/**
 * Single-session handoffs: a handoff swaps the persona's Agent inside the call's one
 * session. Before, every handoff closed the session from inside its own handoff tool call,
 * the close never finished, and the next persona's session couldn't start: no voice
 * handoff succeeded on a live call (dev, 2026-10-10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';
import { swapPersona } from '../persona-swap.js';

type FakeAgent = { name: string; heard?: unknown; updateChatCtx: (ctx: unknown) => Promise<void> };

const agentFor = (name: string): FakeAgent => {
  const agent: FakeAgent = {
    name,
    updateChatCtx: async (ctx) => {
      agent.heard = ctx;
    },
  };
  return agent;
};

/**
 * As @livekit/agents 1.5.1 AgentSession.updateAgent: no task unless the session is
 * running, and each transition waits for the one before it.
 */
function callSession(transition: (agent: FakeAgent) => Promise<void> = async () => undefined) {
  const session = {
    running: true,
    live: undefined as FakeAgent | undefined,
    swappedTo: [] as string[],
    closes: 0,
    updateActivityTask: undefined as { result: Promise<void> } | undefined,
    get currentAgent() {
      return { chatCtx: { copy: () => ({ talk: 'so far' }) } };
    },
    updateAgent(agent: FakeAgent) {
      if (!session.running) return;
      session.swappedTo.push(agent.name);
      const previous = session.updateActivityTask?.result.catch(() => undefined);
      session.updateActivityTask = {
        result: (async () => {
          await previous;
          await transition(agent);
          session.live = agent;
        })(),
      };
    },
    close: async () => {
      session.closes += 1;
      session.running = false;
    },
  };
  return session;
}

type Session = ReturnType<typeof callSession>;
let instances = 0;

function persona(
  session: Session,
  personaId: string,
  userData: { personaId?: string },
  ownsSession: boolean
) {
  const record = {
    id: `${personaId}-${(instances += 1)}`, // unique per instance, as the factory's are
    callSession: undefined as unknown,
    personaId,
    isActive: false,
    session,
    userData,
    agent: agentFor(personaId),
    ownsSession,
    released: false,
    release: async () => {
      record.released = true;
    },
    cleanup: async () => {
      record.released = true;
      if (ownsSession) await session.close();
    },
    say: vi.fn(),
    setMuted: vi.fn(),
    interrupt: vi.fn(),
  };
  return record;
}

function orchestrator(session: Session, failToBuild: string[] = []) {
  const userData: { personaId?: string } = {};
  const made: Array<ReturnType<typeof persona>> = [];
  const createPersonaAgent = vi.fn(
    async (personaId: string, context: { callSession?: unknown }) => {
      if (failToBuild.includes(personaId)) throw new Error(`${personaId} failed to build`);
      // setupPersonaAgent sets the voice only for the call's first persona
      if (!context.callSession) userData.personaId = personaId;
      const p = persona(session, personaId, userData, !context.callSession);
      p.callSession = context.callSession;
      if (!context.callSession) session.live = p.agent; // the first persona starts the session
      made.push(p);
      return p as never;
    }
  );
  const o = createAgentOrchestrator({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: 'swap-test',
    createPersonaAgent,
  });
  return { o, made, userData };
}

beforeEach(() => {
  // Speech timing isn't what this is about
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['MULTI_AGENT_SINGLE_SESSION'];
});

describe('a handoff with one session per call', () => {
  beforeEach(() => {
    process.env['MULTI_AGENT_SINGLE_SESSION'] = 'on';
  });

  it("swaps Maya into the call's session, in her voice, with the talk so far", async () => {
    const session = callSession();
    const { o, made, userData } = orchestrator(session);
    await o.start('ferni');

    const result = await o.handoff({ targetPersonaId: 'maya-santos', reason: 'test' });

    expect(result.success).toBe(true);
    expect(o.getCurrentPersonaId()).toBe('maya-santos');
    expect(session.live?.name).toBe('maya-santos');
    expect(userData.personaId).toBe('maya-santos');
    expect(made[1].callSession).toBe(session);
    expect(made[1].agent.heard).toEqual({ talk: 'so far' });
    expect(session.closes).toBe(0);
    expect(made[0].released).toBe(true); // Ferni's own listeners go; the session stays
  });

  it('a failed build leaves Ferni on, in his own voice', async () => {
    const session = callSession();
    const { o, userData } = orchestrator(session, ['maya-santos']);
    await o.start('ferni');

    const result = await o.handoff({ targetPersonaId: 'maya-santos', reason: 'test' });

    expect(result.success).toBe(false);
    expect(o.getCurrentPersonaId()).toBe('ferni');
    expect(userData.personaId).toBe('ferni');
    expect(session.swappedTo).toEqual([]);
    expect(session.closes).toBe(0);
  });

  it('three handoffs keep one session, and the call end closes it once', async () => {
    const session = callSession();
    const { o } = orchestrator(session);
    await o.start('ferni');
    for (const target of ['maya-santos', 'peter-john', 'ferni']) {
      expect((await o.handoff({ targetPersonaId: target, reason: 'test' })).success).toBe(true);
    }
    expect(o.getCurrentPersonaId()).toBe('ferni');
    expect(session.closes).toBe(0);

    await o.shutdown();
    expect(session.closes).toBe(1); // the first persona owns the session
  });
});

describe('when the next persona does not come up', () => {
  const userData: { personaId?: string } = {};
  const setup = (transition: (agent: FakeAgent) => Promise<void>) => {
    const session = callSession(transition);
    userData.personaId = 'ferni';
    const ferni = persona(session, 'ferni', userData, true);
    const maya = persona(session, 'maya-santos', userData, false);
    session.live = ferni.agent;
    const forgotten: string[] = [];
    const swap = swapPersona(ferni as never, maya, (p) => forgotten.push(p.personaId), 20);
    return { session, ferni, maya, forgotten, swap };
  };

  it('Ferni is swapped back, in his own voice, after the failed start', async () => {
    const { session, maya, forgotten, swap } = setup(async (agent) => {
      if (agent.name === 'maya-santos') throw new Error('Maya failed to start');
    });
    await expect(swap).rejects.toThrow('Maya failed to start');
    await vi.waitFor(() => expect(session.live?.name).toBe('ferni'));
    await vi.waitFor(() => expect(userData.personaId).toBe('ferni'));
    expect(maya.released).toBe(true);
    expect(forgotten).toEqual(['maya-santos']);
  });

  it('a swap that is still going when time runs out is swapped back after it finishes', async () => {
    const { session, maya, swap } = setup(async (agent) => {
      if (agent.name === 'maya-santos')
        await new Promise((r) => {
          setTimeout(r, 60);
        }); // slow, not stuck
    });
    await expect(swap).rejects.toThrow(/didn't start within 20ms/);
    expect(userData.personaId).toBe('maya-santos'); // Maya is still coming up: her voice for now

    await vi.waitFor(() => expect(session.swappedTo).toEqual(['maya-santos', 'ferni']));
    await vi.waitFor(() => expect(session.live?.name).toBe('ferni'));
    await vi.waitFor(() => expect(userData.personaId).toBe('ferni'));
    expect(maya.released).toBe(true);
  });

  it('with the call over, nothing is swapped and nobody is let go', async () => {
    const session = callSession();
    session.updateActivityTask = { result: Promise.resolve() }; // an earlier handoff's, finished
    session.running = false;
    const data = { personaId: 'ferni' };
    const ferni = persona(session, 'ferni', data, true);
    const forgotten: string[] = [];
    await expect(
      swapPersona(ferni as never, persona(session, 'maya-santos', data, false), (p) =>
        forgotten.push(p.personaId)
      )
    ).rejects.toThrow(/no running session/);
    expect(data.personaId).toBe('ferni');
    expect(forgotten).toEqual([]);
    expect(ferni.released).toBe(false);
  });
});

describe('with the flag off', () => {
  it('a handoff still closes the old session and starts a new one, as before', async () => {
    const session = callSession();
    const { o, made } = orchestrator(session);
    await o.start('ferni');

    await o.handoff({ targetPersonaId: 'maya-santos', reason: 'test' });

    expect(session.closes).toBe(1);
    expect(made[1].callSession).toBeUndefined();
    expect(session.swappedTo).toEqual([]);
  });
});
