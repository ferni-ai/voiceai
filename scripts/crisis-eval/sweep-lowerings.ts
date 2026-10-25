/**
 * Proves a change lowers no crisis read: scores every crisis fixture line with
 * the base tree's detectCrisis + assessSafety and with the head tree's, and
 * fails when any read went down (sweep-compare.ts). The crisis lane is
 * recall-first: patterns are only ever added, and lowering a read is Seth's call.
 *
 *   npx tsx scripts/crisis-eval/sweep-lowerings.ts --base-dir <tree> --head-dir <tree>
 *
 * The fixture set is always the HEAD's, so fixtures a change adds count. Every
 * case is scored alone, and again with its earlier turns when it has them. Each
 * tree is scored in its own child process (cwd = head, since the corpus reads
 * fixture files relative to it), so the two module graphs never mix. The base
 * tree must resolve `pino` (a node_modules in or above it). Exit 1 = lowered.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareSweeps, type SweepRow } from './sweep-compare.js';

interface Case {
  src: string;
  label: string;
  text: string;
  earlier?: string[];
}

const load = async (tree: string, path: string) =>
  import(pathToFileURL(join(tree, path)).href) as Promise<Record<string, unknown>>;

/** JSON fixtures: every case array in scripts/crisis-eval and the agents' crisis-*.json. */
function jsonFixtures(head: string): string[] {
  const list = (dir: string, match: RegExp) =>
    readdirSync(join(head, dir))
      .filter((f) => match.test(f))
      .sort()
      .map((f) => `${dir}/${f}`);
  return [
    ...list('scripts/crisis-eval', /\.json$/),
    ...list('src/agents/__tests__/fixtures', /^crisis-.*\.json$/),
  ];
}

async function headCases(head: string): Promise<Case[]> {
  const fx = 'src/agents/__tests__/fixtures';
  const cases: Case[] = [];
  const push = (src: string, list: unknown) => {
    if (!Array.isArray(list)) throw new Error(`${src}: not a case list`);
    for (const c of list as Array<Partial<Case>>) {
      if (typeof c.text !== 'string') throw new Error(`${src}: a case has no text`);
      cases.push({ src, label: String(c.label ?? '?'), text: c.text, earlier: c.earlier });
    }
  };
  push('heldout', (await load(head, `${fx}/crisis-heldout.ts`)).CRISIS_HELDOUT);
  push('blind', (await load(head, `${fx}/crisis-test-blind.ts`)).CRISIS_TEST_BLIND);
  push('relay', (await load(head, `${fx}/crisis-relay.ts`)).CRISIS_RELAY);
  push('contextual', (await load(head, `${fx}/crisis-contextual.ts`)).CRISIS_CONTEXTUAL);
  const bth = (await load(head, 'src/services/superhuman/validation/crisis-test-cases.ts'))
    .CRISIS_TEST_CASES as Array<{ input: string; expectedResult: { shouldDetect: boolean } }>;
  push(
    'bth',
    bth.map((c) => ({ text: c.input, label: c.expectedResult.shouldDetect ? 'crisis' : 'none' }))
  );
  for (const f of jsonFixtures(head)) {
    push(f.split('/').pop()!, JSON.parse(readFileSync(join(head, f), 'utf8')));
  }
  const corpus = await load(head, 'src/services/wellbeing-tracking/__tests__/crisis-corpus.ts');
  const lines = (src: string, label: string, texts: string[]) =>
    push(
      src,
      texts.map((text) => ({ text, label }))
    );
  lines('riskCorpus', 'risk', (corpus.riskCorpus as () => string[])());
  lines('adversarial', 'adv', (corpus.adversarialCorpus as () => string[])());
  lines('joinedEveryday', 'none', corpus.JOINED_EVERYDAY as string[]);
  return cases;
}

/** Child mode: score the head's cases with `tree`'s scoring code. */
async function score(tree: string, head: string): Promise<SweepRow[]> {
  const { detectCrisis } = (await load(tree, 'src/services/safety/crisis-guard.ts')) as {
    detectCrisis: (
      t: string,
      v?: unknown,
      o?: { recentMessages?: string[] }
    ) => {
      severity: number;
      isCrisis: boolean;
      indicators: string[];
      subject?: string;
    };
  };
  const { assessSafety } = (await load(
    tree,
    'src/tools/domains/life-coaching-shared/safety-guards.ts'
  )) as { assessSafety: (t: string) => { level: string } };
  const rows: SweepRow[] = [];
  (await headCases(head)).forEach((c, i) => {
    const variants = c.earlier?.length ? [undefined, c.earlier] : [undefined];
    for (const earlier of variants) {
      const d = detectCrisis(c.text, undefined, earlier ? { recentMessages: earlier } : undefined);
      rows.push({
        id: `${c.src}#${i}${earlier ? '+earlier' : ''}`,
        src: earlier ? `${c.src}+earlier` : c.src,
        label: c.label,
        text: c.text,
        sev: d.severity,
        crisis: d.isCrisis,
        imminent: d.indicators.includes('imminent_danger'),
        subject: d.subject ?? null,
        level: assessSafety(c.text).level,
      });
    }
  });
  return rows;
}

function runChild(tree: string, head: string, out: string): Promise<SweepRow[]> {
  const self = fileURLToPath(import.meta.url);
  const args = [...process.execArgv, self, '--score', tree, '--head-dir', head, '--out', out];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: head, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-8000)));
    child.on('error', fail);
    child.on('close', (code) => {
      if (code === 0) return done(JSON.parse(readFileSync(out, 'utf8')) as SweepRow[]);
      fail(new Error(`scoring ${tree} exited ${code}:\n${stderr}`));
    });
  });
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<number> {
  const head = arg('--head-dir');
  const scoreTree = arg('--score');
  if (scoreTree && head) {
    writeFileSync(arg('--out')!, JSON.stringify(await score(resolve(scoreTree), resolve(head))));
    return 0;
  }
  const base = arg('--base-dir');
  if (!base || !head) {
    console.error('usage: sweep-lowerings.ts --base-dir <tree> --head-dir <tree>');
    return 2;
  }
  const started = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), 'crisis-sweep-'));
  try {
    const [b, h] = await Promise.all([
      runChild(resolve(base), resolve(head), join(tmp, 'base.json')),
      runChild(resolve(head), resolve(head), join(tmp, 'head.json')),
    ]);
    const cmp = compareSweeps(b, h);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `${h.length} reads in ${secs}s: ${cmp.loweredRows} lowered, ${cmp.raisedRows} raised, ` +
        `${cmp.identical} identical`
    );
    // Raised reads are fine and can run to thousands (a new pattern hits the adversarial set).
    for (const r of cmp.raised.slice(0, 50)) console.log(`raised  ${r}`);
    if (cmp.raised.length > 50) console.log(`raised  ... and ${cmp.raised.length - 50} more`);
    for (const r of cmp.lowered) console.log(`LOWERED ${r}`);
    if (cmp.loweredRows === 0) return 0;
    console.error(
      `\n${cmp.lowered.length} distinct crisis reads went DOWN vs base. The crisis lane is ` +
        'recall-first: patterns are only ever added. Restore the lowered reads, or, if lowering ' +
        "them is intended, that is Seth's call: he approves it with the PR label " +
        'crisis:lowering-approved.'
    );
    return 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(2);
  }
);
