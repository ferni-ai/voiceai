/**
 * skipsRecall (CRISIS_NO_MEMORY_RECALL): the memory search is skipped on a crisis line or a call
 * with crisis risk, and a check that throws skips it too (fail closed). A skip on a line the
 * patterns read as ordinary is counted, words-free, by why: risk noted, or only a read in flight
 * (a turn's earlier final, whose preemptive reply started the gate's read). Riley Test's lines
 * here are invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const safety = vi.hoisted(() => ({ throws: false }));
/** This module's info lines, as [fields, message]. */
const infos = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);

vi.mock('../../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      if (bindings.module !== 'CrisisMemoryRecall') return logger;
      return new Proxy(logger, {
        get(target, key) {
          if (key === 'info') {
            return (fields: Record<string, unknown>, msg: string) => void infos.push([fields, msg]);
          }
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

vi.mock('../../../../services/safety/index.js', async (orig) => {
  const real = await orig<typeof import('../../../../services/safety/index.js')>();
  return {
    ...real,
    scoreCrisisLanguage: (said: string) => {
      if (safety.throws) throw new Error('pattern scorer down');
      return real.scoreCrisisLanguage(said);
    },
  };
});

const { skipsRecall } = await import('../crisis-memory-recall.js');
const { noteCrisisRisk, resetCrisisCallRisk, trackCrisisRead } =
  await import('../../../../services/safety/crisis-call-risk.js');

const ON = { CRISIS_NO_MEMORY_RECALL: 'on' };
const ORDINARY = 'Riley Test made pasta tonight.';
const CRISIS = "I hope I don't wake up tomorrow";

beforeEach(() => {
  safety.throws = false;
  infos.length = 0;
  resetCrisisCallRisk();
});

/** The ordinary-skip lines logged so far, as their `why`. */
const ordinarySkips = () =>
  infos.filter(([, msg]) => msg === 'CRISIS_RECALL_ORDINARY_SKIP').map(([f]) => f.why);

describe('skipsRecall', () => {
  it('flag on: a crisis line or a call with risk skips the search; an ordinary line does not', () => {
    expect(skipsRecall('s-skip-1', ORDINARY, ON)).toBe(false);
    expect(skipsRecall('s-skip-1', CRISIS, ON)).toBe(true);
    noteCrisisRisk('s-skip-2');
    expect(skipsRecall('s-skip-2', ORDINARY, ON)).toBe(true);
  });

  it('flag off: never skips, a crisis line included', () => {
    expect(skipsRecall('s-skip-3', CRISIS, {})).toBe(false);
  });

  it('a check that throws skips the search (fail closed)', () => {
    expect(skipsRecall('s-skip-4', ORDINARY, ON)).toBe(false); // precondition: it would search
    safety.throws = true;
    expect(skipsRecall('s-skip-4', ORDINARY, ON)).toBe(true);
    expect(skipsRecall('s-skip-4', ORDINARY, {})).toBe(false); // flag off: main, no check run
  });
});

describe('ordinary-line skips are counted (the dev count before the prod re-flip)', () => {
  it("a turn's second final, while the first final's gate read is in flight, skips and counts it", () => {
    const FIRST = 'Riley Test made pasta tonight,';
    const SECOND = 'and then we watched a movie.';
    expect(skipsRecall('s-skip-5', SECOND, ON)).toBe(false); // precondition: no read, it searches
    expect(ordinarySkips()).toEqual([]);
    void trackCrisisRead('s-skip-5', FIRST, new Promise<null>(() => {})); // never settles
    expect(skipsRecall('s-skip-5', SECOND, ON)).toBe(true);
    expect(ordinarySkips()).toEqual(['read_in_flight']);
  });

  it('a call with risk noted counts as risk_noted; a crisis line and the flag off count nothing', () => {
    noteCrisisRisk('s-skip-6');
    expect(skipsRecall('s-skip-6', ORDINARY, ON)).toBe(true);
    expect(skipsRecall('s-skip-6', CRISIS, ON)).toBe(true);
    expect(skipsRecall('s-skip-6', ORDINARY, {})).toBe(false);
    expect(ordinarySkips()).toEqual(['risk_noted']);
  });

  it('the line carries no words: only the session id, why and the running count', () => {
    noteCrisisRisk('s-skip-7');
    skipsRecall('s-skip-7', ORDINARY, ON);
    const line = infos.find(([, msg]) => msg === 'CRISIS_RECALL_ORDINARY_SKIP');
    expect(Object.keys(line?.[0] ?? {}).sort()).toEqual(['ordinarySkips', 'sessionId', 'why']);
    expect(JSON.stringify(line)).not.toContain('pasta');
  });
});
