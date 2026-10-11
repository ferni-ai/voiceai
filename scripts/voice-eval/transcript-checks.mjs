// Checks on a recorded call's captions that hold for WebRTC and phone runs alike.
//
// sttAccuracy: how well the agent heard the caller. The caller's lines are
//   scripted, so the agent's captions of them (lk.transcription, who: 'user')
//   are scored against the script as word error rate.
// echoCheck: the agent hearing itself. Over a phone line the agent's own voice
//   can come back as "caller" speech and cut its reply off (a false barge-in).
//   Caller captions while the scripted caller was silent are that echo; an agent
//   line cut mid-sentence right before one is the barge-in it caused.
import { readFileSync } from 'node:fs';
import { turnsOf } from './humanness.mjs';

/** The spoken words of a scenario file, in order (no comments, data, or say tags). */
export function scriptLines(text) {
  return text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('@data'))
    .map((l) =>
      l
        .replace(/^@\w+ \d+ /, '')
        .replace(/\[\[[^\]]*\]\]/g, ' ')
        .trim()
    );
}

const words = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Word-level edit distance between reference and hypothesis. */
export function wordErrorRate(ref, hyp) {
  const r = words(ref);
  const h = words(hyp);
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  const edits = prev[h.length];
  return {
    edits,
    refWords: r.length,
    wer: r.length ? Math.round((edits / r.length) * 1000) / 1000 : null,
  };
}

/** WER of the agent's captions of the caller against the scenario script. */
export function sttAccuracy(run, lines) {
  const heard = turnsOf({ ...run, userSpeech: [] })
    .filter((t) => t.who === 'user')
    .map((t) => t.text)
    .join(' ');
  return { ...wordErrorRate(lines.join(' '), heard), heard };
}

/** Caller captions while the scripted caller was silent, and agent lines they cut. */
export function echoCheck(run, { afterMs = 3000 } = {}) {
  const speech = run.userSpeech ?? [];
  const firstUserAt = speech[0]?.[0] ?? 0;
  const talking = (t) => speech.some(([s, e]) => t >= s - 500 && t <= e + afterMs);
  const events = (run.events ?? []).filter((e) => e.t > firstUserAt);
  const phantoms = events.filter((e) => e.who === 'user' && !talking(e.t));
  let selfInterruptions = 0;
  events.forEach((e, i) => {
    const next = events[i + 1];
    if (e.who === 'agent' && !/[.!?…"')\]]\s*$/.test(e.text) && next && phantoms.includes(next)) {
      selfInterruptions++;
    }
  });
  return {
    phantomCallerCaptions: phantoms.length,
    selfInterruptions,
    phantoms: phantoms.map((e) => e.text),
  };
}

/** Both checks for a run whose meta names its scenario; null when it can't be found. */
export function checksFor(run, scenarioDir) {
  const name = run.meta?.scenario;
  if (!name) return null;
  let text;
  try {
    text = readFileSync(`${scenarioDir}/${name}.txt`, 'utf8');
  } catch {
    return null;
  }
  const { heard: _heard, ...stt } = sttAccuracy(run, scriptLines(text));
  return { stt, echo: echoCheck(run) };
}
