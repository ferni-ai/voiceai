// How human Ferni's turns read, measured on converse.mjs recordings and
// compared with published human conversation baselines (targets.json in
// ~/Documents/voiceai-evidence/human-baselines, sources in RESEARCH.md).
//
// A "turn" is everything one side says before the other speaks: consecutive
// agent captions are joined, and the caller's turn is their last caption
// (captions grow as they talk). The greeting is not a turn.
//
// Text patterns are deliberately plain-word and word-bounded (see
// substring-classifier-pitfalls): "now" must not match "know".
import { weaveSounds } from './sounds.mjs';

const DONT_KNOW =
  /\b(i don'?t know|i do not know|i'?m not (really )?sure|no idea|beats me|i dunno|i couldn'?t tell you)\b/i;
const OPINION =
  /\b(i think|i'd (say|go|pick|skip|probably)|i would (say|go|pick|skip)|i love|i like|i hate|i prefer|i'm not a fan|my take|if it were me|i reckon|i'd rather|personally)\b/i;
const DISAGREE =
  /\b(i disagree|i don'?t (think|agree) (so|that)|i'?m not (so )?sure (about that|that's|i agree)|i'd push back|not really|nah\b|i don'?t buy (it|that))\b/i;
// Self-repair: a dash restart, a correction marker, or a repeated word ("I, I").
const SELF_REPAIR =
  /[—–]|--|\b(i mean|wait,? no|or,? actually|well,? actually|let me put it|sorry,? i mean|what i meant)\b|\b([a-z']+),? \2\b/i;
// A goodbye that closes its sentence ("Take care, Sam."), as name-gate.ts reads one.
const CLOSING =
  /\b(?:bye(?:-bye)?|goodbye|good ?night|talk (?:to you )?(?:soon|later|tomorrow)|(?<!\bi )see (?:you|ya)(?: (?:soon|later|tomorrow|then|next time|around))?|take care(?: of yourself)?|(?:gotta|got to|have to|need to) (?:go|run|hop off)|catch you later|let you go)\s*(?:,\s*[\p{L}'’-]+\s*)?(?:[.!?…]|$)/iu;
const FILLED_PAUSE = /\b(uh|um|uhm|erm|er)\b/gi;
// Marks the voice rules ban or that read as broken text: a doubled comma
// ("Cats are,, I mean"), an ellipsis or a dash.
const MARKUP_ARTIFACT = /,\s*,|\.\.|…|[—–]/;
export const LAUGHTER = /\[laughter\]|\b(haha+|ha|heh|hah)\b/i;
// Ferni sharing something of its own life or view, not only asking.
const SELF_DISCLOSURE =
  /\b(i (was|went|got|had|used to|tried|made|did|spent|ended up|finally)|my (wife|day|week|morning|weekend|neighbou?r|dog|cat|coffee|garden|dad|mom|brother|sister|friend|kitchen))\b/i;
const STOP = new Set(
  'that this they them their with what have from about your just like been were when then there some would could should into only also very really going want know think yeah okay'.split(
    ' '
  )
);

const words = (t) =>
  t
    .toLowerCase()
    .replace(/<[^>]+>|\[[^\]]*\]/g, ' ')
    .match(/[a-z']+/g) ?? [];
const contentWords = (t) => new Set(words(t).filter((w) => w.length >= 5 && !STOP.has(w)));

const captionKey = (t) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether the next caption is the previous utterance growing ("I'm" → "I'm
 * 34.") or having its tail revised by STT, rather than a new utterance. A new
 * utterance restarts short ("I'm 34." → "I"), so a shared first letter is not
 * enough: the next caption must extend the previous one, or share at least
 * half of the longer of the two (prod 2026-10-23: "I teach 9th grade" erased
 * "I'm 34." and the judge never saw the caller's age).
 */
function sameUtterance(prev, next) {
  const a = captionKey(prev);
  const b = captionKey(next);
  if (!a || !b) return false;
  if (b.startsWith(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= Math.max(a.length, b.length) / 2;
}

// A caption this soon after a longer one it is the start of is an interim
// delivered out of order, not a new line: "That's all." then "That" 1 ms later.
// A real new line comes a second or more after the last caption (2026-10-23 runs).
const STALE_MS = 300;

function withoutStaleCaptions(events) {
  let prev = null;
  return events.filter((e) => {
    if (e.who !== 'user') {
      prev = null;
      return true;
    }
    const a = prev ? captionKey(prev.text) : '';
    const b = captionKey(e.text);
    const stale = prev && e.t - prev.t < STALE_MS && b.length < a.length && a.startsWith(b);
    if (!stale) prev = e;
    return !stale;
  });
}

/**
 * The call as alternating turns: [{ who: 'agent'|'user', text, t }].
 * What Ferni says before the caller speaks is dropped, since it would skew the
 * per-turn numbers; pass { greeting: true } to keep it as a turn marked
 * greeting (the judge needs it: COACH_FOLLOW_THROUGH asks its question there).
 * With { sounds: true } (or { sounds: { name, readWav, speech } }) Ferni's
 * non-speech sounds are woven in where they played (sounds.mjs weaveSounds):
 * inline as "[Ferni: mm-hm]", or as { who: 'sound' } lines.
 */
export function turnsOf(run, { greeting = false, sounds = false } = {}) {
  const firstUserAt = run.userSpeech?.[0]?.[0] ?? 0;
  const turns = [];
  let segs = []; // the current caller turn's separate utterances
  for (const e of withoutStaleCaptions(run.events ?? [])) {
    const isGreeting = e.who === 'agent' && e.t <= firstUserAt;
    if (isGreeting && !greeting) continue;
    const last = turns[turns.length - 1];
    if (last && last.who === e.who) {
      if (e.who === 'agent') last.text = `${last.text} ${e.text}`;
      else {
        // Caller captions grow in place, but two scripted lines in a row are
        // two utterances: "So, that was fun." must not erase "Oh, and Biscuit
        // chewed up my phone charger" (prod 2026-10-10).
        if (sameUtterance(segs[segs.length - 1], e.text)) segs[segs.length - 1] = e.text;
        else segs.push(e.text);
        last.text = segs.join(' ');
      }
      last.snaps?.push({ t: e.t, text: last.text });
    } else {
      turns.push(
        isGreeting
          ? { who: e.who, text: e.text, t: e.t, greeting: true }
          : { who: e.who, text: e.text, t: e.t }
      );
      segs = [e.text];
      if (sounds) turns[turns.length - 1].snaps = [{ t: e.t, text: e.text }];
    }
  }
  return sounds ? weaveSounds(turns, run, sounds === true ? {} : sounds) : turns;
}

const rate = (xs, f) =>
  xs.length ? Math.round((xs.filter(f).length / xs.length) * 100) / 100 : null;
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/** The caller's name as a capitalized word of its own ("Sam," yes; "Samantha" no; "will" is not "Will"). */
const nameIn = (name) =>
  new RegExp(`(?<![\\p{L}'])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}'])`, 'u');

/**
 * Humanness metrics pooled over one or more recorded runs. callerName is who
 * the eval calls as (run.sh: Sam): nameUseRate is the share of Ferni's turns
 * that say it. Friends say each other's name in about 1 turn in 75 (SBCSAE,
 * score-targets.json nameUseRate); Ferni said it in 16 of 24 on a prod call.
 */
export function computeHumanness(runs, { callerName = 'Sam' } = {}) {
  const agent = [];
  for (const run of runs) {
    const turns = turnsOf(run);
    // On a call the caller often says hello first: Ferni's first turn is then its hello.
    const greetedFirst = turnsOf(run, { greeting: true }).some((t) => t.greeting);
    let firstAgent = !greetedFirst;
    turns.forEach((turn, i) => {
      if (turn.who !== 'agent') return;
      const before = turns[i - 1]?.who === 'user' ? turns[i - 1].text : '';
      agent.push({ text: turn.text, before, hello: firstAgent });
      firstAgent = false;
    });
  }
  const lens = agent.map((a) => words(a.text).length);
  const totalWords = lens.reduce((a, b) => a + b, 0);
  const filled = agent.reduce((n, a) => n + (a.text.match(FILLED_PAUSE) ?? []).length, 0);
  return {
    turns: agent.length,
    wordsPerTurn: {
      p25: pct(lens, 25),
      p50: pct(lens, 50),
      p75: pct(lens, 75),
      p90: pct(lens, 90),
    },
    shortTurnShare3: rate(lens, (n) => n <= 3),
    shortTurnShare6: rate(lens, (n) => n <= 6),
    questionEndRate: rate(agent, (a) => /\?\s*$/.test(a.text)),
    questionAnyRate: rate(agent, (a) => /\?/.test(a.text)),
    dontKnowRate: rate(agent, (a) => DONT_KNOW.test(a.text)),
    opinionRate: rate(agent, (a) => OPINION.test(a.text)),
    disagreeRate: rate(agent, (a) => DISAGREE.test(a.text)),
    selfRepairRate: rate(agent, (a) => SELF_REPAIR.test(a.text)),
    filledPausesPer100Words: totalWords ? Math.round((filled / totalWords) * 1000) / 10 : null,
    laughterRate: rate(agent, (a) => LAUGHTER.test(a.text)),
    // Hello and goodbye aside (name-gate.ts keeps the name there; the SBCSAE
    // target is mid-conversation talk).
    nameUseRate: callerName
      ? rate(
          agent.filter((a) => !a.hello && !CLOSING.test(a.text) && !CLOSING.test(a.before)),
          (a) => nameIn(callerName).test(a.text)
        )
      : null,
    markupArtifactRate: rate(agent, (a) => MARKUP_ARTIFACT.test(a.text)),
    selfDisclosureRate: rate(agent, (a) => SELF_DISCLOSURE.test(a.text)),
    // Picks up one of the caller's own content words, the way people echo.
    echoRate: rate(
      agent.filter((a) => a.before),
      (a) => {
        const theirs = contentWords(a.before);
        return [...contentWords(a.text)].some((w) => theirs.has(w));
      }
    ),
  };
}

/**
 * Each metric against its human target: { value, min, max, ok }. A target is
 * { min?, max? }; metrics without a target are left out.
 */
export function compareToTargets(metrics, targets) {
  const out = {};
  for (const [key, t] of Object.entries(targets)) {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), metrics);
    if (typeof v !== 'number') continue;
    const ok = (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max);
    out[key] = { value: v, min: t.min ?? null, max: t.max ?? null, ok };
  }
  return out;
}
