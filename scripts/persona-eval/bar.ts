/**
 * The persona eval bar: the numbers every "directed, not scripted" change has
 * to beat. For one arm (prod persona flags from a file, plus overrides), each
 * of the six personas answers every caller line through the live text path,
 * and the replies are scored on:
 *
 *   distinctness  a blind judge, one reply at a time, guesses which persona
 *                 spoke (chance 1/6)
 *   humanness     pairwise against a baseline arm: same persona and line, the
 *                 two replies in seeded random order; which sounds more like a
 *                 real friend on the phone. Win rate with a 95% Wilson interval
 *   insight       on lines that come with caller context (a memory-recall
 *                 note), does the reply use it naturally
 *   copy          no LLM: replies that contain a 4-word run also present in
 *                 the instructions they were given (system prompt + per-turn
 *                 reminder), and the most-copied runs
 *
 *   # A/A first: the same arm twice, which sets the noise floor per metric
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/bar.ts \
 *     --arm base --flags <prod-persona-flags.json> --aa --out <dir>
 *   # then a change, judged against the saved baseline
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/bar.ts \
 *     --arm voice --flags <prod-persona-flags.json> --set PERSONA_VOICE=on \
 *     --baseline <dir>/base --out <dir>
 *
 * --multi-turn plays scripted calls (fixtures/bar-conversations.json) instead
 * of single lines, so a change that acts BETWEEN turns can be measured: each
 * reply joins the chat, and the real director and deliberation run on it
 * (installDirectorNotes, as a live session installs them), so their notes
 * reach the next turn's reminder as on a call. The last two replies of each
 * call are scored on the same metrics.
 *
 * The live path, per reply: the model base instructions + time of day +
 * loadSystemPrompt(persona) as the agent's instructions, the recall note as a
 * system message after them (as memory-recall-hook.ts adds it, built by the
 * real formatRecall), the caller's line, withTurnReminder with
 * userData.personaId set, then the SDK's own Gemini formatting
 * (toProviderFormat). gemini-3.5-flash at MINIMAL thinking, t=0.8, as
 * scripts/first-call-eval/simulate.ts. Not replayed: audio, tools, greeting,
 * the background notes. So this measures WORDS, one turn deep; compare arms,
 * don't read the absolute numbers as live.
 *
 * Safety: FIRESTORE_EMULATOR_HOST points at a dead port, so a repo module that
 * opens Firestore fails instead of reaching GOOGLE_CLOUD_PROJECT's data. One
 * arm per process: repo modules can read flags at import time.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { EventEmitter } from 'node:events';

import {
  armEnv,
  compareArms,
  compareTable,
  copiedNgrams,
  copyStats,
  maskNames,
  median,
  metricsTable,
  ngramSet,
  noiseFloor,
  notesIn,
  aaGap,
  humannessOf,
  humannessRate,
  parseCompanion,
  parsePick,
  parseSets,
  parseUse,
  rate,
  scoredTurns,
  shuffled,
  words,
  zoneAtLocalHour,
  type Conversation,
  type Floor,
  type Humanness,
  type Metrics,
  type Pair,
  type Rate,
} from './bar-lib.js';
import { bible } from './canon-judge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gemini-3.5-flash';
const PERSONAS = [
  'ferni',
  'alex-chen',
  'peter-john',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
];
const NAMES = PERSONAS.map((p) => p.split('-')[0]);

// The voice targets from CASTING.md, as the 2026-10-18 distinctness harness gave them.
const DESCRIPTIONS: Record<string, string> = {
  ferni:
    'low-key and warm, picks up the small thing you almost did not say, says little when it is hard, gentle self-mocking humor',
  'alex-chen':
    'dry, clipped and exact, sentences land down and stop, point first, deadpan understatement, fewest words, rarely exclaims',
  'peter-john':
    'thinks out loud in quick bursts, chases the pattern or the odd detail, wants to know how it happened, laughs big and often, plain New England uncle',
  'maya-santos':
    'brisk, bright and punchy like a coach, goes straight to one small doable step, celebrates fast and out loud, teasing, rarely leaves a silence',
  'jordan-taylor':
    'energy that builds as she talks, pictures the celebration, widest range, drops to slow and quiet for hard news, laughs at herself',
  'nayan-patel':
    'slow, says the least, leaves room, answers the question under the question, rarely asks anything, gentle sideways humor',
};

interface Fact {
  entity: string;
  key: string;
  value: string;
  daysAgo: number;
}
/** What gets scored: a caller line (single-turn), or a turn of a scripted call (multi-turn). */
interface Line {
  /** What replies are saved under: the line's text, or `<call>#<turn>`. */
  key: string;
  text: string;
  context?: Fact[];
  /** Multi-turn: what the caller said before this on the call. */
  earlier?: string[];
  /** Multi-turn: what else the speaker knows now (the caller's local time). */
  knows?: string[];
  insight: boolean;
}
interface Fixture {
  caller: string;
  lines?: Array<{ text: string; context?: Fact[] }>;
  conversations?: Array<Conversation & { context?: Fact[] }>;
}
/** One persona's answer to one line, and the instruction text the copy check read. */
interface Reply {
  reply: string;
  reminder: string;
  copied: string[];
  /** Multi-turn: the director's notes and the deliberator's thought this reply was given. */
  notes?: { director: string[]; thought: string };
}
/** line key -> persona -> reply */
type Replies = Record<string, Record<string, Reply>>;

/** Multi-turn: one exchange of a call, for the transcript. */
interface TurnLog {
  caller: string;
  reply: string;
  /** The notes this reply was given; what the director wrote after it, and in how long (4 s budget). */
  director: string[];
  thought: string;
  written?: string[];
  directorMs?: number;
}
/** call -> persona -> turns */
type Transcripts = Record<string, Record<string, TurnLog[]>>;
/** Multi-turn: what the director and deliberation did over a run. */
interface Observers {
  directorRuns: number;
  /** Runs that left notes for the next reply; runs at the 4 s budget (no note, as on a call). */
  directorWrote: number;
  overBudget: number;
  deliberation: Record<string, number>;
}
interface Generated {
  replies: Replies;
  transcripts?: Transcripts;
  observers?: Observers;
}

interface Scored {
  metrics: Metrics;
  forced: Rate;
  perPersona: Record<string, { distinctness: Rate; medianWords: number }>;
  confusion: Record<string, Record<string, number>>;
  judgeFailures: number;
  emptyReplies: number;
}

interface Result {
  arm: string;
  sets: Record<string, string>;
  flagsFile: string;
  linesFile: string;
  model: string;
  judgeModel: string;
  rounds: number;
  at: string;
  scored: Scored;
  replies: Replies;
  mode?: 'multi-turn';
  transcripts?: Transcripts;
  observers?: Observers;
  /** Whether the copy check left out n-grams from each persona's own canon (--exclude-canon). */
  copyExcludesCanon?: boolean;
  /** Set when --reuse re-scored saved replies instead of generating new ones. */
  rescoredAt?: string;
  humanness?: Humanness & { vs: string; judgeFailures: number; pairs: Pair[] };
  /** gap: how far the two runs landed; floor: max(gap, sampling gap), what a change must beat. */
  aa?: {
    scored: Scored;
    humanness: Humanness;
    pairs?: Pair[];
    gap: Floor;
    floor: Floor;
    replies: Replies;
    transcripts?: Transcripts;
    observers?: Observers;
  };
  comparison?: ReturnType<typeof compareArms>;
}

const POOL = 8;
async function pooled<T>(jobs: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    })
  );
  return out;
}

const started = Date.now();
const progress = (msg: string): void => {
  process.stderr.write(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}\n`);
};
/** The A/A win rate a floor rests on; results saved before length matching hold a plain Rate. */
const pctCi = (r: Rate): string =>
  `${r.k}/${r.n} = ${(100 * r.p).toFixed(1)}% [${(100 * r.lo).toFixed(1)}%, ${(100 * r.hi).toFixed(1)}%]`;
const aaHumanRate = (h: Humanness | Rate): Rate => ('overall' in h ? humannessRate(h) : h);

/** SSML a listener never sees as text; [laughter]-style sounds stay. */
const untagged = (t: string): string =>
  t
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      arm: { type: 'string' },
      flags: { type: 'string' },
      set: { type: 'string', multiple: true, default: [] },
      lines: { type: 'string', default: join(HERE, 'fixtures/bar-lines.json') },
      // No default: results (replies to caller lines under prod flags) live outside the repo.
      out: { type: 'string' },
      baseline: { type: 'string' },
      aa: { type: 'boolean', default: false },
      rounds: { type: 'string', default: '1' },
      // Re-score <out>/<arm>/result.json: same replies, judged again (humanness) and the copy
      // check redone. Nothing is regenerated, and distinctness and insight are kept as saved.
      reuse: { type: 'boolean', default: false },
      // Leave the speaking persona's own canon (its bible, as canon-judge reads it) out of the
      // copy check, so naming its own cats is not "reading the script".
      'exclude-canon': { type: 'boolean', default: false },
      // Scripted calls with the director and deliberation between turns (fixtures/bar-conversations.json).
      'multi-turn': { type: 'boolean', default: false },
      conversations: { type: 'string', default: join(HERE, 'fixtures/bar-conversations.json') },
    },
  });
  if (!values.arm || !values.flags || !values.out)
    throw new Error('--arm, --flags and --out are required');
  const arm = values.arm;
  const rounds = Number(values.rounds);
  const sets = parseSets(values.set ?? []);
  const flagsFile = resolve(values.flags);
  const multi = values['multi-turn'];
  const linesFile = resolve(multi ? values.conversations : values.lines);
  const fixture = JSON.parse(readFileSync(linesFile, 'utf8')) as Fixture;
  const CALLS = multi ? (fixture.conversations ?? []) : [];
  if (multi && !CALLS.length) throw new Error(`${linesFile} has no conversations`);
  // A call with a local hour goes to a zone where it is that hour now; the rest are in New York.
  const at = new Date();
  const zoneOf = (c?: Conversation): string =>
    c?.localHour === undefined ? 'America/New_York' : zoneAtLocalHour(c.localHour, at);
  const clock = (zone: string): string =>
    at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
  const LINES: Line[] = multi
    ? scoredTurns(CALLS).map((t) => {
        const c = CALLS.find((x) => x.id === t.conversation);
        return {
          ...t,
          context: c?.context,
          knows:
            c?.localHour === undefined
              ? undefined
              : [`it is ${clock(zoneOf(c))} where the caller is`],
        };
      })
    : (fixture.lines ?? []).map((l) => ({ ...l, key: l.text, insight: Boolean(l.context) }));

  // The arm's flags win over the shell, so a result says exactly what it ran with.
  const env = armEnv(JSON.parse(readFileSync(flagsFile, 'utf8')), sets);
  Object.assign(process.env, env);
  process.env.PROMPT_MODE ??= 'character';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:1';

  // Repo modules only after the flags are in place.
  const { initializeLogger, llm } = await import('@livekit/agents');
  // toProviderFormat logs through the SDK logger, which must exist first.
  initializeLogger({ pretty: false, level: 'warn' });
  const { generate } = await import('../first-call-eval/vertex.js');
  const { loadModelBaseInstructions, loadSystemPrompt } =
    await import('../../src/agents/personas/prompt-loader.js');
  const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
  const { timeContext } = await import('../../src/agents/shared/time-context.js');
  const { formatRecall } = await import('../../src/memory/recall/session-recall.js');

  const baseInstructions = await loadModelBaseInstructions();
  const sheets: Record<string, string> = {};
  const canonGrams: Record<string, Set<string> | undefined> = {};
  const repo = join(HERE, '../..');
  for (const p of PERSONAS) {
    sheets[p] = await loadSystemPrompt(p);
    if (values['exclude-canon']) canonGrams[p] = ngramSet(bible(p, repo));
  }
  /** The persona's instructions for a caller in `zone`, and their 4-grams for the copy check. */
  const systemCache = new Map<string, { text: string; grams: Set<string> }>();
  const systemFor = (
    p: string,
    zone = 'America/New_York'
  ): { text: string; grams: Set<string> } => {
    const k = `${p}|${zone}`;
    let sys = systemCache.get(k);
    if (!sys) {
      const text = `${baseInstructions}${timeContext(at, zone)}\n\n---\n\n${sheets[p]}`;
      sys = { text, grams: ngramSet(text) };
      systemCache.set(k, sys);
    }
    return sys;
  };
  const copiedFor = (p: string, reply: string, reminder: string, zone?: string): string[] =>
    copiedNgrams(reply, [systemFor(p, zone).grams, ngramSet(reminder)], 4, canonGrams[p]);
  const now = Date.now();
  const recallFor = (context?: Fact[]): string | null =>
    context
      ? formatRecall(
          context.map((f) => ({
            entity: f.entity,
            key: f.key,
            value: f.value,
            confidence: 0.9,
            extractedAt: new Date(now - f.daysAgo * 86_400_000).toISOString(),
          })),
          [],
          fixture.caller,
          now,
          { env: process.env }
        )
      : null;

  // ------------------------------------------------------------ replies
  /** One reply through the live text path, and the reminder withTurnReminder appended to `said`. */
  async function answer(
    ctx: InstanceType<typeof llm.ChatContext>,
    session: object,
    said: string
  ): Promise<{ reply: string; reminder: string }> {
    const request = withTurnReminder(ctx, session);
    const [turns, extra] = (await request.toProviderFormat('google')) as [
      Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
      { systemMessages: string[] | null },
    ];
    // The reminder is what withTurnReminder appended to the caller's message.
    const last = [...request.items]
      .reverse()
      .find((i) => i.type === 'message' && i.role === 'user');
    const asked =
      last && last.type === 'message'
        ? last.content.filter((c): c is string => typeof c === 'string').join('')
        : '';
    const reminder = asked.startsWith(said) ? asked.slice(said.length).trim() : asked;
    const reply = await generate({
      model: MODEL,
      system: (extra.systemMessages ?? []).join('\n\n'),
      contents: turns.map((t) => ({
        role: t.role,
        parts: t.parts.map((x) => ({ text: x.text })),
      })),
      temperature: 0.8,
      thinkingLevel: 'MINIMAL',
    });
    return { reply, reminder };
  }

  async function replies(label: string): Promise<Generated> {
    if (multi) return calls(label);
    const out: Replies = {};
    for (const l of LINES) out[l.key] = {};
    let done = 0;
    await pooled(
      LINES.flatMap((line) =>
        PERSONAS.map((p) => async () => {
          const session = {
            userData: { userId: `bar-${arm}-${label}-${p}`, isReturningUser: true, personaId: p },
          };
          const ctx = llm.ChatContext.empty();
          ctx.addMessage({ role: 'system', content: systemFor(p).text });
          const note = recallFor(line.context);
          if (note) ctx.addMessage({ role: 'system', content: note, id: 'recall_1' });
          ctx.addMessage({ role: 'user', content: line.text });
          const { reply, reminder } = await answer(ctx, session, line.text);
          out[line.key][p] = { reply, reminder, copied: copiedFor(p, reply, reminder) };
          if (++done % 30 === 0 || !reply)
            progress(
              `${label} reply ${done}/${LINES.length * PERSONAS.length}${reply ? '' : ` EMPTY (${p})`}`
            );
        })
      )
    );
    return { replies: out };
  }

  /**
   * Multi-turn: each persona plays each scripted call. After every reply but
   * the last, the session goes speaking -> listening, so the director and the
   * deliberator installed by installDirectorNotes (turn-observers.ts) read the
   * call exactly as on a live session; their model calls finish before the
   * caller's next turn, whose reminder then carries what they wrote.
   */
  async function calls(label: string): Promise<Generated> {
    const { voice } = await import('@livekit/agents');
    const { installDirectorNotes } = await import('../../src/agents/multi-agent/turn-observers.js');
    const { getDirector } = await import('../../src/agents/personas/director-notes.js');
    const { getDeliberator } = await import('../../src/agents/personas/deliberation.js');
    const EV = voice.AgentSessionEventTypes;
    const out: Replies = {};
    for (const l of LINES) out[l.key] = {};
    const transcripts: Transcripts = {};
    const observers: Observers = {
      directorRuns: 0,
      directorWrote: 0,
      overBudget: 0,
      deliberation: {},
    };
    let done = 0;
    await pooled(
      CALLS.flatMap((c) =>
        PERSONAS.map((p) => async () => {
          const zone = zoneOf(c);
          // A stand-in AgentSession: the observers only listen for its events and read userData.
          const session = Object.assign(new EventEmitter(), {
            userData: {
              userId: `bar-${arm}-${label}-${p}-${c.id}`,
              isReturningUser: true,
              personaId: p,
              userName: fixture.caller,
              callerTimezone: zone,
            },
          });
          const ctx = llm.ChatContext.empty();
          ctx.addMessage({ role: 'system', content: systemFor(p, zone).text });
          const note = recallFor(c.context);
          if (note) ctx.addMessage({ role: 'system', content: note, id: 'recall_1' });
          const cleanup: Array<() => void> = [];
          await installDirectorNotes({
            session: session as never,
            sessionId: `bar-${label}-${p}-${c.id}`,
            userName: fixture.caller,
            agent: { chatCtx: ctx },
            cleanupFunctions: cleanup,
          });
          // The handlers fire and forget; keep their promises so the next turn waits for them.
          const pending: Array<Promise<void>> = [];
          const director = getDirector(session);
          const deliberator = getDeliberator(session);
          let directorMs = 0;
          if (director) {
            const observe = director.observe.bind(director);
            director.observe = (...a) => {
              const t0 = Date.now();
              const work = observe(...a).finally(() => void (directorMs = Date.now() - t0));
              pending.push(work);
              return work;
            };
          }
          if (deliberator) {
            const observe = deliberator.observe.bind(deliberator);
            deliberator.observe = (...a) => (
              pending.push(observe(...a)),
              pending[pending.length - 1]
            );
          }
          const log: TurnLog[] = [];
          for (const [i, said] of c.turns.entries()) {
            session.emit(EV.ConversationItemAdded, {
              item: ctx.addMessage({ role: 'user', content: said }),
            });
            const { reply, reminder } = await answer(ctx, session, said);
            const notes = notesIn(reminder);
            log.push({ caller: said, reply, ...notes });
            const key = `${c.id}#${i}`;
            if (out[key])
              out[key][p] = { reply, reminder, copied: copiedFor(p, reply, reminder, zone), notes };
            session.emit(EV.ConversationItemAdded, {
              item: ctx.addMessage({ role: 'assistant', content: reply }),
            });
            if (++done % 30 === 0 || !reply)
              progress(`${label} turn ${done}${reply ? '' : ` EMPTY (${p} ${key})`}`);
            if (i === c.turns.length - 1) break; // nobody reads notes after the last reply
            session.emit(EV.AgentStateChanged, { newState: 'speaking' });
            session.emit(EV.AgentStateChanged, { newState: 'listening' });
            await Promise.all(pending.splice(0));
            if (director) {
              const turn = log[log.length - 1];
              turn.written = [...director.current()];
              turn.directorMs = directorMs;
              observers.directorRuns++;
              if (turn.written.length) observers.directorWrote++;
              if (directorMs >= 3900) observers.overBudget++;
            }
          }
          for (const [k, v] of Object.entries(deliberator?.summary() ?? {}))
            observers.deliberation[k] = (observers.deliberation[k] ?? 0) + v;
          for (const f of cleanup) f();
          (transcripts[c.id] ??= {})[p] = log;
        })
      )
    );
    return { replies: out, transcripts, observers };
  }

  // ------------------------------------------------------------ judges
  /** Multi-turn: the caller's earlier words on the call (the same in every arm), for a judge. */
  const earlierOn = (line: Line): string =>
    line.earlier?.length
      ? `Earlier on this call the caller said:\n${line.earlier.map((t) => `- "${t}"`).join('\n')}\n\n`
      : '';

  async function score(label: string, rs: Replies): Promise<Scored> {
    let judgeFailures = 0;
    const confusion: Record<string, Record<string, number>> = {};
    const hits: Record<string, number> = {};
    const tries: Record<string, number> = {};
    const filled = LINES.flatMap((l) =>
      PERSONAS.filter((p) => rs[l.key]?.[p]?.reply).map((p) => ({ line: l, p, r: rs[l.key][p] }))
    );
    const emptyReplies = LINES.length * PERSONAS.length - filled.length;

    // Distinctness: one reply at a time; judging the six as a set coupled the guesses.
    await pooled(
      filled.flatMap(({ line, p, r }) =>
        Array.from({ length: rounds }, (_, round) => async () => {
          const order = shuffled(PERSONAS, `${label}:${line.key}:${p}:${round}`);
          const keyList = order
            .map((q, i) => `${String.fromCharCode(65 + i)}: ${DESCRIPTIONS[q]}`)
            .join('\n');
          const raw = await generate({
            model: JUDGE_MODEL,
            system:
              'You identify which companion said a spoken reply. Use only voice, word choice, rhythm and personality, not topic expertise.',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text:
                      `Companions:\n${keyList}\n\nA caller said: "${line.text}"\nOne companion replied: "${maskNames(r.reply, NAMES)}"\n\n` +
                      'Which companion was it? Return JSON only: {"companion":"A"}',
                  },
                ],
              },
            ],
            temperature: 0,
            json: true,
            maxOutputTokens: 4000,
          });
          const i = parseCompanion(raw, order.length);
          if (i === null) return void judgeFailures++;
          confusion[p] ??= {};
          confusion[p][order[i]] = (confusion[p][order[i]] ?? 0) + 1;
          tries[p] = (tries[p] ?? 0) + 1;
          if (order[i] === p) hits[p] = (hits[p] ?? 0) + 1;
        })
      )
    );
    progress(`${label} distinctness judged`);

    // Insight: only lines that came with something to remember.
    let natural = 0;
    let forced = 0;
    let insightN = 0;
    await pooled(
      filled
        .filter(({ line }) => line.insight)
        .map(({ line, r }) => async () => {
          const facts = (line.context ?? [])
            .map((f) => `- ${f.entity === 'user' ? 'the caller' : f.entity}: ${f.key} = ${f.value}`)
            .join('\n');
          const what = line.earlier
            ? 'something the speaker remembers, knows or heard earlier on this call'
            : 'something the speaker remembers';
          const raw = await generate({
            model: JUDGE_MODEL,
            system:
              'You judge whether a friend on a phone call used what they remember about the caller.',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text:
                      (facts
                        ? `What the speaker remembers about the caller from past calls:\n${facts}\n\n`
                        : '') +
                      (line.knows
                        ? `What the speaker knows right now: ${line.knows.join('; ')}.\n\n`
                        : '') +
                      earlierOn(line) +
                      `The caller said: "${line.text}"\nThe speaker replied: "${untagged(r.reply)}"\n\n` +
                      `Did the reply use ${what}? "natural": it used a remembered detail the way a friend who remembers would, woven in and fitting the moment. ` +
                      '"forced": it used one awkwardly (recited, listed, or out of place). "none": it used nothing it remembers. ' +
                      'Return JSON only: {"use":"natural"}',
                  },
                ],
              },
            ],
            temperature: 0,
            json: true,
            maxOutputTokens: 4000,
          });
          const use = parseUse(raw);
          if (use === null) return void judgeFailures++;
          insightN++;
          if (use === 'natural') natural++;
          if (use === 'forced') forced++;
        })
    );
    progress(`${label} insight judged`);

    const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
    const lengths = (ps: string[]): number[] =>
      filled.filter((f) => ps.includes(f.p)).map((f) => words(untagged(f.r.reply)).length);
    return {
      metrics: {
        distinctness: rate(sum(hits), sum(tries)),
        insight: rate(natural, insightN),
        copy: copyStats(filled.map((f) => f.r.copied)),
        medianWords: median(lengths(PERSONAS)),
      },
      forced: rate(forced, insightN),
      perPersona: Object.fromEntries(
        PERSONAS.map((p) => [
          p,
          { distinctness: rate(hits[p] ?? 0, tries[p] ?? 0), medianWords: median(lengths([p])) },
        ])
      ),
      confusion,
      judgeFailures,
      emptyReplies,
    };
  }

  /**
   * How often `a`'s reply sounds more like a real friend than `b`'s, same
   * persona and line, over all pairs and over length-matched pairs only.
   */
  async function pairwise(
    a: Replies,
    b: Replies,
    seed: string
  ): Promise<Humanness & { judgeFailures: number; pairs: Pair[] }> {
    const pairs: Pair[] = [];
    let judgeFailures = 0;
    await pooled(
      LINES.flatMap((line) =>
        PERSONAS.filter((p) => a[line.key]?.[p]?.reply && b[line.key]?.[p]?.reply).map(
          (p) => async () => {
            const ra = untagged(a[line.key][p].reply);
            const rb = untagged(b[line.key][p].reply);
            const aFirst = shuffled([true, false], `${seed}:${line.key}:${p}`)[0];
            const [r1, r2] = aFirst ? [ra, rb] : [rb, ra];
            const raw = await generate({
              model: JUDGE_MODEL,
              system: 'You judge spoken replies on a phone call between friends.',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text:
                        `${earlierOn(line)}A caller said: "${line.text}"\n\nReply 1: "${r1}"\nReply 2: "${r2}"\n\n` +
                        'Which reply sounds more like a real friend talking on the phone: a person, not an assistant or a script? ' +
                        'Ignore length entirely: a short reply and a long one can be equally human, and either can sound scripted. ' +
                        'Do not prefer the longer, fuller or more helpful reply, or the shorter one. Judge only whether it sounds like a real friend talking. ' +
                        'Return JSON only: {"pick":"1"} or {"pick":"2"}',
                    },
                  ],
                },
              ],
              temperature: 0,
              json: true,
              maxOutputTokens: 4000,
            });
            const pick = parsePick(raw);
            if (pick === null) return void judgeFailures++;
            pairs.push({
              line: line.key,
              persona: p,
              armWords: words(ra).length,
              baseWords: words(rb).length,
              armWins: (pick === 1) === aFirst,
            });
          }
        )
      )
    );
    progress(`${seed} humanness judged`);
    return { ...humannessOf(pairs), judgeFailures, pairs };
  }

  // ------------------------------------------------------------ run
  const dir = join(resolve(values.out), arm);
  const prior = values.reuse
    ? (JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) as Result)
    : null;
  /** Saved scores with the copy check redone on the saved replies (cheap, no LLM). */
  const recopied = (rs: Replies, scored: Scored): Scored => {
    for (const byPersona of Object.values(rs))
      for (const [p, r] of Object.entries(byPersona))
        if (r.reply) r.copied = copiedFor(p, r.reply, r.reminder);
    const copied = Object.values(rs).flatMap((byPersona) =>
      Object.values(byPersona)
        .filter((r) => r.reply)
        .map((r) => r.copied)
    );
    return { ...scored, metrics: { ...scored.metrics, copy: copyStats(copied) } };
  };
  if (prior && (prior.arm !== arm || JSON.stringify(prior.sets) !== JSON.stringify(sets)))
    throw new Error(`--reuse: ${dir}/result.json is arm ${prior.arm} with other overrides`);
  const run1 = prior ? null : await replies('run1');
  const result: Result = prior
    ? {
        ...prior,
        judgeModel: JUDGE_MODEL,
        rescoredAt: new Date().toISOString(),
        scored: recopied(prior.replies, prior.scored),
      }
    : {
        arm,
        sets,
        flagsFile,
        linesFile,
        model: MODEL,
        judgeModel: JUDGE_MODEL,
        rounds,
        at: new Date().toISOString(),
        scored: undefined as unknown as Scored,
        replies: run1?.replies ?? {},
        ...(multi ? { mode: 'multi-turn' as const } : {}),
        transcripts: run1?.transcripts,
        observers: run1?.observers,
      };
  result.copyExcludesCanon = values['exclude-canon'];
  delete result.humanness;
  delete result.comparison;
  if (!prior) result.scored = await score('run1', result.replies);
  const md: string[] = [
    `# Persona eval bar: ${arm}`,
    '',
    `Overrides: ${
      Object.keys(sets).length
        ? Object.entries(sets)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : 'none (flags file as is)'
    }. ` +
      (multi
        ? `${CALLS.length} scripted calls x ${PERSONAS.length} personas, the last 2 replies of each scored (${LINES.length} per persona), insight judged on ${LINES.filter((l) => l.insight).length}. `
        : `${LINES.length} lines x ${PERSONAS.length} personas, ${LINES.filter((l) => l.context).length} lines with caller context. `) +
      `Model ${MODEL}, judge ${JUDGE_MODEL}. Judge failures ${result.scored.judgeFailures}, empty replies ${result.scored.emptyReplies}.`,
    '',
  ];

  if (values.aa) {
    const run2 = prior?.aa ? null : await replies('run2');
    const replies2 = prior?.aa ? prior.aa.replies : (run2?.replies ?? {});
    const scored2 = prior?.aa ? recopied(replies2, prior.aa.scored) : await score('run2', replies2);
    const h = await pairwise(replies2, result.replies, `${arm}:aa`);
    const gap = aaGap(result.scored.metrics, scored2.metrics, humannessRate(h));
    const floor = noiseFloor(result.scored.metrics, scored2.metrics, humannessRate(h));
    result.aa = {
      scored: scored2,
      humanness: { overall: h.overall, matched: h.matched },
      pairs: h.pairs,
      gap,
      floor,
      replies: replies2,
      transcripts: run2 ? run2.transcripts : prior?.aa?.transcripts,
      observers: run2 ? run2.observers : prior?.aa?.observers,
    };
    md.push(
      metricsTable('run 1', result.scored.metrics),
      '',
      metricsTable('run 2 (A/A)', scored2.metrics, h),
      '',
      '## A/A noise floor (a change counts only if its gap is larger)',
      '',
      'Floor = the larger of the gap the two runs showed and the 95% gap their sample sizes allow.',
      '',
      '| metric | A/A gap | sampling gap (when larger) | floor |',
      '|---|---|---|---|',
      ...(Object.keys(floor) as Array<keyof Floor>).map(
        (k) =>
          `| ${k} | ${(100 * gap[k]).toFixed(1)} pts | ${floor[k] > gap[k] ? `${(100 * floor[k]).toFixed(1)} pts` : '-'} | ${(100 * floor[k]).toFixed(1)} pts |`
      ),
      ''
    );
  } else md.push(metricsTable(arm, result.scored.metrics), '');

  if (values.baseline) {
    const baseResult = JSON.parse(
      readFileSync(join(resolve(values.baseline), 'result.json'), 'utf8')
    ) as Result;
    if ((baseResult.mode ?? 'single-turn') !== (result.mode ?? 'single-turn'))
      throw new Error(
        `--baseline ${baseResult.arm} is ${baseResult.mode ?? 'single-turn'}, this run is not`
      );
    const h = await pairwise(result.replies, baseResult.replies, `${arm}:vs:${baseResult.arm}`);
    result.humanness = { vs: baseResult.arm, ...h };
    result.comparison = compareArms(
      baseResult.scored.metrics,
      result.scored.metrics,
      h,
      // Recomputed from the saved A/A runs, so a baseline keeps up with the floor rule.
      baseResult.aa
        ? noiseFloor(
            baseResult.scored.metrics,
            baseResult.aa.scored.metrics,
            aaHumanRate(baseResult.aa.humanness)
          )
        : null
    );
    md.push(
      `## ${arm} vs ${baseResult.arm}`,
      '',
      `Humanness, ${arm} preferred: all pairs ${pctCi(h.overall)}; length-matched pairs (word counts within 1.5x) ${pctCi(h.matched)}. ` +
        `The verdict uses the length-matched pairs when there are at least 30 (judge failures ${h.judgeFailures}).`,
      '',
      compareTable(result.comparison),
      ''
    );
  }

  if (result.observers) md.push(observersLine(result), '');
  const top = result.scored.metrics.copy.top.slice(0, 10);
  md.push(
    `## Most-copied 4-grams (replies containing each${result.copyExcludesCanon ? "; the persona's own canon left out" : ''})`,
    '',
    ...top.map((t) => `- "${t.ngram}" (${t.replies})`),
    ''
  );
  md.push(
    '## Per persona (run 1)',
    '',
    '| persona | distinctness | median words |',
    '|---|---|---|',
    ...PERSONAS.map((p) => {
      const s = result.scored.perPersona[p];
      return `| ${p} | ${s.distinctness.k}/${s.distinctness.n} | ${s.medianWords} |`;
    }),
    ''
  );

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(dir, 'result.md'), md.join('\n'));
  console.log(md.join('\n'));
  console.log(`-> ${dir}/result.json`);
}

/** Multi-turn: what the director and deliberation did, and what the scored replies were given. */
function observersLine(r: Result): string {
  const o = r.observers;
  if (!o) return '';
  const scored = Object.values(r.replies).flatMap((byPersona) => Object.values(byPersona));
  const given = (f: (n: NonNullable<Reply['notes']>) => boolean): string =>
    `${scored.filter((x) => x.notes && f(x.notes)).length}/${scored.length}`;
  const d = o.deliberation;
  return (
    `Between turns: the director ran ${o.directorRuns} times, wrote notes after ${o.directorWrote}, hit its 4 s budget ${o.overBudget}; ` +
    `deliberation ran ${d.runs ?? 0} (none ${d.none ?? 0}, failed ${d.failed ?? 0}), offered ${d.offered ?? 0}, expired ${d.expired ?? 0}. ` +
    `Scored replies given a director note ${given((n) => n.director.length > 0)}, a thought ${given((n) => n.thought !== '')}.`
  );
}

// Repo imports (config watchers, stores) keep handles open, so exit explicitly.
main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
