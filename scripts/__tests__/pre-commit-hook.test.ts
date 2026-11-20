/**
 * Every check the pre-commit hook reports on can go red (#3884). Until then the
 * Prettier check and the secret scan could not fail a commit, six checks hid their
 * own errors, and the hook said "ALL PRE-COMMIT CHECKS PASSED" after a warning.
 *
 * Each row runs the real .husky/pre-commit in a throwaway git repo. `npx`, `npm` and
 * `node` are stubs first on PATH: they log their arguments and, when an argument
 * matches a pattern in STUB_FAIL, print "crashed: <pattern>" to stderr and exit 1.
 * git, awk and grep are the real ones, so the secret scan runs for real.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOK = join(__dirname, '..', '..', '.husky', 'pre-commit');

// Built at run time so this file holds no secret-shaped text.
const AWS_KEY = `AKIA${'Q'.repeat(16)}`;
const STRIPE_KEY = `sk_${'live'}_${'x'.repeat(24)}`;
const PEM = `-----BEGIN ${'RSA PRIVATE'} KEY-----`;

// The repo's own git commands run no hooks and sign nothing, whatever the global config.
const GIT_SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false'];

const STUB = `#!/bin/sh
args="$*"
echo "$args" >> "$STUB_LOG"
IFS='|'
for pat in $STUB_FAIL; do
  case "$args" in *"$pat"*) echo "crashed: $pat" >&2; exit 1 ;; esac
done
exit 0
`;

interface Run {
  code: number | null;
  out: string;
  calls: string;
}

function repo(): { dir: string; bin: string; stage: (file: string, text: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pre-commit-'));
  const bin = join(dir, '.stub-bin');
  mkdirSync(bin);
  for (const name of ['npx', 'npm', 'node']) {
    writeFileSync(join(bin, name), STUB);
    chmodSync(join(bin, name), 0o755);
  }
  const git = (...args: string[]): void => {
    const r = spawnSync('git', [...GIT_SAFE, ...args], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'README.md'), 'base\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'base');
  const stage = (file: string, text: string): void => {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
    git('add', '--', file);
  };
  return { dir, bin, stage };
}

function run(r: ReturnType<typeof repo>, fail: string[] = [], extraBin?: string): Run {
  const log = join(r.dir, '.stub-log');
  writeFileSync(log, '');
  const path = [extraBin, r.bin, process.env.PATH].filter(Boolean).join(':');
  const res = spawnSync('sh', [HOOK], {
    cwd: r.dir,
    encoding: 'utf8',
    env: { PATH: path, HOME: r.dir, STUB_LOG: log, STUB_FAIL: fail.join('|') },
  });
  return {
    code: res.status,
    out: `${res.stdout}\n${res.stderr}`,
    calls: readFileSync(log, 'utf8'),
  };
}

const BLOCKING = [
  ['TypeScript', 'tsc --noEmit'],
  ['ESLint', 'run lint'],
  ['Prettier format ratchet', 'format-ratchet.ts'],
  ['deployment safety', 'check-deploy-safety.ts'],
  ['brand colors', 'check-brand.js'],
] as const;
const WARNING_ONLY = [
  ['code quality', 'code-quality-check.ts'],
  ['design compliance', 'check-design-compliance.js'],
  ['brand compliance', 'check-brand-compliance.ts'],
] as const;

describe('pre-commit hook: every check can go red (#3884)', () => {
  it('runs every check and says all passed when nothing fails', () => {
    const r = repo();
    r.stage('src/a.ts', 'export const a = 1;\n');
    const res = run(r);
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain('ALL PRE-COMMIT CHECKS PASSED');
    for (const [, pat] of [...BLOCKING, ...WARNING_ONLY]) expect(res.calls).toContain(pat);
    expect(res.calls).not.toContain('format:check');
  });

  for (const [name, pat] of BLOCKING) {
    it(`blocks the commit when ${name} fails, and shows its error`, () => {
      const r = repo();
      r.stage('src/a.ts', 'export const a = 1;\n');
      const res = run(r, [pat]);
      expect(res.code, res.out).not.toBe(0);
      expect(res.out).toContain(`crashed: ${pat}`);
      expect(res.out).not.toContain('CHECKS PASSED');
    });
  }

  for (const [name, pat] of WARNING_ONLY) {
    it(`warns, shows the error and drops "all passed" when ${name} fails`, () => {
      const r = repo();
      r.stage('src/a.ts', 'export const a = 1;\n');
      const res = run(r, [pat]);
      expect(res.code, res.out).toBe(0);
      expect(res.out).toContain(`crashed: ${pat}`);
      expect(res.out).not.toContain('ALL PRE-COMMIT CHECKS PASSED');
      expect(res.out).toContain('1 non-blocking check(s) failed');
    });
  }

  it('with a tool schema staged: a failed validation blocks, a failed generation warns', () => {
    const r = repo();
    r.stage('src/tools/schemas/play.schema.json', '{}\n');
    const blocked = run(r, ['validate-tool-schemas.ts']);
    expect(blocked.code, blocked.out).not.toBe(0);
    expect(blocked.out).toContain('crashed: validate-tool-schemas.ts');
    const warned = run(r, ['generate-all.ts']);
    expect(warned.code, warned.out).toBe(0);
    expect(warned.out).toContain('crashed: generate-all.ts');
    expect(warned.out).not.toContain('ALL PRE-COMMIT CHECKS PASSED');
  });
});

describe('pre-commit hook: the secret scan reads what is staged (#3884)', () => {
  const blocked = (res: Run, file: string): void => {
    expect(res.code, res.out).not.toBe(0);
    expect(res.out).toContain('POSSIBLE SECRET STAGED - COMMIT BLOCKED');
    expect(res.out).toContain(`    ${file}`);
  };

  it('blocks each pattern, in any text file', () => {
    for (const [file, line] of [
      ['src/keys.ts', `const k = '${AWS_KEY}';`],
      ['.env', `STRIPE_SECRET_KEY=${STRIPE_KEY}`],
      ['deploy/key.pem', PEM],
      ['config/app.yaml', `aws_key: ${AWS_KEY}`],
    ]) {
      const r = repo();
      r.stage(file, `${line}\n`);
      blocked(run(r), file);
    }
  });

  it('scans the staged content, not the working tree', () => {
    const r = repo();
    r.stage('src/keys.ts', `const k = '${AWS_KEY}';\n`);
    writeFileSync(join(r.dir, 'src/keys.ts'), 'const k = process.env.KEY;\n');
    blocked(run(r), 'src/keys.ts');
  });

  it('reads a staged path with a space in it', () => {
    const r = repo();
    r.stage('src/my keys.ts', `const k = '${AWS_KEY}';\n`);
    blocked(run(r), 'src/my keys.ts');
  });

  it('reads an added line that starts with "++ " (it looks like a file header)', () => {
    const r = repo();
    r.stage('notes.txt', `++ ${AWS_KEY}\n`);
    blocked(run(r), 'notes.txt');
  });

  it('passes a line marked gitleaks:allow, and a key that was already committed', () => {
    const r = repo();
    r.stage('src/test.ts', `const fake = '${AWS_KEY}'; // gitleaks:allow\n`);
    expect(run(r).code).toBe(0);
    spawnSync('git', [...GIT_SAFE, 'commit', '-q', '-m', 'fixture'], { cwd: r.dir });
    writeFileSync(
      join(r.dir, 'src/test.ts'),
      `const fake = '${AWS_KEY}'; // gitleaks:allow\nexport {};\n`
    );
    spawnSync('git', ['add', 'src/test.ts'], { cwd: r.dir });
    const res = run(r);
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain('No secret pattern in the staged lines');
  });

  it('blocks when the scan itself cannot run, instead of reading empty as clean', () => {
    const r = repo();
    r.stage('src/a.ts', 'export const a = 1;\n');
    const broken = join(r.dir, '.broken-bin');
    mkdirSync(broken);
    writeFileSync(join(broken, 'awk'), '#!/bin/sh\necho "awk: broken" >&2\nexit 2\n');
    chmodSync(join(broken, 'awk'), 0o755);
    const res = run(r, [], broken);
    expect(res.code, res.out).not.toBe(0);
    expect(res.out).toContain('SECRET SCAN COULD NOT RUN (awk)');
  });
});
