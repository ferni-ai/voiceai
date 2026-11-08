/**
 * Can a blind listener tell WHO is speaking? Each roster.ts persona answers bar.ts's caller lines
 * through the voice path and phone line. A Gemini judge hears each clip and picks from one bundle
 * paragraph per persona (names blanked, letters shuffled per trial by a random --salt saved in
 * result.json); a qwen or claude --text-judge reads the words. Arms: voice (one neutral line),
 * reply (--replies: a saved bar.ts run), clips (UNAVAILABLE). Flags: defaults, --flags <file>,
 * --set NAME=on; run the A/A first. Needs GOOGLE_CLOUD_PROJECT, CARTESIA_API_KEY and gcloud ADC.
 *
 *   npx tsx scripts/audio-eval/persona-audio-id.ts --replies <bar run>/result.json [--out <dir>]
 */
import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { spokenVoiceId } from '../../src/agents/shared/spoken-voice.js';
import { generate } from '../first-call-eval/vertex.js';
import { judgeModel } from '../lib/judge-model.mjs';
import { armEnv, parseSets } from '../persona-eval/bar-lib.js';
import { PERSONAS } from '../persona-eval/roster.js';
import { PROVIDERS, type JudgeContext } from '../voice-eval/judge.mjs';
import { runArms, summary, type Clients, type Say } from './persona-audio-lib.js';
import { PHONE_RATE, phoneLine } from './phone-sim.js';
import { RENDER_RATE, renderReply } from './render-lib.js';
import { encodeWav } from './speech-e2e-lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NEUTRAL = "Okay. I'm here, and I'm listening. Tell me a little more about that.";

export interface Judges {
  audioModel: string;
  textJudge: 'qwen' | 'claude';
  text: JudgeContext;
}

/** The judges. The audio one must be Gemini: any other route drops the clip and reads text. */
export function judgesFor(env: NodeJS.ProcessEnv, textJudge: Judges['textJudge'], project: string) {
  const audioModel = judgeModel(env, 'pro');
  if (!audioModel.startsWith('gemini'))
    throw new Error(`JUDGE_MODEL ${audioModel} cannot hear audio; set a Gemini model or unset it`);
  const text = { model: PROVIDERS[textJudge].model(env), project };
  return { audioModel, textJudge, text } satisfies Judges;
}

/** Real clients: the voice path renders, Gemini hears the clip, the other family reads the words. */
export function networkClients(out: string, judges: Judges): (arm: string) => Clients {
  const warned = new Set<string>();
  const failed = (judge: string) => (e: unknown) => {
    if (!warned.has(judge)) console.error(`${judge} judge failed (counted as a failure):`, e);
    warned.add(judge);
    return '';
  };
  return (arm) => ({
    async render(persona, said, line, i) {
      const reply = await renderReply({
        text: said,
        personaId: persona,
        voiceId: spokenVoiceId(persona, undefined),
        sessionId: `persona-audio-${randomInt(1e9)}`,
        userText: line,
      });
      const phone = phoneLine(reply, RENDER_RATE);
      const pcm = Int16Array.from(phone, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
      if (pcm.length === 0) throw new Error(`${persona}: the clip is empty`);
      const wav = encodeWav(pcm, PHONE_RATE);
      mkdirSync(join(out, arm), { recursive: true });
      writeFileSync(join(out, arm, `${persona}-${i + 1}.wav`), wav);
      return wav;
    },
    hear: (wav, prompt) =>
      generate({
        model: judges.audioModel,
        system: 'You are a careful blind listener.',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        temperature: 0.2,
        maxOutputTokens: 2000,
        json: true,
      }).catch(failed('audio')),
    read: (prompt) =>
      PROVIDERS[judges.textJudge]
        .ask(prompt, judges.text)
        .then((v) => JSON.stringify(v), failed('text')),
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: join(tmpdir(), `persona-audio-id-${Date.now()}`) },
      n: { type: 'string', default: '12' },
      replies: { type: 'string' },
      salt: { type: 'string' },
      'text-judge': { type: 'string', default: 'qwen' },
      flags: { type: 'string' },
      set: { type: 'string', multiple: true, default: [] },
      lines: { type: 'string', default: join(HERE, '../persona-eval/fixtures/bar-lines.json') },
    },
  });
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project || !process.env.CARTESIA_API_KEY)
    throw new Error('Set GOOGLE_CLOUD_PROJECT and CARTESIA_API_KEY');
  const textJudge = values['text-judge'];
  if (textJudge !== 'qwen' && textJudge !== 'claude')
    throw new Error('--text-judge must be qwen or claude');
  const n = Number(values.n);
  if (!Number.isInteger(n) || n < 1) throw new Error('--n must be a whole number >= 1');
  const file: unknown = values.flags ? JSON.parse(readFileSync(resolve(values.flags), 'utf8')) : {};
  const flags = armEnv(file, parseSets(values.set ?? []));
  Object.assign(process.env, flags);

  const fixture = JSON.parse(readFileSync(resolve(values.lines), 'utf8')) as {
    lines: { text: string }[];
  };
  const lines = fixture.lines.slice(0, n).map((l) => l.text);
  type Saved = { replies: Record<string, Record<string, { reply: string } | undefined>> };
  const saved = values.replies
    ? (JSON.parse(readFileSync(resolve(values.replies), 'utf8')) as Saved).replies
    : null;
  const judges = judgesFor(process.env, textJudge, project);
  const ownReply: Say | string = saved
    ? (persona, line) => {
        const r = saved[line]?.[persona]?.reply;
        if (!r) throw new Error(`--replies has no reply from ${persona} to "${line}"`);
        return r;
      }
    : 'not run: pass --replies <bar run>/result.json';

  const out = resolve(values.out);
  const salt = values.salt ?? randomUUID();
  const arms = await runArms(
    {
      voice: () => NEUTRAL,
      reply: ownReply,
      clips: 'UNAVAILABLE: no offline renderer composes a reply with its reaction clips',
    },
    lines,
    networkClients(out, judges),
    salt
  );
  const set = Object.entries(flags).map(([k, v]) => `${k}=${v}`);
  const head = [
    `Flags: code defaults${set.length ? `, then ${set.join(', ')}` : ''}.`,
    `${lines.length} caller lines per persona. Judges: ${judges.audioModel} (audio), ${textJudge} ${judges.text.model} (transcript).`,
  ];
  mkdirSync(out, { recursive: true });
  const judged = { audio: judges.audioModel, text: `${textJudge}/${judges.text.model}` };
  const result = { salt, flags, personas: PERSONAS, lines, judges: judged, arms };
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(out, 'summary.md'), summary(arms, PERSONAS, head));
  console.log(join(out, 'summary.md'));
}

if (process.argv[1]?.endsWith('persona-audio-id.ts'))
  main().then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    }
  );
