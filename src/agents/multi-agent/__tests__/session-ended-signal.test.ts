/**
 * SESSION_ENDED_SIGNAL: when the AgentSession closes without the caller (prod
 * 2026-10-13, an unrecoverable STT error left the web client alone for 15+
 * minutes), the agent tells the caller's app on the data channel. A caller
 * hanging up or our own normal close sends nothing.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import {
  registerSessionEndedSignal,
  SESSION_ENDED_MESSAGE_TYPE,
  sessionEndedReason,
} from '../session-ended-signal.js';

vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const ON = { SESSION_ENDED_SIGNAL: 'on' };
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function setup(env: Record<string, string> = ON) {
  const session = new EventEmitter();
  const publishData = vi.fn(async (_data: Uint8Array, _opts: { reliable: boolean }) => undefined);
  const room = { localParticipant: { publishData } };
  const registered = registerSessionEndedSignal(session, room, 'sess-1', env);
  const close = (reason: voice.ShutdownReason, error: unknown = null) =>
    session.emit(
      voice.AgentSessionEventTypes.Close,
      voice.createCloseEvent(reason, error as voice.CloseEvent['error'])
    );
  const sent = () =>
    publishData.mock.calls.map(([data, opts]) => ({
      message: JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>,
      opts,
    }));
  return { session, publishData, registered, close, sent };
}

const sttError = {
  type: 'stt_error',
  timestamp: 0,
  label: 'cartesia.STT',
  recoverable: false,
  error: new Error('ink-2 socket 1011: internal upstream detail'),
};

describe('registerSessionEndedSignal', () => {
  it('publishes a reliable agent_session_ended on an error close', async () => {
    const { close, sent } = setup();
    close(voice.CloseReason.ERROR, sttError);
    await vi.waitFor(() => expect(sent()).toHaveLength(1));

    const [{ message, opts }] = sent();
    expect(opts).toEqual({ reliable: true });
    expect(message).toMatchObject({
      type: SESSION_ENDED_MESSAGE_TYPE,
      reason: 'error',
      recoverable: true,
    });
  });

  it('never sends the internal error text', async () => {
    const { close, sent } = setup();
    close(voice.CloseReason.ERROR, sttError);
    await vi.waitFor(() => expect(sent()).toHaveLength(1));

    const wire = JSON.stringify(sent()[0]?.message);
    expect(wire).not.toContain('ink-2');
    expect(wire).not.toContain('stt_error');
    expect(Object.keys(sent()[0]?.message ?? {}).sort()).toEqual([
      'reason',
      'recoverable',
      'timestamp',
      'type',
    ]);
  });

  it('says shutdown when the job shuts the session down', async () => {
    const { close, sent } = setup();
    close(voice.CloseReason.JOB_SHUTDOWN);
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]?.message['reason']).toBe('shutdown');
  });

  it.each([
    ['the caller hangs up', voice.CloseReason.PARTICIPANT_DISCONNECTED],
    ['we close it ourselves (goodbye, handoff cleanup)', voice.CloseReason.USER_INITIATED],
  ])('sends nothing when %s', async (_label, reason) => {
    const { close, publishData } = setup();
    close(reason);
    await flush();
    expect(publishData).not.toHaveBeenCalled();
  });

  it('does nothing while the flag is off', async () => {
    const { registered, session, close, publishData } = setup({});
    expect(registered).toBe(false);
    expect(session.listenerCount(voice.AgentSessionEventTypes.Close)).toBe(0);
    close(voice.CloseReason.ERROR, sttError);
    await flush();
    expect(publishData).not.toHaveBeenCalled();
  });

  it('a failed publish (room already gone) is not thrown', async () => {
    const { close, publishData } = setup();
    publishData.mockRejectedValueOnce(new Error('not connected'));
    expect(() => close(voice.CloseReason.ERROR, sttError)).not.toThrow();
    await vi.waitFor(() => expect(publishData).toHaveBeenCalledOnce());
  });
});

describe('sessionEndedReason', () => {
  it('maps only unexpected closes to a reason', () => {
    expect(sessionEndedReason(voice.CloseReason.ERROR)).toBe('error');
    expect(sessionEndedReason(voice.CloseReason.JOB_SHUTDOWN)).toBe('shutdown');
    expect(sessionEndedReason(voice.CloseReason.PARTICIPANT_DISCONNECTED)).toBeNull();
    expect(sessionEndedReason(voice.CloseReason.USER_INITIATED)).toBeNull();
  });
});
