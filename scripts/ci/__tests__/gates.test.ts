/**
 * The gate runner (scripts/ci/gates.ts) behind `pnpm gates`, `pnpm gates --pre-push` and
 * CI's Quality Gates job: it selects by flag, runs every selected gate even after one
 * fails, exits non-zero naming each failed gate, and hands the token only to the gates
 * whose entry lists it.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  execGate,
  gateEnv,
  GATES_FILE,
  main,
  PRE_PUSH_BUDGET_SECONDS,
  readGates,
  runGates,
  selectGates,
  type ExecGate,
  type Gate,
} from '../gates.js';

const gate = (name: string, prePush: boolean, extra: Partial<Gate> = {}): Gate => ({
  name,
  run: ['true'],
  prePush,
  why: `${name} why`,
  ...extra,
});
const LIST = [gate('arch', true), gate('knip', false), gate('ratchet', true)];

/** An exec that fails the named gates, recording what ran with which env. */
function fakeExec(failing: string[] = []) {
  const ran: { name: string; env: NodeJS.ProcessEnv }[] = [];
  const exec: ExecGate = (g, env) => {
    ran.push({ name: g.name, env });
    return failing.includes(g.name) ? { code: 1 } : { code: 0 };
  };
  return { exec, ran };
}
function printer() {
  const lines: string[] = [];
  return { lines, print: (l: string) => void lines.push(l) };
}

describe('gates.json', () => {
  it('parses into gates with unique names, and a pre-push set smaller than the whole', () => {
    const gates = readGates(readFileSync(GATES_FILE, 'utf8'));
    expect(gates.length).toBeGreaterThanOrEqual(16);
    const prePush = selectGates(gates, true);
    expect(prePush.length).toBeGreaterThan(0);
    expect(prePush.length).toBeLessThan(gates.length);
  });

  it('rejects an entry the runner could not run as written', () => {
    const bad = (entry: object): string => JSON.stringify([entry]);
    const ok = { name: 'a', run: ['pnpm', 'x'], prePush: false, why: 'w' };
    expect(readGates(bad(ok))).toEqual([ok]);
    expect(() => readGates('{}')).toThrow(/not a list/);
    expect(() => readGates('[]')).toThrow(/not a list/);
    expect(() => readGates(bad({ ...ok, prePush: 'yes' }))).toThrow(/prePush must be/);
    expect(() => readGates(bad({ ...ok, run: [] }))).toThrow(/run must be/);
    expect(() => readGates(bad({ ...ok, run: 'pnpm x' }))).toThrow(/run must be/);
    expect(() => readGates(bad({ ...ok, why: '' }))).toThrow(/empty why/);
    expect(readGates(bad({ name: 'b', run: ['x'], prePush: true }))).toHaveLength(1); // why is optional
    expect(() => readGates(bad({ ...ok, env: 'GH_TOKEN' }))).toThrow(/env must be/);
    expect(() => readGates(JSON.stringify([ok, ok]))).toThrow(/duplicate name/);
  });
});

describe('selecting gates', () => {
  it('--pre-push picks the marked gates in list order; no flag picks all', () => {
    expect(selectGates(LIST, true).map((g) => g.name)).toEqual(['arch', 'ratchet']);
    expect(selectGates(LIST, false).map((g) => g.name)).toEqual(['arch', 'knip', 'ratchet']);
  });
});

describe('the token', () => {
  it('reaches only a gate that lists it; other variables reach every gate', () => {
    const env = { GH_TOKEN: 't1', GITHUB_TOKEN: 't2', CI: 'true' };
    expect(gateEnv(gate('plain', false), env)).toEqual({ CI: 'true' });
    expect(gateEnv(gate('expiry', false, { env: ['GH_TOKEN'] }), env)).toEqual({
      GH_TOKEN: 't1',
      CI: 'true',
    });
    expect(env.GH_TOKEN).toBe('t1'); // the caller's env is not changed
  });

  it('is passed by runGates as gateEnv says', () => {
    const { exec, ran } = fakeExec();
    const gates = [gate('plain', false), gate('expiry', false, { env: ['GH_TOKEN'] })];
    runGates(gates, { exec, env: { GH_TOKEN: 't' }, print: () => {} });
    expect(ran.map((r) => [r.name, r.env.GH_TOKEN])).toEqual([
      ['plain', undefined],
      ['expiry', 't'],
    ]);
  });
});

describe('running gates', () => {
  it('runs every gate after a failure and returns each failed name', () => {
    const { exec, ran } = fakeExec(['arch', 'ratchet']);
    const { print } = printer();
    expect(runGates(LIST, { exec, env: {}, print })).toEqual(['arch', 'ratchet']);
    expect(ran.map((r) => r.name)).toEqual(['arch', 'knip', 'ratchet']);
  });

  it('counts a gate with no exit code (killed, not found) as failed', () => {
    const exec: ExecGate = () => ({ code: null, detail: 'spawnSync nope ENOENT' });
    const { lines, print } = printer();
    expect(runGates([gate('gone', true)], { exec, env: {}, print })).toEqual(['gone']);
    expect(lines.join('\n')).toContain('spawnSync nope ENOENT');
  });

  it('in GitHub Actions, gives each gate a log group and each failure an ::error', () => {
    const { exec } = fakeExec(['knip, dead: code']);
    const { lines, print } = printer();
    const gates = [gate('arch', true), gate('knip, dead: code', false)];
    runGates(gates, { exec, env: { GITHUB_ACTIONS: 'true' }, print });
    expect(lines.filter((l) => l.startsWith('::group::'))).toEqual([
      '::group::arch',
      '::group::knip, dead: code',
    ]);
    expect(lines.filter((l) => l === '::endgroup::')).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith('::error'))).toEqual([
      '::error title=knip%2C dead%3A code::exit 1. knip, dead: code why',
    ]);
  });

  it('locally, names the failed gate, its why and its log', () => {
    const exec: ExecGate = () => ({ code: 2, log: '/tmp/gates-x/arch.log' });
    const { lines, print } = printer();
    runGates([gate('arch', true)], { exec, env: {}, print });
    expect(lines.some((l) => l.startsWith('::'))).toBe(false);
    const failure =
      /^ {2}❌ arch \(.* s, exit 2, output in \/tmp\/gates-x\/arch\.log\)\. arch why$/;
    expect(lines).toEqual([expect.stringMatching(failure)]);
  });
});

describe('main', () => {
  it('--pre-push runs only the pre-push set, and exits 1 naming each failed gate', () => {
    const { exec, ran } = fakeExec(['arch', 'ratchet']);
    const { lines, print } = printer();
    expect(main(['--pre-push'], { gates: LIST, exec, env: {}, print })).toBe(1);
    expect(ran.map((r) => r.name)).toEqual(['arch', 'ratchet']);
    expect(lines.at(-1)).toMatch(/^gates: 2 of 2 failed: arch, ratchet \(.* s\)\.$/);
  });

  it('with no flag runs every gate, and exits 0 when all pass', () => {
    const { exec, ran } = fakeExec();
    const { lines, print } = printer();
    expect(main([], { gates: LIST, exec, env: {}, print })).toBe(0);
    expect(ran).toHaveLength(3);
    expect(lines.at(-1)).toMatch(/^gates: all 3 passed/);
  });

  it('exits 2 on an unknown argument, running nothing', () => {
    const { exec, ran } = fakeExec();
    const { lines, print } = printer();
    expect(main(['--prepush'], { gates: LIST, exec, env: {}, print })).toBe(2);
    expect(ran).toEqual([]);
    expect(lines).toEqual(['usage: pnpm gates [--pre-push]']);
  });

  it('warns when the pre-push set runs over its budget, and only then', () => {
    const slow = (): (() => number) => {
      let t = 0;
      return () => (t += (PRE_PUSH_BUDGET_SECONDS * 1000) / 2);
    };
    const run = (args: string[]): string[] => {
      const { lines, print } = printer();
      main(args, { gates: LIST, exec: fakeExec().exec, env: {}, print, now: slow() });
      return lines.filter((l) => l.includes('budget'));
    };
    expect(run(['--pre-push'])).toHaveLength(1);
    expect(run([])).toEqual([]);
  });
});

describe('execGate, with real processes', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes each gate to its own log, passes a 0 exit, and fails any other', () => {
    dir = mkdtempSync(join(tmpdir(), 'gates-test-'));
    const node = (name: string, code: string): Gate =>
      gate(name, true, { run: [process.execPath, '-e', code] });
    const gates = [
      node('Fails loudly', "process.stdout.write('broken thing'); process.exit(3)"),
      node('Passes', 'process.exit(0)'),
      gate('Not installed', true, { run: ['gates-test-no-such-command'] }),
    ];
    const { lines, print } = printer();
    expect(runGates(gates, { exec: execGate(dir), env: process.env, print })).toEqual([
      'Fails loudly',
      'Not installed',
    ]);
    expect(readFileSync(join(dir, 'fails-loudly.log'), 'utf8')).toContain('broken thing');
    expect(lines.join('\n')).toMatch(/Fails loudly .*exit 3, output in .*fails-loudly\.log/);
    expect(lines.join('\n')).toMatch(/Not installed .*ENOENT/);
  });
});
