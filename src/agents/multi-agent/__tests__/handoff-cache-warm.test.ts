/**
 * A handoff arms the incoming persona's prompt-cache warm (HANDOFF_CACHE_WARM,
 * handoff-cache-warm.ts) once, with that persona's session, and never waits for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

// A warm that never finishes: the handoff must complete anyway.
const warm = vi.hoisted(() => vi.fn(async () => new Promise<void>(() => {})));
vi.mock('../../model-provider/handoff-cache-warm.js', () => ({ warmIncomingPersona: warm }));

const sessions = new Map<string, object>();
function config() {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: 'handoff-warm-test',
    createPersonaAgent: vi.fn(async (personaId: string) => {
      const session = { persona: personaId };
      sessions.set(personaId, session);
      return {
        id: `${personaId}-agent`,
        personaId,
        isActive: false,
        session,
        cleanup: vi.fn(async () => undefined),
        say: vi.fn(),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      } as never;
    }),
  };
}

beforeEach(() => {
  sessions.clear();
  warm.mockClear();
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('handoff cache warm', () => {
  it("arms one warm, on the incoming persona's session, without waiting for it", async () => {
    const orchestrator = createAgentOrchestrator(config());
    await orchestrator.start('ferni');
    expect(warm).not.toHaveBeenCalled(); // the first greeting has its own warm

    const result = await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });

    expect(result.success).toBe(true);
    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledWith(sessions.get('peter-john'));
  });
});
