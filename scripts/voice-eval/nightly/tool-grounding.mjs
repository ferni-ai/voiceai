#!/usr/bin/env node
// Tool grounding: on a turn that called a lookup tool, every number and name Ferni says must be
// in that turn's tool output (or the caller's own words). A number or name from neither is
// invented: a restaurant the search never returned, a temperature the weather tool didn't give,
// a drive time quoted after the search came back empty. The 2026-10-30 dev sweep found that
// nothing in the nightly graded a reply against tool output (e2e-house-sweep-2026-10-30.md);
// this ports its grade.py.
//
// Tool output comes from the agent's "FUNCTION TOOLS EXECUTED" log line
// (event.functionCallOutputs[]), which analyze.py keeps per call as summary.json tool_outputs
// with atMs (agent clock minus run.wallT0), so each output is graded against the reply of the
// caller turn it ran in. Formatting is matched, not guessed at: "39°F" backs "thirty-nine
// degrees" (and 4 °C), "1:05" backs "an hour and five minutes", 19:00 backs "seven PM", 534
// minutes backs "nine hours", 10:30 backs "ten thirty", a 3-item list backs "three", an ISO date
// backs its weekday, and a hedged number ("about forty") may be within 5%. Nothing is skipped:
// a remembered fact is backed by the caller's words or a seeded call's, never by "you told me".
// Lexical, so the nightly reports it only (capabilities.json tool-grounding, never exit 1). What it
// can't catch yet is in TOOL_GROUNDING_KNOWN_GAPS.md; a model-judge check is the path to blocking.
//
// usage: tool-grounding.mjs <run.json> <agent-log.jsonl>   (one call's log lines; prints JSON)
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** A tool whose output is information to relay (getWeather, searchWeb, findRestaurants...). */
export const isLookupTool = (name) => /^(?:get|search|find|lookup|check)[A-Z]/.test(name ?? '');

const SMALL =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' '
  );
const TENS = Object.fromEntries(
  'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ').map((w, i) => [w, 20 + i * 10])
);
const isNumberWord = (w) => SMALL.includes(w) || w in TENS;
const isScale = (w) => w === 'hundred' || w === 'thousand';

/** One run of number words as numbers: "nine hundred and sixty" 960, "twenty twenty-eight" 2028. */
function parseRun(words) {
  const out = [];
  let [total, cur, prev, big] = [0, 0, null, false];
  const flush = () => {
    if (prev) out.push({ v: total + cur, big });
    [total, cur, prev, big] = [0, 0, null, false];
  };
  for (const w of words) {
    if (w === 'and') continue;
    if (isScale(w)) {
      if (w === 'hundred') cur = (cur || 1) * 100;
      else [total, cur] = [total + (cur || 1) * 1000, 0];
      [prev, big] = ['H', true];
      continue;
    }
    const v = w === 'a' ? 1 : (TENS[w] ?? SMALL.indexOf(w));
    const kind = v < 10 ? 'u' : v < 20 ? 't' : 'T';
    if (prev === 'u' || prev === 't' || (prev === 'T' && kind !== 'u')) flush(); // "eight thirty"
    [cur, prev] = [cur + v, kind];
  }
  flush();
  // Two halves are one number: a year ("twenty twenty-eight"), a time ("ten thirty", "seven
  // fifteen"), a price ("twelve fifty", "one eighty-nine"). The tool side derives the same forms.
  if (out.length === 2 && !out[0].big && !out[1].big && out[0].v >= 1 && out[1].v >= 10)
    if (out[0].v < 100 && out[1].v < 100) return [out[0].v * 100 + out[1].v];
  return out.filter((n) => n.big || n.v > 1).map((n) => n.v); // a lone "one" is a word, not data
}

/** Spoken numbers in text, a run of number words at a time; punctuation ends a run. */
function spokenNumbers(text) {
  if (/[,.;:!?]/.test(text)) return text.split(/[,.;:!?]+/).flatMap(spokenNumbers);
  const t =
    text
      .toLowerCase()
      .replace(/-/g, ' ')
      .match(/[a-z]+/g) ?? [];
  const out = [];
  let run = [];
  t.forEach((w, i) => {
    const joins =
      isNumberWord(w) ||
      (isScale(w) && run.length) ||
      (w === 'a' && isScale(t[i + 1])) ||
      (w === 'and' && run.some(isScale) && isNumberWord(t[i + 1]));
    if (joins) return void run.push(w);
    out.push(...parseRun(run));
    run = [];
  });
  return [...out, ...parseRun(run)];
}

/** How many items each JSON list in a tool output holds ("I found three" for a 3-item list). */
function listCounts(text) {
  const counts = [];
  const walk = (v) => {
    if (Array.isArray(v)) counts.push(v.length);
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
    if (typeof v === 'string' && /^\s*[[{]/.test(v)) walk(parse(v));
  };
  const parse = (v) => {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  walk(parse(text));
  return counts;
}

/** Every number a text states, with what its formatting makes derivable. */
export function numbersIn(text, { derive = false } = {}) {
  const s = String(text).replace(/(\d),(?=\d{3})/g, '$1');
  const out = new Set(spokenNumbers(s));
  const add = (...vs) => vs.forEach((v) => Number.isFinite(v) && out.add(Math.round(v)));
  for (const m of s.matchAll(/(?<![\d.])(\d{1,6})(?:\.(\d+))?(?!\d)/g)) {
    const v = Number(m[2] ? `${m[1]}.${m[2]}` : m[1]);
    add(v);
    if (derive) add(Math.floor(v), Math.ceil(v));
  }
  if (!derive) return out;
  const each = (re, f) => [...s.matchAll(re)].forEach((m) => add(...f(m.slice(1).map(Number), m)));
  each(/(\d{1,2}):(\d{2})(?!\d)/g, ([h, m]) => [
    h * 60 + m,
    h % 12 || 12, // 19:00 is "seven"
    h + m / 60,
    h * 100 + m, // 10:30 is "ten thirty"
    (h % 12 || 12) * 100 + m, // 20:15 is "eight fifteen"
  ]);
  each(/(\d+)\.(\d{2})(?!\d)/g, ([d, c]) => [d * 100 + c]); // $12.50 is "twelve fifty"
  each(/(\d{1,2})(?::\d{2})?\s*p\.?m\b/gi, ([h]) => [h + 12]); // 7pm is 19
  each(/(\d+)\s*(?:hours?|hrs?|h)\b\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b/gi, ([h, m]) => [
    h * 60 + m,
  ]);
  each(/(\d+)\s*(?:minutes?|mins?)\b/gi, ([m]) => [m / 60, Math.floor(m / 60)]); // 534 min, 9 hours
  each(/(\d+)\s*(?:hours?|hrs?)\b/gi, ([h]) => [h * 60]);
  each(/(\d+(?:\.\d+)?)\s*(km|kilomet)/gi, ([v]) => [v / 1.609]);
  each(/(\d+(?:\.\d+)?)\s*(mi\b|miles?)/gi, ([v]) => [v * 1.609]);
  each(/(-?\d+(?:\.\d+)?)\s*°?\s*([FC])\b/g, ([v], m) => [
    m[2] === 'F' ? ((v - 32) * 5) / 9 : (v * 9) / 5 + 32,
  ]);
  add(...listCounts(s));
  return out;
}

/** A price's cents and a duration's minutes past the hour back a number only in that same form:
 *  $12.95 backs "twelve dollars and ninety-five cents", never "ninety-five reviews"; 95 minutes
 *  backs "an hour and thirty-five minutes", never "thirty-five awards". */
const partsOf = (text) => ({
  cents: [...String(text).matchAll(/\d\.(\d{2})(?!\d)/g)].map((m) => Number(m[1])),
  minutes: [...String(text).matchAll(/(\d+)\s*(?:minutes?|mins?)\b/gi)].map((m) => m[1] % 60),
});
const partsSaid = (text, unit) =>
  new Set(
    [
      ...String(text).matchAll(new RegExp(`((?:[\\w-]+\\s+){1,3})${unit}\\b`, 'gi')),
      // cents as the one word after the dollars: "a dollar ninety-five" ("and" means "cents" follows)
      ...(unit === 'cents' ? String(text).matchAll(/\bdollars?\s+([\w-]+)/gi) : []),
    ].flatMap((m) => [...numbersIn(m[1])])
  );

const isNumberToken = (t) =>
  /^\d[\d.,:]*$/.test(t) ||
  (/^[a-z-]+$/i.test(t) &&
    t
      .toLowerCase()
      .split('-')
      .every((p) => isNumberWord(p) || isScale(p)));
/** The number said straight after a hedge ("about forty", "around a hundred", "~40", or the
 *  minutes of "about an hour and fifty minutes"). "around flight 1530" and "about the 1530" hedge
 *  nothing. Each hedge is read on its own (a lookahead), so a second hedge counts too. */
const hedgedNumbers = (text) =>
  new Set(
    [
      ...String(text).matchAll(
        /(?:\b(?:about|around|roughly|nearly|almost|approximately)\b|~)(?=\s*([^.;:!?]{1,60}))/gi
      ),
    ].flatMap((m) => {
      const t = m[1].split(/[\s,]+/).filter(Boolean);
      // "about an hour and fifty minutes": the hedge carries over the hours to the minutes.
      const lead = /^(?:a|an|\S+)\s+hours?(?:\s+and)?$/i.test(t.slice(0, 3).join(' '))
        ? 3
        : /^(?:a|an|\S+)\s+hours?$/i.test(t.slice(0, 2).join(' '))
          ? 2
          : 0;
      let i = lead && (lead === 2 || /^(?:a|an)$/i.test(t[0]) || isNumberToken(t[0])) ? lead : 0;
      const run = [];
      for (; i < t.length; i++) {
        const w = t[i].toLowerCase();
        const joins =
          isNumberToken(w) ||
          (w === 'a' && !run.length && isScale(t[i + 1]?.toLowerCase())) ||
          (w === 'and' && run.length && isNumberToken(t[i + 1] ?? ''));
        if (!joins) break;
        run.push(w);
      }
      return run.length ? [...numbersIn(run.join(' '))].slice(0, 1) : [];
    })
  );
/** Backed when the tool or caller said it; a hedged number may be within 5% of one. Never an
 *  unhedged number: "UA 1523" against "UA 1549" is an invented flight, not a rounding. */
const backedNumber = (n, backed, hedged) =>
  backed.has(n) ||
  (hedged.has(n) && [...backed].some((b) => b >= 20 && Math.abs(n - b) <= 0.05 * b));

// Capitalised words that are not entities: openers, pronouns, units, times of day, the team and
// the eval caller (EVAL_CALLER_NAME, as score.mjs reads it).
const STOP = new Set(
  `I I'm I'll I've I'd Ferni Sam Maya Jordan Alex Nayan Peter Okay Ok Oh Yeah Yes Hey Hi Hmm Well So
  And But Let Sure Nice Good Great That This It It's There Here What Want Do Does Did You Your If Or
  Is Are Just No Not Also Honestly Right Then Now Maybe Sounds Looks Alright Plus Anything Sorry Hope
  Totally Thanks Try Want The A An My We How Why When Where Which Who Wow Ah Mm Anyway Actually
  Celsius Fahrenheit Today Tonight Tomorrow Yesterday AM PM ${process.env.EVAL_CALLER_NAME ?? ''}`
    .split(/\s+/)
    .filter(Boolean)
);
const WEEKDAYS = 'sunday monday tuesday wednesday thursday friday saturday'.split(' ');
const MONTHS =
  'january february march april may june july august september october november december'.split(
    ' '
  );
// Sentence-first subjects that are never names ("Everything is...", "Nothing was...").
const OPENERS = new Set(
  'i you he she we they it this that there here what which who one everything nothing something someone everyone each all both none traffic weather'.split(
    ' '
  )
);
const ABBR = Object.fromEntries(
  `st:street ave:avenue rd:road blvd:boulevard dr:drive ln:lane hwy:highway mt:mount mon:monday
  tue:tuesday wed:wednesday thu:thursday fri:friday sat:saturday sun:sunday jan:january
  feb:february mar:march apr:april jun:june jul:july aug:august sep:september oct:october
  nov:november dec:december 1st:first 2nd:second 3rd:third 4th:fourth 5th:fifth 6th:sixth
  7th:seventh 8th:eighth 9th:ninth 10th:tenth`
    .split(/\s+/)
    .map((pair) => pair.split(':'))
);
const CONNECTORS = new Set(['of', 'the', 'and', 'de', 'la', 'del', 'on', 'at']);
/** Lower-case words, abbreviations spelled out and possessives dropped. */
const wordsOf = (text) =>
  (
    String(text)
      .toLowerCase()
      .replace(/['’]s\b/g, '')
      .match(/[\p{L}\d]+/gu) ?? []
  ).map((w) => ABBR[w] ?? w);

/** Words a text backs: its own, and the weekday of each ISO date in it. */
const backingWords = (text) =>
  new Set([
    ...wordsOf(text),
    ...[...String(text).matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(
      (m) => WEEKDAYS[new Date(`${m[1]}T12:00:00Z`).getUTCDay()]
    ),
  ]);
/** A name's capitalised words, spelled out ("Fahrenheit-wise" is Fahrenheit, a unit). */
const nameWords = (name) =>
  name
    .split(/[\s-]+/)
    .filter((p) => /^\p{Lu}/u.test(p) && !STOP.has(p))
    .flatMap(wordsOf)
    .filter((w) => !CONNECTORS.has(w) && w.length > 1);
/** Backed as said, or as its singular or plural ("Australians" by "Australian"). */
const backedWord = (w, words) =>
  [w, w.replace(/e?s$/, ''), w.replace(/s$/, ''), `${w}s`].some((x) => words.has(x));

/** Capitalised runs ("Thai Orchid", "Congress Avenue"). A sentence's first word counts when it is
 *  a weekday or month ("Thursday at ten is..."), or the subject of "is/are/was/has" and not a
 *  common opener ("Nopalito is a great pick."). */
export function namesIn(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.replace(/[*_"“”]/g, ' ').match(/[\p{L}][\p{L}\d'’&-]*/gu) ?? [];
    let run = [];
    words.concat(['x']).forEach((w, k) => {
      const lower = wordsOf(w)[0] ?? '';
      const subject = !OPENERS.has(lower) && /^(?:is|are|was|were|has|have)$/i.test(words[1] ?? '');
      const first = WEEKDAYS.includes(lower) || MONTHS.includes(lower) || subject;
      const name = /^\p{Lu}/u.test(w) && !STOP.has(w) && (k > 0 || first);
      if (name) return void run.push(w);
      if (run.length) out.push(run.join(' '));
      run = [];
    });
  }
  return out;
}

/** A run's caller lines, final captions only. */
const callerLines = (run) =>
  finals((run?.events ?? []).map((e) => ({ ...e, text: String(e.text ?? '') })))
    .filter((e) => e.who === 'user')
    .map((e) => e.text)
    .join(' ');

/**
 * The nightly metric (capabilities.json tool-grounding.invented-data, report only): calls with a
 * lookup turn that said
 * something nothing backs. Only calls with analyze.py's tool_outputs measure anything; a seeded
 * call's seed run is the caller's known history.
 */
export function nightGrounding(runs) {
  const g = runs
    .filter((r) => r.run && Array.isArray(r.summary?.tool_outputs))
    .map((r) => gradeRun(r.run, r.summary.tool_outputs, { context: callerLines(r.seed) }))
    .filter((x) => x.turns);
  return { value: g.length ? g.filter((x) => x.invented).length : null, n: g.length };
}

/** Only the final caption of a line that grew ("Let" then "Let me look."). */
function finals(events) {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.who === e.who && e.text.startsWith(last.text)) out[out.length - 1] = e;
    else out.push(e);
  }
  return out;
}

/**
 * Grade one run. tools: [{ name, isError, output, atMs }] (atMs from run.wallT0; without it,
 * every output is graded against every reply). context: what else the caller is known to have
 * said (a seeded call's caller lines, which memory recall can repeat). Returns { turns, invented,
 * details }: turns that called a lookup tool, how many said something nothing backs, and per
 * turn what it said.
 */
export function gradeRun(run, tools, { context = '' } = {}) {
  const lookups = (tools ?? []).filter((o) => isLookupTool(o?.name));
  const events = finals((run?.events ?? []).map((e) => ({ ...e, text: String(e.text ?? '') })));
  const starts = (run?.userSpeech ?? []).map((s) => s[0]).sort((a, b) => a - b);
  const callerText = `${callerLines(run)} ${context}`;
  const turns = new Map(); // turn start -> outputs
  for (const o of lookups) {
    const at = Number.isFinite(o.atMs) && starts.length ? o.atMs : null;
    const start = at === null ? -Infinity : (starts.filter((s) => s <= at).pop() ?? starts[0]);
    turns.set(start, [...(turns.get(start) ?? []), o]);
  }
  const details = [];
  for (const [start, outs] of turns) {
    const end = Number.isFinite(start) ? (starts.find((s) => s > start) ?? Infinity) : Infinity;
    const from = Number.isFinite(start) ? start : (starts[0] ?? -Infinity);
    const reply = events
      .filter((e) => e.who === 'agent' && e.t >= from && e.t < end)
      .map((e) => e.text)
      .join(' ');
    const said = events
      .filter((e) => e.who === 'user' && e.t >= from && e.t < end)
      .map((e) => e.text)
      .join(' ');
    const texts = outs.map((o) =>
      typeof o.output === 'string' ? o.output : JSON.stringify(o.output ?? '')
    );
    const nums = new Set([
      ...texts.flatMap((t) => [...numbersIn(t, { derive: true })]),
      ...numbersIn(callerText),
    ]);
    const words = backingWords(`${texts.join(' ')} ${callerText}`);
    const hedged = hedgedNumbers(reply);
    const parts = texts.map(partsOf);
    const part = (n, unit) =>
      parts.some((p) => p[unit].includes(n)) &&
      partsSaid(reply, unit === 'cents' ? 'cents' : 'minutes?').has(n);
    const invented = [
      ...[...numbersIn(reply)].filter(
        (n) => !backedNumber(n, nums, hedged) && !part(n, 'cents') && !part(n, 'minutes')
      ),
      ...namesIn(reply).filter((name) => nameWords(name).some((w) => !backedWord(w, words))),
    ];
    details.push({ tools: outs.map((o) => o.name), question: said, reply, invented });
  }
  return {
    turns: details.length,
    invented: details.filter((d) => d.invented.length).length,
    details,
  };
}

/** Tool outputs from one call's agent log lines (JSON, or text with JSON after a prefix). */
export function toolOutputsFromLog(lines, wallT0) {
  const out = [];
  for (const line of lines) {
    let j;
    try {
      j = typeof line === 'string' ? JSON.parse(line.slice(line.indexOf('{'))) : line;
    } catch {
      continue; // a plain-text log line
    }
    if (j?.event?.type !== 'function_tools_executed') continue;
    for (const o of j.event.functionCallOutputs ?? []) {
      const atMs = Number.isFinite(j.time) && Number.isFinite(wallT0) ? j.time - wallT0 : undefined;
      out.push({ name: o.name, isError: o.isError === true, output: o.output, atMs });
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [runFile, logFile] = process.argv.slice(2);
  if (!runFile || !logFile) {
    console.error('usage: tool-grounding.mjs <run.json> <agent-log.jsonl>');
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(runFile, 'utf8'));
  const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const g = gradeRun(run, toolOutputsFromLog(lines, run.wallT0));
  console.log(JSON.stringify(g, null, 2));
  process.exit(g.invented ? 1 : 0);
}
