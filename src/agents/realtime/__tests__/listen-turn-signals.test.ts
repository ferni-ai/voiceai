/**
 * AVATAR_LISTEN_SIGNALS: speech onset reaches the speech-state dispatcher, so
 * pauses send speech_pause + active_listening_nod; no made-up breath rate.
 * Off, the old behaviour: no speech_start, no pause nods, random breath rate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  avatarListenSignalsEnabled,
  clearListenTurnSignals,
  createListenTurnSignals,
  getListenTurnSignals,
} from '../listen-turn-signals.js';
import { dispatchSpeechPause, type SendDataMessageFn } from '../speech-state-dispatcher.js';

type Call = [string, Record<string, unknown>];

const SESSION = 'listen-turn-test';
let send: ReturnType<typeof vi.fn<SendDataMessageFn>>;
const calls = () => send.mock.calls as Call[];
const speechStates = (t: string) =>
  calls().filter(([m, p]) => m === 'speech_state' && p.type === t);
const nods = () =>
  calls().filter(
    ([m, p]) => m === 'humanization_signal' && p.signalType === 'active_listening_nod'
  );
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('listen-turn signals', () => {
  beforeEach(() => {
    send = vi.fn<SendDataMessageFn>().mockResolvedValue(undefined);
    clearListenTurnSignals(SESSION);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reads AVATAR_LISTEN_SIGNALS=on only', () => {
    expect(avatarListenSignalsEnabled({})).toBe(false);
    expect(avatarListenSignalsEnabled({ AVATAR_LISTEN_SIGNALS: 'off' })).toBe(false);
    expect(avatarListenSignalsEnabled({ AVATAR_LISTEN_SIGNALS: 'true' })).toBe(false);
    expect(avatarListenSignalsEnabled({ AVATAR_LISTEN_SIGNALS: 'on' })).toBe(true);
  });

  it('on: speech onset sends speech_start once per turn, so a pause nods', async () => {
    const signals = createListenTurnSignals(SESSION, send, true);
    signals.onFrame(true, 0);
    signals.onFrame(true, 400);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(1);
    expect(calls()).toContainEqual([
      'humanization_signal',
      expect.objectContaining({ signalType: 'active_listening_start' }),
    ]);

    await dispatchSpeechPause(SESSION, send, 300);
    expect(speechStates('speech_pause')).toEqual([
      ['speech_state', expect.objectContaining({ pauseType: 'breath', nodType: 'micro' })],
    ]);
    expect(nods()).toEqual([
      ['humanization_signal', expect.objectContaining({ nodType: 'micro', durationMs: 300 })],
    ]);

    // A mid-turn pause and resume is the same turn.
    signals.onFrame(false, 1200);
    signals.onFrame(true, 1500);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(1);

    // The detector ends the turn after a long pause; the next onset is a new turn.
    signals.onFrame(false, 0);
    signals.onFrame(true, 0);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(2);
  });

  it('on: sends no breath rate, since nothing measures one', async () => {
    const signals = createListenTurnSignals(SESSION, send, true);
    signals.onFrame(true, 0);
    signals.onFrame(true, 5000);
    signals.onFrame(true, 10_050);
    await flush();
    expect(speechStates('breath_detected')).toHaveLength(0);
    expect(calls().some(([, p]) => p.signalType === 'breath_sync')).toBe(false);
  });

  it('off: no speech_start, so pauses send nothing; the old breath rate still goes', async () => {
    const signals = createListenTurnSignals(SESSION, send, false);
    signals.onFrame(true, 0);
    signals.onFrame(true, 5000);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(0);
    expect(speechStates('breath_detected')).toHaveLength(1);

    await dispatchSpeechPause(SESSION, send, 300);
    expect(speechStates('speech_pause')).toHaveLength(0);
    expect(nods()).toHaveLength(0);
  });

  it('getListenTurnSignals keeps one per session and reads the flag at creation', async () => {
    vi.stubEnv('AVATAR_LISTEN_SIGNALS', 'on');
    const first = getListenTurnSignals(SESSION, send);
    expect(getListenTurnSignals(SESSION, send)).toBe(first);
    first.onFrame(true, 0);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(1);

    clearListenTurnSignals(SESSION);
    vi.stubEnv('AVATAR_LISTEN_SIGNALS', 'off');
    const second = getListenTurnSignals(SESSION, send);
    expect(second).not.toBe(first);
    second.onFrame(true, 0);
    await flush();
    expect(speechStates('speech_start')).toHaveLength(1);
    // The tracker was cleared too: a pause no longer counts as mid-speech.
    await dispatchSpeechPause(SESSION, send, 300);
    expect(nods()).toHaveLength(0);
  });
});
