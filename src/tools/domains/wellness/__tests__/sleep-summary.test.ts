/**
 * getSleepSummary: the only source of sleep numbers Ferni may speak. Every refusal carries no
 * numbers; the tool exists only behind OURA_SLEEP_TOOL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const night = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../services/identity/oura-night.js', () => ({ getOuraNight: night.get }));

const {
  sleepSummaryFor: summaryFor,
  getSleepSummaryDef,
  ouraSleepToolEnabled,
} = await import('../sleep-summary.js');
type Summary = { status: string; message: string; instruction: string; date?: string };
const sleepSummaryFor = (...args: Parameters<typeof summaryFor>) =>
  summaryFor(...args) as Promise<Summary>;
const { getToolDefinitions } = await import('../index.js');
const { toolAvailable } = await import('../../../registry/tool-availability.js');
const { TOPIC_PATTERNS } = await import('../../../dynamic-loader/topic-patterns.js');

const NOW = Date.parse('2026-10-28T14:00:00Z');
const NIGHT = {
  date: '2026-10-28',
  sleep: {
    score: 72,
    contributors: null,
    totalSleepMinutes: 391,
    timeInBedMinutes: 407,
    efficiencyPercent: 89,
    latencyMinutes: 11,
    deepMinutes: 72,
    remMinutes: 79,
    lightMinutes: 241,
    awakeMinutes: 44,
    averageHrv: 38,
    lowestHeartRate: 47,
    bedtimeStart: null,
    bedtimeEnd: null,
  },
  readiness: { score: 63, temperatureDeviation: -0.2, contributors: null },
};

beforeEach(() => night.get.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe('sleepSummaryFor', () => {
  it('hands back the night as Oura gave it, with the order to speak only that', async () => {
    night.get.mockResolvedValue({ status: 'ok', night: NIGHT });
    const result = await sleepSummaryFor('u1', undefined, NOW);
    expect(result).toMatchObject({
      status: 'ok',
      date: '2026-10-28',
      totalSleepText: '6 hours 31 minutes',
      sleep: { score: 72, efficiencyPercent: 89, latencyMinutes: 11 },
      readiness: { score: 63 },
    });
    expect(result.instruction).toMatch(/only what is in this result/i);
    expect(night.get).toHaveBeenCalledWith('u1', undefined, NOW);
  });

  it('a missing total stays missing in the words too', async () => {
    night.get.mockResolvedValue({
      status: 'ok',
      night: { ...NIGHT, sleep: { ...NIGHT.sleep, totalSleepMinutes: null } },
    });
    expect(await sleepSummaryFor('u1', undefined, NOW)).toMatchObject({ totalSleepText: null });
  });

  it.each([
    ['not_connected', /not connected an Oura ring/],
    ['needs_reauth', /connect Oura again/],
    ['unavailable', /Oura did not answer/],
  ] as const)('%s: says so, with no sleep numbers', async (status, words) => {
    night.get.mockResolvedValue({ status });
    const result = await sleepSummaryFor('u1', undefined, NOW);
    expect(result.status).toBe(status);
    expect(result.message).toMatch(words);
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });

  it('a night with no record is no_data and names the night, with no numbers beyond the date', async () => {
    night.get.mockResolvedValue({ status: 'no_data', date: '2026-10-25' });
    const result = await sleepSummaryFor('u1', '2026-10-25', NOW);
    expect(result).toMatchObject({ status: 'no_data', date: '2026-10-25' });
    expect(JSON.stringify(result).replace(/2026-10-25/g, '')).not.toMatch(/\d/);
  });

  it.each(['anon:abc', 'onbehalf:xyz'])('%s has no Oura link and never reads one', async (id) => {
    expect(await sleepSummaryFor(id, undefined, NOW)).toMatchObject({ status: 'not_connected' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it.each(['last night', '10/28/2026', '2026-10-28T00:00', '2027-01-01'])(
    'refuses the date %j without reading Oura',
    async (date) => {
      expect(await sleepSummaryFor('u1', date, NOW)).toMatchObject({ status: 'invalid_date' });
      expect(night.get).not.toHaveBeenCalled();
    }
  );
});

describe('the tool', () => {
  const ctx = { userId: 'u1', agentId: 'maya-santos', agentDisplayName: 'Maya' };
  type Runnable = { execute: (args: unknown, opts: unknown) => Promise<unknown> };

  it('reads the call’s own caller', async () => {
    night.get.mockResolvedValue({ status: 'not_connected' });
    const tool = getSleepSummaryDef.create(ctx) as unknown as Runnable;
    await tool.execute({ date: '2026-10-27' }, {});
    expect(night.get).toHaveBeenCalledWith('u1', '2026-10-27', expect.any(Number));
  });

  it('a tool built once for everyone runs as each call’s caller, never as the placeholder', async () => {
    night.get.mockResolvedValue({ status: 'not_connected' });
    const tool = getSleepSummaryDef.create({ ...ctx, userId: 'gateway' }) as unknown as Runnable;
    await tool.execute({}, { ctx: { userData: { userId: 'real-member' } } });
    expect(night.get.mock.calls[0][0]).toBe('real-member');
  });

  it('a call placed for someone else never reads the account owner’s ring', async () => {
    const tool = getSleepSummaryDef.create({ ...ctx, userId: 'the-owner' }) as unknown as Runnable;
    const result = await tool.execute({}, { ctx: { userData: { userId: 'onbehalf:call-9' } } });
    expect(result).toMatchObject({ status: 'not_connected' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it('tells the model to speak only what it returned', () => {
    const tool = getSleepSummaryDef.create(ctx) as unknown as { description: string };
    expect(tool.description).toMatch(/ONLY the numbers this tool returns/);
    expect(tool.description).toMatch(/Never guess or estimate/);
  });
});

describe('registration', () => {
  const ids = async () => (await getToolDefinitions()).map((d) => d.id);

  it('flag off (the default): the tool is not registered', async () => {
    vi.stubEnv('OURA_SLEEP_TOOL', '');
    expect(ouraSleepToolEnabled()).toBe(false);
    expect(await ids()).not.toContain('getSleepSummary');
  });

  it('flag on: registered in the wellness domain', async () => {
    vi.stubEnv('OURA_SLEEP_TOOL', 'on');
    const defs = await getToolDefinitions();
    expect(defs.find((d) => d.id === 'getSleepSummary')?.domain).toBe('wellness');
  });

  it('without the Oura app credentials the registry does not offer it, flag or not', () => {
    const on = { TOOL_REQUIRES_ENV: 'on' };
    expect(toolAvailable(getSleepSummaryDef, on)).toBe(false);
    expect(toolAvailable(getSleepSummaryDef, { ...on, OURA_CLIENT_ID: 'id' })).toBe(false);
    expect(
      toolAvailable(getSleepSummaryDef, { ...on, OURA_CLIENT_ID: 'id', OURA_CLIENT_SECRET: 's' })
    ).toBe(true);
  });
});

describe('reachability', () => {
  const domainsFor = (utterance: string) =>
    new Set(
      TOPIC_PATTERNS.filter(([, , re]) => re.test(utterance.toLowerCase())).flatMap(([, d]) => d)
    );

  it.each([
    'how did I sleep last night?',
    'I slept terribly',
    'do you think I am rested',
    "what's my readiness today",
    "I'm so tired",
    'did my oura see anything odd',
  ])('%j loads the wellness domain, where getSleepSummary lives', (utterance) => {
    expect(domainsFor(utterance).has('wellness')).toBe(true);
  });

  it('is in the wellness domain', () => {
    expect(getSleepSummaryDef.domain).toBe('wellness');
  });
});
