/**
 * EXPERIMENT_KEEP_ZERO_TRAFFIC (#4397): an experiment created as 100/0/0 runs as 100/0/0.
 *
 * Prod ran smart-context-routing-v1 as an equal three-way split: the manager read each explicit 0
 * as unset (`||`), the 0% variants became 33.3%, the sum was 166.67, and ab-testing.ts reset all
 * three to an equal share. The REAL setupSmartRoutingExperiment, experiment manager and A/B
 * manager; only the logger is recorded. Fictional user ids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ level: string; fields: unknown; msg: unknown }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (fields: unknown, msg?: unknown) => logged.push({ level, fields, msg });
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

const { getABTestingManager, resetABTestingManager } = await import('../ab-testing.js');
const { getExperimentManager, resetExperimentManager } = await import('../experiment-manager.js');
const { setupSmartRoutingExperiment, SMART_ROUTING_EXPERIMENT_ID } =
  await import('../../../intelligence/context-routing/smart-selector.js');

const percentages = (id: string): number[] =>
  (getABTestingManager()
    .getActiveExperiments()
    .find((e) => e.id === id)
    ?.variants.map((v) => v.trafficPercent)) ?? [];

const mismatchWarns = () =>
  logged.filter(({ msg }) => String(msg).startsWith('Traffic percentages did not sum'));

function createAb(id: string, shares: number[]): void {
  getExperimentManager().createExperiment({
    id,
    name: id,
    type: 'ab',
    variants: shares.map((trafficPercent, i) => ({ id: `v${i}`, name: `v${i}`, trafficPercent })),
    primaryMetric: 'fictional_metric',
  });
}

beforeEach(() => {
  logged.length = 0;
  resetABTestingManager();
  resetExperimentManager();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetExperimentManager();
});

describe('with EXPERIMENT_KEEP_ZERO_TRAFFIC on', () => {
  beforeEach(() => vi.stubEnv('EXPERIMENT_KEEP_ZERO_TRAFFIC', 'on'));

  it('keeps smart-context-routing-v1 at 100/0/0 and does not warn', async () => {
    await setupSmartRoutingExperiment();
    expect(percentages(SMART_ROUTING_EXPERIMENT_ID)).toEqual([100, 0, 0]);
    expect(mismatchWarns()).toEqual([]);
  });

  it('assigns every user to priority while the other two are at 0%', async () => {
    await setupSmartRoutingExperiment();
    const abManager = getABTestingManager();
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(abManager.getVariant(`user-fictional-${i}`, SMART_ROUTING_EXPERIMENT_ID)?.id ?? '?');
    }
    expect([...seen]).toEqual(['priority']);
  });

  it('keeps the first variant as the one control', async () => {
    await setupSmartRoutingExperiment();
    const variants = getABTestingManager()
      .getActiveExperiments()
      .find((e) => e.id === SMART_ROUTING_EXPERIMENT_ID)?.variants;
    expect(variants?.map((v) => v.isControl)).toEqual([true, false, false]);
  });

  it('leaves a 50/50 split as it is, without a warn', () => {
    createAb('fictional-50-50', [50, 50]);
    expect(percentages('fictional-50-50')).toEqual([50, 50]);
    expect(mismatchWarns()).toEqual([]);
  });

  it('still normalises a bad sum in the A/B manager, and the warn names each percentage', () => {
    // Straight to the A/B manager: the experiment manager has already given a bad sum an equal
    // share before it gets there.
    getABTestingManager().createExperiment({
      id: 'fictional-60-30',
      name: 'fictional-60-30',
      description: '',
      variants: [
        { id: 'a', name: 'a', trafficPercent: 60, config: {}, isControl: true },
        { id: 'b', name: 'b', trafficPercent: 30, config: {}, isControl: false },
      ],
      startDate: new Date(),
      endDate: null,
      minSampleSize: 100,
      primaryMetric: 'fictional_metric',
      secondaryMetrics: [],
    });
    expect(percentages('fictional-60-30')).toEqual([50, 50]);
    expect(mismatchWarns()).toHaveLength(1);
    expect(mismatchWarns()[0]?.fields).toMatchObject({
      experimentId: 'fictional-60-30',
      totalTraffic: 90,
      percentages: [60, 30],
    });
  });
});

describe('with the flag off (the default), as main did', () => {
  it('still turns 100/0/0 into an equal split, and the warn now names the percentages', async () => {
    await setupSmartRoutingExperiment();
    const third = 100 / 3;
    expect(percentages(SMART_ROUTING_EXPERIMENT_ID)).toEqual([third, third, third]);
    expect(mismatchWarns()).toHaveLength(1);
    expect(mismatchWarns()[0]?.fields).toMatchObject({
      experimentId: SMART_ROUTING_EXPERIMENT_ID,
      percentages: [100, third, third],
    });
    expect((mismatchWarns()[0]?.fields as { totalTraffic: number }).totalTraffic).toBeCloseTo(
      166.67,
      1
    );
  });
});
