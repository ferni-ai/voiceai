/**
 * A third-party action pinned to a tag runs whatever the tag points at today. In a job that
 * holds a secret (a deploy key, a service-account key), whoever can move that tag can run
 * code with the secret. So every third-party action such a job runs, directly or through a
 * local composite action, is pinned to a 40-char commit with a comment saying which release
 * it is (`# vX.Y.Z`, or `# stable @ <date>` for an action that publishes no tags) (#2183).
 * First-party `actions/*` and `github/*` are out of scope.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = join(__dirname, '..', '..', '..');
const PINNED = /@[0-9a-f]{40}$/;
const FIRST_PARTY = /^(actions|github)\//;
// GITHUB_TOKEN is scoped to this run and this repo; any other secret is long-lived.
// Matched against JSON text, where a double quote in `secrets["X"]` reads as \".
const SECRET = /secrets(?:\.|\[\s*\\?['"])(\w+)/g;

interface Scan {
  /** Secret-holding jobs seen, so a scan that finds nothing can't pass by reading nothing. */
  jobs: number;
  /** Third-party `uses:` checked inside those jobs. */
  checked: number;
  /** One line per third-party action that isn't pinned with a version comment. */
  problems: string[];
}

function heldSecrets(...parts: unknown[]): string[] {
  const text = JSON.stringify(parts);
  const named = [...text.matchAll(SECRET)].map((m) => m[1]).filter((s) => s !== 'GITHUB_TOKEN');
  return /"secrets":"inherit"/.test(text) ? [...named, 'inherit'] : named;
}

interface Step {
  uses?: string;
}
interface WorkflowJob {
  /** A reusable workflow the job calls. */
  uses?: string;
  steps?: Step[];
}
/** One `uses:` value and the file whose line states it ('' = the workflow itself). */
interface Use {
  uses: string;
  file: string;
}

/** The `uses:` of a job: its steps', a reusable workflow's, and those of local composite actions. */
function usesOf(root: string, job: WorkflowJob): Use[] {
  const out: Use[] = [];
  const add = (uses: string | undefined, file: string, seen: Set<string>): void => {
    if (!uses) return;
    if (!uses.startsWith('./')) return void out.push({ uses, file });
    const dir = join(root, uses);
    const action = ['action.yml', 'action.yaml']
      .map((f) => join(dir, f))
      .find((f) => existsSync(f));
    if (!action || seen.has(action)) return;
    seen.add(action);
    const doc = parse(readFileSync(action, 'utf8')) as { runs?: { steps?: Step[] } };
    for (const step of doc.runs?.steps ?? []) add(step.uses, action, seen);
  };
  add(job.uses, '', new Set());
  for (const step of job.steps ?? []) add(step.uses, '', new Set());
  return out;
}

/** Every secret-holding job's third-party actions under `root`/.github/workflows. */
function scan(root: string): Scan {
  const result: Scan = { jobs: 0, checked: 0, problems: [] };
  const dir = join(root, '.github/workflows');
  for (const name of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const path = join(dir, name);
    const doc = parse(readFileSync(path, 'utf8')) as {
      env?: unknown;
      jobs?: Record<string, WorkflowJob>;
    };
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (heldSecrets(doc.env, job).length === 0) continue;
      result.jobs++;
      for (const { uses, file } of usesOf(root, job)) {
        if (FIRST_PARTY.test(uses) || uses.startsWith('docker://')) continue;
        result.checked++;
        const source = readFileSync(file || path, 'utf8');
        const commented = source
          .split('\n')
          .some((l) => l.includes(`uses: ${uses}`) && /\s#\s*\S/.test(l));
        if (!PINNED.test(uses) || !commented) result.problems.push(`${name} ${id}: ${uses}`);
      }
    }
  }
  return result;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
/** A repo root holding the given files (paths relative to the root). */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'action-pins-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const SHA = 'a'.repeat(40);
/** One workflow with one job: an optional job-level env line and the given steps. */
function workflow(env: string, ...steps: string[]): Record<string, string> {
  const lines = ['on: push', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest'];
  if (env) lines.push('    env:', `      KEY: ${env}`);
  lines.push('    steps:', ...steps.map((s) => `      - uses: ${s}`));
  return { '.github/workflows/w.yml': `${lines.join('\n')}\n` };
}

describe('third-party actions in secret-holding jobs are pinned to a commit (#2183)', () => {
  it('holds for every workflow in this repo', () => {
    const result = scan(ROOT);
    // The prod web deploy alone holds FIREBASE_SERVICE_ACCOUNT and runs action-hosting-deploy.
    expect(result.jobs).toBeGreaterThan(10);
    expect(result.checked).toBeGreaterThan(20);
    expect(result.problems).toEqual([]);
  });

  it('flags a tag-pinned action in a job holding a secret, and only there', () => {
    const tagged = 'vendor/deploy@v3';
    expect(scan(repo(workflow('${{ secrets.DEPLOY_KEY }}', tagged))).problems).toEqual([
      `w.yml deploy: ${tagged}`,
    ]);
    expect(scan(repo(workflow("${{ secrets['DEPLOY_KEY'] }}", tagged))).problems).toHaveLength(1);
    expect(scan(repo(workflow('${{ secrets.GITHUB_TOKEN }}', tagged))).problems).toEqual([]);
    expect(scan(repo(workflow('', tagged))).problems).toEqual([]);
    expect(
      scan(repo(workflow('${{ secrets.DEPLOY_KEY }}', 'actions/checkout@v7'))).problems
    ).toEqual([]);
  });

  it('wants the commit and the release comment both', () => {
    const key = '${{ secrets.DEPLOY_KEY }}';
    expect(scan(repo(workflow(key, `vendor/deploy@${SHA} # v3.1.0`))).problems).toEqual([]);
    expect(
      scan(repo(workflow(key, `vendor/toolchain@${SHA} # stable @ 2026-09-25`))).problems
    ).toEqual([]);
    expect(scan(repo(workflow(key, `vendor/deploy@${SHA}`))).problems).toHaveLength(1);
    expect(scan(repo(workflow(key, 'vendor/deploy@v3 # v3.1.0'))).problems).toHaveLength(1);
  });

  it('follows a local composite action into the job that calls it', () => {
    const files = {
      ...workflow('${{ secrets.DEPLOY_KEY }}', './.github/actions/setup'),
      '.github/actions/setup/action.yml':
        'runs:\n  using: composite\n  steps:\n    - uses: vendor/setup@v4\n',
    };
    expect(scan(repo(files)).problems).toEqual(['w.yml deploy: vendor/setup@v4']);
  });

  it('counts a workflow-level secret and secrets: inherit as held by the job', () => {
    const top = workflow('', 'vendor/deploy@v3');
    top['.github/workflows/w.yml'] =
      `env:\n  KEY: \${{ secrets.DEPLOY_KEY }}\n${top['.github/workflows/w.yml']}`;
    expect(scan(repo(top)).problems).toHaveLength(1);
    const inherit =
      'on: push\njobs:\n  call:\n    uses: vendor/flows/.github/workflows/d.yml@v1\n    secrets: inherit\n';
    expect(scan(repo({ '.github/workflows/w.yml': inherit })).problems).toEqual([
      'w.yml call: vendor/flows/.github/workflows/d.yml@v1',
    ]);
  });
});
