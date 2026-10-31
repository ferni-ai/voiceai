/**
 * Ways the parity check could say CLEAN when it shouldn't (review of #2556, round 1): an
 * allowlist hiding a missing key, a rolled-back boot read as the old one, voice ids and flags
 * nobody compared, a newer boot only partly logged, a boot older than the last secret change,
 * and junk input. Plus the CLI reading the whole log backlog, against a fake `lk`.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BootCollector,
  compare,
  exitCode,
  newSealer,
  parseAllowlist,
  parseSecrets,
  snapshotOf,
  type Snapshot,
} from '../secrets-parity-lib.js';

const isFlag = (n: string) => n === 'X_FLAG';
const T0 = Date.parse('2026-10-23T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function line(
  at: number,
  hash: string,
  flags: Record<string, string>,
  env: Record<string, string>,
  part = 1,
  parts = 1
) {
  const body = JSON.stringify({ part, parts, commit: 'c1', hash, flags, env });
  return `[${iso(at)}] [worker] EFFECTIVE_SETTINGS ${body}`;
}

function snap(
  label: string,
  names: string[],
  lines: string[],
  newest: number | null = T0 - 1000,
  seal = newSealer()
): Snapshot {
  const c = new BootCollector(isFlag, seal);
  lines.forEach((l) => c.add(l));
  return snapshotOf(label, { names, newest }, c.result());
}

const NONE = parseAllowlist('{"keys":{}}', [], isFlag);
const KEYS = parseAllowlist(JSON.stringify({ keys: { '*_API_KEY': 'per project' } }), [], isFlag);

describe('the allowlist never hides a missing key', () => {
  it('reports an allowlisted key that is only on dev as drift', () => {
    const seal = newSealer();
    const dev = snap(
      'dev',
      ['CARTESIA_API_KEY'],
      [line(T0, 'h', {}, { CARTESIA_API_KEY: '<set>' })],
      T0 - 1,
      seal
    );
    const prod = snap(
      'prod',
      [],
      [line(T0, 'h', {}, { CARTESIA_API_KEY: '<unset>' })],
      T0 - 1,
      seal
    );
    const rows = compare(dev, prod, KEYS, isFlag);
    expect(rows).toMatchObject([
      { name: 'CARTESIA_API_KEY', status: 'only-dev', allowlisted: false },
    ]);
    expect(exitCode(rows, dev, prod)).toBe(1);
  });

  it('accepts a key on one side only when onlyOn lists it for that side', () => {
    const allow = parseAllowlist(
      JSON.stringify({ keys: {}, onlyOn: { dev: { DEV_DEBUG_KEY: 'dev tooling' } } }),
      [],
      isFlag
    );
    const dev = snap('dev', ['DEV_DEBUG_KEY'], [line(T0, 'h', {}, {})]);
    const prod = snap('prod', [], [line(T0, 'h', {}, {})]);
    expect(exitCode(compare(dev, prod, allow, isFlag), dev, prod)).toBe(0);
    expect(exitCode(compare(prod, dev, allow, isFlag), prod, dev)).toBe(1); // listed for dev, not prod
  });

  it('reports <set> on one side and <unset> on the other as drift, allowlisted or not', () => {
    const seal = newSealer();
    const dev = snap(
      'dev',
      ['OPENAI_API_KEY'],
      [line(T0, 'h', {}, { OPENAI_API_KEY: '<set>' })],
      T0 - 1,
      seal
    );
    const prod = snap(
      'prod',
      ['OPENAI_API_KEY'],
      [line(T0, 'h', {}, { OPENAI_API_KEY: '<unset>' })],
      T0 - 1,
      seal
    );
    const rows = compare(dev, prod, KEYS, isFlag);
    expect(rows).toMatchObject([
      { name: 'OPENAI_API_KEY', status: 'presence', allowlisted: false },
    ]);
    expect(exitCode(rows, dev, prod)).toBe(1);
  });
});

describe('the latest boot wins', () => {
  it('sees a rollback to earlier settings (A, B, then A again)', () => {
    const seal = newSealer();
    const prod = snap(
      'prod',
      ['X_FLAG'],
      [
        line(T0, 'hA', { X_FLAG: 'on' }, {}),
        line(T0 + 1000, 'hB', { X_FLAG: 'off' }, {}),
        line(T0 + 2000, 'hA', { X_FLAG: 'on' }, {}),
      ],
      T0 - 1,
      seal
    );
    const dev = snap('dev', ['X_FLAG'], [line(T0, 'hB', { X_FLAG: 'off' }, {})], T0 - 1, seal);
    const rows = compare(dev, prod, NONE, isFlag);
    expect(rows).toMatchObject([
      { name: 'X_FLAG', status: 'differs', states: { dev: 'off', prod: 'on' } },
    ]);
  });

  it('ignores a second instance of the same boot logging alongside the first', () => {
    const prod = snap(
      'prod',
      ['X_FLAG'],
      [
        line(T0, 'hA', { X_FLAG: 'on' }, {}, 1, 2),
        line(T0, 'hA', { X_FLAG: 'on' }, {}, 1, 2),
        line(T0, 'hA', {}, {}, 2, 2),
        line(T0, 'hA', {}, {}, 2, 2),
      ]
    );
    expect(prod.problems).toEqual([]);
    expect(prod.values.get('X_FLAG')).toMatchObject({ state: 'on' });
  });

  it('cannot verify when a newer boot is only partly logged', () => {
    const prod = snap(
      'prod',
      ['X_FLAG'],
      [
        line(T0, 'hA', { X_FLAG: 'on' }, {}, 1, 2),
        line(T0, 'hA', {}, {}, 2, 2),
        line(T0 + 5000, 'hB', { X_FLAG: 'off' }, {}, 1, 2),
      ]
    );
    expect(prod.problems.join()).toMatch(/newer boot .*partly/);
    expect(exitCode([], prod, prod)).toBe(2);
  });

  it('cannot verify when the boot is older than the latest secret change', () => {
    const prod = snap('prod', ['X_FLAG'], [line(T0, 'hA', { X_FLAG: 'on' }, {})], T0 + 60_000);
    expect(prod.problems.join()).toMatch(/older than the latest secret change/);
    expect(exitCode([], prod, prod)).toBe(2);
  });

  it('cannot verify a boot line without a timestamp', () => {
    const untimed = `EFFECTIVE_SETTINGS ${JSON.stringify({ part: 1, parts: 1, commit: 'c', hash: 'h', flags: {}, env: {} })}`;
    expect(snap('prod', [], [untimed]).problems.join()).toMatch(/boot time unknown/);
  });
});

describe('voice ids and flags must be compared', () => {
  it.each([['SAGE_VOICE_ID'], ['X_FLAG']])(
    'cannot verify %s when it is set on both but in neither boot log',
    (name) => {
      const dev = snap('dev', [name], [line(T0, 'h', {}, {})]);
      const prod = snap('prod', [name], [line(T0, 'h2', {}, {})]);
      const rows = compare(dev, prod, NONE, isFlag);
      expect(rows).toMatchObject([{ name, status: 'unread', guarded: true }]);
      expect(exitCode(rows, dev, prod)).toBe(2);
    }
  );

  it('still lets an ordinary unread key pass', () => {
    const dev = snap('dev', ['OLD_KNOB'], [line(T0, 'h', {}, {})]);
    expect(exitCode(compare(dev, dev, NONE, isFlag), dev, dev)).toBe(0);
  });
});

describe('junk input', () => {
  it('does not crash on an EFFECTIVE_SETTINGS null line', () => {
    expect(() =>
      snap('dev', [], ['[2026-10-23T09:00:00.000Z] EFFECTIVE_SETTINGS null'])
    ).not.toThrow();
  });

  it('rejects a broken allowlist without echoing it', () => {
    expect(() => parseAllowlist('{"keys": {"SECRETISH_zq7Kx2', [], isFlag)).toThrow(
      /^allowlist is not valid JSON$/
    );
  });

  it('reads the newest updatedAt from lk agent secrets', () => {
    const json = JSON.stringify({
      secrets: [
        { name: 'A', updatedAt: iso(T0) },
        { name: 'B', updatedAt: iso(T0 + 5) },
      ],
    });
    expect(parseSecrets(json)).toEqual({ names: ['A', 'B'], newest: T0 + 5 });
  });
});

describe('the CLI reads the whole log backlog', () => {
  it('uses a boot logged after a long run of other lines, not the first one it saw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-lk-'));
    const secrets = JSON.stringify({ secrets: [{ name: 'ARC_INSIGHT_ONCE', updatedAt: iso(T0) }] });
    const boot = (at: number, h: string, v: string) =>
      `[${iso(at)}] EFFECTIVE_SETTINGS ${JSON.stringify({ part: 1, parts: 1, commit: 'c1', hash: h, flags: { ARC_INSIGHT_ONCE: v }, env: {} })}`;
    // `lk agent logs`: boot A, 4.5 s of other lines, boot B, then a quiet live tail.
    writeFileSync(
      join(dir, 'lk'),
      [
        '#!/bin/sh',
        `if [ "$2" = secrets ]; then echo '${secrets}'; exit 0; fi`,
        `echo '${boot(T0 + 1000, 'hA', 'off')}'`,
        'i=0; while [ $i -lt 18 ]; do echo "noise $i"; sleep 0.25; i=$((i+1)); done',
        `if [ "$4" = dev-p ]; then echo '${boot(T0 + 2000, 'hB', 'on')}'; fi`,
        'sleep 30',
      ].join('\n')
    );
    chmodSync(join(dir, 'lk'), 0o755);
    const script = fileURLToPath(new URL('../secrets-parity.ts', import.meta.url));
    let out = '';
    try {
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          script,
          '--dev-project',
          'dev-p',
          '--dev-config',
          'x',
          '--prod-project',
          'prod-p',
          '--prod-config',
          'y',
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
    } catch (err) {
      out = (err as { stdout: string }).stdout;
    }
    expect(out).toContain('Values differ (1): ARC_INSIGHT_ONCE (dev=on prod=off)');
  }, 30_000);
});

describe('round 2: fail closed on missing times and rolling restarts', () => {
  it('cannot verify when the agent has secrets but lk gives no updatedAt', () => {
    const prod = snap('prod', ['X_FLAG'], [line(T0, 'hA', { X_FLAG: 'on' }, {})], null);
    expect(prod.problems.join()).toMatch(/no updatedAt/);
    expect(exitCode([], prod, prod)).toBe(2);
  });

  it('cannot verify while two boots with different settings log at once', () => {
    const prod = snap(
      'prod',
      ['X_FLAG'],
      [
        line(T0, 'hA', { X_FLAG: 'on' }, {}, 1, 2),
        line(T0 + 200, 'hB', { X_FLAG: 'off' }, {}, 1, 2),
        line(T0 + 300, 'hA', {}, {}, 2, 2),
        line(T0 + 400, 'hB', {}, {}, 2, 2),
      ]
    );
    expect(prod.problems.join()).toMatch(/two boots/);
    expect(exitCode([], prod, prod)).toBe(2);
  });

  it('trusts a boot that came well after the one before it', () => {
    const prod = snap(
      'prod',
      ['X_FLAG'],
      [line(T0, 'hA', { X_FLAG: 'on' }, {}), line(T0 + 3_600_000, 'hB', { X_FLAG: 'off' }, {})]
    );
    expect(prod.problems).toEqual([]);
  });
});
