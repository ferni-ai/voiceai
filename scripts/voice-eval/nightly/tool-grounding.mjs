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
// degrees" (and 4 °C), "1:05" backs "an hour and five minutes" (and 65 minutes), "3.4" backs 3.
// Lexical, so it can miss a paraphrased invention; it can't pass a new number or proper name.
//
// usage: tool-grounding.mjs <run.json> <agent-log.jsonl>   (one call's log lines; prints JSON)
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** A tool whose output is information to relay (getWeather, searchWeb, findRestaurants...). */
export const isLookupTool = (name) => /^(?:get|search|find|lookup|check)[A-Z]/.test(name ?? '');

const UNITS =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' '
  );
const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Spoken numbers, minus zero and one (too common as words). "twenty twenty-eight" is 2028. */
function spokenNumbers(text) {
  const toks =
    text
      .toLowerCase()
      .replace(/-/g, ' ')
      .match(/[a-z]+/g) ?? [];
  const out = [];
  let prev = null; // the number that ended on the token before, for years
  for (let i = 0; i < toks.length; i++) {
    let v = null;
    if (toks[i] in TENS) {
      v = TENS[toks[i]];
      const u = UNITS.indexOf(toks[i + 1]);
      if (u >= 1 && u <= 9) ((v += u), i++);
    } else if (UNITS.indexOf(toks[i]) >= 2) v = UNITS.indexOf(toks[i]);
    if (v !== null && toks[i + 1] === 'hundred') ((v *= 100), i++);
    if (v === null) {
      prev = null;
      continue;
    }
    if (prev !== null && prev >= 10 && prev < 100 && v >= 10 && v < 100) {
      out.push(out.pop() * 100 + v); // a year said in two halves is one number
      prev = null;
      continue;
    }
    out.push(v);
    prev = v;
  }
  return out;
}

/** Every number a text states, with what its formatting makes derivable. */
export function numbersIn(text, { derive = false } = {}) {
  const s = String(text).replace(/(\d),(?=\d{3})/g, '$1');
  const out = new Set(spokenNumbers(s));
  for (const m of s.matchAll(/(?<![\d.])(\d{1,6})(?:\.(\d+))?(?!\d)/g)) {
    const v = Number(m[2] ? `${m[1]}.${m[2]}` : m[1]);
    out.add(Math.round(v));
    if (derive) out.add(Math.floor(v)).add(Math.ceil(v));
  }
  if (!derive) return out;
  for (const m of s.matchAll(/(\d{1,2}):(\d{2})(?!\d)/g)) out.add(Number(m[1]) * 60 + Number(m[2]));
  for (const m of s.matchAll(
    /(\d+)\s*(?:hours?|hrs?|h)\b\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b/gi
  ))
    out.add(Number(m[1]) * 60 + Number(m[2]));
  for (const m of s.matchAll(/(-?\d+(?:\.\d+)?)\s*°?\s*([FC])\b/g)) {
    const v = Number(m[1]);
    out.add(Math.round(m[2] === 'F' ? ((v - 32) * 5) / 9 : (v * 9) / 5 + 32));
  }
  return out;
}

// Capitalised words that are not entities: openers, pronouns, units, the team and the eval caller.
const STOP = new Set(
  `I I'm I'll I've I'd Ferni Sam Maya Jordan Alex Nayan Peter Okay Ok Oh Yeah Yes Hey Hi Hmm Well So
  And But Let Sure Nice Good Great That This It It's There Here What Want Do Does Did You Your If Or
  Is Are Just No Not Also Honestly Right Then Now Maybe Sounds Looks Alright Plus Anything Sorry Hope
  Totally Thanks Try Want The A An My We How Why When Where Which Who Wow Ah Mm Anyway Actually
  Celsius Fahrenheit`.split(/\s+/)
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

/** Capitalised runs ("Thai Orchid", "Congress Avenue"), skipping a sentence's own first word. */
export function namesIn(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.replace(/[*_"“”]/g, ' ').match(/[\p{L}][\p{L}\d'’&-]*/gu) ?? [];
    let run = [];
    words.concat(['x']).forEach((w, k) => {
      if (/^\p{Lu}/u.test(w) && !STOP.has(w) && k > 0) return void run.push(w);
      if (run.length) out.push(run.join(' '));
      run = [];
    });
  }
  return out;
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
 * every output is graded against every reply). Returns { turns, invented, details }: turns that
 * called a lookup tool, how many said something no output backs, and per turn what it said.
 */
export function gradeRun(run, tools) {
  const lookups = (tools ?? []).filter((o) => isLookupTool(o?.name));
  const events = finals((run?.events ?? []).map((e) => ({ ...e, text: String(e.text ?? '') })));
  const starts = (run?.userSpeech ?? []).map((s) => s[0]).sort((a, b) => a - b);
  const callerText = events
    .filter((e) => e.who === 'user')
    .map((e) => e.text)
    .join(' ');
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
    const toolText = outs
      .map((o) => (typeof o.output === 'string' ? o.output : JSON.stringify(o.output ?? '')))
      .join(' ');
    const backedNums = new Set([
      ...numbersIn(toolText, { derive: true }),
      ...numbersIn(callerText),
    ]);
    const backedWords = new Set(wordsOf(`${toolText} ${callerText}`));
    const invented = [
      ...[...numbersIn(reply)].filter((n) => !backedNums.has(n)),
      ...namesIn(reply).filter((name) =>
        wordsOf(name).some((w) => !CONNECTORS.has(w) && w.length > 1 && !backedWords.has(w))
      ),
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
