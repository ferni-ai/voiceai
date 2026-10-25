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
import { handoffGrounding } from './handoff-grounding.mjs';

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

// ownOpenerAnswer: on a return call the greeting asks about something from before,
// the caller only says hello ("Hey Ferni, it's me."), and Ferni's next line answers
// his own question as if he were the caller: "Yeah, I sent it over.", "She's
// managing", "My hands are still complaining" (dev sweep 2026-10-21, B2). A flag for
// a person to read, not proof: it looks at the first two sentences that aren't a hello.
const HELLO_ONLY = /^(?:(?:hey|hi|hello|oh|ferni|it'?s|me|again|just|i'?m|back|there)[\s,.!]*)+$/i;
const LEAD_IN =
  /^(?:(?:oh|ah|hey|hi|hello|well|heh|ha|haha|um+|uh+|man|so|and|right)\b[\s,.!—-]*)+/i;
const ANSWER_START =
  /^(?:yeah|yes|yep|yup|nope|nah|no\b|not (?:yet|bad|great|really|much)|i (?:did|didn'?t|sent|have|haven'?t|finally|got|made|managed|went)\b|it went|they went|they were|it was|she'?s|he'?s|they'?re|my\b)/i;
const TO_THEM = /\b(?:you|your|you're|yours)\b/i;
// Wondering aloud, or catching that it hasn't happened yet ("the interview isn't until Monday").
const NOT_AN_ANSWER =
  /\b(?:wonder(?:ing|ed)?|thinking|thought|remember|meant to ask|curious|jump(?:ing|ed)? the gun|(?:isn'?t|not) until)\b/i;
const stem = (w) => w.replace(/'s$/, '').replace(/(?:ing|ed|s)$/, '');
const topicWords = (s) =>
  new Set(
    words(s)
      .filter(
        (w) => w.length >= 4 && !/^(?:that|this|with|have|been|your|going|those|today)$/.test(w)
      )
      .map(stem)
  );

/** The greeting's question answered by Ferni himself; null when the call isn't that shape. */
export function ownOpenerAnswer(run) {
  const [greeting, caller, reply] = turnsOf(run, { greeting: true });
  if (!greeting?.greeting || caller?.who !== 'user' || reply?.who !== 'agent') return null;
  const asked = greeting.text.trim();
  if (!asked.endsWith('?') || !HELLO_ONLY.test(caller.text.trim())) return null;
  const topic = topicWords(asked);
  const sentences = reply.text
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(LEAD_IN, ''))
    .filter((s) => s && !/^[A-Z][a-z]+[.!,]?$/.test(s)); // "Hey Sam." leaves just the name
  let flagged = false;
  for (const s of sentences.slice(0, 2)) {
    if (s.endsWith('?')) break; // a re-ask or a question back
    if (TO_THEM.test(s) || NOT_AN_ANSWER.test(s)) continue;
    const shared = words(s).some((w) => topic.has(stem(w)));
    if (ANSWER_START.test(s) || (shared && words(s).length >= 6)) {
      flagged = true;
      break;
    }
  }
  return { asked, said: caller.text, reply: reply.text, flagged };
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
  const handoff = name.startsWith('handoff') ? handoffGrounding(run) : undefined;
  const opener = ownOpenerAnswer(run);
  return {
    stt,
    echo: echoCheck(run),
    ...(handoff ? { handoff } : {}),
    ...(opener ? { opener } : {}),
  };
}
