/**
 * No idle hum, whistle or snore for the rest of a call that had a hard moment
 * (hard news turns back, crisis risk, the wrap-up reading it heavy, a caller
 * who sounds under 18), and none after its closing lines or once it closes
 * (presence-heavy.ts, presence-closing.ts). An ordinary light call still gets
 * its sound. The real voiced presence path and watcher run; only the clock
 * and the audio track are fake. Lines are written for this test.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm, voice } from '@livekit/agents';

const direct = vi.hoisted(() => ({ labels: [] as string[] }));
const fakeDirect = {
  playing: false,
  play: (_pcm: ArrayBuffer, _v: number, label: string) => (direct.labels.push(label), true),
  stop: () => {},
};

const { startVoicedPresence } = await import('../voiced-presence.js');
const { startToolHum, TOOL_HUM_DELAY_MS } = await import('../tool-hum.js');
const { isHeavyMoment } = await import('../../../speech/adaptive-ssml/heavy-moment.js');
const { noteCrisisRisk, resetCrisisCallRisk } =
  await import('../../../services/safety/crisis-call-risk.js');
const { likelyMinor, noteCallerWords, resetMinorCare } =
  await import('../../../utils/minor-care.js');
const { WrapUp, setWrapUp } = await import('../../personas/wrap-up.js');
const { ferniSaysGoodbye, stayQuietOn } = await import('../../shared/call-farewell.js');
const { clearSessionClosing, markSessionClosing } =
  await import('../../shared/session-closing-tracker.js');

type Line = ['user' | 'assistant', string];

/** An easy call about soup: no hard words, no goodbye. */
const LIGHT: Line[] = [
  ['user', 'hey ferni'],
  ['assistant', 'Hey, how was the day?'],
  ['user', 'pretty good, I made soup'],
  ['assistant', 'What kind?'],
  ['user', 'tomato, it came out great'],
  ['assistant', 'Tomato is a classic.'],
  ['user', 'yeah I am kind of proud of it'],
  ['assistant', 'You should be.'],
];

const pcm = () => new Int16Array(2400).fill(8000).buffer;
let n = 0;

function call(lines: readonly Line[]) {
  const sessionId = `heavy-close-${++n}`;
  const history = llm.ChatContext.empty();
  for (const [role, content] of lines) history.addMessage({ role, content });
  const session = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId } },
    history,
  });
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  return { session, sessionId, agent };
}
type Call = ReturnType<typeof call>;

/** Callers' turns, oldest first. */
const callerTurns = (lines: readonly Line[]) =>
  lines.filter(([r]) => r === 'user').map(([, t]) => t);

/** Idle sounds (hum, whistle and the long-quiet snore) in 40 s of quiet after three exchanges. */
function quietSounds(c: Call, during?: () => void): number {
  const v = startVoicedPresence({
    session: c.session as never,
    direct: fakeDirect,
    mixerBusy: () => false,
    getClip: pcm,
    personaId: () => 'ferni',
    env: {
      VOICED_PRESENCE: 'on',
      PRESENCE_SOUNDS: 'on',
      VOICED_QUIRKS: 'on',
      PRESENCE_SNORE: 'on',
    },
    rng: () => 0.1, // every roll passes
    now: () => new Date('2026-10-12T16:00:00Z'), // noon EDT: a hum, not a yawn
  });
  for (let i = 0; i < 3; i++) {
    c.agent('speaking');
    c.agent('listening');
  }
  const before = direct.labels.length;
  vi.advanceTimersByTime(2000); // the sound is armed, not yet played
  during?.();
  vi.advanceTimersByTime(38_000);
  v?.close();
  return direct.labels.length - before;
}

/** Tool hums over a slow tool call. */
function toolHums(c: Call): number {
  const env = { VOICED_PRESENCE: 'on', TOOL_HUM: 'on' };
  const v = startVoicedPresence({
    session: c.session as never,
    direct: fakeDirect,
    mixerBusy: () => false,
    getClip: pcm,
    personaId: () => 'ferni',
    env,
    rng: () => 0.1,
  });
  const stop = startToolHum(c.session as never, { play: () => true, stop: () => {} }, env);
  const items = new Set<(item: { type: string; callId: string }) => void>();
  c.session.emit(voice.AgentSessionEventTypes.SpeechCreated, {
    speechHandle: {
      _addItemAddedCallback: (cb: (item: { type: string; callId: string }) => void) =>
        items.add(cb),
      _removeItemAddedCallback: () => {},
      addDoneCallback: () => {},
    },
  });
  c.agent('thinking');
  items.forEach((cb) => cb({ type: 'function_call', callId: 'c1' }));
  const before = direct.labels.length;
  vi.advanceTimersByTime(TOOL_HUM_DELAY_MS + 4000);
  stop();
  v?.close();
  return direct.labels.length - before;
}

beforeEach(() => {
  vi.useFakeTimers();
  direct.labels = [];
});
afterEach(() => {
  vi.useRealTimers();
  resetCrisisCallRisk();
  resetMinorCare();
});

describe('control: an ordinary light call', () => {
  it('its quiet gets a hum and the long-quiet snore, a slow tool its tool hum', () => {
    expect(quietSounds(call(LIGHT))).toBe(2);
    expect(toolHums(call(LIGHT))).toBe(1);
  });
});

describe('a hard moment earlier in the call: nothing for the rest of it', () => {
  const hard: Line[] = [
    ['user', 'my dad is back in the hospital'],
    ['assistant', 'Oh, I am sorry.'],
    ...LIGHT,
  ];

  it('hard news four caller turns back, light turns since: no sound', () => {
    expect(isHeavyMoment(callerTurns(hard).slice(0, 1))).toBe(true);
    expect(isHeavyMoment(callerTurns(hard))).toBe(false); // the last three turns are light
    expect(quietSounds(call(hard))).toBe(0);
    expect(toolHums(call(hard))).toBe(0);
  });

  it('crisis risk noted, light words: no sound', () => {
    const c = call(LIGHT);
    noteCrisisRisk(c.sessionId);
    expect(quietSounds(c)).toBe(0);
  });

  it('a caller who sounds under 18 (minor care): no sound', () => {
    const c = call([['user', "I'm only 14."], ['assistant', 'Oh, okay.'], ...LIGHT]);
    noteCallerWords(c.sessionId, "I'm only 14.", { env: { MINOR_CARE: 'on' } });
    expect(likelyMinor(c.sessionId)).toBe(true);
    expect(quietSounds(c)).toBe(0);
  });

  it('the wrap-up reads the call as heavy, no hard word in it: no sound', async () => {
    const lines: Line[] = [['user', 'he is moving in with me tomorrow'], ...LIGHT];
    const wrapUp = new WrapUp(async () => '{"items":[],"heavy":true}');
    await wrapUp.observe([{ speaker: 'user', text: 'he is moving in with me tomorrow' }]);
    expect(wrapUp.readsHeavy()).toBe(true);
    const c = call(lines);
    setWrapUp(c.session, wrapUp);
    expect(quietSounds(c)).toBe(0);
    setWrapUp(c.session, null);
    expect(quietSounds(call(lines))).toBe(2); // the same call, no reading: a sound
  });
});

describe('after the closing lines', () => {
  it("Ferni's goodbye last, no goodbye watcher: no sound, no tool hum", () => {
    const lines: Line[] = [
      ...LIGHT,
      ['user', 'okay I am going to go eat it now'],
      ['assistant', 'Enjoy it, take care.'],
    ];
    const c = call(lines);
    expect(stayQuietOn(c.session)).toBe(false);
    expect(quietSounds(c)).toBe(0);
    expect(toolHums(call(lines))).toBe(0);
  });

  it("the caller's goodbye, answered by a line that isn't one: no sound", () => {
    const last = 'Get some rest. Tell me how the soup keeps.';
    expect(ferniSaysGoodbye(last)).toBe(false);
    const c = call([...LIGHT, ['user', 'Man. I will talk to you later.'], ['assistant', last]]);
    expect(quietSounds(c)).toBe(0);
  });

  it('the caller carries on after the goodbyes: the quiet is easy again', () => {
    const c = call([
      ...LIGHT,
      ['user', 'alright, talk soon'],
      ['assistant', 'Talk soon, take care.'],
      ['user', 'oh wait, what goes with tomato soup?'],
      ['assistant', 'Grilled cheese, always.'],
    ]);
    expect(quietSounds(c)).toBe(2);
  });
});

describe('the call closing while a sound is armed', () => {
  it('the session closes: nothing plays', () => {
    const c = call(LIGHT);
    expect(quietSounds(c, () => c.session.emit(voice.AgentSessionEventTypes.Close, {}))).toBe(0);
  });

  it('marked closing, no farewell watcher: nothing plays', () => {
    const c = call(LIGHT);
    expect(quietSounds(c, () => markSessionClosing(c.sessionId))).toBe(0);
    clearSessionClosing(c.sessionId);
  });
});
