/**
 * Flag expiry, warn first (src/config/flag-lifecycle.ts).
 *
 *   pnpm flags:expiry           CI (Quality Gates): fails only on what this change adds, edits or
 *                               touches (compared with the merge base, flag-lifecycle.ts); expired
 *                               and TBD experiments are warnings only. Past ISSUE_TBD_UNTIL an
 *                               issue counts only if it is an open issue in this repo, and a 'TBD'
 *                               experiment passes while its owner's nightly issue is open (asked
 *                               with gh only then; a token that can't read issues fails closed,
 *                               with an error, githubIssues).
 *   pnpm flags:expiry --issues  nightly (flag-expiry.yml): one open issue per owner listing its
 *                               expired or overdue experiments, closed once the list is empty.
 *
 * FLAG_EXPIRY_TODAY=YYYY-MM-DD overrides today (tests, rehearsals).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listAtBase,
  readAtBase,
  resolveBase,
} from '../../apps/cli/src/commands/quality/merge-base.js';
import { parseBackfill } from '../../src/config/flag-lifecycle-backfill.js';
import {
  ISSUE_TBD,
  type IssueLookup,
  isoDay,
  lifecycleWarnings,
  specProblems,
  touchedProblems,
} from '../../src/config/flag-lifecycle.js';
import { isMain } from './new-flag.js';
import { parseFlagFile, parseLegacy, type Spec } from './legacy-parse.js';

const CONFIG = 'src/config';
const isRegistry = (f: string): boolean =>
  /^src\/config\/flag-manifest[\w-]*\.ts$/.test(f) ||
  /^src\/config\/flags\/[A-Z][A-Z0-9_]*\.ts$/.test(f);

/** name → spec, from the registry files' texts. */
export function specsOf(texts: Map<string, string>): Map<string, Spec> {
  const out = new Map<string, Spec>();
  for (const [file, text] of texts) {
    const entries = file.includes('/flags/')
      ? [parseFlagFile(file, text)]
      : parseLegacy(file, text).entries;
    for (const e of entries) out.set(e.name, e.spec);
  }
  return out;
}

/** Experiments this change adds or edits (spec differs from the base, or kind became experiment). */
export function editedExperiments(head: Map<string, Spec>, base: Map<string, Spec>): string[] {
  const same = (a: Spec, b: Spec | undefined): boolean =>
    !!b && JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  return [...head]
    .filter(([name, spec]) => spec.kind === 'experiment' && !same(spec, base.get(name)))
    .map(([name]) => name)
    .sort();
}

/** name → the registry entry's own text (its lines and comments), from the registry files. */
function entryTexts(texts: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [file, text] of texts) {
    const entries = file.includes('/flags/')
      ? [parseFlagFile(file, text)]
      : parseLegacy(file, text).entries;
    for (const e of entries) out.set(e.name, text.slice(e.start, e.end).trim());
  }
  return out;
}

/** Flags whose registry entry this change touched (spec or comments), new ones included. */
export function touchedFlags(head: Map<string, string>, base: Map<string, string>): string[] {
  const h = entryTexts(head);
  const b = entryTexts(base);
  return [...h]
    .filter(([name, text]) => b.get(name) !== text)
    .map(([name]) => name)
    .sort();
}

/** The backfill may only shrink or move dates earlier (null: the base has no backfill yet). */
export function backfillProblems(
  base: Map<string, string> | null,
  head: Map<string, string>
): string[] {
  if (base === null) return [];
  const out: string[] = [];
  for (const [name, expires] of head) {
    const was = base.get(name);
    if (was === undefined)
      out.push(
        `${name}: added to the backfill; a new or edited experiment carries expires in its own spec`
      );
    else if (expires > was)
      out.push(
        `${name}: backfill expiry moved later (${was} → ${expires}); the backfill may only move dates earlier`
      );
  }
  return out;
}

const BACKFILL = 'src/config/flag-lifecycle-backfill.ts';
const LABEL = 'flag-expiry';
const ownerTitle = (owner: string): string => `Flag expiry: ${owner}`;

/** owner → '#N', from the open issues the nightly job keeps (label flag-expiry, title 'Flag expiry: <owner>'). */
export function ownerIssuesFrom(
  issues: ReadonlyArray<{ number: number; title: string }>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of issues) {
    const m = /^Flag expiry: (\S+)$/.exec(i.title);
    if (m && !out.has(m[1]!)) out.set(m[1]!, `#${i.number}`);
  }
  return out;
}

/** Runs gh and returns stdout; throws on a non-zero exit (a 404 for a missing issue included). */
export type Gh = (args: string[]) => string;
const runGh: Gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/;

/**
 * What the Flag expiry check asks GitHub, lazily: nothing until the first question (asked only
 * past ISSUE_TBD_UNTIL), then a probe that the token can read issues at all. A token without
 * issues: read gets an empty list, not an error (verify of #2577, 2026-10-27), so an empty probe
 * means "can't read issues". It is printed as an error and nothing counts (fail closed, loudly),
 * never mistaken for "no owner issue is open".
 */
export function githubIssues(gh: Gh = runGh): IssueLookup {
  let seen: { repo: string; byOwner: Map<string, string> } | null | undefined;
  const open = new Map<string, boolean>();
  const load = (): typeof seen => {
    if (seen !== undefined) return seen;
    try {
      const probe = JSON.parse(gh(['api', 'repos/{owner}/{repo}/issues?state=all&per_page=1'])) as Array<{
        repository_url?: string;
      }>;
      if (!Array.isArray(probe) || probe.length === 0)
        throw new Error('the token sees no issue at all (state=all), so it lacks issues: read');
      const repo = (probe[0]!.repository_url ?? '').replace(/^.*\/repos\//, '').toLowerCase();
      const list = JSON.parse(
        gh(['issue', 'list', '--state', 'open', '--label', LABEL, '--limit', '200', '--json', 'number,title'])
      ) as Array<{ number: number; title: string }>;
      seen = { repo, byOwner: ownerIssuesFrom(list) };
    } catch (error) {
      const why = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.log(
        `${process.env.GITHUB_ACTIONS ? '::error title=Flag expiry::' : '  ❌ '}Cannot read this repo's issues, so no issue number and no owner issue counts (${why}). The quality-gates job needs permissions: issues: read.`
      );
      seen = null;
    }
    return seen;
  };
  return {
    ownerIssue: (owner) => load()?.byOwner.get(owner),
    isOpenIssue: (ref) => {
      const s = load();
      if (!s) return false;
      const url = ISSUE_URL.exec(ref);
      if (url && url[1]!.toLowerCase() !== s.repo) return false; // another repo's issue
      const n = url ? url[2]! : /^#(\d+)$/.exec(ref)?.[1];
      if (!n) return false;
      if (!open.has(n)) {
        try {
          const i = JSON.parse(gh(['api', `repos/{owner}/{repo}/issues/${n}`])) as {
            state?: string;
            pull_request?: unknown;
          };
          open.set(n, i.state === 'open' && !i.pull_request);
        } catch {
          open.set(n, false); // 404: no such issue
        }
      }
      return open.get(n)!;
    },
  };
}

function headTexts(root: string): Map<string, string> {
  const files = [
    ...readdirSync(join(root, CONFIG)).map((f) => `${CONFIG}/${f}`),
    ...readdirSync(join(root, CONFIG, 'flags')).map((f) => `${CONFIG}/flags/${f}`),
  ].filter(isRegistry);
  return new Map(files.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
}

function syncIssues(byOwner: Map<string, string[]>, owners: string[]): void {
  const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf8' });
  // A dedicated label and a plain list (no search index), so back-to-back runs see each other's issues.
  try {
    gh([
      'label',
      'create',
      LABEL,
      '--color',
      'C5DEF5',
      '--description',
      'Experiment flags past their expiry (nightly)',
    ]);
  } catch {
    // it exists already
  }
  const open = JSON.parse(
    gh([
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      LABEL,
      '--limit',
      '200',
      '--json',
      'number,title',
    ])
  ) as Array<{ number: number; title: string }>;
  for (const owner of owners) {
    const title = ownerTitle(owner);
    const existing = open.find((i) => i.title === title);
    const items = byOwner.get(owner) ?? [];
    if (items.length === 0) {
      if (existing)
        gh([
          'issue',
          'close',
          String(existing.number),
          '--comment',
          `No expired or overdue experiments for ${owner}.`,
        ]);
      continue;
    }
    const body = join(tmpdir(), `flag-expiry-${owner}.md`);
    writeFileSync(
      body,
      `Experiments owned by **${owner}** that are past their expiry or still have issue '${ISSUE_TBD}' (src/config/flag-lifecycle.ts). For each: delete the flag, make it permanent (kind kill-switch/config), or move \`expires\` with a reason in \`context\`.\n\n${items.map((i) => `- ${i}`).join('\n')}\n\nUpdated nightly by .github/workflows/flag-expiry.yml.`
    );
    if (existing) gh(['issue', 'edit', String(existing.number), '--body-file', body]);
    else gh(['issue', 'create', '--title', title, '--label', LABEL, '--body-file', body]);
  }
}

function main(args: string[]): void {
  const root = process.cwd();
  // A rehearsal override for local runs only: in CI a variable must not pin the date.
  const today =
    (!process.env.GITHUB_ACTIONS && process.env.FLAG_EXPIRY_TODAY) || isoDay(new Date());
  const texts = headTexts(root);
  const head = specsOf(texts);
  const warnings = [...head].flatMap(([name, spec]) =>
    lifecycleWarnings(name, spec, today).map((w) => ({
      owner: spec.owner,
      w,
    }))
  );
  console.log(
    `Flag expiry on ${today}: ${[...head.values()].filter((s) => s.kind === 'experiment').length} experiments, ${warnings.length} warning(s).`
  );
  for (const { w } of warnings.slice(0, 40))
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=Flag expiry::${w}` : `  ⚠️  ${w}`);
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`);
  if (args.includes('--issues')) {
    const byOwner = new Map<string, string[]>();
    for (const { owner, w } of warnings) byOwner.set(owner, [...(byOwner.get(owner) ?? []), w]);
    syncIssues(byOwner, [...new Set([...head.values()].map((s) => s.owner))].sort());
    return;
  }
  const base = resolveBase(root);
  const baseFiles = listAtBase(base, [CONFIG], root).filter(isRegistry);
  const baseTexts = readAtBase(base, baseFiles, root);
  const baseSpecs = specsOf(baseTexts);
  const edited = editedExperiments(head, baseSpecs);
  const touched = touchedFlags(texts, baseTexts).filter((n) => !edited.includes(n));
  const baseBackfill = readAtBase(base, [BACKFILL], root).get(BACKFILL);
  const issues = githubIssues();
  const problems = [
    ...edited.flatMap((name) =>
      specProblems(name, head.get(name)!, today, {
        isNew: baseSpecs.get(name)?.kind !== 'experiment',
        issues,
      })
    ),
    ...touched.flatMap((name) => touchedProblems(name, head.get(name)!, today, issues)),
    ...backfillProblems(
      baseBackfill === undefined ? null : parseBackfill(baseBackfill),
      parseBackfill(readFileSync(join(root, BACKFILL), 'utf8'))
    ),
  ];
  console.log(
    `Against base ${base.slice(0, 9)}: ${edited.length} experiment spec(s) added or edited, ${touched.length} more entries touched.`
  );
  if (problems.length > 0) {
    console.log(
      `\n❌ ${problems.length} problem(s) in flags this change adds, edits or touches:\n${problems.map((p) => `  - ${p}`).join('\n')}`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    '\n✅ The experiments this change adds, edits or touches are in order, and the backfill only shrank or moved earlier.'
  );
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
