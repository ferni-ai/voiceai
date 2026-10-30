/**
 * getSleepSummary: the only source of sleep numbers Ferni may speak. Every refusal carries no
 * numbers; the tool exists only behind OURA_SLEEP_TOOL.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const night = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../services/identity/oura-night.js', () => ({ getOuraNight: night.get }));

const {
  sleepSummaryFor: summaryFor,
  getSleepSummaryDef,
  ouraSleepToolEnabled,
  callerOf,
} = await import('../sleep-summary.js');
type Summary = { status: string; message: string; instruction: string; date?: string };
const sleepSummaryFor = (...args: Parameters<typeof summaryFor>) =>
  summaryFor(...args) as Promise<Summary>;
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

const VERIFIED = { userId: 'u1', verified: true };
const CALLER_ID_ONLY = { userId: 'u1', verified: false };
/** What LiveKit hands a tool call: the session's userData. */
const call = (userData: Record<string, unknown>) => ({ ctx: { userData } });

beforeEach(() => {
  night.get.mockReset();
  vi.stubEnv('OURA_SLEEP_TOOL', 'on');
});
afterEach(() => vi.unstubAllEnvs());

/** The wellness domain as a fresh process would load it (the flag is read when it loads). */
async function wellness(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('../index.js');
}

describe('sleepSummaryFor', () => {
  it('hands back the night as Oura gave it, with the order to speak only that', async () => {
    night.get.mockResolvedValue({ status: 'ok', night: NIGHT });
    const result = await sleepSummaryFor(VERIFIED, undefined, NOW);
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
    expect(await sleepSummaryFor(VERIFIED, undefined, NOW)).toMatchObject({ totalSleepText: null });
  });

  it.each([
    ['not_connected', /not connected an Oura ring/],
    ['needs_reauth', /connect Oura again/],
    ['unavailable', /Oura did not answer/],
  ] as const)('%s: says so, with no sleep numbers', async (status, words) => {
    night.get.mockResolvedValue({ status });
    const result = await sleepSummaryFor(VERIFIED, undefined, NOW);
    expect(result.status).toBe(status);
    expect(result.message).toMatch(words);
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });

  it('a night with no record is no_data and names the night, with no numbers beyond the date', async () => {
    night.get.mockResolvedValue({ status: 'no_data', date: '2026-10-25' });
    const result = await sleepSummaryFor(VERIFIED, '2026-10-25', NOW);
    expect(result).toMatchObject({ status: 'no_data', date: '2026-10-25' });
    expect(JSON.stringify(result).replace(/2026-10-25/g, '')).not.toMatch(/\d/);
  });

  it('a member uid reached by caller ID alone is refused: no Oura read, no numbers', async () => {
    const result = await sleepSummaryFor(CALLER_ID_ONLY, undefined, NOW);
    expect(result).toMatchObject({ status: 'unverified' });
    expect(result.message).toMatch(/once you know it's them/);
    expect(JSON.stringify(result)).not.toMatch(/\d/);
    expect(night.get).not.toHaveBeenCalled();
  });

  it('a verified caller reads their own night', async () => {
    night.get.mockResolvedValue({ status: 'ok', night: NIGHT });
    expect(await sleepSummaryFor(VERIFIED, undefined, NOW)).toMatchObject({ status: 'ok' });
    expect(night.get).toHaveBeenCalledWith('u1', undefined, NOW);
  });

  it('with the flag off every path refuses, even for a verified caller', async () => {
    vi.stubEnv('OURA_SLEEP_TOOL', 'off');
    const result = await sleepSummaryFor(VERIFIED, undefined, NOW);
    expect(result).toMatchObject({ status: 'unavailable' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it.each(['last night', '10/28/2026', '2026-10-28T00:00', '2027-01-01'])(
    'refuses the date %j without reading Oura',
    async (date) => {
      expect(await sleepSummaryFor(VERIFIED, date, NOW)).toMatchObject({ status: 'invalid_date' });
      expect(night.get).not.toHaveBeenCalled();
    }
  );
});

describe('who is calling', () => {
  it.each([
    ['verified member', { userId: 'u1', verifiedCaller: true }, 'u1', true],
    ['a member by caller ID only', { userId: 'u1', verifiedCaller: false }, 'u1', false],
    ['a session that never said', { userId: 'u1' }, 'u1', false],
    [
      'a phone: id, even marked verified',
      { userId: 'phone:+15550100', verifiedCaller: true },
      'phone:+15550100',
      false,
    ],
    [
      'a device: id, even marked verified',
      { userId: 'device:d1', verifiedCaller: true },
      'device:d1',
      false,
    ],
    [
      'an anon: id, even marked verified',
      { userId: 'anon:abc', verifiedCaller: true },
      'anon:abc',
      false,
    ],
    [
      'an on-behalf call',
      { userId: 'onbehalf:call-9', verifiedCaller: true },
      'onbehalf:call-9',
      false,
    ],
  ])('%s', (_name, userData, userId, verified) => {
    const caller = callerOf(call(userData));
    expect(caller.verified).toBe(verified);
    if (userId.startsWith('phone:') === false) expect(caller.userId).toBe(userId);
  });

  it('never falls back to anything but the call’s own caller', () => {
    expect(callerOf({}).verified).toBe(false);
    expect(callerOf(undefined).verified).toBe(false);
  });
});

describe('the tool', () => {
  type Runnable = { execute: (args: unknown, opts: unknown) => Promise<unknown> };
  const tool = () => getSleepSummaryDef.create({} as never) as unknown as Runnable;

  it('a verified call reads that call’s caller, whoever built the tool', async () => {
    night.get.mockResolvedValue({ status: 'not_connected' });
    await tool().execute(
      { date: '2026-10-27' },
      call({ userId: 'real-member', verifiedCaller: true })
    );
    expect(night.get).toHaveBeenCalledWith('real-member', '2026-10-27', expect.any(Number));
  });

  it('a call with no named caller is refused, never read as the factory’s user', async () => {
    const result = await tool().execute({}, {});
    expect(result).toMatchObject({ status: 'unverified' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it('a member reached by caller ID only is refused through the tool too', async () => {
    const result = await tool().execute({}, call({ userId: 'u1', verifiedCaller: false }));
    expect(result).toMatchObject({ status: 'unverified' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it('a call placed for someone else never reads anyone’s ring', async () => {
    const result = await tool().execute(
      {},
      call({ userId: 'onbehalf:call-9', verifiedCaller: true })
    );
    expect(result).toMatchObject({ status: 'unverified' });
    expect(night.get).not.toHaveBeenCalled();
  });

  it('tells the model to speak only what it returned', () => {
    const t = getSleepSummaryDef.create({} as never) as unknown as { description: string };
    expect(t.description).toMatch(/ONLY the numbers this tool returns/);
    expect(t.description).toMatch(/Never guess or estimate/);
  });
});

describe('registration', () => {
  const CREDS = { OURA_CLIENT_ID: 'id', OURA_CLIENT_SECRET: 's' };
  const idsOf = (defs: Array<{ id: string }>) => defs.map((d) => d.id);

  it('flag off (the default): not in the registry path or the agent’s direct path', async () => {
    const m = await wellness({ OURA_SLEEP_TOOL: 'off', ...CREDS });
    expect(ouraSleepToolEnabled()).toBe(false);
    expect(idsOf(await m.getToolDefinitions())).not.toContain('getSleepSummary');
    expect(idsOf(m.definitions)).not.toContain('getSleepSummary');
    expect(idsOf(m.availableDefinitions())).not.toContain('getSleepSummary');
  });

  it('flag on with the credentials: in both paths, in the wellness domain', async () => {
    const m = await wellness({ OURA_SLEEP_TOOL: 'on', ...CREDS });
    expect((await m.getToolDefinitions()).find((d) => d.id === 'getSleepSummary')?.domain).toBe(
      'wellness'
    );
    expect(idsOf(m.availableDefinitions())).toContain('getSleepSummary');
  });

  it('flag on without the Oura app credentials: the direct path withholds it', async () => {
    const m = await wellness({ OURA_SLEEP_TOOL: 'on', OURA_CLIENT_ID: '', OURA_CLIENT_SECRET: '' });
    expect(idsOf(m.availableDefinitions())).not.toContain('getSleepSummary');
  });

  it('the agent builds wellness tools from the same filtered path, not the raw definitions', () => {
    const source = readFileSync(
      new URL('../../../../agents/personas/ferni-agent.ts', import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/availableDefinitions as wellnessToolDefs/);
    expect(source).toMatch(/of wellnessToolDefs\(\)/);
  });

  it('the registry withholds it without the credentials', () => {
    const on = { TOOL_REQUIRES_ENV: 'on' };
    expect(toolAvailable(getSleepSummaryDef, on)).toBe(false);
    expect(toolAvailable(getSleepSummaryDef, { ...on, OURA_CLIENT_ID: 'id' })).toBe(false);
    expect(toolAvailable(getSleepSummaryDef, { ...on, ...CREDS })).toBe(true);
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
