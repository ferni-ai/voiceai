/**
 * Which agent flags the dev switchboard may flip, and what an apply request may
 * ask for (docs/plans/2026-11-16-dev-flag-switchboard.md, "Which flags").
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as FLAG_FILES from '../../flags/index.generated.js';
import {
  SHADOW_CAPABLE,
  VALUE_OVERRIDES,
  agentFlags,
  resolvedValue,
  validateApply,
} from '../domain/switchable.js';

const FILE_NAMES = new Set(Object.keys(FLAG_FILES));
// The flag files whose default is a number (the spec counted 6; CALL_MEMORY_TRACE is
// kind config but defaults to off, so it is an on/off switch like any other).
const NUMERIC_CONFIG_FLAGS = [
  'BARGE_IN_SOFT_PAUSE_CONFIRM_MS',
  'BARGE_IN_SOFT_PAUSE_STT_GRACE_MS',
  'LATENCY_ARM_PERCENT',
  'WORKER_RECYCLE_MAX_CALLS',
  'WORKER_RECYCLE_RSS_MB',
];

function byName(name: string) {
  const flag = agentFlags().find((f) => f.name === name);
  if (!flag) throw new Error(`${name} missing from agentFlags()`);
  return flag;
}

describe('agentFlags', () => {
  it('lists every per-file flag and nothing else, sorted by name', () => {
    const names = agentFlags().map((f) => f.name);
    expect(names).toHaveLength(FILE_NAMES.size);
    expect(names.filter((n) => !FILE_NAMES.has(n))).toEqual([]);
    expect(names).toEqual([...names].sort());
  });

  it('carries each flag file default, owner and kind', () => {
    expect(byName('ABUSE_DISCLOSURE_PATTERNS')).toMatchObject({
      default: 'off',
      owner: 'intelligence',
      kind: 'experiment',
    });
  });

  it('shows the numeric config flags read-only', () => {
    for (const name of NUMERIC_CONFIG_FLAGS) {
      expect(byName(name)).toMatchObject({ switchable: false, modes: [] });
    }
    expect(agentFlags().filter((f) => !f.switchable)).toHaveLength(NUMERIC_CONFIG_FLAGS.length);
  });

  it('switches a config-kind flag whose default is off', () => {
    expect(byName('CALL_MEMORY_TRACE')).toMatchObject({ kind: 'config', switchable: true });
  });

  it('gives an on/off experiment the modes off and on', () => {
    expect(byName('ABUSE_DISCLOSURE_PATTERNS')).toMatchObject({
      switchable: true,
      modes: ['off', 'on'],
    });
  });

  it('gives a flagModeOf flag the shadow mode as well', () => {
    expect(byName('SOUND_CONDUCTOR').modes).toEqual(['off', 'shadow', 'on']);
  });

  it("gives a flag read directly its reader's own words", () => {
    expect(byName('CRISIS_MEANS_IN_HAND').modes).toEqual(['off', 'shadow', 'live']);
    expect(byName('ATTUNE_LEDGER').modes).toEqual(['off', 'on']);
    expect(byName('CALL_TELEMETRY').modes).toEqual(['off', 'on', 'reports']);
  });

  it('is computed once and cannot be changed by a caller', () => {
    expect(agentFlags()).toBe(agentFlags());
    expect(Object.isFrozen(agentFlags())).toBe(true);
    expect(Object.isFrozen(agentFlags()[0])).toBe(true);
  });
});

describe('validateApply', () => {
  const refuses = (body: unknown) => {
    const result = validateApply(body);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors;
  };

  it('refuses a real agent secret that is not a flag file', () => {
    expect(refuses({ set: { CARTESIA_MODEL: 'on' }, reset: [] })).toEqual([
      'CARTESIA_MODEL is not a switchable agent flag',
    ]);
  });

  it('refuses ALLOW_PRODUCTION_DATA, in set and in reset', () => {
    expect(refuses({ set: { ALLOW_PRODUCTION_DATA: 'on' }, reset: [] })[0]).toContain(
      'ALLOW_PRODUCTION_DATA'
    );
    expect(refuses({ set: {}, reset: ['ALLOW_PRODUCTION_DATA'] })[0]).toContain(
      'ALLOW_PRODUCTION_DATA'
    );
  });

  it('refuses a numeric config flag, whatever the value', () => {
    expect(refuses({ set: { LATENCY_ARM_PERCENT: 'off' }, reset: [] })[0]).toContain(
      'LATENCY_ARM_PERCENT'
    );
    expect(refuses({ set: { LATENCY_ARM_PERCENT: 'on' }, reset: [] })[0]).toContain(
      'LATENCY_ARM_PERCENT'
    );
    expect(refuses({ set: {}, reset: ['WORKER_RECYCLE_RSS_MB'] })[0]).toContain(
      'WORKER_RECYCLE_RSS_MB'
    );
  });

  it('refuses shadow on a flag that has no shadow mode', () => {
    expect(refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'shadow' }, reset: [] })[0]).toContain(
      'ABUSE_DISCLOSURE_PATTERNS'
    );
  });

  it('refuses a value the reader of a directly read flag ignores', () => {
    expect(refuses({ set: { CRISIS_MEANS_IN_HAND: 'on' }, reset: [] })[0]).toContain(
      'allowed: off, shadow, live'
    );
    refuses({ set: { SELF_VOICE_GATE: 'on' }, reset: [] });
    refuses({ set: { ATTUNE_LEDGER: 'shadow' }, reset: [] });
  });

  it('accepts live where the reader acts on it', () => {
    expect(validateApply({ set: { CRISIS_MEANS_IN_HAND: 'live' }, reset: [] })).toEqual({
      ok: true,
      request: { set: { CRISIS_MEANS_IN_HAND: 'live' }, reset: [] },
    });
  });

  it('refuses a value that is not one of the modes', () => {
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'true' }, reset: [] });
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'ON' }, reset: [] });
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 1 }, reset: [] });
  });

  it('refuses a name in both set and reset', () => {
    expect(
      refuses({ set: { SOUND_CONDUCTOR: 'on' }, reset: ['SOUND_CONDUCTOR'] }).join(' ')
    ).toContain('SOUND_CONDUCTOR');
  });

  it('refuses an empty request', () => {
    refuses({ set: {}, reset: [] });
    refuses({});
  });

  it('refuses a body that is not an object of the right shape', () => {
    for (const body of [null, undefined, 'SOUND_CONDUCTOR=on', 42, [], ['SOUND_CONDUCTOR']]) {
      refuses(body);
    }
    refuses({ set: [], reset: [] });
    refuses({ set: {}, reset: 'SOUND_CONDUCTOR' });
    refuses({ set: {}, reset: [42] });
    refuses({ set: {}, reset: ['SOUND_CONDUCTOR', 'SOUND_CONDUCTOR'] });
    refuses({ set: { SOUND_CONDUCTOR: 'on' }, reset: [], extra: true });
  });

  it('refuses inherited and prototype names', () => {
    refuses({ set: {}, reset: ['__proto__'] });
    refuses({ set: {}, reset: ['toString'] });
    refuses(JSON.parse('{"set":{"__proto__":"on"},"reset":[]}'));
  });

  it('accepts shadow on a shadow-capable flag plus a reset', () => {
    expect(
      validateApply({ set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] })
    ).toEqual({
      ok: true,
      request: { set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] },
    });
  });
});

const SRC = join(__dirname, '..', '..', '..');
const FLAG_FILES_DIR = join(SRC, 'config', 'flags');
const SEALED = /fixtures|heldout|held-out|blind|sealed|corpus/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SEALED.test(path) || path === FLAG_FILES_DIR) continue;
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('SHADOW_CAPABLE', () => {
  it('holds every per-file flag the code reads with flagModeOf', () => {
    const read = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/flagModeOf\(\s*'([A-Z][A-Z0-9_]+)'/g)) {
        if (m[1] && FILE_NAMES.has(m[1])) read.add(m[1]);
      }
    }
    // the scan must find the known readers, or it proves nothing
    expect(read).toContain('SOUND_CONDUCTOR');
    expect([...read].filter((name) => !SHADOW_CAPABLE.has(name))).toEqual([]);
  });

  it('gives every per-file flag whose default is shadow a shadow mode', () => {
    const shadowDefaults = agentFlags().filter((f) => f.default === 'shadow');
    expect(shadowDefaults.length).toBeGreaterThan(0);
    expect(shadowDefaults.filter((f) => !f.modes.includes('shadow'))).toEqual([]);
  });

  it('names only per-file flags', () => {
    expect([...SHADOW_CAPABLE].filter((name) => !FILE_NAMES.has(name))).toEqual([]);
  });
});

describe('VALUE_OVERRIDES', () => {
  /** Per-file flags some source file reads straight from env: env.NAME, process.env.NAME, env['NAME']. */
  function readDirectly(): Set<string> {
    const read = new Set<string>();
    const pattern = /\benv(?:\.([A-Z][A-Z0-9_]*)\b|\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\])/g;
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(pattern)) {
        const name = m[1] ?? m[2];
        if (name && FILE_NAMES.has(name)) read.add(name);
      }
    }
    return read;
  }

  it('holds every switchable per-file flag the code reads straight from env', () => {
    const read = readDirectly();
    // the scan must find known readers, or it proves nothing
    expect(read).toContain('ATTUNE_LEDGER');
    expect(read).toContain('CRISIS_MEANS_IN_HAND');
    const missing = [...read].filter((name) => byName(name).switchable && !VALUE_OVERRIDES[name]);
    expect(missing).toEqual([]);
  });

  it('names only switchable per-file flags, none of them read with flagModeOf', () => {
    for (const name of Object.keys(VALUE_OVERRIDES)) {
      expect(byName(name).switchable, name).toBe(true);
      expect(SHADOW_CAPABLE.has(name), name).toBe(false);
    }
  });

  it("includes each flag's default in its words, so a reset is a value the reader knows", () => {
    for (const [name, words] of Object.entries(VALUE_OVERRIDES)) {
      expect(words, name).toContain(byName(name).default);
    }
  });
});

describe('resolvedValue', () => {
  it('reports CRISIS_MEANS_IN_HAND as its reader resolves it', () => {
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'on')).toBe('shadow');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'live')).toBe('live');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', ' LIVE ')).toBe('live');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', 'off')).toBe('off');
    expect(resolvedValue('CRISIS_MEANS_IN_HAND', undefined)).toBe('shadow');
  });

  it("reports a flag whose reader accepts only 'on' as off for any other word", () => {
    expect(resolvedValue('ATTUNE_LEDGER', 'true')).toBe('off');
    expect(resolvedValue('ATTUNE_LEDGER', 'on')).toBe('on');
    expect(resolvedValue('ATTUNE_LEDGER', undefined)).toBe('off');
  });

  it("reports CRISIS_GRADED_RESPONSE's live as the shadow it runs as", () => {
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', 'live')).toBe('shadow');
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', '__proto__')).toBe('off');
    expect(resolvedValue('CRISIS_GRADED_RESPONSE', 'toString')).toBe('off');
  });

  it('reads a flagModeOf flag as flagModeOf does', () => {
    expect(resolvedValue('SOUND_CONDUCTOR', 'shadow')).toBe('shadow');
    expect(resolvedValue('SOUND_CONDUCTOR', 'TRUE')).toBe('on');
    expect(resolvedValue('SOUND_CONDUCTOR', undefined)).toBe('off');
  });

  it('reads any other switchable flag as flagOn does', () => {
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', 'true')).toBe('on');
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', 'shadow')).toBe('off');
    expect(resolvedValue('ABUSE_DISCLOSURE_PATTERNS', undefined)).toBe('off');
  });

  it('reports a numeric config flag as set, or its default when unset', () => {
    expect(resolvedValue('LATENCY_ARM_PERCENT', ' 25 ')).toBe('25');
    expect(resolvedValue('LATENCY_ARM_PERCENT', undefined)).toBe('0');
    expect(resolvedValue('LATENCY_ARM_PERCENT', '')).toBe('0');
  });

  it('passes through a name that is not a per-file flag', () => {
    expect(resolvedValue('NOT_A_FLAG', ' x ')).toBe('x');
    expect(resolvedValue('NOT_A_FLAG', undefined)).toBe('');
  });
});
