/**
 * HANDOFF_EARLY_GOODBYE on the orchestrator: a goodbye the handoff tool already
 * said (tools/handoff/early-goodbye.ts) is not said again when the handoff runs;
 * without one, the orchestrator says it as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brokenPromiseLine,
  registerEarlyGoodbye,
  sayGoodbyeEarly,
  withEarlyGoodbye,
} from '../../../tools/handoff/early-goodbye.js';
import { earlyGoodbyeCall } from '../early-goodbye-call.js';
import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';

vi.mock('../../model-provider/handoff-cache-warm.js', () => ({
  warmIncomingPersona: vi.fn(async () => undefined),
}));

const SESSION = 'early-goodbye-orchestrator';
const says = new Map<string, ReturnType<typeof vi.fn>>();

function config() {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: SESSION,
    createPersonaAgent: vi.fn(async (personaId: string) => {
      const say = vi.fn();
      says.set(personaId, say);
      return {
        id: `${personaId}-agent`,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn(async () => undefined),
        say,
        setMuted: vi.fn(),
        interrupt: vi.fn(),
      } as never;
    }),
  };
}

let unregister = (): void => undefined;
beforeEach(() => {
  says.clear();
  vi.stubEnv('HANDOFF_TALK_THROUGH', 'off');
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});
afterEach(() => {
  unregister();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function startCall() {
  const orchestrator = createAgentOrchestrator(config());
  await orchestrator.start('ferni');
  unregister = registerEarlyGoodbye(
    SESSION,
    earlyGoodbyeCall(orchestrator, SESSION, () => undefined)
  );
  const ferni = says.get('ferni');
  if (!ferni) throw new Error('no ferni');
  await vi.waitFor(() => expect(ferni).toHaveBeenCalledTimes(1)); // the opening greeting
  ferni.mockClear();
  return { orchestrator, ferni };
}

describe('HANDOFF_EARLY_GOODBYE in the orchestrator', () => {
  it('flag off: the orchestrator says the goodbye, once', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'off');
    const { orchestrator, ferni } = await startCall();
    expect(await sayGoodbyeEarly(SESSION, 'peter-john')).toBe(false);
    expect(ferni).not.toHaveBeenCalled();
    const result = await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
    expect(result.success).toBe(true);
    expect(ferni).toHaveBeenCalledTimes(1);
  });

  it('flag on: the goodbye said early is the only one', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
    const { orchestrator, ferni } = await startCall();
    expect(await sayGoodbyeEarly(SESSION, 'peter-john')).toBe(true);
    expect(ferni).toHaveBeenCalledTimes(1);
    const [line] = ferni.mock.calls[0] as [string];
    const result = await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'test' });
    expect(result.success).toBe(true);
    expect(ferni).toHaveBeenCalledTimes(1);
    expect(ferni).toHaveBeenCalledWith(line, { allowInterruptions: false });
  });

  it('flag on: no early goodbye while a handoff is already running', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
    const { orchestrator, ferni } = await startCall();
    vi.spyOn(orchestrator, 'isHandoffInProgress').mockReturnValue(true);
    expect(await sayGoodbyeEarly(SESSION, 'peter-john')).toBe(false);
    expect(ferni).not.toHaveBeenCalled();
  });

  it('flag on: a handoff that fails after the goodbye says so, and the next one says its goodbye', async () => {
    vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on');
    const { orchestrator, ferni } = await startCall();
    const failed = await withEarlyGoodbye(SESSION, 'Peter John', async (onCleared) => {
      await onCleared('peter-john');
      return {
        success: false,
        error: 'timeout',
        targetAgent: 'peter-john',
        targetAgentName: 'Peter John',
        previousAgent: 'ferni',
        greeting: '',
      };
    });
    expect(failed.success).toBe(false);
    expect(failed.error).toMatch(/already told them Peter was coming/);
    const lines = (): string[] => ferni.mock.calls.map(([text]) => String(text));
    expect(lines()).toHaveLength(2);
    expect(lines()[1]).toBe(brokenPromiseLine('Peter John'));

    // Within 10 s, a handoff that skips the tool (a tap) still says its own goodbye
    const result = await orchestrator.handoff({ targetPersonaId: 'peter-john', reason: 'tap' });
    expect(result.success).toBe(true);
    expect(lines()).toHaveLength(3);
    expect(lines()[2]).not.toBe(brokenPromiseLine('Peter John'));
  });
});
