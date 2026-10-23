/**
 * The secrets parity check on fixture agents: names only on one side, a drifted voice id
 * (the Maya case), flag states, allowlisted keys, values hidden from the boot log. The leak
 * tests run the real CLI on the same fixtures and fail if any fixture value, or even its
 * first or last 8 characters in any case, appears in what it prints.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  parseSecretNames,
  render,
  type Snapshot,
} from '../secrets-parity-lib.js';

const FLAGS = new Set(['ARC_INSIGHT_ONCE', 'WORLD_NOW', 'CASCADE_TURN_DETECTION', 'NEVER_SILENT']);
const isFlag = (n: string) => FLAGS.has(n);

/** Every value that is not a flag word. None of these may reach the output. */
const SECRET_VALUES = {
  devMaya: 'zq7Kx2DevMayaVoice9a1b2c3d',
  prodMaya: 'mW4pR8ProdMeditation5e6f7g8h',
  ferni: 'fN3vT6SameFerniVoice0i9j8k7',
  devKey: 'sk-dEv1LeakCheckKeyQ4w5e6r7t',
  prodKey: 'sk-pRd2LeakCheckKeyY8u9i0o1p',
  ttsDev: 'cartesiaModeDevAa11bb22',
  ttsProd: 'cartesiaModeProdCc33dd44',
};

function boot(commit: string, flags: Record<string, string>, env: Record<string, string>): string {
  // Two parts, as a long boot line is split, plus noise a real log stream carries.
  const head = { parts: 2, commit, hash: `h-${commit}` };
  return [
    '{"level":30,"msg":"token_at_rest_kid=whatever"}',
    `EFFECTIVE_SETTINGS ${JSON.stringify({ part: 1, ...head, flags, env: {} })}`,
    '[voice-agent-entry] Using Cartesia Cascade',
    `EFFECTIVE_SETTINGS ${JSON.stringify({ part: 2, ...head, flags: {}, env })}`,
  ].join('\n');
}

const FIXTURES = {
  'dev.secrets.json': {
    secrets: [
      'ARC_INSIGHT_ONCE',
      'CASCADE_TURN_DETECTION',
      'NEVER_SILENT',
      'MAYA_SANTOS_VOICE_ID',
      'FERNI_VOICE_ID',
      'OPENAI_API_KEY',
      'DEV_ONLY_THING',
    ],
  },
  'prod.secrets.json': {
    secrets: [
      'CASCADE_TURN_DETECTION',
      'NEVER_SILENT',
      'MAYA_SANTOS_VOICE_ID',
      'FERNI_VOICE_ID',
      'OPENAI_API_KEY',
      'WORLD_NOW',
    ],
  },
  'dev.logs.txt': boot(
    'aaaaaaa1111',
    {
      ARC_INSIGHT_ONCE: 'on',
      WORLD_NOW: 'off',
      CASCADE_TURN_DETECTION: SECRET_VALUES.ttsDev,
      NEVER_SILENT: 'on',
    },
    {
      MAYA_SANTOS_VOICE_ID: SECRET_VALUES.devMaya,
      FERNI_VOICE_ID: SECRET_VALUES.ferni,
      OPENAI_API_KEY: '<set>',
    }
  ),
  'prod.logs.txt': boot(
    'bbbbbbb2222',
    {
      ARC_INSIGHT_ONCE: 'off',
      WORLD_NOW: 'shadow',
      CASCADE_TURN_DETECTION: SECRET_VALUES.ttsProd,
      NEVER_SILENT: 'on',
    },
    {
      MAYA_SANTOS_VOICE_ID: SECRET_VALUES.prodMaya,
      FERNI_VOICE_ID: SECRET_VALUES.ferni,
      OPENAI_API_KEY: '<set>',
    }
  ),
};

const ALLOW = JSON.stringify({ keys: { '*_API_KEY': 'per project' } });

function snap(label: string, seal = newSealer()): Snapshot {
  const names = parseSecretNames(
    JSON.stringify({
      secrets: FIXTURES[`${label}.secrets.json` as 'dev.secrets.json'].secrets.map((name) => ({
        name,
      })),
    })
  );
  const c = new BootCollector(isFlag, seal);
  for (const line of FIXTURES[`${label}.logs.txt` as 'dev.logs.txt'].split('\n')) c.add(line);
  return { label, names: new Set(names), ...c.result() };
}

function pair() {
  const seal = newSealer();
  return { dev: snap('dev', seal), prod: snap('prod', seal) };
}

describe('compare', () => {
  const { dev, prod } = pair();
  const allow = parseAllowlist(ALLOW, [...FLAGS, ...dev.names, ...prod.names], isFlag);
  const rows = compare(dev, prod, allow, isFlag);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  it('reports names set on one side only, with flag words for flags', () => {
    expect(byName.ARC_INSIGHT_ONCE).toMatchObject({
      status: 'only-dev',
      states: { dev: 'on', prod: 'off' },
    });
    expect(byName.DEV_ONLY_THING).toMatchObject({ status: 'only-dev' });
    expect(byName.WORLD_NOW).toMatchObject({
      status: 'only-prod',
      states: { dev: 'off', prod: 'shadow' },
    });
  });

  it('catches a persona voice id that drifted (the Maya case)', () => {
    expect(byName.MAYA_SANTOS_VOICE_ID).toMatchObject({ status: 'differs', allowlisted: false });
  });

  it('leaves out keys whose values match', () => {
    expect(byName.FERNI_VOICE_ID).toBeUndefined();
    expect(byName.NEVER_SILENT).toBeUndefined();
  });

  it('shows "differs" without states for a flag whose value is not a flag word', () => {
    expect(byName.CASCADE_TURN_DETECTION).toEqual({
      name: 'CASCADE_TURN_DETECTION',
      status: 'differs',
      allowlisted: false,
    });
  });

  it('marks an allowlisted key hidden from the boot log as allowlisted, not drift', () => {
    expect(byName.OPENAI_API_KEY).toMatchObject({ status: 'not-comparable', allowlisted: true });
  });

  it('lists a key set on both but read by neither build as unread, which does not fail', () => {
    const same = compare(dev, dev, allow, isFlag);
    expect(same).toContainEqual({ name: 'DEV_ONLY_THING', status: 'unread', allowlisted: false });
  });

  it('exits 1 on drift and 0 once both sides agree', () => {
    expect(exitCode(rows, dev, prod)).toBe(1);
    expect(exitCode(compare(dev, dev, allow, isFlag), dev, dev)).toBe(0);
  });

  it('exits 2 when a non-allowlisted value is hidden, or a boot log is missing', () => {
    const none = parseAllowlist('{"keys":{}}', [], isFlag);
    expect(exitCode(compare(dev, dev, none, isFlag), dev, dev)).toBe(2);
    const blind = { ...dev, commit: null, values: new Map() };
    expect(exitCode([], dev, blind)).toBe(2);
  });

  it('gives different digests for the same value in two runs', () => {
    const a = snap('dev').values.get('FERNI_VOICE_ID');
    const b = snap('dev').values.get('FERNI_VOICE_ID');
    expect(a?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toEqual(b);
  });
});

describe('parseAllowlist', () => {
  it.each(['*_VOICE_ID', 'MAYA_SANTOS_VOICE_ID', '*_ID', 'MAYA_*', 'WORLD_NOW', 'WORLD_*'])(
    'refuses %s, which covers a voice id or a flag',
    (pattern) => {
      const json = JSON.stringify({ keys: { [pattern]: 'no' } });
      expect(() => parseAllowlist(json, [...FLAGS, 'MAYA_SANTOS_VOICE_ID'], isFlag)).toThrow(
        /voice ids and flags/
      );
    }
  );

  it('refuses an entry without a reason', () => {
    expect(() => parseAllowlist('{"keys":{"X_KEY":""}}', [], isFlag)).toThrow(/no reason/);
  });

  it('accepts the checked-in allowlist against the real manifest', async () => {
    const { FLAG_MANIFEST } = await import('../../../src/config/flag-manifest.js');
    const file = fileURLToPath(new URL('../secrets-parity-allowlist.json', import.meta.url));
    const names = Object.keys(FLAG_MANIFEST);
    expect(() =>
      parseAllowlist(readFileSync(file, 'utf8'), names, (n) => names.includes(n))
    ).not.toThrow();
  });
});

describe('no value reaches the output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secrets-parity-'));
  for (const [file, body] of Object.entries(FIXTURES)) {
    writeFileSync(
      join(dir, file),
      typeof body === 'string'
        ? body
        : JSON.stringify({ secrets: body.secrets.map((name) => ({ name })) })
    );
  }
  writeFileSync(join(dir, 'allow.json'), ALLOW);

  function leaks(text: string): string[] {
    return Object.values(SECRET_VALUES).flatMap((v) =>
      [v, v.slice(0, 8), v.slice(-8)].filter((piece) =>
        text.toLowerCase().includes(piece.toLowerCase())
      )
    );
  }

  it('render prints names and flag words only', () => {
    const { dev, prod } = pair();
    const allow = parseAllowlist(ALLOW, [...FLAGS, ...dev.names, ...prod.names], isFlag);
    const text = render(compare(dev, prod, allow, isFlag), dev, prod);
    expect(text).toContain('MAYA_SANTOS_VOICE_ID');
    expect(leaks(text)).toEqual([]);
  });

  it('the CLI prints no fixture value on stdout or stderr', () => {
    const script = fileURLToPath(new URL('../secrets-parity.ts', import.meta.url));
    let out = '';
    try {
      execFileSync(
        process.execPath,
        ['--import', 'tsx', script, '--fixtures', dir, '--allowlist', join(dir, 'allow.json')],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      expect(e.status).toBe(1); // drift in the fixtures
      out = `${e.stdout}\n${e.stderr}`;
    }
    expect(leaks(out)).toEqual([]);
    expect(out).toContain('Values differ (2): CASCADE_TURN_DETECTION, MAYA_SANTOS_VOICE_ID');
    expect(out).toContain('ARC_INSIGHT_ONCE (dev=on prod=off)');
  }, 30_000);
});
