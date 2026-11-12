import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_MANIFEST } from '../../../src/config/flag-manifest.js';
import { rate, samplingGap, TELL_KEYS } from '../../persona-eval/bar-lib.js';
import { compare, failed, readBaseline } from '../gate-lib.js';
import {
  BASELINE,
  FLAGS,
  PROTECTIONS,
  baselineFrom,
  metricsOf,
  protectionsFrom,
  ratesOf,
  readResult,
  runBar,
  type BarResult,
} from '../persona.js';

/** A bar result: distinctness k/240, the question tell q/240, the rest fixed. */
function result(k: number, q = 200, empty = 0): BarResult {
  const tells = { question: rate(q, 240), opener: rate(30, 240), checkin: rate(5, 240), exclaim: rate(10, 240), asks: rate(220, 240) }; // prettier-ignore
  return {
    scored: {
      metrics: {
        distinctness: rate(k, 240),
        insight: rate(60, 72),
        copy: { ...rate(20, 240), top: [] },
        medianWords: 35,
        tells,
      },
      forced: rate(2, 72),
      judgeFailures: 0,
      emptyReplies: empty,
    },
  };
}

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'persona-gate-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('metric extraction', () => {
  it('reads distinctness, insight natural and forced, copy and the four tells', () => {
    const m = metricsOf(result(60));
    expect(m['persona.distinctness']).toBe(0.25);
    expect(m['persona.insight_natural']).toBeCloseTo(60 / 72);
    expect(m['persona.insight_forced']).toBeCloseTo(2 / 72);
    expect(m['persona.copy']).toBeCloseTo(20 / 240);
    expect(TELL_KEYS.map((k) => m[`persona.tell_${k}`] !== undefined)).toEqual([true, true, true, true]); // prettier-ignore
    expect(m['persona.empty_replies']).toBe(0);
  });

  it('refuses a result without scores or tells instead of reading zeros', () => {
    expect(() => ratesOf({})).toThrow(/no scored metrics/);
    const { tells: _, ...untold } = result(60).scored?.metrics ?? {};
    expect(() => ratesOf({ scored: { ...result(60).scored, metrics: untold } } as BarResult)).toThrow(/tells/); // prettier-ignore
  });
});

describe('baselineFrom', () => {
  it('takes the mean, and the sampling gap when the runs landed close', () => {
    const b = baselineFrom([result(60), result(61), result(62)], 'abc');
    const d = b.metrics['persona.distinctness'];
    expect(d.value).toBeCloseTo(61 / 240, 4);
    const [a, b2, c] = [rate(60, 240), rate(61, 240), rate(62, 240)];
    const gap = Math.max(samplingGap(a, b2), samplingGap(a, c), samplingGap(b2, c));
    expect(gap).toBeGreaterThan(2 / 240);
    expect(d.maxDrop).toBeGreaterThanOrEqual(gap);
    expect((d.maxDrop ?? 0) - gap).toBeLessThan(2e-4);
    expect(d.runs).toHaveLength(3);
    expect(b.runs).toBe(3);
    // Lower is better for tells and copy: they get maxRise.
    expect(b.metrics['persona.tell_question'].maxRise).toBeGreaterThan(0);
    expect(b.metrics['persona.copy'].maxDrop).toBeUndefined();
  });

  it('takes the spread when the runs landed further apart than sampling allows', () => {
    const b = baselineFrom([result(30), result(60), result(90)], 'abc');
    expect(b.metrics['persona.distinctness'].maxDrop).toBe(0.25);
  });

  it('needs at least three runs', () => {
    expect(() => baselineFrom([result(60), result(61)], 'abc')).toThrow(/at least 3/);
  });

  it('produces a baseline the gate fails on: a planted drop past the band is REGRESSED', () => {
    const b = baselineFrom([result(60), result(61), result(62)], 'abc');
    expect(failed(compare(b, metricsOf(result(61))))).toBe(false);
    expect(failed(compare(b, metricsOf(result(20))))).toBe(true);
    expect(failed(compare(b, metricsOf(result(61, 238))))).toBe(true);
    expect(failed(compare(b, metricsOf(result(61, 200, 40))))).toBe(true);
  });
});

/** Fictional protection values: the real ones live only in repository variables. */
const ENV = { PATH: '/bin', CRISIS_MEANS_IN_HAND: 'test-a', MINOR_CARE: 'test-b' };
interface Seen {
  args: string[];
  opts: { env?: Record<string, string> };
}

describe('a bar run that produced nothing fails', () => {
  const spawned = (status: number | null, signal: NodeJS.Signals | null = null, seen: Seen[] = []) =>
    ((_cmd: string, args: string[], opts: Seen['opts']) => {
      seen.push({ args, opts });
      return { status, signal, pid: 1, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }) as unknown as (cmd: string, args: string[], opts: object) => SpawnSyncReturns<Buffer>; // prettier-ignore

  it('throws when result.json is missing', () => {
    expect(() => readResult(tmp())).toThrow(/wrote no/);
  });

  it('throws when the child exits non-zero or is killed, even with a result on disk', () => {
    const out = tmp();
    mkdirSync(join(out, 'gate', 'run1'), { recursive: true });
    writeFileSync(join(out, 'gate', 'run1', 'result.json'), JSON.stringify(result(60)));
    expect(() => runBar(out, spawned(1), ENV)).toThrow(/exit 1/);
    expect(() => runBar(out, spawned(null, 'SIGTERM'), ENV)).toThrow(/SIGTERM/);
    expect(runBar(out, spawned(0), ENV).scored?.metrics.distinctness.k).toBe(60);
  });

  it('throws when the child exits 0 but wrote no result', () => {
    expect(() => runBar(tmp(), spawned(0), ENV)).toThrow(/wrote no/);
  });

  it('refuses to start without either protection, naming its repository variable', () => {
    for (const name of PROTECTIONS) {
      expect(() => protectionsFrom({ ...ENV, [name]: undefined })).toThrow(`PERSONA_GATE_${name}`);
      expect(() => protectionsFrom({ ...ENV, [name]: ' ' })).toThrow(`PERSONA_GATE_${name}`);
      const seen: Seen[] = [];
      expect(() => runBar(tmp(), spawned(0, null, seen), { ...ENV, [name]: '' })).toThrow(name);
      expect(seen).toEqual([]); // no child started
    }
  });

  it('never writes a protection value to stdout, stderr or an error message', () => {
    const sentinels = { CRISIS_MEANS_IN_HAND: 'zz-sentinel-1', MINOR_CARE: 'zz-sentinel-2' };
    const printed: string[] = [];
    const capture = (chunk: unknown): boolean => (printed.push(String(chunk)), true);
    const spies = [
      vi.spyOn(process.stdout, 'write').mockImplementation(capture),
      vi.spyOn(process.stderr, 'write').mockImplementation(capture),
      ...(['log', 'error', 'warn', 'info'] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void printed.push(a.join(' ')))
      ),
    ];
    try {
      const out = tmp();
      mkdirSync(join(out, 'gate', 'run1'), { recursive: true });
      writeFileSync(join(out, 'gate', 'run1', 'result.json'), JSON.stringify(result(60)));
      const env = { ...ENV, ...sentinels };
      const message = (run: () => unknown): void => {
        try {
          run();
        } catch (e) {
          printed.push((e as Error).message);
        }
      };
      runBar(out, spawned(0), env);
      message(() => runBar(out, spawned(1), env));
      message(() => runBar(tmp(), spawned(0), env));
      for (const name of PROTECTIONS) message(() => protectionsFrom({ ...env, [name]: '' }));
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.filter((p) => /zz-sentinel/.test(p))).toEqual([]);
  });

  it('passes the protections to the child unchanged, in its env, never as printed --set overrides', () => {
    const seen: Seen[] = [];
    expect(() => runBar(tmp(), spawned(0, null, seen), ENV)).toThrow(/wrote no/);
    expect(seen[0].opts.env).toMatchObject({
      CRISIS_MEANS_IN_HAND: 'test-a',
      MINOR_CARE: 'test-b',
    });
    expect(seen[0].args.join(' ')).not.toMatch(/CRISIS|MINOR|--set/);
  });
});

const PROTECTION = /CRISIS|SAFETY|MINOR|SMS|SCREEN|PRIVACY|AUTH|CONSENT/;
const FLAG_WORD = /^(?:on|off|true|false|live|shadow|\d+(?:\.\d+)?|[a-z][a-z0-9-]{0,23})$/;

describe('committed files', () => {
  const flags = JSON.parse(readFileSync(FLAGS, 'utf8')) as Record<string, unknown>;

  it('the flags file names only flags the manifest still has (a renamed or deleted flag fails)', () => {
    expect(Object.keys(flags).filter((k) => !(k in FLAG_MANIFEST))).toEqual([]);
  });

  it('the flags file holds flag words only, and no protection', () => {
    expect(Object.entries(flags).filter(([, v]) => typeof v !== 'string' || !FLAG_WORD.test(v))).toEqual([]); // prettier-ignore
    expect(Object.keys(flags).filter((k) => PROTECTION.test(k))).toEqual([]);
    expect(PROTECTIONS.filter((k) => !(k in FLAG_MANIFEST))).toEqual([]);
  });

  it('the baseline carries every metric persona.ts measures, each with a band', () => {
    const b = readBaseline(BASELINE);
    expect(Object.keys(b.metrics).sort()).toEqual(Object.keys(metricsOf(result(60))).sort());
    for (const m of Object.values(b.metrics)) expect(m.maxDrop ?? m.maxRise).toBeGreaterThan(0);
    expect(b.runs).toBeGreaterThanOrEqual(5);
  });
});
