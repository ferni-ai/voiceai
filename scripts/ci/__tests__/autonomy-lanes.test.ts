/**
 * Autonomy lanes: which lanes a PR touches under scripts/ci/autonomy-policy.json, and
 * whether it carries what each lane needs (an owner approval on the exact head, or an
 * evaluator author). main() runs as a subprocess on a fixture PR.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  changedLinesOf,
  classify,
  diffInputs,
  evaluate,
  loadPolicy,
  matchesGlob,
  normalizeLogin,
  type PullInput,
} from '../autonomy-lanes.js';

const policy = loadPolicy();
const HEAD = 'bbb';
const PERSONA = 'src/personas/bundles/x/content.ts';
const SAFETY = 'src/services/safety/x.ts';
const EVAL = 'scripts/voice-eval/judge.mjs';
const approval = (commitId: string, state = 'APPROVED', login = 'sethdford') => ({
  login,
  state,
  commitId,
});
const pr = (over: Partial<PullInput> = {}): PullInput => ({
  head: HEAD,
  author: 'app/ferni-agent',
  files: [PERSONA],
  changedLines: ['+  greeting: "hi"'],
  reviews: [],
  ...over,
});

describe('classify', () => {
  it('crisis via changed line in a persona file fails for the loop', () => {
    const p = pr({ author: 'ferni-loop[bot]', changedLines: ['+  "call or text 988"'] });
    expect(classify(p.files, p.changedLines, p.author, policy)).toEqual(['crisis']);
    const r = evaluate(p, policy);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('same content edit by ferni-agent has no crisis lane', () => {
    expect(classify([PERSONA], ['+  "call or text 988"'], 'app/ferni-agent', policy)).toEqual([]);
  });

  it('the loop is recognised in both login forms', () => {
    for (const author of ['ferni-loop[bot]', 'app/ferni-loop', 'FERNI-LOOP[bot]']) {
      expect(classify([PERSONA], ['+ MINOR_CARE'], author, policy)).toEqual(['crisis']);
    }
  });

  it('removed 988 line in a non-crisis file is still crisis', () => {
    const diff = [
      `diff --git a/${PERSONA} b/${PERSONA}`,
      `--- a/${PERSONA}`,
      `+++ b/${PERSONA}`,
      '@@ -3 +2,0 @@',
      '-  "or call 988 any time"',
    ].join('\n');
    const lines = changedLinesOf(diff);
    expect(lines).toEqual(['-  "or call 988 any time"']);
    expect(classify([PERSONA], lines, 'ferni-loop[bot]', policy)).toEqual(['crisis']);
  });

  it('diff headers are not changed lines', () => {
    const diff = [
      'diff --git a/src/x/988.ts b/src/x/988.ts',
      '--- a/src/x/988.ts',
      '+++ b/src/x/988.ts',
      '@@ -1 +1 @@',
      '+ok',
      '-gone',
      ' context',
      'diff --git a/src/y/988.ts b/src/y/988.ts',
      '--- a/src/y/988.ts',
      '+++ b/src/y/988.ts',
      '@@ -0,0 +1 @@',
      '+next',
    ].join('\n');
    expect(changedLinesOf(diff)).toEqual(['+ok', '-gone', '+next']);
  });

  it('crisis line disguised as a +++ header is still caught', () => {
    // An added line whose text is `++ call 988` renders as `+++ call 988`.
    const diff = [
      `diff --git a/${PERSONA} b/${PERSONA}`,
      `--- a/${PERSONA}`,
      `+++ b/${PERSONA}`,
      '@@ -0,0 +1,2 @@',
      '+++ call 988',
      '--- 988 removed',
    ].join('\n');
    const lines = changedLinesOf(diff);
    expect(lines).toEqual(['+++ call 988', '--- 988 removed']);
    expect(classify([PERSONA], lines, 'ferni-loop[bot]', policy)).toEqual(['crisis']);
  });

  it('plain persona change has no lane', () => {
    const p = pr({ author: 'ferni-loop[bot]' });
    expect(classify(p.files, p.changedLines, p.author, policy)).toEqual([]);
    expect(evaluate(p, policy)).toEqual({ ok: true, reasons: ['no autonomy lane'] });
  });

  it('privacy follows the arm gate: src or apps paths, markdown excluded', () => {
    expect(classify(['src/memory/forget-user.ts'], [], 'app/ferni-agent', policy)).toEqual([
      'privacy',
    ]);
    expect(classify(['src/memory/forget-user.md'], [], 'app/ferni-agent', policy)).toEqual([]);
    expect(classify(['docs/forget-user.ts'], [], 'app/ferni-agent', policy)).toEqual([]);
    const r = evaluate(pr({ files: ['src/memory/forget-user.ts'] }), policy);
    expect(r.ok).toBe(true);
    expect(r.reasons.join()).toMatch(/^privacy lane:/);
  });

  it('voice-eval scenarios are not evaluator code, but crisis scenarios are crisis', () => {
    expect(classify(['scripts/voice-eval/scenarios/x.txt'], [], 'a', policy)).toEqual([]);
    expect(classify(['scripts/voice-eval/scenarios/crisis-relay.txt'], [], 'a', policy)).toEqual([
      'crisis',
    ]);
    expect(classify(['scripts/voice-eval/release-check.mjs'], [], 'a', policy)).toEqual([
      'crisis',
      'evaluator',
    ]);
  });
});

describe('evaluate', () => {
  it('crisis path without approval fails', () => {
    const r = evaluate(pr({ files: [SAFETY] }), policy);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['crisis lane: needs sethdford approval on bbb']);
  });

  it('crisis path edit by ferni-agent still needs approval', () => {
    const p = pr({ author: 'app/ferni-agent', files: [SAFETY] });
    expect(classify(p.files, p.changedLines, p.author, policy)).toEqual(['crisis']);
    expect(evaluate(p, policy).ok).toBe(false);
  });

  it('approval on old head does not count', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval('aaa')] }), policy);
    expect(r.ok).toBe(false);
  });

  it('approval on head passes', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval(HEAD)] }), policy);
    expect(r).toEqual({ ok: true, reasons: ['crisis lane: approved by sethdford on bbb'] });
  });

  it('approval by someone who is not an approver does not count', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval(HEAD, 'APPROVED', 'x')] }), policy);
    expect(r.ok).toBe(false);
  });

  it('changes requested after an approval on head withdraws it', () => {
    const reviews = [
      approval(HEAD),
      approval(HEAD, 'COMMENTED'),
      approval(HEAD, 'CHANGES_REQUESTED'),
    ];
    expect(evaluate(pr({ files: [SAFETY], reviews }), policy).ok).toBe(false);
  });

  it('evaluator path by ferni-agent fails', () => {
    const r = evaluate(pr({ files: [EVAL] }), policy);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/^evaluator lane: author ferni-agent\[bot\] is not an evaluator/);
  });

  it('evaluator path by ferni-eval[bot] passes', () => {
    for (const author of ['ferni-eval[bot]', 'app/ferni-eval']) {
      expect(evaluate(pr({ author, files: [EVAL] }), policy).ok).toBe(true);
    }
  });

  it('evaluator path by ferni-agent passes with an owner approval on head', () => {
    expect(evaluate(pr({ files: [EVAL], reviews: [approval(HEAD)] }), policy).ok).toBe(true);
  });

  it('crisis and evaluator are judged independently', () => {
    const files = [SAFETY, EVAL];
    expect(evaluate(pr({ author: 'ferni-eval[bot]', files }), policy).ok).toBe(false);
  });
});

describe('fail closed', () => {
  it('control-character path is in every lane', () => {
    for (const odd of ['src/personas/a\u0001b.ts', 'docs/x\n.md', '"src/personas/q.ts"']) {
      expect(classify([odd], [], 'app/ferni-agent', policy)).toEqual([
        'crisis',
        'privacy',
        'evaluator',
      ]);
    }
  });

  it('binary file in a loop PR is crisis', () => {
    const image = 'src/personas/bundles/x/avatar.png';
    expect(classify([image], [], 'ferni-loop[bot]', policy, [image])).toEqual(['crisis']);
    expect(classify([image], [], 'app/ferni-agent', policy, [image])).toEqual([]);
  });

  it('the check itself and CODEOWNERS are evaluator code', () => {
    for (const f of ['.github/workflows/autonomy-lanes.yml', '.github/CODEOWNERS']) {
      expect(evaluate(pr({ files: [f] }), policy).ok).toBe(false);
    }
  });
});

describe('approver authorship', () => {
  it('crisis PR authored by sethdford passes', () => {
    const r = evaluate(pr({ author: 'sethdford', files: [SAFETY, EVAL] }), policy);
    expect(r.ok).toBe(true);
    expect(r.reasons[0]).toBe('crisis lane: authored by approver sethdford');
  });

  it('crisis PR authored by ferni-agent with no approval fails', () => {
    expect(evaluate(pr({ author: 'app/ferni-agent', files: [SAFETY] }), policy).ok).toBe(false);
  });

  it('a bot or app form of the approver login is not a sign-off', () => {
    for (const author of ['app/sethdford', 'sethdford[bot]']) {
      expect(evaluate(pr({ author, files: [SAFETY] }), policy).ok).toBe(false);
    }
  });
});

describe('diffInputs against a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-diff-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env }).trim();
  const write = (path: string, data: string | Buffer) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  git('init', '-q', '-b', 'main');
  write('README.md', 'base\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  write('src/services/safety/caf\u00e9-gate.ts', 'export const x = 1;\n');
  write('src/services/safety/model.bin', Buffer.from('\u0000\u0001\u0000MINOR_CARE\n'));
  write(PERSONA, '++ call 988\n');
  // A textconv driver that blanks the content must not hide it from the diff.
  write('.gitattributes', '*.ts diff=blank\n');
  git('config', 'diff.blank.textconv', 'true');
  git('add', '-A');
  git('commit', '-q', '-m', 'change');
  const inputs = diffInputs('main~1...main', root);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('non-ASCII path under src/services/safety/ classifies crisis', () => {
    expect(inputs.files).toContain('src/services/safety/caf\u00e9-gate.ts');
    const safety = inputs.files.filter((f) => f.startsWith('src/services/safety/caf'));
    expect(classify(safety, [], 'app/ferni-agent', policy)).toEqual(['crisis']);
  });

  it('binary file in a crisis path is crisis', () => {
    expect(inputs.binaryFiles).toEqual(['src/services/safety/model.bin']);
    expect(classify([], [], 'app/ferni-agent', policy, inputs.binaryFiles)).toEqual(['crisis']);
    // --text: a binary file's content is still screened.
    expect(inputs.changedLines.some((l) => l.includes('MINOR_CARE'))).toBe(true);
  });

  it('a +++-looking added line and textconv-hidden content still reach the loop screen', () => {
    expect(inputs.changedLines).toContain('+++ call 988');
    expect(inputs.changedLines).toContain('+export const x = 1;');
    expect(classify([PERSONA], inputs.changedLines, 'ferni-loop[bot]', policy)).toEqual(['crisis']);
  });
});

describe('helpers', () => {
  it('normalizeLogin maps the gh app form to the REST bot login', () => {
    expect(normalizeLogin('app/ferni-loop')).toBe('ferni-loop[bot]');
    expect(normalizeLogin('Ferni-Loop[bot]')).toBe('ferni-loop[bot]');
    expect(normalizeLogin(' SethDford ')).toBe('sethdford');
  });

  it('matchesGlob: * stays in one directory, ** crosses them', () => {
    expect(matchesGlob('src/utils/minor-care-gate.ts', 'src/utils/minor-care*.ts')).toBe(true);
    expect(matchesGlob('src/utils/minor-care/x.ts', 'src/utils/minor-care*.ts')).toBe(false);
    expect(matchesGlob('src/services/safety/a/b.ts', 'src/services/safety/**')).toBe(true);
    expect(matchesGlob('src/services/safety-net.ts', 'src/services/safety/**')).toBe(false);
    expect(matchesGlob('README.md', '**/*.md')).toBe(true);
    expect(matchesGlob('scripts/ci/autonomy-policy.json', 'scripts/ci/autonomy-policy.json')).toBe(
      true
    );
    expect(matchesGlob('scripts/ci/autonomy-policyXjson', 'scripts/ci/autonomy-policy.json')).toBe(
      false
    );
  });
});

describe('main()', () => {
  const SCRIPT = join(__dirname, '../autonomy-lanes.ts');
  const root = mkdtempSync(join(tmpdir(), 'autonomy-lanes-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const run = (input: PullInput, enforce: boolean) => {
    const fixture = join(root, 'pr.json');
    writeFileSync(fixture, JSON.stringify(input));
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const k of ['GITHUB_STEP_SUMMARY', 'PR_NUMBER', 'PR_HEAD', 'QUEUE_REF']) delete env[k];
    const r = spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
      encoding: 'utf8',
      env: {
        ...env,
        AUTONOMY_LANES_FIXTURE: fixture,
        AUTONOMY_LANES_ENFORCE: enforce ? '1' : '',
      },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('enforced: a crisis file with no approval exits 1', () => {
    const r = run(pr({ files: [SAFETY] }), true);
    expect(r.code).toBe(1);
    expect(r.out).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('report-only: the same PR exits 0 and still says what it needs', () => {
    const r = run(pr({ files: [SAFETY] }), false);
    expect(r.code).toBe(0);
    expect(r.out).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('enforced: approved on head exits 0', () => {
    expect(run(pr({ files: [SAFETY], reviews: [approval(HEAD)] }), true).code).toBe(0);
  });
});
