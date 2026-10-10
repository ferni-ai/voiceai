/**
 * A handoff that fails leaves the call with an agent. The orchestrator closes the old
 * agent before starting the new one; when the new one failed to start, the call had no
 * agent at all, while the app was told to roll back to the old one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

const spawned: string[] = [];
function config() {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: 'restore-test',
    createPersonaAgent: vi.fn(async (personaId: string) => {
      if (personaId === 'maya-santos') throw new Error('Maya failed to start');
      spawned.push(personaId);
      return {
        id: `${personaId}-${spawned.length}`,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn(async () => undefined),
        say: vi.fn(),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      } as never;
    }),
  };
}

beforeEach(() => {
  spawned.length = 0;
  // Speech timing isn't what this is about
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('a handoff that fails', () => {
  it('brings the previous agent back, so the call still has someone to talk to', async () => {
    const orchestrator = createAgentOrchestrator(config());
    await orchestrator.start('ferni');

    const result = await orchestrator.handoff({ targetPersonaId: 'maya-santos', reason: 'test' });

    expect(result.success).toBe(false);
    expect(orchestrator.getCurrentPersonaId()).toBe('ferni');
    expect(spawned).toEqual(['ferni', 'ferni']); // started, then restored
  });
});
