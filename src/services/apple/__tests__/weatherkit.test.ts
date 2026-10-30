/**
 * The WeatherKit REST client (weatherkit.ts): the developer token Apple's auth
 * page specifies, the request it sends, the typed outcomes, and the licence
 * rules (attribution, verbatim alerts with the agency). No call reaches Apple:
 * fetch is a stub and the key is generated per run.
 */
import { generateKeyPairSync, verify } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', () => {
  const rec =
    () =>
    (...args: unknown[]) =>
      logged.push(args);
  const logger = { debug: rec(), info: rec(), warn: rec(), error: rec() };
  return { createLogger: () => logger, getLogger: () => logger };
});

import {
  formatAlertsForVoice,
  getWeatherKitWeather,
  weatherKitCredentials,
  weatherKitToken,
  type WeatherAlert,
  type WeatherKitCredentials,
  type WeatherKitQuery,
} from '../weatherkit.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = {
  APPLE_TEAM_ID: 'TEAM123456',
  WEATHERKIT_KEY_ID: 'KEY1234567',
  WEATHERKIT_SERVICE_ID: 'com.example.weatherkit-client',
  WEATHERKIT_PRIVATE_KEY: PEM,
};
const CREDS = weatherKitCredentials(ENV) as WeatherKitCredentials;
const NOW = new Date(Date.UTC(2026, 9, 30, 12));
const QUERY = {
  latitude: 47.6062,
  longitude: -122.3321,
  timezone: 'America/Los_Angeles',
  countryCode: 'us',
};

const META = {
  attributionURL: 'https://weatherkit.apple.com/legal-attribution.html',
  expireTime: '',
  readTime: '',
  latitude: 0,
  longitude: 0,
  version: 1,
};
const BODY = {
  currentWeather: {
    metadata: META,
    asOf: '2026-10-30T12:00:00Z',
    temperature: 10,
    temperatureApparent: 8,
    humidity: 0.8,
    conditionCode: 'Rain',
  },
  forecastHourly: {
    metadata: META,
    hours: [
      {
        forecastStart: '2026-10-30T12:00:00Z',
        temperature: 10,
        conditionCode: 'Rain',
        precipitationChance: 0.9,
      },
    ],
  },
  forecastDaily: {
    metadata: META,
    days: [
      {
        forecastStart: '2026-10-30T07:00:00Z',
        temperatureMax: 12,
        temperatureMin: 6,
        conditionCode: 'Rain',
        precipitationChance: 0.8,
        precipitationType: 'rain',
      },
    ],
  },
  forecastNextHour: {
    metadata: META,
    summary: [
      {
        condition: 'clear',
        startTime: '2026-10-30T12:00:00Z',
        endTime: '2026-10-30T12:12:00Z',
        precipitationChance: 0,
        precipitationIntensity: 0,
      },
      {
        condition: 'rain',
        startTime: '2026-10-30T12:12:00Z',
        precipitationChance: 0.8,
        precipitationIntensity: 1.2,
      },
    ],
    minutes: [],
  },
  weatherAlerts: {
    alerts: [
      {
        id: 'a1',
        description: 'Wind Advisory',
        source: 'National Weather Service',
        severity: 'moderate',
        detailsUrl: 'https://weatherkit.apple.com/alertDetails/a1',
        expireTime: '2026-10-31T00:00:00Z',
      },
    ],
  },
};

type Reply = { status: number; body: unknown } | Error;
let calls: Array<{ url: URL; auth: string }>;
let replies: Reply[];
const stubFetch = (async (input: string | URL, init?: RequestInit) => {
  calls.push({
    url: new URL(String(input)),
    auth: String((init?.headers as Record<string, string>).Authorization),
  });
  const r = replies.shift() ?? { status: 500, body: '' };
  if (r instanceof Error) throw r;
  return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
    status: r.status,
  });
}) as typeof fetch;
const run = (query: WeatherKitQuery = QUERY, env: Record<string, string | undefined> = ENV) =>
  getWeatherKitWeather(query, { env, fetch: stubFetch, now: () => NOW });
const ALL_SETS = [
  'currentWeather',
  'forecastDaily',
  'forecastHourly',
  'forecastNextHour',
  'weatherAlerts',
];

beforeEach(() => {
  calls = [];
  replies = [];
  logged.length = 0;
});

describe('weatherKitToken', () => {
  it('header is { alg: ES256, kid, id: <team>.<serviceId> }', async () => {
    const header = decodeProtectedHeader(await weatherKitToken(CREDS, NOW));
    expect(header).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
      id: 'TEAM123456.com.example.weatherkit-client',
    });
  });

  it('claims are exactly iss = team, sub = Services ID, iat, exp', async () => {
    const claims = decodeJwt(await weatherKitToken(CREDS, NOW));
    const iat = NOW.getTime() / 1000;
    expect(claims).toEqual({
      iss: 'TEAM123456',
      sub: 'com.example.weatherkit-client',
      iat,
      exp: iat + 3600,
    });
  });

  it('signature is 64-byte raw r||s (IEEE P1363), not DER', async () => {
    const token = await weatherKitToken(CREDS, NOW);
    const [h, p, s] = token.split('.');
    const sig = Buffer.from(s, 'base64url');
    expect(sig.length).toBe(64);
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      sig
    );
    expect(ok).toBe(true);
    await expect(jwtVerify(token, publicKey, { algorithms: ['ES256'] })).resolves.toBeTruthy();
  });

  it('accepts a PEM whose newlines were stored as \\n', async () => {
    const creds = { ...CREDS, privateKey: PEM.replace(/\n/g, '\\n') };
    await expect(jwtVerify(await weatherKitToken(creds, NOW), publicKey)).resolves.toBeTruthy();
  });
});

describe('getWeatherKitWeather request', () => {
  it('asks availability, then requests the offered sets with timezone and countryCode', async () => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: BODY },
    ];
    const res = await run();
    expect(res.outcome).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(calls[0].url.pathname).toBe('/api/v1/availability/47.6062/-122.3321');
    expect(calls[0].url.searchParams.get('country')).toBe('US');
    const w = calls[1].url;
    expect(w.pathname).toBe('/api/v1/weather/en/47.6062/-122.3321');
    expect(w.searchParams.get('timezone')).toBe('America/Los_Angeles');
    expect(w.searchParams.get('countryCode')).toBe('US');
    expect(w.searchParams.get('dataSets')?.split(',').sort()).toEqual([...ALL_SETS].sort());
    const token = calls[1].auth.replace(/^Bearer /, '');
    await expect(jwtVerify(token, publicKey)).resolves.toBeTruthy();
  });

  it('requests next hour and alerts only where Apple offers them', async () => {
    replies = [
      { status: 200, body: ['currentWeather', 'forecastDaily', 'forecastHourly'] },
      { status: 200, body: BODY },
    ];
    await run();
    expect(calls[1].url.searchParams.get('dataSets')?.split(',').sort()).toEqual([
      'currentWeather',
      'forecastDaily',
      'forecastHourly',
    ]);
  });

  it('without a country it skips availability, alerts and next hour, but still sends timezone', async () => {
    replies = [{ status: 200, body: BODY }];
    await run({ ...QUERY, countryCode: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get('timezone')).toBe('America/Los_Angeles');
    expect(calls[0].url.searchParams.has('countryCode')).toBe(false);
    expect(calls[0].url.searchParams.get('dataSets')).toBe(
      'currentWeather,forecastHourly,forecastDaily'
    );
  });

  it.each([
    ['missing timezone', { timezone: '' }],
    ['unknown timezone', { timezone: 'Mars/Olympus_Mons' }],
    ['latitude out of range', { latitude: 91 }],
    ['bad country', { countryCode: 'USA' }],
  ])('%s is bad_request with no call to Apple', async (_name, patch) => {
    expect(await run({ ...QUERY, ...patch })).toEqual({ outcome: 'bad_request' });
    expect(calls).toHaveLength(0);
  });
});

describe('getWeatherKitWeather outcomes', () => {
  it.each(Object.keys(ENV))('unconfigured without %s, and nothing is fetched', async (name) => {
    expect(await run(QUERY, { ...ENV, [name]: '' })).toEqual({ outcome: 'unconfigured' });
    expect(calls).toHaveLength(0);
  });

  it('a private key that will not import is unconfigured, and the key is never logged', async () => {
    expect(await run(QUERY, { ...ENV, WEATHERKIT_PRIVATE_KEY: 'not-a-key' })).toEqual({
      outcome: 'unconfigured',
    });
    expect(JSON.stringify(logged)).not.toContain('not-a-key');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
    [404, 'no_data'],
    [503, 'unreachable'],
  ])('HTTP %i from Apple is %s', async (status, outcome) => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status, body: 'nope' },
    ];
    expect(await run()).toEqual({ outcome, status });
  });

  it('a failed availability check stops before the weather call', async () => {
    replies = [{ status: 401, body: '' }];
    expect(await run()).toEqual({ outcome: 'unauthorized', status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('a network error is unreachable', async () => {
    replies = [new TypeError('fetch failed')];
    expect(await run()).toEqual({ outcome: 'unreachable' });
  });

  it('an empty or all-unavailable response is no_data, never a made-up forecast', async () => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: {} },
    ];
    expect(await run()).toEqual({ outcome: 'no_data' });
    const down = {
      currentWeather: { metadata: { ...META, temporarilyUnavailable: true }, temperature: 10 },
    };
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: down },
    ];
    expect(await run()).toEqual({ outcome: 'no_data' });
  });

  it('a current block without a temperature is dropped, not reported as 0°', async () => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: { ...BODY, currentWeather: { metadata: META, conditionCode: 'Rain' } } },
    ];
    const res = await run();
    expect(res.outcome === 'ok' && res.weather.current).toBeNull();
  });

  it('never logs the token, the key or the coordinates', async () => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 401, body: 'bad token' },
    ];
    await run();
    const text = JSON.stringify(logged);
    expect(logged.length).toBeGreaterThan(0);
    expect(text).not.toContain('PRIVATE KEY');
    expect(text).not.toContain(calls[0].auth.slice(7, 40));
    expect(text).not.toContain('47.6062');
  });
});

describe('parsed result and licence rules', () => {
  it('returns every data set, the attribution, and the alert verbatim with its agency', async () => {
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: BODY },
    ];
    const res = await run();
    if (res.outcome !== 'ok') throw new Error(res.outcome);
    expect(res.attribution).toEqual({
      serviceName: 'Apple Weather',
      legalUrl: META.attributionURL,
    });
    expect(res.weather.current).toMatchObject({
      temperature: 10,
      humidity: 0.8,
      conditionCode: 'Rain',
    });
    expect(res.weather.hourly).toHaveLength(1);
    expect(res.weather.daily[0]).toMatchObject({ temperatureMax: 12, temperatureMin: 6 });
    expect(res.weather.nextHour?.[1]).toMatchObject({
      condition: 'rain',
      startTime: '2026-10-30T12:12:00Z',
    });
    expect(res.weather.alerts).toEqual([BODY.weatherAlerts.alerts[0]]);
  });

  it("falls back to Apple's attribution page when the response names none", async () => {
    const noUrl = {
      currentWeather: { ...BODY.currentWeather, metadata: { ...META, attributionURL: undefined } },
    };
    replies = [
      { status: 200, body: ALL_SETS },
      { status: 200, body: noUrl },
    ];
    const res = await run();
    expect(res.outcome === 'ok' && res.attribution.legalUrl).toBe(
      'https://developer.apple.com/weatherkit/data-source-attribution/'
    );
  });

  it('speaks the most severe alert word for word, naming the issuing agency', () => {
    const alerts: WeatherAlert[] = [
      {
        id: '1',
        description: 'Wind Advisory',
        source: 'National Weather Service',
        severity: 'moderate',
        expireTime: '',
      },
      {
        id: '2',
        description: 'Tornado Warning until 4:15 PM CDT',
        source: 'NWS Norman OK',
        severity: 'extreme',
        expireTime: '',
      },
    ];
    expect(formatAlertsForVoice(alerts)).toBe(
      'Weather alert from NWS Norman OK: Tornado Warning until 4:15 PM CDT'
    );
    expect(formatAlertsForVoice([])).toBeNull();
  });
});
