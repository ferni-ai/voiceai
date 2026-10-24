// Ferni's non-speech sounds in the judge's transcript and the scorecard
// (sounds.mjs), on a real dev run (fixtures/sounds-minor-care-adult.json) and
// small synthetic calls for the cases that run did not have.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { turnsOf } from '../humanness.mjs';
import { promptFor, transcriptOf } from '../judge.mjs';
import { metric } from '../nightly/scorecard.mjs';
import { cutSoundsOf, placeSounds, poolSoundMetrics, soundMetrics, soundsOf } from '../sounds.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const real = () =>
  JSON.parse(readFileSync(join(HERE, 'fixtures', 'sounds-minor-care-adult.json'), 'utf8'));
const persona = { id: 'ferni', name: 'Ferni', bio: '' };
const textOf = (run) => turnsOf(run, { greeting: true, sounds: true }).map((t) => t.text);

/** The real run as if CLIENT_SIGNALS_V2 were on: sound_played with labels, plus `extra`. */
function v2(extra = []) {
  const run = real();
  const labels = ['Mm-hmm.', 'Yeahh.'];
  run.data = run.data.map((d, i) => ({
    t: d.t,
    payload: { ...d.payload, type: 'sound_played', kind: 'mm-hmm', label: labels[i] },
  }));
  // Each added sound is heard: its audio on the reactions track.
  const side = run.tracks.find((t) => /background_reactions/.test(t.name));
  for (const [t, kind, label] of extra) {
    run.data.push({ t, payload: { type: 'sound_played', kind, wireDelayMs: 0, label } });
    side.voice.push([t, t + 400]);
  }
  return run;
}

/** A synthetic call: the caller talks 1-10 s, Ferni 20-22 s; `sounds` are [t, kind, label?]. */
function call(sounds, { agent = [[20000, 22000]] } = {}) {
  return {
    userSpeech: [[1000, 10000]],
    events: [
      { t: 1800, who: 'user', text: 'So' },
      { t: 10400, who: 'user', text: 'So the thing is I moved.' },
      { t: 22100, who: 'agent', text: 'Oh, where to?' },
    ],
    tracks: [
      { name: 'agent:roomio_audio', voice: agent },
      { name: 'agent:background_reactions', voice: sounds.map(([t]) => [t, t + 400]) },
    ],
    data: sounds.map(([t, kind, label]) => ({
      t,
      payload: { type: 'sound_played', kind, wireDelayMs: 0, ...(label ? { label } : {}) },
    })),
  };
}

describe('soundsOf and placement on the real run (backchannel_played, no mic)', () => {
  it('takes each message at the side-track audio it started, and keeps unsignalled audio', () => {
    expect(soundsOf(real()).map((s) => [s.t, s.kind, s.source])).toEqual([
      [25716, 'mm-hmm', 'backchannel_played'],
      [44235, 'mm-hmm', 'backchannel_played'],
      [58605, 'sound', 'track'], // the turn-opening "mm" (unsignalled with CLIENT_SIGNALS_V2 off)
    ]);
  });

  it('places all three at the caller pause (0.5, 0.4 and 2.5 s after they stopped)', () => {
    const placed = placeSounds(real());
    expect(placed.map((s) => [s.place, s.sinceCallerMs, s.precise])).toEqual([
      ['pause', 460, false],
      ['pause', 383, false],
      ['pause', 2490, false],
    ]);
    expect(soundMetrics(placed)).toMatchObject({
      total: 3,
      byKind: { 'mm-hmm': 2, sound: 1 },
      intoSilence: 0,
      overCaller: null, // the scripted turns can't tell a phrase pause from their words
      repeats: null, // no labels: unmeasured, not 0
    });
  });
});

describe('signalled sounds the caller never heard', () => {
  // long-day-fl04: backchannel_played at 26265, every side track silent 26.0-27.5 s.
  const cutRun = () =>
    JSON.parse(readFileSync(join(HERE, 'fixtures', 'sounds-long-day-cut.json'), 'utf8'));

  it('drops a message with no side-track audio when the side tracks were recorded', () => {
    const run = cutRun();
    expect(cutSoundsOf(run).map((s) => [s.t, s.kind])).toEqual([[26265, 'mm-hmm']]);
    expect(soundsOf(run).map((s) => s.t)).toEqual([9983, 11393, 44033, 45303, 64103]);
    const manager = turnsOf(run, { sounds: true }).find((t) => /My manager/.test(t.text));
    expect(manager.text).not.toContain('[');
    const m = soundMetrics(placeSounds(run), { cut: cutSoundsOf(run).length });
    expect(m).toMatchObject({ total: 5, cutBeforeHeard: 1, intoSilence: 0 });
    expect(m.reactions['mid-utterance']).toBe(2);
  });

  it('keeps the message time only for a run with no side track recorded', () => {
    const run = cutRun();
    run.tracks = run.tracks.filter((t) => !/background/.test(t.name));
    expect(cutSoundsOf(run)).toEqual([]);
    expect(soundsOf(run).map((s) => s.t)).toEqual([9918, 26265, 43972, 63870]);
  });
});

describe('one clip, two messages', () => {
  /** Each backchannel_played also sent as sound_played (both CLIENT_SIGNALS_V2 and AVATAR_LISTEN_SIGNALS on). */
  const both = (run) => {
    const twins = run.data.map((d) => ({
      t: d.t,
      payload: { ...d.payload, type: 'sound_played', kind: 'mm-hmm', label: 'Mm-hmm.' },
    }));
    return { ...run, data: [...run.data, ...twins] };
  };

  it('counts once with the side tracks recorded', () => {
    const run = both(real());
    expect(soundsOf(run).filter((s) => s.source !== 'track')).toHaveLength(2);
    expect(cutSoundsOf(run)).toEqual([]);
    expect(soundMetrics(placeSounds(run)).total).toBe(3);
  });

  it('counts once with no side track to match against', () => {
    const run = both(real());
    run.tracks = run.tracks.filter((t) => !/background/.test(t.name));
    expect(soundsOf(run).map((s) => [s.t, s.source])).toEqual([
      [25606, 'sound_played'],
      [44165, 'sound_played'],
    ]);
  });
});

describe('the woven transcript', () => {
  it('puts each backchannel at the end of the caller turn it answered, words unchanged', () => {
    const run = real();
    const plain = turnsOf(run, { greeting: true });
    const woven = turnsOf(run, { greeting: true, sounds: true });
    expect(woven).toHaveLength(plain.length);
    expect(woven.filter((t) => t.text.includes('[')).map((t) => [t.who, t.text])).toEqual([
      ['user', 'I teach 9th grade at Lincoln High. [Ferni: mm-hm]'],
      [
        'user',
        'My best friend Riley and I had a fight today and I feel kind of awful. [Ferni: mm-hm]',
      ],
      [
        'user',
        'She told everyone at work that I have a crush on a guy named Jess. [Ferni makes a short sound]',
      ],
    ]);
    expect(plain.some((t) => t.text.includes('['))).toBe(false);
    expect(woven.map((t) => t.text.replace(/ \[Ferni[^\]]*\]/g, ''))).toEqual(
      plain.map((t) => t.text)
    );
  });

  it('inline mid-sentence, silence, over Ferni, by label (CLIENT_SIGNALS_V2 on)', () => {
    const run = v2([
      [42400, 'mm-hmm', 'Right.'], // while they said "...Riley and I had a fight"
      [39000, 'mm-hmm', 'Mm-hmm.'], // 13.7 s after the caller stopped, nobody about to talk
      [30000, 'laugh', 'laughter'], // during Ferni's "Ninth grade, wow"
    ]);
    const text = textOf(run);
    expect(text).toContain(
      'My best friend Riley and I [Ferni: "Right."] had a fight today and I feel kind of awful. [Ferni: "Yeahh."]'
    );
    expect(text).toContain('I teach 9th grade at Lincoln High. [Ferni: "Mm-hmm."]');
    const ninth = text.findIndex((t) => t.startsWith('Ninth grade, wow'));
    expect(text.slice(ninth, ninth + 3)).toEqual([
      expect.stringMatching(/^Ninth grade, wow/),
      '[Ferni laughs: "laughter", over Ferni\'s own speech]',
      '[Ferni: "Mm-hmm.", into silence, 13.7 s after the caller stopped, 1.1 s after Ferni stopped]',
    ]);
    expect(text[ninth + 3]).toMatch(/^My best friend Riley/);
    expect(soundMetrics(placeSounds(run))).toMatchObject({
      // pause: the two labelled backchannels and the unsignalled opener audio
      reactions: { pause: 3, 'mid-utterance': 1, silence: 1, 'over-ferni': 1, 'before-reply': 0 },
      intoSilence: 1,
      repeats: 1,
      repeatedLabels: ['Mm-hmm.'],
    });
  });

  it('says how long after the caller stopped a sound played into silence', () => {
    const text = textOf(call([[14100, 'mm-hmm']], { agent: [] }));
    expect(text).toEqual([
      'So the thing is I moved.',
      '[Ferni: mm-hm, into silence, 4.1 s after the caller stopped]',
      'Oh, where to?',
    ]);
  });

  it('marks a sound over their words only when the mic phrases show it', () => {
    const run = call([[5000, 'mm-hmm', 'Mm-hmm.']]);
    // Scripted turns only: placed by the captions, not called over their words.
    expect(textOf(run)[0]).toBe('So [Ferni: "Mm-hmm."] the thing is I moved.');
    const speech = [
      [1000, 6000],
      [6400, 10000],
    ];
    const turns = turnsOf(run, { sounds: { speech } });
    expect(turns[0].text).toBe('So [Ferni: "Mm-hmm.", over their words] the thing is I moved.');
    expect(soundMetrics(placeSounds(run, { speech })).overCaller).toBe(1);
    // In the 400 ms between their phrases it is a pause, said plainly.
    const gap = call([[6100, 'mm-hmm']]);
    expect(placeSounds(gap, { speech })[0].place).toBe('pause');
    expect(soundMetrics(placeSounds(gap, { speech })).overCaller).toBe(0);
  });
});

describe('into silence', () => {
  it('true over 2.5 s after the caller stopped with nobody about to talk; false at the pause or before a reply', () => {
    const placed = placeSounds(
      call([
        [11000, 'mm-hmm'],
        [12400, 'mm-hmm'],
        [12600, 'mm-hmm'],
        [18600, 'opener'],
        [21000, 'mm-hmm'],
      ])
    );
    expect(placed.map((s) => s.place)).toEqual([
      'pause',
      'pause', // 2.4 s
      'silence', // 2.6 s
      'before-reply', // Ferni starts 1.4 s later
      'over-ferni',
    ]);
    expect(soundMetrics(placed).intoSilence).toBe(1);
  });

  it('counts the prod case, five backchannels into 45 s of quiet, but not a quiet-line hum', () => {
    const five = [15000, 24000, 33000, 42000, 51000].map((t) => [t, 'mm-hmm']);
    const placed = placeSounds(call([...five, [55000, 'hum'], [57000, 'breath']], { agent: [] }));
    expect(placed.filter((s) => s.place === 'silence')).toHaveLength(7);
    expect(soundMetrics(placed).intoSilence).toBe(5);
  });
});

describe('repeats', () => {
  const repeats = (sounds) => soundMetrics(placeSounds(call(sounds, { agent: [] }))).repeats;

  it('the same label again within 60 s is a repeat; later, or another take, is not', () => {
    expect(
      repeats([
        [11000, 'mm-hmm', 'Right.'],
        [70000, 'mm-hmm', 'Right.'],
      ])
    ).toBe(1);
    expect(
      repeats([
        [11000, 'mm-hmm', 'Right.'],
        [72000, 'mm-hmm', 'Right.'],
      ])
    ).toBe(0);
    expect(
      repeats([
        [11000, 'mm-hmm', 'Mm-hmm.'],
        [12000, 'mm-hmm', 'Mmm-hmm.'],
      ])
    ).toBe(0);
    expect(
      repeats([
        [11000, 'mm-hmm'],
        [12000, 'mm-hmm'],
      ])
    ).toBe(null);
  });

  it('pools runs: counts add up, unmeasured stays null', () => {
    const a = soundMetrics(
      placeSounds(
        call([
          [11000, 'mm-hmm', 'Right.'],
          [12000, 'mm-hmm', 'Right.'],
        ])
      )
    );
    const b = soundMetrics(placeSounds(call([[14100, 'mm-hmm']], { agent: [] })));
    expect(poolSoundMetrics([a, b])).toMatchObject({
      runs: 2,
      total: 3,
      intoSilence: 1,
      repeats: 1,
    });
    expect(poolSoundMetrics([b]).repeats).toBe(null);
  });
});

describe('the judge hears them', () => {
  const order = ['conduct', 'empathy'];

  it('on: the prompt has the woven sounds and how to judge them', () => {
    const prompt = promptFor(real(), null, order, persona, { sounds: true });
    expect(prompt).toContain('I teach 9th grade at Lincoln High. [Ferni: mm-hm]');
    expect(prompt).toContain('a sound into silence, the same sound again within a minute');
    expect(transcriptOf(v2([[39000, 'mm-hmm', 'Mm-hmm.']]), 'Ferni', { sounds: true })).toMatch(
      /^\d+\. \[Ferni: "Mm-hmm\.", into silence, 13\.7 s after the caller stopped/m
    );
  });

  it('off (JUDGE_SOUNDS=off): the words-only transcript, no note', () => {
    const prompt = promptFor(real(), null, order, persona, { sounds: false });
    expect(prompt).toContain('I teach 9th grade at Lincoln High.\n');
    expect(prompt).not.toContain('[Ferni');
    expect(prompt).not.toContain('Square brackets');
    const before = process.env.JUDGE_SOUNDS;
    process.env.JUDGE_SOUNDS = 'off';
    try {
      expect(promptFor(real(), null, order, persona)).toBe(prompt);
    } finally {
      if (before === undefined) delete process.env.JUDGE_SOUNDS;
      else process.env.JUDGE_SOUNDS = before;
    }
  });
});

describe('nightly sounds metric', () => {
  it('sums a field over the runs that measured it; none is no data', () => {
    const check = { metric: 'sounds', field: 'repeats' };
    const runs = [
      { score: { sounds: { repeats: 2 } } },
      { score: { sounds: { repeats: null } } },
      { score: {} },
    ];
    expect(metric(check, runs, {})).toEqual({ value: 2, n: 1 });
    expect(metric(check, runs.slice(1), {})).toEqual({ value: null, n: 0 });
  });
});
