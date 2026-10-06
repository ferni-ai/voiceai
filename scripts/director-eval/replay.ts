/**
 * Replay recorded calls through the director, old prompt vs new, and print every
 * note that survives parsing. Manual tool (calls the live model).
 *
 *   GOOGLE_CLOUD_PROJECT=<p> npx tsx scripts/director-eval/replay.ts <old-module> <eval.json>...
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getGenerativeModel } from '../../src/config/generative-model.js';

type Line = { speaker: 'user' | 'ferni'; text: string };
type Mod = {
  DIRECTOR_SYSTEM: string;
  buildDirectorPrompt: (l: Line[]) => string;
  parseNotes: (r: string | undefined, c?: Line[]) => string[];
};

function linesOf(file: string): Line[] {
  const ev = (
    JSON.parse(readFileSync(file, 'utf8')) as { events: Array<{ who: string; text: string }> }
  ).events;
  const out: Line[] = [];
  for (const e of ev) {
    const speaker = e.who === 'agent' ? 'ferni' : 'user';
    const last = out[out.length - 1];
    if (last && last.speaker === speaker && speaker === 'user')
      last.text = e.text; // captions grow
    else if (last && last.speaker === speaker) last.text = `${last.text} ${e.text}`;
    else out.push({ speaker, text: e.text });
  }
  return out;
}

async function notes(mod: Mod, call: Line[]): Promise<string[]> {
  const model = await getGenerativeModel({
    model: process.env.DIRECTOR_MODEL || 'gemini-3.5-flash',
    systemInstruction: mod.DIRECTOR_SYSTEM,
    generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
  });
  if (!model) throw new Error('no model');
  const r = await model.generateContent(mod.buildDirectorPrompt(call));
  return mod.parseNotes(r.response.text(), call);
}

const [oldPath, ...files] = process.argv.slice(2);
const oldMod = (await import(pathToFileURL(resolve(oldPath)).href)) as Mod;
const newMod = (await import('../../src/agents/personas/director-notes.js')) as unknown as Mod;
const snapshots: Line[][] = [];
for (const f of files) {
  const lines = linesOf(f);
  lines.forEach((l, i) => i > 1 && l.speaker === 'ferni' && snapshots.push(lines.slice(0, i + 1)));
}
for (const [name, mod] of [
  ['old', oldMod],
  ['new', newMod],
] as const) {
  let total = 0;
  const all: string[] = [];
  for (const s of snapshots) {
    const n = await notes(mod, s).catch(() => [] as string[]);
    total += n.length;
    all.push(...n);
  }
  console.log(`=== ${name}: ${snapshots.length} moments, ${total} notes`);
  for (const n of all) console.log(`  ${n}`);
}
