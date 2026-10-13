#!/usr/bin/env node
// next-turn-vs-human, step 1: pick moments. Each candidate gets a conversation type from
// gemini-3.5-flash-lite, then a seeded sample spread over types and conversations. A third of
// the conversations (by hash) are held out for the replication, never mixed with the main sample.
//
//   node scripts/voice-eval/next-turn/sample.mjs [--main 132] [--holdout 66] [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { hashSeed } from '../judge-stats.mjs';
import { CONVERSATIONS, TYPES, momentsOf, runDir, stratified } from './corpus.mjs';
import { gemini, pool } from './models.mjs';
import { parseJudgeJson } from '../judge.mjs';

const CORPUS = join(homedir(), 'Documents/voiceai-evidence/human-corpora/sbcsae/raw/SBCSAE');
const LABEL = `Label this moment in a conversation between two people who know each other, judging by the last few turns. One of:
casual: chit-chat, banter, stories, catching up
venting: complaining or frustrated about someone or something
good_news: sharing something good, exciting or funny that happened
planning: arranging, deciding or working out something practical
low_mood: sad, worried, tired, hurting or down
Reply JSON only: {"type": "<one of the five>"}\n\n`;

async function label(m) {
  const text = m.context.slice(-4).map((t) => `${t.who === 'caller' ? 'A' : 'B'}: ${t.text}`);
  const thinkingConfig = { thinkingLevel: 'MINIMAL' };
  const reply = await gemini('gemini-3.5-flash-lite', {
    contents: [{ role: 'user', parts: [{ text: LABEL + text.join('\n') }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig },
  });
  const { type } = parseJudgeJson(reply);
  m.type = TYPES.includes(type) ? type : 'casual';
}

const opts = {
  main: { type: 'string', default: '132' },
  holdout: { type: 'string', default: '66' },
};
const { values } = parseArgs({ options: { ...opts, out: { type: 'string' } } });
const out = runDir(values.out);
mkdirSync(out, { recursive: true });
const all = CONVERSATIONS.flatMap((f) =>
  momentsOf(f, readFileSync(join(CORPUS, `${f}.cha`), 'utf8'))
);
await pool(all, 8, label);
const held = (m) => hashSeed(m.file) % 3 === 0;
const pick = (split, n, seed) =>
  stratified(
    all.filter((m) => m.type && held(m) === (split === 'holdout')),
    n,
    { seed }
  ).map((m) => ({ ...m, split }));
const moments = [
  ...pick('main', Number(values.main), 1),
  ...pick('holdout', Number(values.holdout), 2),
];
writeFileSync(join(out, 'moments.json'), JSON.stringify(moments, null, 1));
const count = (s) =>
  TYPES.map((t) => `${t} ${moments.filter((m) => m.split === s && m.type === t).length}`);
console.log(
  `${all.length} candidates; main: ${count('main')}; holdout: ${count('holdout')}; ${out}`
);
