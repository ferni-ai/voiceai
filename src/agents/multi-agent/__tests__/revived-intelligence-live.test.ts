/**
 * Revived intelligence on the live per-turn path: createTurnIntelligenceHook
 * loads it when the call starts, the real turn handler adds it to the turn's
 * injections (inject-context.ts), and the pusher puts it in the note the next
 * reply reads. Only the turn processor is stubbed, to fix the turn's other
 * injections.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevivedStore } from '../../../intelligence/revived/revived-intelligence.js';

const processed = vi.hoisted(() => ({
  injections: [] as Array<{ category: string; content: string; priority: number }>,
}));
vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async () => ({
    analysis: {
      analysis: { emotion: { primary: 'neutral', intensity: 0.2 } },
      currentTopic: 'life',
    },
    context: { injections: processed.injections.map((i) => ({ ...i })) },
    emotional: { primary: 'neutral', intensity: 0.2 },
    response: {},
    identity: {},
  })),
}));

const { createTurnContextPusher, createTurnIntelligenceHook } =
  await import('../turn-intelligence.js');
type Deps = Parameters<typeof createTurnIntelligenceHook>[0];

const NOW = Date.now();
const LAST_CALL = {
  sessionId: 'session-earlier',
  timestamp: new Date(NOW - 2 * 86_400_000).toISOString(),
  emotionalArc: 'Started lighthearted and ended abruptly after a mix-up about tea blocks.',
  questionsRemaining: ['How the move to Denver is going'],
  keyPoints: ['Seth trains martial arts'],
};
const ARC = 'ended abruptly after a mix-up about tea blocks';

let n = 0;
function setup(store: RevivedStore) {
  const sessionId = `session-revived-${++n}`;
  const services = { sessionId, userId: 'user-revived', userProfile: { name: 'Seth' } };
  const hook = createTurnIntelligenceHook({
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services,
    userData: { turnCount: 2 },
    revivedStore: store,
  } as unknown as Deps);
  return { hook, sessionId };
}

/** The note the next reply reads, as the pusher writes it into the agent's context. */
async function noteFor(hook: ReturnType<typeof createTurnIntelligenceHook>): Promise<string> {
  let pushed = '';
  const agent = {
    chatCtx: llm.ChatContext.empty(),
    updateChatCtx: async (ctx: llm.ChatContext) => {
      pushed = ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');
    },
  };
  const pusher = createTurnContextPusher(hook, agent as never);
  await pusher.onFinalTranscript('Long week. Anyway, how are you?');
  return pushed;
}

const store = (): RevivedStore => ({ summaries: async () => [LAST_CALL] });
const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

afterEach(() => {
  delete process.env.REVIVED_INTELLIGENCE;
  delete process.env.REVIVED_BUILDERS;
  processed.injections = [{ category: 'pacing', content: 'Keep it short.', priority: 40 }];
});
processed.injections = [{ category: 'pacing', content: 'Keep it short.', priority: 40 }];

describe('revived intelligence on the live turn path', () => {
  it('flag on: what Ferni knows from the last call reaches the turn note', async () => {
    process.env.REVIVED_INTELLIGENCE = 'on';
    const { hook } = setup(store());
    await settle();

    const note = await noteFor(hook);
    expect(note).toContain('Keep it short.');
    expect(note).toContain('From earlier calls');
    expect(note).toContain(ARC);
    expect(note).toContain('How the move to Denver is going');
  });

  it('flag off: the note is unchanged and nothing is read', async () => {
    const summaries = vi.fn(async () => [LAST_CALL]);
    const { hook } = setup({ summaries });
    await settle();

    const note = await noteFor(hook);
    expect(note).toContain('Keep it short.');
    expect(note).not.toContain('From earlier calls');
    expect(summaries).not.toHaveBeenCalled();
  });

  it('allow-list: a builder left out of REVIVED_BUILDERS adds nothing', async () => {
    process.env.REVIVED_INTELLIGENCE = 'on';
    process.env.REVIVED_BUILDERS = 'session-gap';
    const { hook } = setup(store());
    await settle();

    expect(await noteFor(hook)).not.toContain(ARC);
  });

  it('a store that never answers never delays the turn', async () => {
    process.env.REVIVED_INTELLIGENCE = 'on';
    const { hook } = setup({
      summaries: () =>
        new Promise(() => {
          // never settles
        }),
    });

    const turn = noteFor(hook);
    const winner = await Promise.race([
      turn.then(() => 'turn'),
      new Promise((r) => {
        setTimeout(() => r('timeout'), 2000);
      }),
    ]);
    expect(winner).toBe('turn');
    expect(await turn).not.toContain('From earlier calls');
  });

  it('a crisis turn is left exactly as built', async () => {
    process.env.REVIVED_INTELLIGENCE = 'on';
    processed.injections = [
      { category: 'safety', content: '[CRISIS] Stay with them.', priority: 99 },
      { category: 'pacing', content: 'Keep it short.', priority: 40 },
    ];
    const { hook } = setup(store());
    await settle();

    const note = await noteFor(hook);
    expect(note).toContain('[CRISIS] Stay with them.');
    expect(note).not.toContain('From earlier calls');
  });
});
