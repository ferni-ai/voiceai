/**
 * Flag expiry, warn first (src/config/flag-lifecycle.ts).
 *
 *   pnpm flags:expiry           CI (Quality Gates): fails only when this change adds or edits an
 *                               experiment's spec without a valid future `expires` (compared with
 *                               the merge base); expired and TBD experiments are warnings only.
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
import { isoDay, lifecycleWarnings, specProblems } from '../../src/config/flag-lifecycle.js';
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

function headTexts(root: string): Map<string, string> {
  const files = [
    ...readdirSync(join(root, CONFIG)).map((f) => `${CONFIG}/${f}`),
    ...readdirSync(join(root, CONFIG, 'flags')).map((f) => `${CONFIG}/flags/${f}`),
  ].filter(isRegistry);
  return new Map(files.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
}

function syncIssues(byOwner: Map<string, string[]>, owners: string[]): void {
  const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf8' });
  for (const owner of owners) {
    const title = `Flag expiry: ${owner}`;
    const open = JSON.parse(
      gh([
        'issue',
        'list',
        '--state',
        'open',
        '--search',
        `in:title "${title}"`,
        '--json',
        'number,title',
      ])
    ) as Array<{ number: number; title: string }>;
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
      `Experiments owned by **${owner}** that are past their expiry or still have issue 'TBD' (src/config/flag-lifecycle.ts). For each: delete the flag, make it permanent (kind kill-switch/config), or move \`expires\` with a reason in \`context\`.\n\n${items.map((i) => `- ${i}`).join('\n')}\n\nUpdated nightly by .github/workflows/flag-expiry.yml.`
    );
    if (existing) gh(['issue', 'edit', String(existing.number), '--body-file', body]);
    else gh(['issue', 'create', '--title', title, '--body-file', body]);
  }
}

function main(args: string[]): void {
  const root = process.cwd();
  const today = process.env.FLAG_EXPIRY_TODAY ?? isoDay(new Date());
  const head = specsOf(headTexts(root));
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
  const edited = editedExperiments(head, specsOf(readAtBase(base, baseFiles, root)));
  const problems = edited.flatMap((name) => specProblems(name, head.get(name)!, today));
  console.log(
    `Against base ${base.slice(0, 9)}: ${edited.length} experiment spec(s) added or edited.`
  );
  if (problems.length > 0) {
    console.log(
      `\n❌ ${problems.length} problem(s) in experiment specs this change adds or edits:\n${problems.map((p) => `  - ${p}`).join('\n')}`
    );
    process.exit(1);
  }
  console.log('\n✅ Every experiment this change adds or edits has a future expires and an issue.');
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
