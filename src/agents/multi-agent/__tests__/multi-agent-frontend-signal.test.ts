/**
 * A multi-agent call registers its frontend signal, so conversation_end (and
 * the other client signals senders look up by session) reaches the web client
 * instead of being dropped. Uses the real frontend-signal and publisher
 * registries; only the orchestrator and agent factory are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const orchestrator = {
  start: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
};

vi.mock('../orchestrator.js', () => ({ createAgentOrchestrator: () => orchestrator }));
vi.mock('../persona-agent-factory.js', () => ({ createPersonaAgentFactory: () => vi.fn() }));
vi.mock('../../../speech/tts-gateway/index.js', () => ({ prewarmTTSGateway: vi.fn() }));
vi.mock('../../../services/diagnostic-logger.js', () => ({ diag: { entry: vi.fn() } }));
vi.mock('../../../tools/handoff/handoff-unlock-check.js', () => ({
  checkHandoffUnlocked: vi.fn(),
}));
vi.mock('../../../tools/handoff/state.js', () => ({ setCurrentAgent: vi.fn() }));

const { initializeMultiAgentSession } = await import('../multi-agent-entry.js');
const { sendFrontendSignal, resetFrontendSignal } =
  await import('../../../services/communication/frontend-signal.js');

function fakeRoom(): { publishData: ReturnType<typeof vi.fn>; room: never } {
  const publishData = vi.fn(async () => undefined);
  return { publishData, room: { localParticipant: { identity: 'agent', publishData } } as never };
}

function start(sessionId: string, room: never) {
  return initializeMultiAgentSession({
    ctx: {} as never,
    room,
    userParticipant: {} as never,
    initialPersonaId: 'ferni',
    services: {} as never,
    userData: {} as never,
    sessionId,
    enableFullHandlers: false,
  });
}

afterEach(() => resetFrontendSignal());

describe('multi-agent frontend signal', () => {
  it('delivers conversation_end to the call room', async () => {
    const { room, publishData } = fakeRoom();
    await start('ma-session-1', room);

    const sent = await sendFrontendSignal(
      'conversation_end',
      { reason: 'max_duration', disconnectDelay: 2000, timestamp: 1 },
      'ma-session-1'
    );

    expect(sent).toBe(true);
    expect(publishData).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      new TextDecoder().decode(publishData.mock.calls[0]![0] as Uint8Array)
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'conversation_end', reason: 'max_duration' });
  });

  it('keeps each call to its own room and forgets the call at cleanup', async () => {
    const a = fakeRoom();
    const b = fakeRoom();
    const callA = await start('ma-a', a.room);
    await start('ma-b', b.room);

    expect(await sendFrontendSignal('conversation_end', { reason: 'x' }, 'ma-b')).toBe(true);
    expect(b.publishData).toHaveBeenCalledTimes(1);
    expect(a.publishData).not.toHaveBeenCalled();

    await callA.cleanup();
    expect(await sendFrontendSignal('conversation_end', { reason: 'x' }, 'ma-a')).toBe(false);
    expect(a.publishData).not.toHaveBeenCalled();
  });
});
