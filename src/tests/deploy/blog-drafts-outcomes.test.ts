/**
 * blog-drafts.yml tells a rejected draft from a broken run (#3953). A draft the
 * brand gate, the live check or the editorial judge turns down still opens as a
 * blog-draft PR, but the job stays green: the bar working is not the workflow
 * failing, and site health reads the scheduled run's conclusion. The weekly
 * blog-weekly-failed issue still tracks that no post cleared the bar. The job
 * stays red only for real breakage: a check that gives no verdict, a failed hero
 * image, or a PR that can't be opened.
 *
 * This runs the workflow's own step scripts with a stand-in gh, the way
 * crisis-sweep-jobs.test.ts runs the sweep verdict.
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REJECTED } from '../../../scripts/blog/exit-codes.js';
import { jobs } from './workflow-jobs.js';

const ROOT = join(__dirname, '..', '..', '..');
const TEXT = readFileSync(join(ROOT, '.github', 'workflows', 'blog-drafts.yml'), 'utf8');
const RECORD = join(ROOT, 'scripts', 'blog', 'record-verdict.sh');
const PR_NUMBER = '4242';

/** A step of a job: its `if:`, its `env:` lines and its `run: |` script, dedented. */
function step(jobId: string, name: string): { if?: string; env: string; run: string } {
  const job = TEXT.slice(TEXT.indexOf(`\n  ${jobId}:\n`));
  const at = job.indexOf(`- name: ${name}\n`);
  if (at < 0) throw new Error(`step ${name} not found`);
  const text = job.slice(at).split(/\n {6}- /)[0];
  const run = /\n {8}run: \|\n((?: {10}.*\n|\n)+)/.exec(`${text}\n`)?.[1].replace(/^ {10}/gm, '');
  if (!run) throw new Error(`step ${name} has no run script`);
  return {
    if: /\n {8}if: (.*)\n/.exec(text)?.[1],
    env: /\n {8}env:\n((?: {10}\S.*\n)+)/.exec(text)?.[1] ?? '',
    run,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blog-drafts-'));
  // gh: logs every call; serves the PR number, this run's jobs and the open issue.
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env bash
echo "$*" >> "$CALLS"
args="$*"
jq_filter=""
while [ $# -gt 0 ]; do [ "$1" = --jq ] && jq_filter=$2; shift; done
case "$args" in
  *"git/ref/heads/main"*) echo "${'b'.repeat(40)}" ;;
  *"git/ref/heads/"*) exit 1 ;;
  *"-X POST repos/o/r/pulls"*) [ -n "$PULLS_FAIL" ] && { echo "HTTP 422" >&2; exit 1; }; echo ${PR_NUMBER} ;;
  *"/actions/runs/"*"/jobs"*) jq -r "$jq_filter" < "$JOBS" ;;
  "issue list"*) jq -r "$jq_filter" <<< "$ISSUES" ;;
  "pr list"*) jq -r "$jq_filter" <<< '[]' ;;
  "issue create"*) echo "https://github.com/o/r/issues/1" ;;
esac
exit 0
`
  );
  writeFileSync(join(dir, 'base64'), '#!/usr/bin/env bash\ncat "${@: -1}"\n');
  chmodSync(join(dir, 'gh'), 0o755);
  chmodSync(join(dir, 'base64'), 0o755);
  writeFileSync(join(dir, 'post.md'), '---\ntitle: "A post"\n---\n\nHello.\n');
  // The hero image the step uploads, relative to the checkout (the step's cwd).
  mkdirSync(join(dir, 'apps/website/ferni-website/images/blog'), { recursive: true });
  writeFileSync(join(dir, 'apps/website/ferni-website/images/blog/post.png'), 'png');
  writeFileSync(join(dir, 'draft-meta.json'), JSON.stringify({ sources: ['PR #1'] }));
  for (const f of ['calls', 'output', 'summary']) writeFileSync(join(dir, f), '');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(script: string, env: Record<string, string>) {
  const r = spawnSync('bash', ['-e', '-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      CALLS: join(dir, 'calls'),
      GITHUB_OUTPUT: join(dir, 'output'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      RUNNER_TEMP: dir,
      GITHUB_WORKSPACE: dir,
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_RUN_ID: '99',
      REPO: 'o/r',
      ...env,
    },
  });
  const read = (f: string): string => readFileSync(join(dir, f), 'utf8');
  return {
    status: r.status,
    stdout: r.stdout,
    calls: read('calls'),
    output: read('output'),
    summary: read('summary'),
  };
}

/** "Open the PR" for a consumer post, with these verdicts. */
function openPr(env: Record<string, string>) {
  return run(step('draft', 'Open the PR').run, {
    TYPE: 'team-letter',
    DRAFT: join(dir, 'post.md'),
    CONSUMER: 'true',
    HAS_PR_TOKEN: 'true',
    HERO: 'success',
    HERO_REASON: '',
    GATE: 'pass',
    JUDGE: 'pass',
    ...env,
  });
}

/** The weekly status job's script after a run whose jobs are `jobs`. */
function weekly(jobsList: unknown[], openIssue = '12') {
  writeFileSync(join(dir, 'jobs.json'), JSON.stringify({ jobs: jobsList }));
  return run(step('weekly-status', 'Open, update or close the blog-weekly-failed issue').run, {
    JOBS: join(dir, 'jobs.json'),
    ISSUES: JSON.stringify(openIssue ? [{ number: Number(openIssue) }] : []),
    PLAN: 'success',
    DRAFT: 'success',
    RUN_URL: 'https://github.com/o/r/actions/runs/99',
  });
}

const draftJob = (name: string, rejected: boolean) => ({
  name,
  conclusion: 'success',
  steps: [
    { name: 'Open the PR', conclusion: 'success' },
    { name: 'Rejected by the bar', conclusion: rejected ? 'success' : 'skipped' },
  ],
});

describe('each check records a verdict: pass, rejected or error', () => {
  const verdict = (command: string) => {
    writeFileSync(join(dir, 'output'), '');
    return run(`bash "${RECORD}" "${join(dir, 'check.log')}" bash -c '${command}'`, {});
  };

  it('reads 0 as pass, REJECTED as rejected and anything else (a crash) as error', () => {
    expect(REJECTED).toBe(3);
    expect(verdict('exit 0')).toMatchObject({ status: 0, output: 'verdict=pass\n' });
    expect(verdict(`exit ${REJECTED}`)).toMatchObject({ status: 3, output: 'verdict=rejected\n' });
    expect(verdict('exit 1')).toMatchObject({ status: 1, output: 'verdict=error\n' });
    expect(verdict('exit 2')).toMatchObject({ status: 2, output: 'verdict=error\n' });
  });

  it('keeps the check output, its stderr included, in the log and in the step log', () => {
    const r = verdict(`echo "Judge: fail (craft 3)"; echo "below the bar" >&2; exit ${REJECTED}`);
    expect(r.stdout).toBe('Judge: fail (craft 3)\nbelow the bar\n');
    expect(readFileSync(join(dir, 'check.log'), 'utf8')).toBe(r.stdout);
  });

  it('the gate and the judge both run through it, and the PR step reads both verdicts', () => {
    expect(step('draft', 'Brand gate and live check').run).toContain(
      'record-verdict.sh "$RUNNER_TEMP/gate.log"'
    );
    expect(step('draft', 'Editorial judge').run).toContain(
      'record-verdict.sh "$RUNNER_TEMP/judge.log"'
    );
    const { env } = step('draft', 'Open the PR');
    expect(env).toContain('GATE: ${{ steps.gate.outputs.verdict }}');
    expect(env).toContain('JUDGE: ${{ steps.judge.outputs.verdict }}');
  });
});

describe('a rejected draft: green, a blog-draft PR, and the weekly issue', () => {
  it.each([
    ['the judge', { JUDGE: 'rejected' }],
    ['the brand gate or live check', { GATE: 'rejected' }],
  ])('rejected by %s: the PR opens as an unarmed draft and the step passes', (_, env) => {
    const r = openPr(env);
    expect(r.status).toBe(0);
    expect(r.calls).toMatch(/-X POST repos\/o\/r\/pulls .*-F draft=true/);
    expect(r.calls).toContain('labels[]=blog-draft');
    expect(r.calls).not.toContain('pr merge');
    expect(r.output).toBe(`rejected=${PR_NUMBER}\n`);
  });

  it('the rejection step runs on that output and puts the scores in the job summary', () => {
    const rejected = step('draft', 'Rejected by the bar');
    expect(rejected.if).toBe("steps.pr.outputs.rejected != ''");
    writeFileSync(join(dir, 'judge.log'), 'Judge (claude, consumer): fail (craft 3)\n');
    const r = run(rejected.run, { TYPE: 'team-letter', PR: PR_NUMBER });
    expect(r.status).toBe(0);
    expect(r.summary).toContain(`Opened #${PR_NUMBER} as a draft`);
    expect(r.summary).toContain('fail (craft 3)');
  });

  it('the weekly issue is updated, not closed, when a green run had a rejected draft', () => {
    const r = weekly([draftJob('Draft whats-new', false), draftJob('Draft team-letter', true)]);
    expect(r.status).toBe(0);
    expect(r.calls).toContain('issue comment 12');
    expect(r.calls).not.toContain('issue close');
    const created = weekly([draftJob('Draft team-letter', true)], '');
    expect(created.calls).toContain('issue create');
  });

  it('the weekly issue closes only when every draft passed', () => {
    const r = weekly([draftJob('Draft whats-new', false), draftJob('Draft team-letter', false)]);
    expect(r.status).toBe(0);
    expect(r.calls).toContain('issue close 12');
  });
});

describe('real breakage stays red', () => {
  it('the judge gave no verdict: red, the PR still opens as a draft, nothing marked rejected', () => {
    const r = openPr({ JUDGE: 'error' });
    expect(r.status).toBe(1);
    expect(r.calls).toMatch(/-X POST repos\/o\/r\/pulls .*-F draft=true/);
    expect(r.output).toBe('');
  });

  it.each([
    ['the gate errored', { GATE: 'error' }],
    ['the gate verdict is missing', { GATE: '' }],
    ['the hero image failed', { HERO: 'failure' }],
    ['the hero image failed on a rejected draft', { HERO: 'failure', JUDGE: 'rejected' }],
  ])('%s: red', (_, env) => {
    const r = openPr(env);
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
  });

  it('the PR fails to open: red', () => {
    const r = openPr({ JUDGE: 'rejected', PULLS_FAIL: '1' });
    expect(r.status).not.toBe(0);
    expect(r.output).toBe('');
  });

  it('no BLOG_PR_TOKEN: red', () => {
    expect(openPr({ JUDGE: 'rejected', HAS_PR_TOKEN: 'false' }).status).toBe(1);
  });
});

describe('a draft that passes is unchanged', () => {
  it('a consumer post waits for the owner; a developer post arms auto-merge', () => {
    const consumer = openPr({});
    expect(consumer.status).toBe(0);
    expect(consumer.calls).toContain('labels[]=blog-needs-approval');
    expect(consumer.calls).not.toContain('pr merge');
    const developer = openPr({ CONSUMER: 'false', HERO: 'skipped', TYPE: 'whats-new' });
    expect(developer.status).toBe(0);
    expect(developer.calls).toContain(`pr merge ${PR_NUMBER} --auto`);
    expect(developer.output).toBe('');
  });

  it('the weekly status job still needs every draft job', () => {
    expect(
      jobs('blog-drafts.yml')
        .find((j) => j.id === 'weekly-status')
        ?.needs.sort()
    ).toEqual(['draft', 'plan']);
  });
});
