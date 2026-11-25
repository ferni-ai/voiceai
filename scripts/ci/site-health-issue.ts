#!/usr/bin/env node
/**
 * Keeps at most one open issue per site-health failure kind, the way blog-drafts.yml keeps
 * its blog-weekly-failed issue: open it when the kind goes red, comment on it while it stays
 * red, close it on the first green run. Each kind has its own label, so issues are found by
 * label and never duplicated.
 *
 *   node --experimental-strip-types scripts/ci/site-health-issue.ts <kind> <report.md>
 *
 * The report is the check's markdown: empty means green. A missing report means the check
 * never ran, so the issue is left alone and this exits 1 (never closes on no evidence).
 * Runs triggered by a deploy (EVENT=workflow_run) open and close but don't comment, so a
 * busy day of merges doesn't flood an open issue; the weekly run comments.
 * Env: REPO, GH_TOKEN, EVENT, RUN_URL.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const KINDS = {
  links: { label: 'site-health-links', title: 'Site health: broken internal links' },
  'stale-site': { label: 'site-health-stale', title: 'Site health: a public site is behind main' },
  'scheduled-run': {
    label: 'site-health-schedule',
    title: 'Site health: a scheduled workflow keeps failing',
  },
};
export type Kind = keyof typeof KINDS;
export type Action = 'unknown' | 'none' | 'open' | 'comment' | 'close';

/** What to do with the kind's issue, given the open one (if any) and the check's report. */
export function issueAction(
  openIssue: number | null,
  report: string | null,
  event: string
): Action {
  if (report === null) return 'unknown';
  if (report.trim() === '') return openIssue ? 'close' : 'none';
  if (!openIssue) return 'open';
  return event === 'workflow_run' ? 'none' : 'comment';
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main(): void {
  const [kind, reportPath] = process.argv.slice(2) as [Kind, string];
  const spec = KINDS[kind];
  if (!spec || !reportPath)
    throw new Error(`usage: site-health-issue.ts <${Object.keys(KINDS).join('|')}> <report.md>`);
  const repo = process.env.REPO || 'ferni-ai/voiceai';
  const runUrl = process.env.RUN_URL || '(local run)';
  const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : null;

  const listArgs = ['issue', 'list', '--repo', repo, '--label', spec.label, '--state', 'open'];
  // A label that doesn't exist yet lists nothing (no error); it is created on first open.
  const found = gh([
    ...listArgs,
    '--limit',
    '1',
    '--json',
    'number',
    '--jq',
    '.[0].number // empty',
  ]);
  const open = Number(found.trim()) || null;
  const action = issueAction(open, report, process.env.EVENT || '');
  const today = new Date().toISOString().slice(0, 10);
  const body = `Site health on ${today} ([run](${runUrl})) found:\n\n${report ?? ''}\nThis issue closes itself on the next run where this check is green.`;

  if (action === 'unknown') {
    process.stderr.write(
      `::error::No ${kind} report at ${reportPath}: the check did not run, issue left alone\n`
    );
    process.exitCode = 1;
  } else if (action === 'close') {
    gh([
      'issue',
      'close',
      String(open),
      '--repo',
      repo,
      '--comment',
      `Green on ${today} ([run](${runUrl})), closing.`,
    ]);
  } else if (action === 'comment') {
    gh(['issue', 'comment', String(open), '--repo', repo, '--body', body]);
  } else if (action === 'open') {
    const labelArgs = [
      'label',
      'create',
      spec.label,
      '--repo',
      repo,
      '--color',
      'b60205',
      '--force',
    ];
    gh([...labelArgs, '--description', `${spec.title}; closes on the next green run`]);
    gh([
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      spec.title,
      '--label',
      spec.label,
      '--body',
      body,
    ]);
  }
  process.stdout.write(`${kind}: ${action}${open ? ` (#${open})` : ''}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
