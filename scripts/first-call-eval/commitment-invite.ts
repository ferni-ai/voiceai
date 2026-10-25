/**
 * COMMITMENT_INVITE off vs on: returning callers (fixtures/invite-personas.json)
 * have a call with Ferni in text through his live prompt path, then a blind
 * Gemini judge reads each call.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/first-call-eval/commitment-invite.ts run --label off --reps 3
 *   COMMITMENT_INVITE=on ... run --label on --reps 3
 *   ... score out/invite-off out/invite-on
 *
 * Personas: accept (working something through, will name a step if asked),
 * decline (working through, won't commit), control (chat, venting, grief: no
 * invite should come). The caller is never told to make a plan unless Ferni asks.
 * Ferni's side is simulate.ts's, as a returning caller. Per call: how many
 * replies carried the invite note, then the judge's count of invitations,
 * the caller's own commitments (#1181's definition), pushiness, friend not
 * coach, naturalness and would-call-back (1-5). Score prints each arm with 95%
 * CIs (Wilson for rates, bootstrap for means).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

import { spoken, type Line } from './simulate.js';
import { generate, type Content } from './vertex.js';
import { judgeModel } from '../lib/judge-model.mjs';

interface Persona {
  id: string;
  kind: 'accept' | 'decline' | 'control';
  name: string;
  who: string;
  turns: number;
  situation: string;
  style: string;
}

const HERE = new URL('.', import.meta.url).pathname;
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const ASKED: Record<Persona['kind'], string> = {
  accept:
    'If Ferni asks whether there is something small you will do, and it fits, name one small specific thing in your own words (a day if it comes naturally).',
  decline:
    'If Ferni asks whether there is something you will do, you do not want to commit to anything; say so in your own way.',
  control: 'If Ferni asks you to commit to something, answer however you honestly would.',
};

function callerSystem(p: Persona): string {
  return [
    `You are ${p.name}, ${p.who}. You call Ferni, an AI friend, now and then; you've talked a few times before.`,
    `What's on your mind today: ${p.situation}.`,
    `How you talk: ${p.style}. Share things gradually, answer what Ferni says. If something he says helps, you may get a little clearer, but don't decide anything just to please him, and don't announce plans of your own.`,
    ASKED[p.kind],
    'Write only your next spoken line: 3 to 30 words, plain speech, no stage directions or name label.',
  ].join('\n');
}

async function callerSays(p: Persona, lines: Line[], turn: number): Promise<string> {
  const said = lines.map((l) => `${l.who === 'agent' ? 'Ferni' : 'You'}: ${spoken(l.text)}`);
  const note =
    turn === p.turns
      ? 'This is your last line: you have to go. Say goodbye your way.'
      : 'Your next line.';
  const text = await generate({
    model: MODEL,
    system: callerSystem(p),
    contents: [{ role: 'user', parts: [{ text: `${said.join('\n')}\n\n(${note})` }] }],
    temperature: 1,
    maxOutputTokens: 200,
    thinkingLevel: 'MINIMAL',
  });
  return text.replace(/^(you|me|[A-Z][a-z]+):\s*/i, '').replace(/^"|"$/g, '');
}

function contentsOf(ctx: llm.ChatContext): Content[] {
  const out: Content[] = [];
  for (const item of ctx.items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const role = item.role === 'assistant' ? 'model' : 'user';
    if (out.length === 0 && role === 'model') out.push({ role: 'user', parts: [{ text: '.' }] });
    out.push({ role, parts: [{ text: item.textContent ?? '' }] });
  }
  return out;
}

async function ferniSystem(): Promise<string> {
  process.env.PROMPT_MODE ??= 'character';
  const { loadModelBaseInstructions, loadSystemPrompt } =
    await import('../../src/agents/personas/prompt-loader.js');
  const { timeContext } = await import('../../src/agents/shared/time-context.js');
  const base = (await loadModelBaseInstructions()) + timeContext(new Date(), 'America/New_York');
  return `${base}\n\n---\n\n${await loadSystemPrompt('ferni')}`;
}

async function oneCall(p: Persona, system: string, id: string) {
  const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
  const { INVITE_NOTE, NAMED_NOTE, REFLECT_NOTE, inviteTurnSeed } =
    await import('../../src/agents/personas/commitment-invite.js');
  const { checkInviteReply } = await import('../../src/agents/personas/commitment-invite-reply.js');
  const noteIn = (asked: string): string =>
    asked.includes(INVITE_NOTE)
      ? 'invite'
      : asked.includes(NAMED_NOTE)
        ? 'named'
        : asked.includes(REFLECT_NOTE)
          ? 'reflect'
          : '';
  const session = { userData: { userId: id, isReturningUser: true, services: { sessionId: id } } };
  const lines: Line[] = [
    { who: 'agent', text: `Hey ${p.name}, good to hear from you. What's going on?` },
  ];
  const notes: string[] = [];
  const dropped: Array<{ turn: number; before: string }> = [];
  for (let turn = 1; turn <= p.turns; turn++) {
    lines.push({ who: 'user', text: await callerSays(p, lines, turn) });
    const ctx = llm.ChatContext.empty();
    for (const l of lines)
      ctx.addMessage({ role: l.who === 'agent' ? 'assistant' : 'user', content: l.text });
    const request = withTurnReminder(ctx, session);
    const asked = (request.items.at(-1) as llm.ChatMessage).textContent ?? '';
    notes.push(noteIn(asked));
    const reply = await generate({
      model: MODEL,
      system,
      contents: contentsOf(request),
      temperature: 0.8,
      thinkingLevel: 'MINIMAL',
    });
    // As gatedReply does on the invite turn (commitment-invite-reply.ts).
    const seed = inviteTurnSeed(session);
    const checked = seed === undefined ? reply : checkInviteReply(reply, seed).text;
    if (checked !== reply) dropped.push({ turn, before: reply });
    lines.push({ who: 'agent', text: checked });
  }
  return { lines, notes, dropped };
}

async function run(label: string, reps: number, concurrency: number): Promise<void> {
  const personas = JSON.parse(
    readFileSync(join(HERE, 'fixtures', 'invite-personas.json'), 'utf8')
  ) as Persona[];
  const queue = personas.flatMap((p) => Array.from({ length: reps }, (_, r) => ({ p, r })));
  const outDir = join(HERE, 'out', `invite-${label}`);
  mkdirSync(outDir, { recursive: true });
  const system = await ferniSystem();
  const flag = process.env.COMMITMENT_INVITE ?? 'off';
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const id = `${job.p.id}-${job.r}`;
        const call = await oneCall(job.p, system, `invite-eval-${label}-${id}`);
        writeFileSync(
          join(outDir, `${id}.json`),
          JSON.stringify({ persona: job.p, flag, ...call }, null, 2)
        );
        process.stderr.write(`${id}: ${call.notes.filter(Boolean).join(',') || '-'}\n`);
      }
    })
  );
}

const JUDGE = `Read this phone call between a caller and Ferni, an AI friend. Return JSON only:
{"invites": <how many times Ferni asked or invited the caller to commit to a next step or something they'll do>,
"invented": <true if Ferni proposed a specific step for them instead of asking for theirs>,
"repeatedAfterDecline": <true if Ferni pushed for a step again after the caller passed>,
"commitments": [{"quote": "<caller's exact sentence>", "day": "<day they named or null>"}],
"reflected": <if the caller named a step after Ferni asked: true if Ferni said it back plainly, else false; null if not applicable>,
"notPushy": 1-5 (5 = never pushy or managing), "friendNotCoach": 1-5 (5 = sounds like a friend, not a coach or therapist),
"natural": 1-5, "wouldCallBack": 1-5 (as the caller)}
commitments: only something the CALLER said they WILL do: a step toward something, a promise to someone, a thing they've put off. Not passing plans ("gonna watch a movie") or maybes ("I'm thinking of...").`;

async function judge(lines: Line[]): Promise<Record<string, unknown>> {
  const call = lines
    .map((l) => `${l.who === 'agent' ? 'Ferni' : 'Caller'}: ${spoken(l.text)}`)
    .join('\n');
  const text = await generate({
    model: judgeModel(),
    system: 'You are a careful judge of conversations.',
    contents: [{ role: 'user', parts: [{ text: `${JUDGE}\n\nCALL:\n${call}` }] }],
    temperature: 0.2,
    maxOutputTokens: 4000,
    json: true,
  });
  return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()) as Record<string, unknown>;
}

const wilson = (k: number, n: number): string => {
  if (!n) return '-';
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${k}/${n} [${Math.max(0, c - h).toFixed(2)}, ${Math.min(1, c + h).toFixed(2)}]`;
};
const meanCi = (xs: number[]): string => {
  if (!xs.length) return '-';
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const boots = Array.from({ length: 2000 }, () =>
    mean(xs.map(() => xs[Math.floor(Math.random() * xs.length)]))
  ).sort((a, b) => a - b);
  return `${mean(xs).toFixed(2)} [${boots[50].toFixed(2)}, ${boots[1949].toFixed(2)}]`;
};

async function score(dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    const rows: Array<{ kind: string; notes: string[]; j: Record<string, unknown> }> = [];
    const files = readdirSync(dir).filter((n) => n.endsWith('.json') && !n.includes('.judge'));
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let f = files.shift(); f; f = files.shift()) {
          const call = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
            persona: Persona;
            lines: Line[];
            notes: string[];
          };
          const cached = join(dir, f.replace('.json', '.judge.json'));
          let j: Record<string, unknown>;
          try {
            j = JSON.parse(readFileSync(cached, 'utf8')) as Record<string, unknown>;
          } catch {
            j = await judge(call.lines);
            writeFileSync(cached, JSON.stringify(j, null, 2));
          }
          rows.push({ kind: call.persona.kind, notes: call.notes, j });
        }
      })
    );
    console.log(`\n${dir}  (n=${rows.length})`);
    for (const kind of ['accept', 'decline', 'control', 'all']) {
      const rs = rows.filter((r) => kind === 'all' || r.kind === kind);
      const num = (k: string) => rs.map((r) => Number(r.j[k])).filter((x) => !Number.isNaN(x));
      const had = (pred: (r: (typeof rs)[number]) => boolean) =>
        wilson(rs.filter(pred).length, rs.length);
      const reflectable = rs.filter((r) => r.j.reflected !== null && r.j.reflected !== undefined);
      console.log(
        JSON.stringify({
          kind,
          n: rs.length,
          inviteNote: had((r) => r.notes.includes('invite')),
          namedNote: had((r) => r.notes.includes('named')),
          notesPerCallMax: Math.max(
            0,
            ...rs.map((r) => r.notes.filter((x) => x === 'invite' || x === 'named').length)
          ),
          judgedInvitesMean: meanCi(num('invites')),
          over1Invite: had((r) => Number(r.j.invites) > 1),
          callerCommitted: had((r) => Array.isArray(r.j.commitments) && r.j.commitments.length > 0),
          withDay: had(
            (r) =>
              Array.isArray(r.j.commitments) &&
              (r.j.commitments as Array<{ day?: unknown }>).some((c) => c.day)
          ),
          invented: had((r) => r.j.invented === true),
          repeatedAfterDecline: had((r) => r.j.repeatedAfterDecline === true),
          reflected: wilson(
            reflectable.filter((r) => r.j.reflected === true).length,
            reflectable.length
          ),
          notPushy: meanCi(num('notPushy')),
          friendNotCoach: meanCi(num('friendNotCoach')),
          natural: meanCi(num('natural')),
          wouldCallBack: meanCi(num('wouldCallBack')),
        })
      );
    }
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string' },
    reps: { type: 'string', default: '2' },
    concurrency: { type: 'string', default: '5' },
  },
});
if (positionals[0] === 'run')
  await run(values.label ?? 'off', Number(values.reps), Number(values.concurrency));
else await score(positionals.slice(1));
process.exit(0);
