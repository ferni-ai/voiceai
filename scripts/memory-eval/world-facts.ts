#!/usr/bin/env tsx
/**
 * World changes through Ferni's real write and read paths, offline. Write: each
 * scenario's past calls go through the after-call world extraction
 * (extractWorldAfterCall: the model's extraction, then supersession) into an
 * in-memory store. Read: the call-start loader and the turn note
 * (in-call-load.ts). Each scenario's opening line is answered with the note
 * (arm "on") and without it (arm "off"), several times each, and a judge
 * grades every reply against what is true now. --judge2 <ollama model> grades
 * again with a model of another family.
 *
 * The written memory is saved; --memory <file> reuses it, so a read-path
 * change is measured on the same facts.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/world-facts.ts \
 *     [--memory file.json] [--n 3] [--judge2 qwen3:30b-a3b]
 *
 * "off" has no memory at all here (not recall's facts either), so the gap is
 * an upper bound on what the block adds to a real call.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractWorldAfterCall } from '../../src/intelligence/world-model/extraction/register.js';
import {
  loadWorldFactsForCall,
  worldFactsNoteFor,
} from '../../src/intelligence/world-model/temporal/in-call-load.js';
import { createMemoryWorldFactStore } from '../../src/intelligence/world-model/temporal/__tests__/memory-store.js';
import type { WorldFactStore } from '../../src/intelligence/world-model/temporal/store.js';
import type { TemporalFact } from '../../src/intelligence/world-model/temporal/types.js';
import { callLLM } from '../../src/services/llm-utils.js';

const TZ = 'America/Denver';
const ENV = { AFTER_CALL_EXTRACTION: 'on', WORLD_MODEL_TEMPORAL: 'on', WORLD_FACTS_IN_CALL: 'on' };

interface Scenario {
  id: string;
  /** Past calls: when (noon in Denver) and what the caller said. */
  calls: Array<{ day: string; said: string[] }>;
  today: string;
  ask: string;
  /** What a good friend's reply gets right, for the judge. */
  gold: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'job-change',
    calls: [
      { day: '2026-10-01', said: ['Still grinding at Acme. My manager there is brutal.'] },
      { day: '2026-10-09', said: ['Big news, I started at Beta on Monday! Finally out of Acme.'] },
    ],
    today: '2026-10-11',
    ask: "Ugh, Monday tomorrow. Work's going to be a lot this week.",
    gold: 'They now work at Beta (started Oct 5); Acme is over. The reply must not treat Acme or the Acme manager as their current job.',
  },
  {
    id: 'move',
    calls: [
      { day: '2026-10-02', said: ['I love my little place in Austin, right off South Congress.'] },
      { day: '2026-10-08', said: ['We finally moved to Denver last weekend, boxes everywhere.'] },
    ],
    today: '2026-10-11',
    ask: 'The weather here today is wild.',
    gold: 'They live in Denver now (moved from Austin). The reply must not assume they are in Austin.',
  },
  {
    id: 'upcoming-interview',
    calls: [
      {
        day: '2026-10-09',
        said: ['I have an interview at Stripe on Thursday, kind of a big deal.'],
      },
    ],
    today: '2026-10-13',
    ask: "I'm kind of nervous about this week.",
    gold: 'Their Stripe interview is this Thursday (Oct 15). A good reply connects the nerves to it or asks if it is the interview.',
  },
  {
    id: 'past-surgery',
    calls: [
      { day: '2026-10-06', said: ['My sister Mindy has knee surgery this Friday, I am worried.'] },
    ],
    today: '2026-10-11',
    ask: "Hey, what's up?",
    gold: "Mindy's knee surgery was Friday Oct 9; the outcome is unknown. A good reply asks how it went or how Mindy is, without claiming to know.",
  },
  {
    id: 'breakup',
    calls: [
      {
        day: '2026-10-01',
        said: ["Jordan and I are doing great, we're going to Napa next month."],
      },
      { day: '2026-10-10', said: ['Jordan and I broke up. It was mutual, honestly.'] },
    ],
    today: '2026-10-11',
    ask: 'Got any ideas for my Saturday night?',
    gold: 'They broke up with Jordan. The reply must not suggest plans with Jordan or treat Jordan as their partner.',
  },
];

const noon = (day: string) => new Date(`${day}T18:00:00.000Z`);

async function write(s: Scenario): Promise<TemporalFact[]> {
  const store = createMemoryWorldFactStore();
  for (const [i, c] of s.calls.entries()) {
    const turns = c.said.flatMap((content) => [
      { role: 'user', content },
      { role: 'assistant', content: 'Oh wow, tell me more.' },
    ]);
    const ctx = {
      userId: s.id,
      sessionId: `${s.id}-c${i + 1}`,
      turns,
      startedAt: noon(c.day),
      timezone: TZ,
    };
    await extractWorldAfterCall(ctx, { store, env: ENV });
  }
  return store.all(s.id);
}

/** A frozen store: the saved facts, read as the Firestore store reads them (open ones). */
const frozen = (facts: TemporalFact[]): WorldFactStore => ({
  listOpen: async () => facts.filter((f) => f.validTo === null),
  apply: async () => undefined,
});

const answer = (
  note: string,
  ask: string
) => `You are Ferni, the caller's close friend, on a phone call. Reply in one or two spoken sentences.
${note ? `${note}\n` : ''}
Caller: ${ask}
Ferni:`;

const judge = (s: Scenario, reply: string) => `What is true about the caller right now: ${s.gold}
The caller said: "${s.ask}"
Their friend replied: "${reply}"
Does the reply fit what is true now, without stating anything false or made up about the caller's life? Answer only YES or NO.`;

const yes = (text: string | null): boolean | null =>
  /\bYES\b/i.test(text ?? '') ? true : /\bNO\b/i.test(text ?? '') ? false : null;

async function ollama(model: string, prompt: string): Promise<string | null> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model,
      prompt: `${prompt} /no_think`,
      stream: false,
      options: { temperature: 0 },
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { response?: string };
  return (body.response ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const n = Number(flag('--n') ?? 3);
  const judge2 = flag('--judge2');
  const memoryFile = flag('--memory');
  const memory: Record<string, TemporalFact[]> = memoryFile
    ? JSON.parse(readFileSync(memoryFile, 'utf8'))
    : {};
  for (const s of SCENARIOS) memory[s.id] ??= await write(s);

  const rows: Array<Record<string, unknown>> = [];
  const tally: Record<string, { pass: number; pass2: number; n: number }> = {};
  for (const s of SCENARIOS) {
    const call = {};
    await loadWorldFactsForCall(call, s.id, {
      store: frozen(memory[s.id]),
      forgotten: async () => [],
      env: ENV,
    });
    process.env.WORLD_FACTS_IN_CALL = 'on';
    const on = worldFactsNoteFor(call, {
      now: noon(s.today).getTime(),
      timeZone: TZ,
      words: s.ask,
    });
    for (const [arm, note] of [
      ['off', ''],
      ['on', on],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const reply = (
          (await callLLM(answer(note, s.ask), { temperature: 0.7, maxTokens: 120 })) ?? ''
        ).trim();
        const pass = yes(await callLLM(judge(s, reply), { temperature: 0, maxTokens: 5 }));
        const pass2 = judge2 ? yes(await ollama(judge2, judge(s, reply))) : null;
        const t = (tally[`${s.id}:${arm}`] ??= { pass: 0, pass2: 0, n: 0 });
        t.n++;
        t.pass += pass ? 1 : 0;
        t.pass2 += pass2 ? 1 : 0;
        rows.push({ scenario: s.id, arm, note, reply, pass, pass2 });
        console.log(
          `${pass ? '✓' : '✗'}${judge2 ? (pass2 ? '✓' : '✗') : ''} [${s.id}/${arm}] ${reply}`
        );
      }
    }
  }

  const sum = (arm: string, k: 'pass' | 'pass2') =>
    Object.entries(tally)
      .filter(([key]) => key.endsWith(`:${arm}`))
      .reduce((a, [, t]) => a + t[k], 0);
  const total = SCENARIOS.length * n;
  const dir = join(tmpdir(), 'world-facts-eval');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(dir, `memory-${stamp}.json`), JSON.stringify(memory, null, 2));
  writeFileSync(join(dir, `run-${stamp}.json`), JSON.stringify({ tally, rows }, null, 2));
  console.log('\nper scenario (judge1 pass / n):');
  for (const [k, t] of Object.entries(tally))
    console.log(`  ${k}: ${t.pass}/${t.n}${judge2 ? `, judge2 ${t.pass2}/${t.n}` : ''}`);
  console.log(`\noff: ${sum('off', 'pass')}/${total}  on: ${sum('on', 'pass')}/${total}`);
  if (judge2)
    console.log(
      `judge2 (${judge2}) off: ${sum('off', 'pass2')}/${total}  on: ${sum('on', 'pass2')}/${total}`
    );
  console.log(`\nMemory (reuse with --memory): ${join(dir, `memory-${stamp}.json`)}`);
}

// Exit explicitly: the memory modules leave timers and gRPC channels open, so
// the process would otherwise never end, even after an error.
main().then(
  () => process.exit(),
  (error: unknown) => {
    console.error(String(error));
    process.exit(1);
  }
);
