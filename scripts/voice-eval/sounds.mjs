// Ferni's non-speech sounds on a recorded call ("mm-hm", a laugh, a hum, the
// turn-opening "mm"): where each one landed against who was talking, so the
// judge can hear them in the transcript and score.mjs can count the bad ones.
//
// Sounds come from the data messages the agent sends as a clip starts:
// `sound_played { kind, wireDelayMs, label }` (CLIENT_SIGNALS_V2, every kind)
// or else `backchannel_played { kind, wireDelayMs }` (live backchannels only),
// each matched to the side-track audio segment the harness heard. A side-track
// segment with no message is still a sound the caller heard, kind 'sound'.
//
// Placement, on the harness clock (what the listener hears):
//   over-ferni     during Ferni's own speech
//   mid-utterance  while the caller is talking
//   pause          within INTO_SILENCE_MS of the caller's last words
//   before-reply   later, but Ferni starts speaking within 1.5 s (an opener)
//   silence        later, with nobody about to speak: a prod call played five
//                  backchannels into 45 s of quiet (review 2026-10-24)
// The caller's speech is their phrases from the mic recording when it can be
// read (presence.mjs), else the scripted turns (run.userSpeech), which can't
// tell a phrase pause from talking over them.
import { callerPhrases, readWavPcm } from './presence.mjs';

export const INTO_SILENCE_MS = 2500;
export const REPEAT_WINDOW_MS = 60000;
const REPLY_WITHIN_MS = 1500;
// Sounds made for a quiet line (presence-watcher.ts): silence is their place.
const QUIET_KINDS = new Set(['hum', 'breath', 'sigh']);
const REACTIONS = new Set(['mm-hmm', 'laugh', 'sound']);
const PLACES = ['pause', 'mid-utterance', 'silence', 'over-ferni', 'before-reply'];

const isSide = (t) => /background/i.test(t.name);

/** The sounds the caller heard, in order: [{ t, kind, label, source }]. */
export function soundsOf(run) {
  const msgs = (run.data ?? []).map((d) => ({ t: d.t, p: d.payload ?? {} }));
  const v2 = msgs.filter((m) => m.p.type === 'sound_played');
  // With both flags on a live backchannel sends both messages: one sound.
  const events = v2.length ? v2 : msgs.filter((m) => m.p.type === 'backchannel_played');
  const segs = (run.tracks ?? [])
    .filter(isSide)
    .flatMap((t) => (t.voice ?? []).map(([s]) => s))
    .sort((a, b) => a - b);
  const used = new Set();
  const out = [];
  for (const { t, p } of events) {
    const heard = t + (p.wireDelayMs ?? 0);
    // The message goes out as play() is accepted; the audio follows.
    const i = segs.findIndex((s, j) => !used.has(j) && s >= t - 300 && s <= heard + 1500);
    if (i >= 0) used.add(i);
    out.push({
      t: i >= 0 ? segs[i] : heard,
      kind: p.kind === 'backchannel' ? 'mm-hmm' : (p.kind ?? 'sound'),
      label: typeof p.label === 'string' && p.label ? p.label : null,
      source: p.type,
    });
  }
  segs.forEach((s, j) => {
    if (!used.has(j)) out.push({ t: s, kind: 'sound', label: null, source: 'track' });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** The caller's speech intervals: mic phrases when readable ({ precise: true }), else the scripted turns. */
export function callerSpeechOf(run, readWav = readWavPcm) {
  if (run.mic?.file) {
    try {
      const { pcm, rate } = readWav(run.mic.file);
      return { speech: callerPhrases(pcm, rate, run.mic.startT), precise: true };
    } catch {
      // no recording: fall back to the turns
    }
  }
  return { speech: run.userSpeech ?? [], precise: false };
}

/** Ferni's own speech: voice on the agent's non-side tracks. */
const agentSpeechOf = (run) =>
  (run.tracks ?? [])
    .filter((t) => !isSide(t))
    .flatMap((t) => t.voice ?? [])
    .sort((a, b) => a[0] - b[0]);

const inside = (ivs, s) => ivs.some(([a, b]) => a <= s && s < b);
const lastEnd = (ivs, s) => Math.max(-Infinity, ...ivs.filter(([, b]) => b <= s).map(([, b]) => b));

/** Each sound with its placement and context times; `speech` (or `caller`, from callerSpeechOf) overrides reading the mic. */
export function placeSounds(run, { readWav, speech, caller: given } = {}) {
  const caller = given ?? (speech ? { speech, precise: true } : callerSpeechOf(run, readWav));
  const agent = agentSpeechOf(run);
  return soundsOf(run).map((snd) => {
    const s = snd.t;
    const sinceCallerMs = s - lastEnd(caller.speech, s);
    const sinceFerniMs = s - lastEnd(agent, s);
    let place;
    if (inside(agent, s)) place = 'over-ferni';
    else if (inside(caller.speech, s)) place = 'mid-utterance';
    else if (sinceCallerMs <= INTO_SILENCE_MS) place = 'pause';
    else if (agent.some(([a]) => a > s && a - s <= REPLY_WITHIN_MS)) place = 'before-reply';
    else place = 'silence';
    return { ...snd, place, precise: caller.precise, sinceCallerMs, sinceFerniMs };
  });
}

const norm = (label) => (label ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Sounds whose label was heard already in the last REPEAT_WINDOW_MS. */
export function repeatsOf(placed) {
  return placed.filter((s, i) => {
    const key = norm(s.label);
    return (
      key && placed.slice(0, i).some((p) => norm(p.label) === key && s.t - p.t <= REPEAT_WINDOW_MS)
    );
  });
}

/** One run's sound counts for score.mjs. */
export function soundMetrics(placed) {
  const byKind = {};
  for (const s of placed) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  const reactions = Object.fromEntries(PLACES.map((p) => [p, 0]));
  for (const s of placed) if (REACTIONS.has(s.kind)) reactions[s.place]++;
  const precise = placed.every((s) => s.precise); // no sounds: none over them, either way
  return {
    total: placed.length,
    byKind,
    // Backchannels and laughs (and unlabelled side-track sounds) by where they landed.
    reactions,
    // Anything but a quiet-line hum or breath played with nobody talking or about to.
    intoSilence: placed.filter((s) => s.place === 'silence' && !QUIET_KINDS.has(s.kind)).length,
    // Only from mic phrases: the scripted turns can't tell a phrase pause from their words.
    overCaller: precise ? placed.filter((s) => s.place === 'mid-utterance').length : null,
    // Null without labels (sound_played before 2026-10-24, or backchannel_played only): unmeasured, not 0.
    repeats: placed.some((s) => s.label) ? repeatsOf(placed).length : null,
    repeatedLabels: [...new Set(repeatsOf(placed).map((s) => s.label))],
  };
}

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const VERB = {
  laugh: 'laughs',
  hum: 'hums',
  breath: 'breathes (a snore or yawn)',
  sigh: 'sighs',
  opener: 'makes an opening sound',
  sound: 'makes a short sound',
};

/** "[Ferni: mm-hm]", "[Ferni laughs: "Ha, laughter"]", with an optional context. */
export function soundMark(s, name = 'Ferni', context = '') {
  const said = s.label ? `"${s.label}"` : null;
  const what =
    s.kind === 'mm-hmm'
      ? `${name}: ${said ?? 'mm-hm'}`
      : `${name} ${VERB[s.kind] ?? 'makes a sound'}${said ? `: ${said}` : ''}`;
  return `[${what}${context ? `, ${context}` : ''}]`;
}

function contextOf(s, name) {
  const caller = Number.isFinite(s.sinceCallerMs)
    ? `${secs(s.sinceCallerMs)} after the caller stopped`
    : 'before the caller has spoken';
  if (s.place === 'over-ferni') return `over ${name}'s own speech`;
  if (s.place === 'before-reply') return `${caller}, just before ${name} replies`;
  const ferni =
    s.sinceFerniMs < s.sinceCallerMs ? `, ${secs(s.sinceFerniMs)} after ${name} stopped` : '';
  return s.place === 'silence' ? `into silence, ${caller}${ferni}` : caller;
}

/** Insert `mark` where the caption stood `at` (caption ms) in a turn's text. */
function insertAt(turn, at, mark) {
  const final = turn.text;
  const snap = [...turn.snaps].reverse().find((x) => x.t <= at)?.text ?? '';
  let i = 0;
  while (i < snap.length && i < final.length && snap[i] === final[i]) i++;
  // Never inside a word: a caption of "I teach 9" before "9th" was heard.
  if (i < final.length && final[i] !== ' ') i = final.lastIndexOf(' ', i) + 1;
  const head = final.slice(0, i).trimEnd();
  const tail = final.slice(i).trimStart();
  return [head, mark, tail].filter(Boolean).join(' ');
}

/**
 * Turns (humanness.turnsOf, with `snaps`) with Ferni's sounds woven in: inline
 * in the caller's turn when it played while they talked or in a short pause,
 * else a line of its own ({ who: 'sound' }) with what it played into.
 */
export function weaveSounds(turns, run, { name = 'Ferni', readWav, speech } = {}) {
  const caller = speech ? { speech, precise: true } : callerSpeechOf(run, readWav);
  const placed = placeSounds(run, { caller });
  const callerIvs = caller.speech;
  const agentIvs = agentSpeechOf(run);
  const users = turns.filter((t) => t.who === 'user');
  const inline = new Map(); // user turn -> [{ at, mark }]
  const lines = [];
  for (const s of placed) {
    const owner =
      (s.place === 'pause' || s.place === 'mid-utterance') &&
      users.filter((u) => u.t <= s.t + 2000).pop();
    if (owner) {
      // Captions trail the audio: shift by how late this turn's final caption came.
      const done = owner.snaps.find((x) => x.text === owner.text)?.t ?? owner.t;
      const end = lastEnd(callerIvs, done);
      const lag = Number.isFinite(end) ? Math.min(Math.max(done - end, 0), 2000) : 600;
      const over = s.place === 'mid-utterance' && s.precise ? 'over their words' : '';
      const list = inline.get(owner) ?? [];
      list.push({ at: s.t + lag, mark: soundMark(s, name, over) });
      inline.set(owner, list);
    } else lines.push({ who: 'sound', t: s.t, text: soundMark(s, name, contextOf(s, name)) });
  }
  // Ferni's captions come as each sentence ends: his turn starts at its first
  // speech after the turn before it was last captioned.
  const starts = new Map(
    turns.map((turn, i) => {
      const after = turns[i - 1]?.snaps.at(-1).t ?? -Infinity;
      const first = agentIvs.find(([a]) => a > after && a <= turn.t);
      return [turn, turn.who === 'agent' && first ? first[0] : turn.t];
    })
  );
  const out = turns.map((turn) => {
    const marks = inline.get(turn);
    const { snaps, ...rest } = turn;
    if (!marks) return { ...rest, start: starts.get(turn) };
    let text = turn.text;
    for (const m of [...marks].sort((a, b) => b.at - a.at))
      text = insertAt({ text, snaps }, m.at, m.mark);
    return { ...rest, text, start: starts.get(turn) };
  });
  for (const line of lines) {
    const i = out.findIndex((turn) => turn.who !== 'sound' && turn.start > line.t);
    out.splice(i < 0 ? out.length : i, 0, line);
  }
  return out.map(({ start, ...turn }) => turn);
}

/** soundMetrics of several runs, summed; overCaller null if any run couldn't measure it, repeats if none could. */
export function poolSoundMetrics(list) {
  const add = (a, b) => {
    for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
    return a;
  };
  const sum = (k) => list.reduce((n, m) => n + (m[k] ?? 0), 0);
  return {
    runs: list.length,
    total: sum('total'),
    byKind: list.reduce((a, m) => add(a, m.byKind), {}),
    reactions: list.reduce((a, m) => add(a, m.reactions), {}),
    intoSilence: sum('intoSilence'),
    overCaller: list.every((m) => m.overCaller !== null) ? sum('overCaller') : null,
    repeats: list.some((m) => m.repeats !== null) ? sum('repeats') : null,
    repeatedLabels: [...new Set(list.flatMap((m) => m.repeatedLabels))],
  };
}
