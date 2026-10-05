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

const DONT_KNOW =
  /\b(i don'?t know|i do not know|i'?m not (really )?sure|no idea|beats me|i dunno|i couldn'?t tell you)\b/i;
const OPINION =
  /\b(i think|i'd (say|go|pick|skip|probably)|i would (say|go|pick|skip)|i love|i like|i hate|i prefer|i'm not a fan|my take|if it were me|i reckon|i'd rather|personally)\b/i;
const DISAGREE =
  /\b(i disagree|i don'?t (think|agree) (so|that)|i'?m not (so )?sure (about that|that's|i agree)|i'd push back|not really|nah\b|i don'?t buy (it|that))\b/i;
// Self-repair: a dash restart, a correction marker, or a repeated word ("I, I").
const SELF_REPAIR =
  /[—–]|--|\b(i mean|wait,? no|or,? actually|well,? actually|let me put it|sorry,? i mean|what i meant)\b|\b([a-z']+),? \2\b/i;
const FILLED_PAUSE = /\b(uh|um|uhm|erm|er)\b/gi;
const LAUGHTER = /\[laughter\]|\b(haha+|ha|heh|hah)\b/i;
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

/** The call as alternating turns: [{ who: 'agent'|'user', text, t }], greeting dropped. */
export function turnsOf(run) {
  const firstUserAt = run.userSpeech?.[0]?.[0] ?? 0;
  const turns = [];
  for (const e of run.events ?? []) {
    if (e.who === 'agent' && e.t <= firstUserAt) continue; // greeting
    const last = turns[turns.length - 1];
    if (last && last.who === e.who) {
      // Caller captions grow in place; agent captions are separate segments.
      last.text = e.who === 'user' ? e.text : `${last.text} ${e.text}`;
    } else {
      turns.push({ who: e.who, text: e.text, t: e.t });
    }
  }
  return turns;
}

const rate = (xs, f) =>
  xs.length ? Math.round((xs.filter(f).length / xs.length) * 100) / 100 : null;
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/** Humanness metrics pooled over one or more recorded runs. */
export function computeHumanness(runs) {
  const agent = [];
  for (const run of runs) {
    const turns = turnsOf(run);
    turns.forEach((turn, i) => {
      if (turn.who !== 'agent') return;
      const before = turns[i - 1]?.who === 'user' ? turns[i - 1].text : '';
      agent.push({ text: turn.text, before });
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
