/**
 * The crisis kernel's K0 baseline: what the five DETERMINISTIC crisis readers make of every line
 * of every crisis corpus in the repo, under each config below. No model, no network. Map and
 * corpus list: docs/plans/2026-11-01-crisis-kernel-map.md.
 *
 *   pnpm crisis:baseline          rewrite deterministic.generated.json
 *   pnpm crisis:baseline --check  exit 1 when the committed file differs from this head
 *
 * A row is one corpus line, `[key, textHash, tuple per config]`; a tuple is the five readings,
 * each `[level, resources, actions, has988, has911]` (has988: the number appears anywhere in what
 * that reader returns). Lines are never copied here, only a key and a hash. The clock, the zone
 * and Math.random are pinned per line, so every machine writes the same bytes.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CRISIS_CONTEXTUAL } from '../../../src/agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../../src/agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import { FLAG_MANIFEST } from '../../../src/config/flag-manifest.js';
import { detectCrisisSignals } from '../../../src/services/human-transfer/escalation-classifier.js';
import { detectCrisis } from '../../../src/services/safety/crisis-guard.js';
import { performSafetyCheck } from '../../../src/services/safety/index.js';
import { CRISIS_TEST_CASES } from '../../../src/services/superhuman/validation/crisis-test-cases.js';
import { RISK_FORMS } from '../../../src/services/wellbeing-tracking/__tests__/crisis-corpus.js';
import { checkWarnings } from '../../../src/services/wellbeing-tracking/early-warning.js';
import { getWellbeingProfile } from '../../../src/services/wellbeing-tracking/index.js';
import { assessSafety } from '../../../src/tools/domains/life-coaching-shared/safety-guards.js';
import { PROFILES } from '../full-path-profiles.js';

export const OUT = 'scripts/crisis-eval/baseline/deterministic.generated.json';
const CLOCK = Date.UTC(2026, 10, 1, 15, 0, 0);

/** main as shipped (every flag below unset), and the full-path harness's two prod profiles. */
export const CONFIGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  defaults: {},
  'prod-2026-10-31': PROFILES['prod-2026-10-31'],
  'prod-2026-11-01': PROFILES['prod-2026-11-01'],
};

/** Every flag a config may set: the crisis flags in the manifest plus every profile's flags. */
const FLAGS = [
  ...new Set([
    ...Object.keys(FLAG_MANIFEST).filter((n) =>
      /^(CRISIS_|SAFETY_|EARLY_WARNING_|MINOR_|SMS_CRISIS_|THIRD_PARTY_|OPENER_GATE)/.test(n)
    ),
    ...Object.values(CONFIGS).flatMap((c) => Object.keys(c)),
  ]),
];

type Line = readonly [key: string, text: string];
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const keyed = (texts: readonly string[]): Line[] => texts.map((t, i) => [`${i}`, t]);
const texts = (path: string): string[] =>
  json<Array<string | { text: string }>>(path).map((r) => (typeof r === 'string' ? r : r.text));
const ls = (dir: string, match: RegExp): string[] =>
  readdirSync(dir)
    .filter((f) => match.test(f))
    .sort()
    .map((f) => `${dir}/${f}`);

/** A multi-turn call corpus: every caller line of every call, one line at a time. */
const callLines = (path: string): Line[] =>
  json<{
    calls: Array<{
      id: string;
      opening?: { who: string; text: string }[];
      turns: { text: string }[];
    }>;
  }>(path).calls.flatMap((c) => [
    ...(c.opening ?? []).flatMap((o, i): Line[] =>
      o.who === 'caller' ? [[`${c.id}/o${i}`, o.text]] : []
    ),
    ...c.turns.map((t, i): Line => [`${c.id}/${i}`, t.text]),
  ]);

/** A voice-eval caller script: one caller line per non-comment line. */
const scriptLines = (path: string): Line[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((s, i): Line => [`L${i + 1}`, s.trim()])
    .filter(([, s]) => s && !s.startsWith('#'));

const FX = 'src/agents/__tests__/fixtures';
const WB = 'src/services/wellbeing-tracking/__tests__';

/** Every crisis corpus in the repo, by the file it lives in. A new corpus file joins on its own. */
export function corpora(): Record<string, Line[]> {
  const out: Record<string, Line[]> = {};
  for (const p of ls('scripts/crisis-eval/corpus', /\.json$/)) out[p] = callLines(p);
  for (const p of [
    ...ls('scripts/crisis-eval', /^(redteam|gloomy)-.*\.json$/),
    ...ls(FX, /^crisis-.*\.json$/),
    `${WB}/crisis-joined-words.json`,
    `${WB}/crisis-phrases.json`,
    `${WB}/crisis-adversarial.json`,
  ])
    out[p] = keyed(texts(p));
  // "/pattern/ | line": the line is what a caller says.
  out[`${WB}/crisis-soft-pairs.json`] = keyed(
    texts(`${WB}/crisis-soft-pairs.json`).map((s) => s.slice(s.indexOf(' | ') + 3))
  );
  out[`${WB}/crisis-corpus.ts#RISK_FORMS`] = keyed(RISK_FORMS);
  out[`${FX}/crisis-heldout.ts`] = keyed(CRISIS_HELDOUT.map((c) => c.text));
  out[`${FX}/crisis-test-blind.ts`] = keyed(CRISIS_TEST_BLIND.map((c) => c.text));
  out[`${FX}/crisis-relay.ts`] = keyed(CRISIS_RELAY.map((c) => c.text));
  out[`${FX}/crisis-contextual.ts`] = keyed(CRISIS_CONTEXTUAL.map((c) => c.text));
  out['src/services/superhuman/validation/crisis-test-cases.ts'] = keyed(
    CRISIS_TEST_CASES.map((c) => c.input)
  );
  for (const p of ls('scripts/voice-eval/scenarios', /crisis.*\.txt$/)) out[p] = scriptLines(p);
  return out;
}

type Reading = [
  level: string | number,
  resources: string[],
  actions: string[],
  has988: boolean,
  has911: boolean,
];
const says = (out: unknown, n: string): boolean =>
  new RegExp(`(?<![0-9])${n}(?![0-9])`).test(JSON.stringify(out ?? null));
const reading = (
  level: string | number,
  resources: string[],
  actions: string[],
  out: unknown
): Reading => [
  level,
  [...resources].sort(),
  [...actions].sort(),
  says(out, '988'),
  says(out, '911'),
];

/** Run `fn` with Math.random seeded by `seed`, the clock at CLOCK and the zone UTC. */
function pinned<T>(seed: string, fn: () => T): T {
  let s = createHash('sha256').update(seed).digest().readUInt32LE(0);
  const [random, RealDate, zone] = [Math.random, Date, process.env.TZ];
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [CLOCK]) as [number]));
    }
    static now = () => CLOCK;
  }
  Math.random = () => (s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32;
  globalThis.Date = FixedDate as DateConstructor;
  process.env.TZ = 'UTC';
  try {
    return fn();
  } finally {
    [Math.random, globalThis.Date] = [random, RealDate];
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
}

let reads = 0;

/** The five readings of one line. A new user and wellbeing profile each time: no read sees another. */
export function readLine(text: string, seed: string): Reading[] {
  const user = `k0-${++reads}`;
  return pinned(seed, () => {
    const g = detectCrisis(text);
    const t = detectCrisisSignals(text);
    const s = performSafetyCheck(text, { userId: user, personaId: 'ferni' });
    const w = checkWarnings(getWellbeingProfile(user), { recentMessages: [text] });
    const a = assessSafety(text);
    const r = s.response;
    const safetyRes = [r?.primaryResource, ...(r?.additionalResources ?? [])].flatMap((x) =>
      x ? [x.name] : []
    );
    const signals = Object.entries(t).flatMap(([k, v]) => (v === true ? [k] : []));
    const warned =
      w
        .map((x) => x.severity)
        .sort()
        .join('+') || 'none';
    return [
      reading(g.severity, [], g.isCrisis ? ['crisis', ...g.indicators] : g.indicators, g),
      reading(t.severity, [], signals, t),
      reading(s.escalation.level, safetyRes, s.shouldInterrupt ? ['interrupt'] : [], [
        r,
        s.contextInjection,
      ]),
      reading(
        warned,
        [],
        w.map((x) => x.type),
        w.map((x) => x.recommendations)
      ),
      reading(
        a.level,
        (a.resources ?? []).map((x) => x.name),
        [a.recommendedAction],
        a.resources
      ),
    ];
  });
}

/** Every corpus line's readings with `flags` set and every other crisis flag unset. */
export function readAll(flags: Readonly<Record<string, string>>): Map<string, Reading[][]> {
  const saved = FLAGS.map((n) => [n, process.env[n]] as const);
  for (const n of FLAGS) delete process.env[n];
  Object.assign(process.env, flags);
  try {
    const lines = Object.entries(corpora());
    return new Map(
      lines.map(([file, ln]) => [file, ln.map(([key, text]) => readLine(text, `${file}:${key}`))])
    );
  } finally {
    for (const [n, v] of saved)
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
  }
}

/** The committed baseline: one row per line, so a changed reading is a one-line diff. */
export function baselineText(): string {
  const names = Object.keys(CONFIGS);
  const runs = names.map((n) => readAll(CONFIGS[n]));
  const tuples: string[] = [];
  const index = new Map<string, number>();
  const idOf = (t: Reading[]): number => {
    const k = JSON.stringify(t);
    if (!index.has(k)) index.set(k, tuples.push(k) - 1);
    return index.get(k)!;
  };
  const files = Object.entries(corpora()).map(([file, lines]) => {
    const rows = lines.map(([key, text], i) =>
      JSON.stringify([
        key,
        createHash('sha256').update(text).digest('hex').slice(0, 8),
        ...runs.map((run) => idOf(run.get(file)![i])),
      ])
    );
    return `{"file":${JSON.stringify(file)},"lines":${lines.length},"rows":[\n${rows.join(',\n')}\n]}`;
  });
  const head = {
    configs: Object.fromEntries(names.map((n) => [n, CONFIGS[n]])),
    readers: ['crisis-guard', 'transfer', 'safety-check', 'early-warning', 'life-coaching'],
    reading: ['level', 'resources', 'actions', 'has988', 'has911'],
  };
  return `{"head":${JSON.stringify(head)},\n"tuples":[\n${tuples.join(',\n')}\n],\n"corpora":[\n${files.join(',\n')}\n]}\n`;
}

function main(): number {
  const text = baselineText();
  if (!process.argv.includes('--check')) return (writeFileSync(OUT, text), 0);
  if (readFileSync(OUT, 'utf8') === text) return 0;
  console.error(`${OUT} differs from this head: run pnpm crisis:baseline`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
