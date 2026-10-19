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
  aaGap,
  parseCompanion,
  parsePick,
  parseSets,
  parseUse,
  rate,
  shuffled,
  words,
  type Floor,
  type Metrics,
  type Rate,
} from './bar-lib.js';

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
interface Line {
  text: string;
  context?: Fact[];
}
interface Fixture {
  caller: string;
  lines: Line[];
}
/** One persona's answer to one line, and the instruction text the copy check read. */
interface Reply {
  reply: string;
  reminder: string;
  copied: string[];
}
/** line -> persona -> reply */
type Replies = Record<string, Record<string, Reply>>;

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
  humanness?: { vs: string; rate: Rate; judgeFailures: number };
  /** gap: how far the two runs landed; floor: max(gap, sampling gap), what a change must beat. */
  aa?: { scored: Scored; humanness: Rate; gap: Floor; floor: Floor; replies: Replies };
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
    },
  });
  if (!values.arm || !values.flags || !values.out)
    throw new Error('--arm, --flags and --out are required');
  const arm = values.arm;
  const rounds = Number(values.rounds);
  const sets = parseSets(values.set ?? []);
  const flagsFile = resolve(values.flags);
  const linesFile = resolve(values.lines);
  const fixture = JSON.parse(readFileSync(linesFile, 'utf8')) as Fixture;
  const LINES = fixture.lines;

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

  const base = (await loadModelBaseInstructions()) + timeContext(new Date(), 'America/New_York');
  const systems: Record<string, string> = {};
  const systemGrams: Record<string, Set<string>> = {};
  for (const p of PERSONAS) {
    systems[p] = `${base}\n\n---\n\n${await loadSystemPrompt(p)}`;
    systemGrams[p] = ngramSet(systems[p]);
  }
  const now = Date.now();
  const recallFor = (line: Line): string | null =>
    line.context
      ? formatRecall(
          line.context.map((f) => ({
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
  async function replies(label: string): Promise<Replies> {
    const out: Replies = {};
    for (const l of LINES) out[l.text] = {};
    let done = 0;
    await pooled(
      LINES.flatMap((line) =>
        PERSONAS.map((p) => async () => {
          const session = {
            userData: { userId: `bar-${arm}-${label}-${p}`, isReturningUser: true, personaId: p },
          };
          const ctx = llm.ChatContext.empty();
          ctx.addMessage({ role: 'system', content: systems[p] });
          const note = recallFor(line);
          if (note) ctx.addMessage({ role: 'system', content: note, id: 'recall_1' });
          ctx.addMessage({ role: 'user', content: line.text });
          const request = withTurnReminder(ctx, session);
          const [turns, extra] = (await request.toProviderFormat('google')) as [
            Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
            { systemMessages: string[] | null },
          ];
          // The reminder is what withTurnReminder appended to the caller's message.
          const last = [...request.items]
            .reverse()
            .find((i) => i.type === 'message' && i.role === 'user');
          const said =
            last && last.type === 'message'
              ? last.content.filter((c): c is string => typeof c === 'string').join('')
              : '';
          const reminder = said.startsWith(line.text) ? said.slice(line.text.length).trim() : said;
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
          out[line.text][p] = {
            reply,
            reminder,
            copied: copiedNgrams(reply, [systemGrams[p], ngramSet(reminder)]),
          };
          if (++done % 30 === 0 || !reply)
            progress(
              `${label} reply ${done}/${LINES.length * PERSONAS.length}${reply ? '' : ` EMPTY (${p})`}`
            );
        })
      )
    );
    return out;
  }

  // ------------------------------------------------------------ judges
  async function score(label: string, rs: Replies): Promise<Scored> {
    let judgeFailures = 0;
    const confusion: Record<string, Record<string, number>> = {};
    const hits: Record<string, number> = {};
    const tries: Record<string, number> = {};
    const filled = LINES.flatMap((l) =>
      PERSONAS.filter((p) => rs[l.text][p]?.reply).map((p) => ({ line: l, p, r: rs[l.text][p] }))
    );
    const emptyReplies = LINES.length * PERSONAS.length - filled.length;

    // Distinctness: one reply at a time; judging the six as a set coupled the guesses.
    await pooled(
      filled.flatMap(({ line, p, r }) =>
        Array.from({ length: rounds }, (_, round) => async () => {
          const order = shuffled(PERSONAS, `${label}:${line.text}:${p}:${round}`);
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
        .filter(({ line }) => line.context)
        .map(({ line, r }) => async () => {
          const facts = (line.context ?? [])
            .map((f) => `- ${f.entity === 'user' ? 'the caller' : f.entity}: ${f.key} = ${f.value}`)
            .join('\n');
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
                      `What the speaker remembers about the caller from past calls:\n${facts}\n\n` +
                      `The caller said: "${line.text}"\nThe speaker replied: "${untagged(r.reply)}"\n\n` +
                      'Did the reply use something the speaker remembers? "natural": it used a remembered detail the way a friend who remembers would, woven in and fitting the moment. ' +
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

  /** How often `a`'s reply sounds more like a real friend than `b`'s, same persona and line. */
  async function pairwise(
    a: Replies,
    b: Replies,
    seed: string
  ): Promise<{ rate: Rate; judgeFailures: number }> {
    let wins = 0;
    let n = 0;
    let judgeFailures = 0;
    await pooled(
      LINES.flatMap((line) =>
        PERSONAS.filter((p) => a[line.text]?.[p]?.reply && b[line.text]?.[p]?.reply).map(
          (p) => async () => {
            const aFirst = shuffled([true, false], `${seed}:${line.text}:${p}`)[0];
            const [r1, r2] = aFirst
              ? [a[line.text][p].reply, b[line.text][p].reply]
              : [b[line.text][p].reply, a[line.text][p].reply];
            const raw = await generate({
              model: JUDGE_MODEL,
              system: 'You judge spoken replies on a phone call between friends.',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text:
                        `A caller said: "${line.text}"\n\nReply 1: "${untagged(r1)}"\nReply 2: "${untagged(r2)}"\n\n` +
                        'Which reply sounds more like a real friend talking on the phone: a person, not an assistant or a script? ' +
                        'Judge only how human it sounds, not which is longer or more helpful. Return JSON only: {"pick":"1"} or {"pick":"2"}',
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
            n++;
            if ((pick === 1) === aFirst) wins++;
          }
        )
      )
    );
    progress(`${seed} humanness judged`);
    return { rate: rate(wins, n), judgeFailures };
  }

  // ------------------------------------------------------------ run
  const result: Result = {
    arm,
    sets,
    flagsFile,
    linesFile,
    model: MODEL,
    judgeModel: JUDGE_MODEL,
    rounds,
    at: new Date().toISOString(),
    scored: undefined as unknown as Scored,
    replies: await replies('run1'),
  };
  result.scored = await score('run1', result.replies);
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
      `${LINES.length} lines x ${PERSONAS.length} personas, ${LINES.filter((l) => l.context).length} lines with caller context. ` +
      `Model ${MODEL}, judge ${JUDGE_MODEL}. Judge failures ${result.scored.judgeFailures}, empty replies ${result.scored.emptyReplies}.`,
    '',
  ];

  if (values.aa) {
    const replies2 = await replies('run2');
    const scored2 = await score('run2', replies2);
    const h = await pairwise(replies2, result.replies, `${arm}:aa`);
    const gap = aaGap(result.scored.metrics, scored2.metrics, h.rate);
    const floor = noiseFloor(result.scored.metrics, scored2.metrics, h.rate);
    result.aa = { scored: scored2, humanness: h.rate, gap, floor, replies: replies2 };
    md.push(
      metricsTable('run 1', result.scored.metrics),
      '',
      metricsTable('run 2 (A/A)', scored2.metrics, h.rate),
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
    const h = await pairwise(result.replies, baseResult.replies, `${arm}:vs:${baseResult.arm}`);
    result.humanness = { vs: baseResult.arm, ...h };
    result.comparison = compareArms(
      baseResult.scored.metrics,
      result.scored.metrics,
      h.rate,
      // Recomputed from the saved A/A runs, so a baseline keeps up with the floor rule.
      baseResult.aa
        ? noiseFloor(
            baseResult.scored.metrics,
            baseResult.aa.scored.metrics,
            baseResult.aa.humanness
          )
        : null
    );
    md.push(
      `## ${arm} vs ${baseResult.arm}`,
      '',
      `Humanness: ${arm} preferred in ${h.rate.k}/${h.rate.n} = ${(100 * h.rate.p).toFixed(1)}% [${(100 * h.rate.lo).toFixed(1)}%, ${(100 * h.rate.hi).toFixed(1)}%] of pairs (judge failures ${h.judgeFailures}).`,
      '',
      compareTable(result.comparison),
      ''
    );
  }

  const top = result.scored.metrics.copy.top.slice(0, 10);
  md.push(
    '## Most-copied 4-grams (replies containing each)',
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

  const dir = join(resolve(values.out), arm);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(dir, 'result.md'), md.join('\n'));
  console.log(md.join('\n'));
  console.log(`-> ${dir}/result.json`);
}

// Repo imports (config watchers, stores) keep handles open, so exit explicitly.
main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
