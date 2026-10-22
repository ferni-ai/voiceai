#!/usr/bin/env node
// Realistic caller (README "Realistic callers"): rewrite a scripted line the way people talk, before
// TTS, per a caller-personas.json persona. Pauses are [[slnc N]]: `say` reads it as silence,
// caller-tts.mjs splices real silence in.
// usage:
//   caller-realism.mjs check <persona>                 prints the default Cartesia voice; exit 2 if unknown
//   caller-realism.mjs line <persona> <seed> <say|cartesia> <text...>   prints the line to render
//   caller-realism.mjs clip <scenario> <turn>          prints the human take for that turn, if any
//     VOICE_EVAL_HUMAN_CLIPS=<dir> with <dir>/manifest.json: {"<scenario>": {"<turn>": "take.wav"}},
//     turn = the scripted line's number (run.sh's t<turn>.pcm). Recorded takes only: never call audio.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { rng } from './judge-stats.mjs';

export const PERSONAS_FILE = new URL('./caller-personas.json', import.meta.url);
export const loadPersonas = (file = PERSONAS_FILE) => JSON.parse(readFileSync(file, 'utf8'));

/** FNV-1a: the same scenario, turn and persona always render the same line. */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
  return h;
}

/** A scenario's own caller: "#@caller trailing-thinker". */
export const callerDirective = (scenarioText) =>
  scenarioText.match(/^#@caller[ \t]+([\w-]+)/m)?.[1] ?? '';

const SLNC = /\[\[slnc (\d+)\]\]/g;
const ENDS_SENTENCE = /[.!?…]["')]?$/;
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const between = (r, [lo, hi]) => Math.round((lo + r() * (hi - lo)) / 10) * 10;

/**
 * One scripted line as this persona says it: { text, pauses: [ms of each injected pause], speed }.
 * text keeps the line's own [[slnc N]] pauses and adds the injected ones.
 */
export function realizeLine(line, persona, seed) {
  const r = rng(hashSeed(seed));
  const speed = Math.round((persona.rate[0] + r() * (persona.rate[1] - persona.rate[0])) * 100) / 100;
  const toks = line.replace(SLNC, ' \u0000$1 ').trim().split(/\s+/);
  const isPause = (t) => t?.startsWith('\u0000');
  const words = toks.filter((t) => !isPause(t)).length;
  const back = (ts) => ts.join(' ').replace(/\u0000(\d+)/g, '[[slnc $1]]');
  if (words < persona.minWords) return { text: back(toks), pauses: [], speed };

  // Boundaries after token i with 2+ words either side, mid-sentence, not next to a pause.
  const open = [];
  for (let i = 1; i < toks.length - 2; i++)
    if (!ENDS_SENTENCE.test(toks[i]) && !isPause(toks[i]) && !isPause(toks[i + 1])) open.push(i);
  let n = r() < persona.pause ? 1 : 0;
  if (n && r() < persona.pause ** 2) n = 2;
  const at = new Set();
  for (let tries = 0; open.length && at.size < n && tries < 20; tries++) {
    const i = pick(r, open);
    if (!at.has(i - 1) && !at.has(i) && !at.has(i + 1)) at.add(i);
  }
  const out = [];
  const pauses = [];
  if (r() < persona.filler / 2) {
    out.push(pick(r, ['Um,', 'Uh,', 'So, um,']));
    if (!/^I\b/.test(toks[0])) toks[0] = toks[0].charAt(0).toLowerCase() + toks[0].slice(1);
  }
  toks.forEach((t, i) => {
    out.push(t);
    if (!at.has(i)) return;
    const ms = between(r, persona.pauseMs);
    pauses.push(ms);
    out.push(`\u0000${ms}`);
    if (r() < persona.filler) out.push(pick(r, ['um,', 'uh,', 'like,']));
    // A restart repeats the last word or two before the pause, never across a sentence end.
    const from = i > 0 && !ENDS_SENTENCE.test(toks[i - 1]) ? i - 1 : i;
    if (r() < persona.restart) out.push(...toks.slice(from, i + 1).map((w) => w.replace(/[,;:]$/, '')));
  });
  const last = out.length - 1;
  if (/[^.]\.$/.test(out[last]) && r() < persona.trailOff) out[last] = out[last].replace(/\.$/, '...');
  return { text: back(out), pauses, speed };
}

/** The line for one TTS: `say` takes [[rate wpm]] (default ~175); Cartesia a <speed> per rendered part. */
export function formatFor(engine, { text, speed }) {
  if (engine === 'say') return `[[rate ${Math.round(175 * speed)}]] ${text}`;
  const tag = `<speed ratio="${speed.toFixed(2)}"/>`;
  return text
    .split(/(\[\[slnc \d+\]\])/)
    .map((part) => (/^\[\[slnc/.test(part) || !part.trim() ? part : `${tag}${part.trim()}`))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A recorded human take for one scripted turn, or '' (no dir, no manifest entry). */
export function clipFor(dir, scenario, turn) {
  if (!dir) return '';
  const manifest = join(dir, 'manifest.json');
  if (!existsSync(manifest)) throw new Error(`caller-realism: no ${manifest}`);
  const rel = JSON.parse(readFileSync(manifest, 'utf8'))[scenario]?.[String(turn)];
  if (!rel) return '';
  // Checked by name and again after symlinks; "..odd.wav" is a name, "../x" is not.
  const root = realpathSync(dir);
  const within = (p) => !/^\.\.(\/|$)/.test(relative(root, p)) && !isAbsolute(relative(root, p));
  const lex = resolve(root, rel);
  const file = within(lex) && existsSync(lex) ? realpathSync(lex) : lex;
  if (!within(lex) || !within(file)) throw new Error(`caller-realism: ${rel} is outside ${dir}`);
  if (!existsSync(file)) throw new Error(`caller-realism: ${lex} is in the manifest but not on disk`);
  if (!statSync(file).isFile()) throw new Error(`caller-realism: ${rel} is not a file`);
  return file;
}

function main([cmd, ...args]) {
  const { voice, personas } = loadPersonas();
  if (cmd === 'check' || cmd === 'line') {
    const persona = personas[args[0]];
    if (!persona) {
      console.error(`caller-realism: no persona "${args[0]}" (have: ${Object.keys(personas).join(', ')})`);
      process.exit(2);
    }
    if (cmd === 'check') return console.log(persona.voice ?? voice);
    const [, seed, engine, ...words] = args;
    return console.log(formatFor(engine, realizeLine(words.join(' '), persona, seed)));
  }
  if (cmd === 'clip') return console.log(clipFor(process.env.VOICE_EVAL_HUMAN_CLIPS, args[0], args[1]));
  console.error('usage: caller-realism.mjs check <persona> | line <persona> <seed> <say|cartesia> <text...> | clip <scenario> <turn>');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
