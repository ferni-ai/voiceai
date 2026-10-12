/**
 * Does Ferni's own story hang together across calls? Plays the same callers
 * through six calls over three weeks against his live per-turn setup, with
 * what he says about himself carried between calls by the real life ledger.
 * Manual tool: calls Vertex AI. Judge the output with self-consistency-judge.ts.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/humanness-eval/self-consistency.ts \
 *     --arm <label> [--callers 4] [--out-dir dir] [--set FLAG=value ...]
 *
 * Each call starts the live recall hook (memory-recall-hook.ts) over in-memory
 * stores: the first note carries the life ledger (what he told this caller on
 * earlier calls) and, with LIFE_MOVES_ON=on, what has happened since. Every
 * request goes through withTurnReminder, recall notes go into the chat context
 * as live (system messages, converted by the google provider format), and the
 * model call matches the cascade's main lane: gemini-3.5-flash, MINIMAL, 0.8.
 * When a call ends the real ledger recorder extracts and stores his claims.
 *
 * The clock is frozen per call (Date.now is offset to the call's day), so
 * "told 3 days ago" and the one-development-a-day rule see three weeks pass.
 * Calls with the same index run together for all callers, on the same day.
 * Defaults are dev's flags (2026-10-11); --set overrides them.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { initializeLogger, llm } from '@livekit/agents';

initializeLogger({ pretty: false, level: 'warn' });

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'arm' },
    callers: { type: 'string', default: '6' },
    'out-dir': { type: 'string', default: 'scripts/voice-eval/out/self-consistency' },
    set: { type: 'string', multiple: true, default: [] },
  },
});
const DEV_FLAGS: Record<string, string> = {
  PROMPT_MODE: 'character',
  FERNI_SELF_MEMORY: 'on',
  LIFE_MOVES_ON: 'on',
  SEMANTIC_RECALL: 'on',
};
for (const [k, v] of Object.entries(DEV_FLAGS)) process.env[k] ??= v;
for (const kv of values.set ?? []) {
  const [k, v] = kv.split('=');
  process.env[k] = v;
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${MODEL}:generateContent`;
const token = (): string =>
  execFileSync('gcloud', ['auth', 'application-default', 'print-access-token']).toString().trim();

/** Frozen per call: the call's day plus the real time elapsed since it began. */
const realNow = Date.now.bind(Date);
let offset = 0;
Date.now = () => realNow() + offset;
const setDay = (iso: string): void => {
  offset = Date.parse(iso) - realNow();
};

interface Caller {
  name: string;
  pet: string;
  kid: string;
}
const CALLERS: Caller[] = [
  { name: 'Dana', pet: 'Pepper', kid: 'Mia' },
  { name: 'Marcus', pet: 'Juniper', kid: 'Theo' },
  { name: 'Priya', pet: 'Bruno', kid: 'Asha' },
  { name: 'Sam', pet: 'Biscuit', kid: 'Lily' },
  { name: 'Elena', pet: 'Mochi', kid: 'Noah' },
  { name: 'Ray', pet: 'Duke', kid: 'Grace' },
];

/** A caller line and, for a question about Ferni, what it probes. */
type Line = [text: string, probe?: string];
/** Six calls over three weeks (Mondays and Thursdays, then a Sunday), 6:30pm in Wyoming. */
const DAYS = [0, 3, 7, 10, 14, 20];
const START = Date.parse('2026-09-07T18:30:00-06:00');
const CALLS = (c: Caller): Line[][] => [
  [
    [`Hey Ferni, it's ${c.name}.`],
    [`Pretty good. ${c.pet} chewed up one of my shoes this morning, so that was fun.`],
    ['How was your weekend?', 'weekend'],
    ['Nice. Are you reading anything good these days?', 'book'],
    ['Do you have any pets?', 'pet'],
    ["Ha. Okay, I've got to make dinner. Talk soon."],
  ],
  [
    ["Hey, it's me again."],
    [`Long week. ${c.kid}'s got a cold, so nobody's sleeping.`],
    ['What have you been up to since Monday?', 'since'],
    ["Where'd you grow up, anyway?", 'origin'],
    ["How's that book you were reading?", 'recall-book'],
    ["Alright, I'll let you go. Night."],
  ],
  [
    ['Hi Ferni.'],
    ['What did you do last weekend?', 'weekend'],
    ["How's your dog doing?", 'recall-pet'],
    [`${c.pet} is finally sleeping through the night, by the way.`],
    ['Did you ever finish that book?', 'recall-book'],
    ['Okay, talk later.'],
  ],
  [
    ['Hey, got a minute?'],
    ['Remind me, where did you live before you came back to the States?', 'japan'],
    ['Do you have brothers and sisters?', 'siblings'],
    ['How did that weekend thing you told me about end up?', 'recall-weekend'],
    ['Okay, bye for now.'],
  ],
  [
    ['Hey Ferni.'],
    ['How was your weekend?', 'weekend'],
    ['You said you were reading something, right? What was it again?', 'recall-book'],
    ["And how's the pet situation at your place?", 'recall-pet'],
    ['Good talking, bye.'],
  ],
  [
    ['Hey, quick one before dinner.'],
    ["What's new with you since we last talked?", 'since'],
    ['Where did you grow up again?', 'origin'],
    ["What's your wife up to these days?", 'wife'],
    ["How old are you, if you don't mind me asking?", 'age'],
    ['Alright, have a good night.'],
  ],
];

async function generate(system: string[], contents: unknown): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: { parts: system.map((text) => ({ text })) },
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }
  return '';
}

const { loadSystemPrompt, loadModelBaseInstructions } =
  await import('../../src/agents/personas/prompt-loader.js');
const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
const { Director, setDirector, linesFromChat } =
  await import('../../src/agents/personas/director-notes.js');
const { createMemoryRecall } = await import('../../src/agents/multi-agent/memory-recall-hook.js');
const { createLedgerRecorder, factDocId } =
  await import('../../src/agents/personas/life-ledger.js');
const { updateDocId } = await import('../../src/agents/personas/life-updates.js');
type LedgerFact = import('../../src/agents/personas/life-ledger.js').LedgerFact;
type LifeUpdate = import('../../src/agents/personas/life-updates.js').LifeUpdate;

const system = `${(await loadModelBaseInstructions()).trim()}\n\n---\n\n${await loadSystemPrompt('ferni', 'voice_agent')}`;

/** Firestore stand-ins: keyed by doc id like the real ones, newest first. */
function memoryStore<T extends { personaId: string }>(id: (t: T) => string, at: (t: T) => string) {
  const rows = new Map<string, Map<string, T>>();
  return {
    rows,
    async save(userId: string, items: T[]) {
      const m = rows.get(userId) ?? new Map<string, T>();
      for (const t of items) m.set(id(t), { ...m.get(id(t)), ...t });
      rows.set(userId, m);
    },
    async recent(userId: string, personaId: string, limit: number) {
      // As the Firestore store reads: never retracted or superseded rows.
      return [...(rows.get(userId)?.values() ?? [])]
        .filter((t) => {
          const row = t as T & { retracted?: boolean; supersededAt?: string };
          return t.personaId === personaId && row.retracted !== true && !row.supersededAt;
        })
        .sort((a, b) => at(b).localeCompare(at(a)))
        .slice(0, limit);
    },
  };
}
const ledgerStore = memoryStore<LedgerFact>(factDocId, (f) => f.saidAt);
const updateStore = memoryStore<LifeUpdate>(updateDocId, (u) => u.createdAt);
const noFacts = { facts: async () => [], summaries: async () => [] };

interface Turn {
  caller: string;
  ferni: string;
  probe?: string;
  notes: string[];
}

async function oneCall(c: Caller, k: number, userId: string): Promise<Turn[]> {
  const recall = createMemoryRecall({
    userId,
    userName: c.name,
    store: noFacts,
    ledgerStore,
    lifeUpdates: { store: updateStore },
    checkIns: async () => [],
  });
  await recall.ready;
  const sessionId = `self-consistency-${values.arm}-${c.name}-${k}`;
  const session = {
    userData: { personaId: 'ferni', services: { sessionId, sessionStartTime: Date.now() } },
  };
  const director = new Director({ sessionId, userName: c.name, writeNotes: false });
  setDirector(session, director);
  const ledger = createLedgerRecorder(userId, {
    store: ledgerStore,
    callerNames: async () => [c.name, c.pet, c.kid],
  });
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: system });
  const turns: Turn[] = [];
  for (const [line, probe] of CALLS(c)[k]) {
    // Interim then final transcript, as live: the second sees the turn's embedding.
    const notes: string[] = [];
    for (const wait of [0, 900]) {
      await new Promise((r) => setTimeout(r, wait));
      const note = recall.noteFor(line);
      if (note) {
        notes.push(note);
        ctx.addMessage({ role: 'system', content: note });
      }
    }
    ctx.addMessage({ role: 'user', content: line });
    const [contents, extra] = (await withTurnReminder(ctx, session).toProviderFormat('google')) as [
      unknown,
      { systemMessages: string[] | null },
    ];
    const reply = await generate(extra.systemMessages ?? [system], contents);
    ctx.addMessage({ role: 'assistant', content: reply || 'Mm.' });
    ledger.add('ferni', reply);
    turns.push({ caller: line, ferni: reply, probe, notes });
    await director.observe(linesFromChat(ctx.items));
    recall.newTurn();
  }
  await ledger.flush();
  return turns;
}

const callers = CALLERS.slice(0, Number(values.callers));
const outDir = values['out-dir'] as string;
mkdirSync(outDir, { recursive: true });
const runs = callers.map((c) => ({
  arm: values.arm,
  caller: c.name,
  userId: `self-consistency-${values.arm}-${c.name}`,
  flags: Object.fromEntries(
    [...Object.keys(DEV_FLAGS), 'LIFE_LEDGER', 'FERNI_SELF_RECALL', 'FERNI_PERSONA_SLIP_GUARD'].map(
      (k) => [k, process.env[k] ?? '']
    )
  ),
  calls: [] as Array<{ day: number; at: string; turns: Turn[]; ledgerAfter: string[] }>,
}));
for (const [k, day] of DAYS.entries()) {
  const at = new Date(START + day * 86_400_000).toISOString();
  setDay(at);
  const done = await Promise.all(callers.map((c, i) => oneCall(c, k, runs[i].userId)));
  done.forEach((turns, i) => {
    const ledgerAfter = [...(ledgerStore.rows.get(runs[i].userId)?.values() ?? [])].map(
      (f) => f.fact
    );
    runs[i].calls.push({ day, at, turns, ledgerAfter });
  });
  console.log(`call ${k + 1}/${DAYS.length} (day ${day}) done`);
}
for (const run of runs) {
  writeFileSync(`${outDir}/${values.arm}-${run.caller}.json`, JSON.stringify(run, null, 2));
}
console.log(`wrote ${runs.length} runs to ${outDir}`);
process.exit(0);
