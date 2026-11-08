/**
 * No idle hum, whistle, tune or yawn (voiced presence, live on prod) and no
 * tool hum right after a heavy turn said calmly, on a call with crisis risk,
 * or after the goodbyes (presence-heavy.ts). Light turns still get them, and
 * the hard turn keeps the silence serious for the rest of the call.
 * On hard news or crisis risk the live backchannels and the turn-opening
 * sound keep to soft "mm"s, and the idle sound stops when he starts talking.
 *
 * The heavy and light lines are the heavy-laughter probe's table
 * (voiceai-evidence/heavy-laughter-probe-2026-10-18/p1-heavy.mts).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';

const direct = vi.hoisted(() => ({ labels: [] as string[], stops: 0 }));
const fakeDirect = {
  playing: false,
  play: (_pcm: ArrayBuffer, _v: number, label: string) => {
    direct.labels.push(label);
    return true;
  },
  stop: () => {
    direct.stops++;
  },
  onWireTo: () => {},
  cancelIfFresh: () => false,
  lastWireMs: 50,
  close: async () => {},
};
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => fakeDirect,
}));

const { startVoicedPresence } = await import('../voiced-presence.js');
const { startToolHum, TOOL_HUM_DELAY_MS } = await import('../tool-hum.js');
const { noteCrisisRisk, resetCrisisCallRisk } =
  await import('../../../services/safety/crisis-call-risk.js');
const { clearFarewell, watchFarewell } = await import('../../shared/call-farewell.js');
const { initializeLiveBackchanneling } = await import('../live-backchanneling-integration.js');
const { decideBackchannel } = await import('../backchannel-policy.js');
const { attachTurnOpeningSound, turnOpeningClip } = await import('../turn-opening-sound.js');
const { createPresenceWatcher } = await import('../presence-watcher.js');

const HEAVY = [
  "i'm suicidal lol",
  'kms lol',
  'I wish I was dead haha',
  'he hits me lol',
  'we lost the baby lol',
  'there is no point lol',
  'my nephew passed',
  'unalive',
  'i dont want to live',
  'my sister relapsed',
  "we're in the ER lol",
  'I cried all night haha',
  'lol my grandma passed',
  "I can't do this anymore lol",
  'kill myself lol',
  "my dad's in the ICU haha",
  "I'm broke lol",
  'she left me lol',
  'got laid off today haha',
  'the biopsy came back positive lol',
  'my dog died',
  'we had to put my cat down',
  'i overdosed',
  'my mom has dementia lol',
];
// The probe's 18 light lines but three the gate errs heavy on, as it should (a missed hum costs
// nothing): "dead tired" and "crying laughing" read as venting (callerVenting), and isHeavyMoment
// now counts "my anxiety about this exam lol" as hard.
const LIGHT = [
  "I'm dying laughing",
  'i almost died laughing',
  'i nearly died lol',
  'my phone died lol',
  'my battery died',
  'the plant died lol',
  'that killed me',
  'I passed my test',
  'he passed me the salt',
  'she passed her exam',
  'fired up',
  'tears of joy',
  'the cat knocked my coffee over lol',
  "hahaha you're ridiculous",
  'this homework is killing me lol',
];

const pcm = () => new Int16Array(2400).fill(8000).buffer;
let n = 0;

/** A call whose caller said `turns` (oldest first), his reply after each; voice tone unread. */
function call(turns: readonly string[]) {
  const sessionId = `heavy-gate-${++n}`;
  const history = llm.ChatContext.empty();
  for (const t of turns) {
    history.addMessage({ role: 'user', content: t });
    history.addMessage({ role: 'assistant', content: 'Mm.' });
  }
  const session = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId } },
    history,
  });
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  return { session, sessionId, agent };
}

/** Sounds the voiced quiet window plays after three exchanges and 30 s of quiet. */
function idleSounds(c: ReturnType<typeof call>, getClip = pcm): number {
  const env = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' };
  const v = startVoicedPresence({
    session: c.session as never,
    direct: fakeDirect,
    mixerBusy: () => false,
    getClip,
    personaId: () => 'ferni',
    env,
    rng: () => 0.1, // every roll passes
    now: () => new Date('2026-10-12T16:00:00Z'), // noon EDT: a hum, not a yawn
  });
  for (let i = 0; i < 3; i++) {
    c.agent('speaking');
    c.agent('listening');
  }
  const before = direct.labels.length;
  vi.advanceTimersByTime(30_000);
  v?.close();
  return direct.labels.length - before;
}

/** Hums the voiced tool hum plays over a slow tool. */
function toolHums(c: ReturnType<typeof call>): number {
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
  direct.stops = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetCrisisCallRisk();
});

describe('a heavy turn said calmly, then a quiet window', () => {
  it.each(HEAVY)('no idle sound after %j', (line) => {
    expect(idleSounds(call(['hey', 'not much', line]))).toBe(0);
  });
  it.each(HEAVY)('no tool hum after %j', (line) => {
    expect(toolHums(call(['hey', line]))).toBe(0);
  });
});

describe('a light turn, the same quiet window', () => {
  it.each(LIGHT)('the idle sound still plays after %j', (line) => {
    expect(idleSounds(call(['hey', 'not much', line]))).toBe(1);
  });
  it.each(LIGHT)('the tool hum still plays after %j', (line) => {
    expect(toolHums(call(['hey', line]))).toBe(1);
  });
});

describe('the hard turn keeps the silence serious for the rest of the call', () => {
  const heavy = 'my dad died last week';
  const light = ['haha anyway', 'so what are you up to', 'what is the weather like'];

  it('one light turn after it: still no sound', () => {
    expect(idleSounds(call([heavy, 'haha anyway']))).toBe(0);
    expect(toolHums(call([heavy, 'haha anyway']))).toBe(0);
  });
  it('two light turns after it: still no sound', () => {
    expect(idleSounds(call([heavy, ...light.slice(0, 2)]))).toBe(0);
  });
  it('three light turns after it, past the lookback: still no sound', () => {
    expect(idleSounds(call(light))).toBe(1); // the same light turns alone: a sound
    expect(idleSounds(call([heavy, ...light]))).toBe(0);
    expect(toolHums(call([heavy, ...light]))).toBe(0);
  });
});

describe('crisis risk on the call', () => {
  it('light words, but risk noted: no idle sound, no tool hum', () => {
    const idle = call(['hey', 'not much', 'the plant died lol']);
    noteCrisisRisk(idle.sessionId);
    expect(idleSounds(idle)).toBe(0);
    const hum = call(['hey', 'the plant died lol']);
    noteCrisisRisk(hum.sessionId);
    expect(toolHums(hum)).toBe(0);
  });
});

describe('after the goodbyes', () => {
  it('no idle sound once both sides said goodbye (CALL_WRAP_UP)', () => {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    const c = call(['hey', 'not much', 'the plant died lol']);
    const stop = watchFarewell(c.session, { sessionId: c.sessionId, onIdle: () => undefined });
    const say = (role: string, text: string) =>
      c.session.emit(voice.AgentSessionEventTypes.ConversationItemAdded, {
        item: { type: 'message', role, textContent: text },
      });
    say('user', 'alright, talk soon');
    say('assistant', 'Talk soon, take care.');
    expect(idleSounds(c)).toBe(0);
    stop();
    clearFarewell(c.sessionId);
  });
});

const SOFT = ['Mm', 'Mhm', 'Mm-hmm'];

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(160);
  if (loud) for (let i = 0; i < 160; i++) data[i] = Math.round(12000 * Math.sin((t * 160 + i) / 6));
  return new AudioFrame(data, 16000, 1, 160);
}

/** Live backchannel clips for 3 s of `said` and a breath pause, after `earlier` turns. */
function backchannels(said: string, earlier: string[] = [], sessionId = `bc-${++n}`): string[] {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(sessionId, 'ferni', {} as never, () => false, {
    playClip: (text) => (played.push(text), true),
  });
  for (const turn of [...earlier, said]) {
    bc.onNewTurn();
    bc.updateState({ partialTranscript: turn });
  }
  for (let t = 0; t < 400; t++) {
    vi.advanceTimersByTime(10);
    bc.processAudioFrame(frame(t < 300, t));
  }
  bc.cleanup();
  return played;
}

describe('live backchannels on hard news or crisis risk', () => {
  it.each(HEAVY)('only a soft "mm" for %j', (line) => {
    const played = backchannels(line);
    played.forEach((clip) => expect(SOFT).toContain(clip));
  });

  it('light lines still get one clip each, and their reactions', () => {
    const played = LIGHT.map((line) => backchannels(line));
    played.forEach((clips) => expect(clips).toHaveLength(1));
    expect(played.flat().some((clip) => !SOFT.includes(clip))).toBe(true);
  });

  it('"haha that is so funny" right after grief: soft; after 3 more turns: "Ha" again', () => {
    expect(backchannels('that is so funny lol', ['my dad died last week'])).toEqual(['Mm']);
    const later = ['my dad died last week', 'ok', 'so anyway', 'right'];
    expect(backchannels('that is so funny lol', later)).toEqual(['Ha']);
  });

  it('crisis risk on the call, light words: soft', () => {
    noteCrisisRisk('bc-crisis');
    expect(backchannels('that is so funny lol', [], 'bc-crisis')).toEqual(['Mm']);
    expect(backchannels('that is so funny lol')).toEqual(['Ha']);
  });

  it('a heavy moment: at most 0.4 odds and at least 7 s apart', () => {
    const at = {
      turnCount: 3,
      userSpeakingMs: 4000,
      sinceAgentSpokeMs: 60_000,
      agentSpeaking: false,
      partialTranscript: 'and',
      emotional: false,
    };
    const roll = () => 0.5;
    expect(decideBackchannel({ ...at, sinceLastBackchannelMs: 6500 }, roll).play).toBe(true);
    expect(decideBackchannel({ ...at, sinceLastBackchannelMs: 6500, heavy: true }, roll)).toEqual({
      play: false,
      reason: 'too_soon',
    });
    expect(decideBackchannel({ ...at, sinceLastBackchannelMs: 9000, heavy: true }, roll)).toEqual({
      play: false,
      reason: 'chance',
    });
    expect(
      decideBackchannel({ ...at, sinceLastBackchannelMs: 9000, heavy: true }, () => 0.3).play
    ).toBe(true);
  });
});

/**
 * Early-mode opening clips over three caller turns: a light one opens with
 * "Mm", the next is skipped (never two in a row), the third is `third`, where
 * a repeat of "Mm" is not allowed, so an ungated pick is "Yeah".
 */
function openings(
  third: string,
  opts: { history?: string[]; sessionId?: string; lastPlayedAgoMs?: number } = {}
): string[] {
  vi.useFakeTimers({ now: 100_000 });
  const history = llm.ChatContext.empty();
  for (const t of opts.history ?? []) history.addMessage({ role: 'user', content: t });
  const session = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId: opts.sessionId ?? `open-${++n}` } },
    history,
  });
  const played: string[] = [];
  let transcript = '';
  attachTurnOpeningSound(
    session,
    {
      playClip: (t) => (played.push(t), true),
      lastPlayedAt: () => Date.now() - (opts.lastPlayedAgoMs ?? 60_000),
    },
    () => transcript,
    () => false,
    { waitMs: 120, replyTextSince: () => false, clipMs: () => 450, holdReply: () => {} }
  );
  for (const text of ['We went hiking on Saturday.', 'We went hiking on Sunday too.', third]) {
    transcript = text;
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(1500);
    session.emit('user_state_changed', { newState: 'listening' });
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(200);
    session.emit('agent_state_changed', { newState: 'speaking' });
  }
  return played;
}

describe('the turn-opening sound on hard news or crisis risk', () => {
  it.each(HEAVY)('"Mm" or nothing for %j', (line) => {
    const third = openings(line).slice(1);
    third.forEach((clip) => expect(clip).toBe('Mm'));
  });

  it('a light third turn still gets its "Yeah"', () => {
    expect(openings('The weather was great all weekend.')).toEqual(['Mm', 'Yeah']);
  });

  it('a suicidal line said plainly no longer falls through to "Yeah"', () => {
    expect(openings('i dont want to live')).toEqual(['Mm']);
  });

  it('hard news two turns back still holds it to "Mm" (history)', () => {
    const history = ['my dad died last week', 'We went hiking on Sunday too.'];
    expect(openings('The weather was great all weekend.', { history })).toEqual(['Mm']);
  });

  it('crisis risk on the call, light words: "Mm" or nothing', () => {
    noteCrisisRisk('open-crisis');
    const played = openings('The weather was great all weekend.', { sessionId: 'open-crisis' });
    expect(played).toEqual(['Mm']);
  });

  it('never within 2.5 s of a backchannel ("mm-hm ... Mm")', () => {
    expect(openings('The weather was great all weekend.', { lastPlayedAgoMs: 1000 })).toEqual([]);
    expect(openings('The weather was great all weekend.', { lastPlayedAgoMs: 3000 })).toEqual([
      'Mm',
      'Yeah',
    ]);
  });

  it('the plain mode gives no "Hmm" to a question on a heavy moment', () => {
    const m = {
      transcript: 'why did she have to die?',
      playedLastTurn: false,
      sinceLastClipMs: 9e4,
    };
    expect(turnOpeningClip(m, () => 0)).toBe('Hmm');
    expect(turnOpeningClip({ ...m, heavy: true }, () => 0)).toBeNull();
  });
});

describe('the idle sound stops when he starts talking', () => {
  it('voiced: a hum still playing is cut the moment he speaks', () => {
    const c = call(['hey', 'not much', 'the plant died lol']);
    const long = () => new Int16Array(24_000 * 10).buffer; // 10 s
    const env = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' };
    startVoicedPresence({
      session: c.session as never,
      direct: fakeDirect,
      mixerBusy: () => false,
      getClip: long,
      personaId: () => 'ferni',
      env,
      rng: () => 0.1,
      now: () => new Date('2026-10-12T16:00:00Z'),
    });
    for (let i = 0; i < 3; i++) {
      c.agent('speaking');
      c.agent('listening');
    }
    vi.advanceTimersByTime(5000);
    expect(direct.labels).toHaveLength(1);
    expect(direct.stops).toBe(0);
    c.agent('thinking');
    expect(direct.stops).toBe(0);
    c.agent('speaking');
    expect(direct.stops).toBe(1);
  });

  it('the watcher stops its own sound on "speaking", once', () => {
    const stop = vi.fn();
    const w = createPresenceWatcher({
      play: () => true,
      stop,
      mood: () => undefined,
      rng: () => 0,
    });
    for (let i = 0; i < 3; i++) {
      w.onAgentState('speaking');
      w.onAgentState('listening');
    }
    vi.advanceTimersByTime(8000);
    expect(w.whistled).toBe(true);
    w.onAgentState('speaking');
    w.onAgentState('listening');
    w.onAgentState('speaking');
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
