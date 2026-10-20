// Coaching-craft rubric for recorded calls (CRAFT.md §8, coaching-research-2026-10-20).
// Pure functions: turns with the persona who said them, the deterministic items,
// and the items scored from the LLM tagger's MITI codes (coach-tagger.mjs).
// COACH-RUBRIC.md says what each item means and where its threshold comes from.
import { sameUtterance } from './humanness.mjs';

// Coach personas get the full rubric. Alex and the finance mentors relax 1, 2
// and 6 (reported, not gated) and count 13 and 14 twice.
const RELAXED = new Set(['alex-chen', 'peter-john', 'peter-lynch', 'john-bogle', 'joel-dickson']);
export const applicabilityOf = (persona, item) =>
  RELAXED.has(persona)
    ? [1, 2, 6].includes(item)
      ? 'relaxed'
      : [13, 14].includes(item)
        ? 'weighted'
        : 'full'
    : 'full';

// "Alex is perfect for this. One moment." / "I'll bring in Maya." spoken by the
// persona handing off, though its caption can land after handoff_complete.
const ANNOUNCE =
  /\b(one moment|bring (?:in|over)|let me (?:get|grab|bring)|i'?ll (?:get|grab|bring)|(?:get|grab) (?:\S+ )?for you|perfect for this|hand(?:ing)? you)\b/i;
const firstName = (id) => id.split('-')[0];
const names = (text, id) =>
  new RegExp(`(?<![\\p{L}])${firstName(id)}(?![\\p{L}])`, 'iu').test(text);
// A new persona's opener can arrive just before handoff_complete (60732 vs 60844 ms, rc-main 2026-10-18).
const EARLY_OPENER_MS = 1000;

/** Handoffs that completed, in order: { startedAt, completedAt, from, to }. */
export function handoffsOf(run) {
  const out = [];
  let pending = null;
  for (const { t, payload: p } of run.data ?? []) {
    if (p?.type === 'handoff_started')
      pending = { startedAt: t, to: p.target, from: p.previousAgent };
    if (p?.type === 'handoff_failed') pending = null;
    if (p?.type === 'handoff_complete') {
      out.push({
        startedAt: pending?.startedAt ?? t,
        completedAt: t,
        from: p.from ?? pending?.from,
        to: p.target,
      });
      pending = null;
    }
  }
  return out;
}

/** Who was speaking for the agent at time t; text, when given, catches the handing-off persona's announcement. */
export function personaAt(run, t, text = null, handoffs = handoffsOf(run)) {
  const reset = (run.data ?? []).find((d) => d.payload?.type === 'state_reset')?.payload
    .activePersona;
  let persona = run.meta?.persona || reset || 'ferni';
  for (const h of handoffs) {
    if (t < h.completedAt - EARLY_OPENER_MS) break;
    persona = text && ANNOUNCE.test(text) && names(text, h.to) ? (h.from ?? persona) : h.to;
  }
  return persona;
}

/**
 * The call as turns: [{ n, who, persona, text, t, greeting? }]. Caller captions
 * arrive as growing partials, so each utterance keeps its longest form; separate
 * utterances in one caller turn are joined. Agent captions are discrete lines,
 * joined while the same persona keeps talking.
 */
export function coachTurns(run) {
  const handoffs = handoffsOf(run);
  const firstUserAt = run.userSpeech?.[0]?.[0] ?? 0;
  const turns = [];
  let segs = [];
  for (const e of run.events ?? []) {
    const text = (e.text ?? '').trim();
    if (!text) continue;
    const persona = personaAt(run, e.t, e.who === 'agent' ? text : null, handoffs);
    const last = turns[turns.length - 1];
    if (last && last.who === e.who && (e.who === 'user' || last.persona === persona)) {
      const prev = segs[segs.length - 1];
      if (text === prev || prev.startsWith(text)) continue;
      if (text.startsWith(prev) || (e.who === 'user' && sameUtterance(prev, text)))
        segs[segs.length - 1] = text;
      else segs.push(text);
      last.text = segs.join(' ');
      continue;
    }
    const turn = { n: turns.length + 1, who: e.who, persona, text, t: e.t };
    if (e.who === 'agent' && e.t <= firstUserAt) turn.greeting = true;
    turns.push(turn);
    segs = [text];
  }
  return turns;
}

const wordsOf = (t) =>
  t
    .replace(/<[^>]+>|\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (xs, p) =>
  xs.length
    ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]
    : null;
const round = (x, d = 2) =>
  x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d;

/** Questions in one turn: each sentence ending in "?", plus an ", or …?" tail stacked onto one. */
export function questionsIn(text) {
  const qs = text.match(/[^.?!]*\?/g) ?? [];
  const orTails = qs.filter((q) => /,\s*or\b[^,]*\?$/i.test(q.trim())).length;
  return { questions: qs.length + orTails, orTails };
}

// CRAFT.md §8 item 15, plus the stock validation lines score.mjs's THERAPIST pattern already flags.
export const STOCK_PHRASES = [
  'i hear you',
  "that's completely valid",
  "that's so valid",
  'that sounds really hard',
  'that sounds so hard',
  'holding space',
  "it's okay to feel",
  "it's ok to feel",
  'thank you for sharing',
  "i'm here for you",
  'that must be so hard',
  'that must be really hard',
];
// Generic and person-level praise (CRAFT.md §2.4; MITI: "Great job" is not an affirmation).
const PRAISE =
  /\b(great job|good job|well done|so proud of you|proud of you|good for you|you('ve)? got this|you('re| are) (amazing|awesome|incredible|a rock ?star)|(that's|that is|how) (amazing|awesome|incredible|fantastic|brilliant)|love that for you)\b|(^|[.!?]\s+)(amazing|awesome|incredible|fantastic|brilliant)[!.]/gi;

export const genericPraiseCount = (text) => (text.match(PRAISE) ?? []).length;

export function stockPhraseCounts(texts) {
  const counts = {};
  for (const p of STOCK_PHRASES) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const n = texts.reduce((acc, t) => acc + (t.replace(/’/g, "'").match(re) ?? []).length, 0);
    if (n) counts[p] = n;
  }
  return counts;
}

const overlaps = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Spoken time per persona from the audio (caller speech vs the agent's reply track). */
export function talkTime(run, handoffs = handoffsOf(run)) {
  const byPersona = {};
  const add = (p, k, ms) => {
    byPersona[p] ??= { userMs: 0, agentMs: 0 };
    byPersona[p][k] += ms;
  };
  for (const [s, e] of run.userSpeech ?? [])
    add(personaAt(run, s, null, handoffs), 'userMs', e - s);
  for (const track of (run.tracks ?? []).filter((t) => !/background/i.test(t.name))) {
    for (const [s, e] of track.voice ?? [])
      add(personaAt(run, s, null, handoffs), 'agentMs', e - s);
  }
  return byPersona;
}

/** Reply gaps and barge-ins per persona; replies that span a handoff are left out. */
export function timingOf(run, handoffs = handoffsOf(run)) {
  const out = {};
  const get = (p) => (out[p] ??= { gaps: [], userTurns: 0, bargeIns: 0 });
  const starts = (run.data ?? [])
    .filter((d) => d.payload?.type === 'handoff_started')
    .map((d) => d.t);
  for (const r of run.results ?? []) {
    if (typeof r.replyDelayMs !== 'number' || typeof r.userEndedAt !== 'number') continue;
    const at = r.userEndedAt + r.replyDelayMs;
    if (starts.some((t) => t >= r.userEndedAt && t <= at)) continue;
    get(personaAt(run, at, null, handoffs)).gaps.push(r.replyDelayMs);
  }
  // A barge-in is reply voice that starts while the caller is talking and runs
  // past a backchannel's length (score.mjs: BACKCHANNEL_MAX_MS 1500).
  const reply = (run.tracks ?? [])
    .filter((t) => !/background/i.test(t.name))
    .flatMap((t) => t.voice ?? []);
  for (const [s, e] of run.userSpeech ?? []) {
    const o = get(personaAt(run, s, null, handoffs));
    o.userTurns++;
    if (
      reply.some(
        ([vs, ve]) => vs > s + 300 && vs < e && ve - vs > 1500 && overlaps(vs, ve, s, e) > 0
      )
    )
      o.bargeIns++;
  }
  return out;
}

const item = (n, name, value, threshold, pass, persona, extra = {}) => ({
  item: n,
  name,
  value,
  threshold,
  status:
    pass === null
      ? 'N/A'
      : applicabilityOf(persona, n) === 'relaxed'
        ? 'RELAXED'
        : pass
          ? 'PASS'
          : 'FAIL',
  applicability: applicabilityOf(persona, n),
  ...extra,
});

/** Items 3, 6, 10 (praise half), 13, 14 and 15 for one persona's turns in one call. */
export function deterministicItems(persona, turns, { talk, timing } = {}) {
  const agent = turns.filter((t) => t.who === 'agent' && !t.greeting);
  const user = turns.filter((t) => t.who === 'user');
  const q = agent.map((t) => questionsIn(t.text));
  const oneQ = agent.length ? q.filter((x) => x.questions <= 1).length / agent.length : null;
  const words = agent.map((t) => wordsOf(t.text).length);
  const userWords = user.reduce((a, t) => a + wordsOf(t.text).length, 0);
  const agentWords = words.reduce((a, b) => a + b, 0);
  const timeShare =
    talk && talk.userMs + talk.agentMs > 0 ? talk.userMs / (talk.userMs + talk.agentMs) : null;
  const share = timeShare ?? (userWords + agentWords ? userWords / (userWords + agentWords) : null);
  const stock = stockPhraseCounts(agent.map((t) => t.text));
  const praise = agent.reduce((a, t) => a + genericPraiseCount(t.text), 0);
  const gaps = timing?.gaps ?? [];
  const p50 = median(gaps);
  const p95 = pct(gaps, 95);
  const bargeRate = timing?.userTurns ? timing.bargeIns / timing.userTurns : null;
  return [
    item(
      3,
      'one question per turn',
      round(oneQ),
      '>= 0.95 of turns',
      oneQ === null ? null : oneQ >= 0.95,
      persona,
      {
        orTails: q.reduce((a, x) => a + x.orTails, 0),
        stackedTurns: q.filter((x) => x.questions > 1).length,
      }
    ),
    item(
      6,
      'user talk share',
      round(share),
      '>= 0.60',
      share === null ? null : share >= 0.6,
      persona,
      {
        basis: timeShare !== null ? 'audio time' : 'word-share proxy',
      }
    ),
    item(
      13,
      'turn timing',
      { p50, p95, bargeInRate: round(bargeRate), n: gaps.length },
      'p50 200-800 ms, p95 < 1500 ms, barge-ins < 3%',
      p50 === null ? null : p50 >= 200 && p50 <= 800 && p95 < 1500 && (bargeRate ?? 0) < 0.03,
      persona
    ),
    item(
      14,
      'concise turns',
      { medianWords: median(words), over80: words.filter((w) => w > 80).length },
      'median <= 35 words, 0 turns > 80',
      words.length ? median(words) <= 35 && words.every((w) => w <= 80) : null,
      persona
    ),
    item(
      15,
      'stock empathy phrases',
      stock,
      'each <= 1 per call',
      agent.length ? Object.values(stock).every((n) => n <= 1) : null,
      persona
    ),
    {
      item: '10a',
      name: 'generic praise',
      value: praise,
      threshold: '<= 1 per call',
      status: agent.length ? (praise <= 1 ? 'PASS' : 'FAIL') : 'N/A',
    },
  ];
}

const REFLECT = ['SR', 'CR'];

/**
 * Items scored from the tagger for one persona's turns: tags = { [turnNumber]:
 * { codes, specificAffirm, evocative, summary, check, agreementMove } | { talk,
 * statesGoal, ownNextStep } }, call = { goalDiscussed }.
 */
export function taggedItems(persona, turns, tags, call = {}, { durationMs = 0, praise = 0 } = {}) {
  const agent = turns.filter((t) => t.who === 'agent').map((t) => ({ ...t, tag: tags[t.n] ?? {} }));
  const user = turns.filter((t) => t.who === 'user').map((t) => ({ ...t, tag: tags[t.n] ?? {} }));
  const codes = agent.flatMap((t) => t.tag.codes ?? []);
  const count = (c) => codes.filter((x) => x === c).length;
  const r = count('SR') + count('CR');
  const qn = count('Q');
  const rq = qn ? r / qn : r ? Infinity : null;
  const pcr = r ? count('CR') / r : null;
  const change = user.filter((t) => t.tag.talk === 'change').length;
  const sustain = user.filter((t) => t.tag.talk === 'sustain').length;
  const ctShare = change + sustain ? change / (change + sustain) : null;
  const evocative = agent.some((t) => t.tag.evocative);
  const firstUsers = user.slice(0, 3).map((t) => t.n);
  const lastFirst = firstUsers[firstUsers.length - 1] ?? Infinity;
  const agreement =
    user.slice(0, 3).some((t) => t.tag.statesGoal) ||
    agent.some((t) => t.n <= lastFirst + 1 && t.tag.agreementMove);
  const summaryCheck = agent.some((t) => t.tag.summary && t.tag.check);
  const specific = agent.some((t) => (t.tag.codes ?? []).includes('AF') && t.tag.specificAffirm);
  const nextStep = user.some((t) => t.tag.ownNextStep);
  const tagged = agent.some((t) => tags[t.n]);
  const v = (x) => (tagged ? x : null);
  return [
    item(
      1,
      'reflections : questions',
      v(rq === Infinity ? 'inf' : rq === null ? '0R:0Q' : round(rq)),
      '>= 1 floor, >= 2 target',
      v(rq === null ? false : rq >= 1),
      persona,
      { reflections: r, questions: qn, target: rq !== null && rq >= 2 }
    ),
    item(
      2,
      'complex reflections',
      v(round(pcr)),
      '>= 0.40 floor, >= 0.50 target',
      v(pcr === null ? null : pcr >= 0.4),
      persona
    ),
    item(
      4,
      'unpermitted advice (Persuade)',
      v(count('Persuade')),
      '0 per call',
      v(count('Persuade') === 0),
      persona,
      { withPermission: count('PwP') }
    ),
    item(
      5,
      'confront / moralize',
      v(count('Confront')),
      '0 per call',
      v(count('Confront') === 0),
      persona
    ),
    item(
      7,
      'session agreement in first 3 user turns',
      v(agreement),
      'present',
      v(user.length ? agreement : null),
      persona
    ),
    item(
      8,
      'change-talk share + evocative question',
      v({ changeShare: round(ctShare), change, sustain, evocative }),
      '>= 0.50 and >= 1 evocative question',
      v(ctShare === null ? null : ctShare >= 0.5 && evocative),
      persona
    ),
    item(
      9,
      'summary + check',
      v(summaryCheck),
      '>= 1 per call over 5 min',
      v(durationMs >= 5 * 60000 ? summaryCheck : null),
      persona,
      { callMinutes: round(durationMs / 60000, 1) }
    ),
    item(
      10,
      'specific affirmation, little generic praise',
      v({ specificAffirm: specific, genericPraise: praise }),
      '>= 1 specific AF and <= 1 generic praise',
      v(specific && praise <= 1),
      persona
    ),
    item(
      11,
      'person-authored next step',
      v(nextStep),
      'present when a goal was discussed',
      v(call.goalDiscussed ? nextStep : null),
      persona
    ),
  ];
}

/** Pool per-call segments of one persona: counts summed, per-call items pass only if every applicable call passes. */
export function poolItems(segments) {
  const byItem = new Map();
  for (const seg of segments)
    for (const it of seg.items) {
      if (!byItem.has(it.item)) byItem.set(it.item, []);
      byItem.get(it.item).push(it);
    }
  return [...byItem].map(([n, its]) => {
    const scored = its.filter((x) => x.status !== 'N/A');
    const passed = scored.filter((x) => x.status === 'PASS').length;
    const status = !scored.length
      ? 'N/A'
      : scored[0].status === 'RELAXED'
        ? 'RELAXED'
        : passed === scored.length
          ? 'PASS'
          : 'FAIL';
    return {
      item: n,
      name: its[0].name,
      threshold: its[0].threshold,
      status,
      calls: `${passed}/${scored.length}`,
      values: its.map((x) => x.value),
    };
  });
}

/** Weighted share of items passed (13 and 14 count twice where weighted; relaxed and N/A items are left out). */
export function weightedScore(items, persona) {
  let got = 0;
  let max = 0;
  for (const it of items) {
    if (it.status !== 'PASS' && it.status !== 'FAIL') continue;
    const w =
      typeof it.item === 'number' && applicabilityOf(persona, it.item) === 'weighted' ? 2 : 1;
    max += w;
    if (it.status === 'PASS') got += w;
  }
  return max ? round(got / max) : null;
}
