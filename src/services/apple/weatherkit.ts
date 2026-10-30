/**
 * Apple WeatherKit REST client: current conditions, hourly and daily
 * forecasts, the minute-by-minute next hour, and severe weather alerts.
 *
 * Auth follows Apple's "Request authentication for WeatherKit REST API": an
 * ES256 JWT whose header is { alg, kid, id: "<TeamID>.<ServiceID>" } and whose
 * claims are only iss (Team ID), sub (Services ID), iat and exp. jose signs it
 * (raw r||s, the 64-byte JWS form; Node's crypto.sign default is DER, which
 * Apple rejects).
 *
 * Env (own names, so they never collide with the APNs, Sign in with Apple or
 * MusicKit keys): WEATHERKIT_KEY_ID, WEATHERKIT_SERVICE_ID,
 * WEATHERKIT_PRIVATE_KEY (PEM contents) and APPLE_TEAM_ID. Never log them.
 *
 * Every call returns a typed outcome and never an invented forecast. Licence
 * (Apple Developer Program License Agreement, Attachment 8): results carry the
 * attribution the UI must show; alert text is passed through verbatim with the
 * issuing agency; nothing here caches weather data.
 *
 * @see https://developer.apple.com/documentation/weatherkitrestapi
 * @module services/apple/weatherkit
 */
import { SignJWT, importPKCS8 } from 'jose';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'weatherkit' });

const BASE_URL = 'https://weatherkit.apple.com/api/v1';
const TIMEOUT_MS = 5_000;
const TOKEN_TTL_S = 60 * 60;
/** Apple's data-source attribution page, used when a response has no attributionURL. */
const LEGAL_ATTRIBUTION_URL = 'https://developer.apple.com/weatherkit/data-source-attribution/';

type WeatherKitDataSet =
  'currentWeather' | 'forecastDaily' | 'forecastHourly' | 'forecastNextHour' | 'weatherAlerts';

export interface WeatherKitCredentials {
  teamId: string;
  keyId: string;
  serviceId: string;
  privateKey: string;
}

export interface WeatherKitQuery {
  latitude: number;
  longitude: number;
  /** IANA time zone of the location, e.g. "America/New_York" (required by Apple). */
  timezone: string;
  /** ISO 3166 alpha-2. Needed for alerts and the availability check. */
  countryCode?: string;
  language?: string;
}

interface WeatherKitDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Temperatures in °C, speeds in km/h, fractions 0-1 (Apple's metric units). */
interface WeatherConditions {
  asOf: string;
  temperature: number;
  temperatureApparent?: number;
  humidity?: number;
  conditionCode: string;
}

interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  conditionCode: string;
  precipitationChance: number;
  precipitationType: string;
}

interface HourlyForecast {
  time: string;
  temperature: number;
  conditionCode: string;
  precipitationChance: number;
}

interface NextHourPeriod {
  condition: string;
  startTime: string;
  endTime?: string;
  precipitationChance: number;
  precipitationIntensity: number;
}

/** Apple's alert, unmodified: description is spoken as-is, with source (the issuing agency). */
export interface WeatherAlert {
  id: string;
  description: string;
  source: string;
  severity: string;
  detailsUrl?: string;
  expireTime: string;
}

interface WeatherData {
  current: WeatherConditions | null;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  nextHour: NextHourPeriod[] | null;
  alerts: WeatherAlert[];
}

interface WeatherKitAttribution {
  serviceName: 'Apple Weather';
  legalUrl: string;
}

type WeatherKitFailure =
  'unconfigured' | 'bad_request' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'no_data';

type WeatherKitResult =
  | { outcome: 'ok'; weather: WeatherData; attribution: WeatherKitAttribution }
  | { outcome: WeatherKitFailure; status?: number };

export function weatherKitCredentials(
  env: Record<string, string | undefined> = process.env
): WeatherKitCredentials | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.WEATHERKIT_KEY_ID?.trim();
  const serviceId = env.WEATHERKIT_SERVICE_ID?.trim();
  const privateKey = env.WEATHERKIT_PRIVATE_KEY?.trim();
  return teamId && keyId && serviceId && privateKey
    ? { teamId, keyId, serviceId, privateKey }
    : null;
}

/** The developer token, exactly as Apple's auth page specifies it. */
export async function weatherKitToken(creds: WeatherKitCredentials, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const key = await importPKCS8(creds.privateKey.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: creds.keyId,
      id: `${creds.teamId}.${creds.serviceId}`,
    })
    .setIssuer(creds.teamId)
    .setSubject(creds.serviceId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + TOKEN_TTL_S)
    .sign(key);
}

function validQuery(q: WeatherKitQuery): boolean {
  const coordsOk =
    Number.isFinite(q.latitude) &&
    Number.isFinite(q.longitude) &&
    Math.abs(q.latitude) <= 90 &&
    Math.abs(q.longitude) <= 180;
  if (!coordsOk || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(q.timezone)) return false;
  if (q.countryCode !== undefined && !/^[A-Za-z]{2}$/.test(q.countryCode)) return false;
  if (q.language !== undefined && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(q.language))
    return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: q.timezone });
    return true;
  } catch {
    return false;
  }
}

function failureFor(status: number): WeatherKitFailure {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'no_data';
  if (status >= 500) return 'unreachable';
  return 'bad_request';
}

type Fetched =
  { ok: true; body: unknown } | { ok: false; outcome: WeatherKitFailure; status?: number };

async function getJson(url: string, token: string, doFetch: typeof fetch): Promise<Fetched> {
  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.name : 'unknown' }, 'WeatherKit unreachable');
    return { ok: false, outcome: 'unreachable' };
  }
  if (!res.ok) {
    const outcome = failureFor(res.status);
    log.warn({ status: res.status, outcome }, 'WeatherKit request failed');
    return { ok: false, outcome, status: res.status };
  }
  try {
    return { ok: true, body: await res.json() };
  } catch {
    log.warn({ status: res.status }, 'WeatherKit returned a body that is not JSON');
    return { ok: false, outcome: 'no_data', status: res.status };
  }
}

/** Without a country: current, hourly, daily. With one: whatever Apple offers there. */
async function chooseDataSets(
  lat: string,
  lon: string,
  country: string | undefined,
  token: string,
  doFetch: typeof fetch
): Promise<{ ok: true; sets: WeatherKitDataSet[] } | Exclude<Fetched, { ok: true }>> {
  const base: WeatherKitDataSet[] = ['currentWeather', 'forecastHourly', 'forecastDaily'];
  if (!country) return { ok: true, sets: base };
  const avail = await getJson(
    `${BASE_URL}/availability/${lat}/${lon}?country=${country}`,
    token,
    doFetch
  );
  if (!avail.ok) return avail;
  const offered: unknown[] = Array.isArray(avail.body) ? avail.body : [];
  const sets = [...base, 'forecastNextHour' as const, 'weatherAlerts' as const].filter((d) =>
    offered.includes(d)
  );
  return sets.length > 0 ? { ok: true, sets } : { ok: false, outcome: 'no_data' };
}

/**
 * Weather for one location. With a countryCode it first asks Apple which data
 * sets exist there, so forecastNextHour and weatherAlerts are requested only
 * where available; without one it asks for current, hourly and daily only.
 */
export async function getWeatherKitWeather(
  query: WeatherKitQuery,
  deps: WeatherKitDeps = {}
): Promise<WeatherKitResult> {
  const creds = weatherKitCredentials(deps.env ?? process.env);
  if (!creds) return { outcome: 'unconfigured' };
  if (!validQuery(query)) return { outcome: 'bad_request' };
  const doFetch = deps.fetch ?? fetch;

  let token: string;
  try {
    token = await weatherKitToken(creds, deps.now?.() ?? new Date());
  } catch {
    log.warn('WeatherKit private key could not be read');
    return { outcome: 'unconfigured' };
  }

  const lat = String(query.latitude);
  const lon = String(query.longitude);
  const country = query.countryCode?.toUpperCase();
  const chosen = await chooseDataSets(lat, lon, country, token, doFetch);
  if (!chosen.ok) return { outcome: chosen.outcome, status: chosen.status };

  const params = new URLSearchParams({ dataSets: chosen.sets.join(','), timezone: query.timezone });
  if (country) params.set('countryCode', country);
  const lang = encodeURIComponent(query.language ?? 'en');
  const res = await getJson(`${BASE_URL}/weather/${lang}/${lat}/${lon}?${params}`, token, doFetch);
  if (!res.ok) return { outcome: res.outcome, status: res.status };

  const parsed = parseWeather(res.body);
  if (!parsed) return { outcome: 'no_data' };
  return { outcome: 'ok', weather: parsed.weather, attribution: parsed.attribution };
}

// ---------------------------------------------------------------------------
// Response parsing: a field Apple did not send stays absent; it is never
// filled with a made-up number.
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const list = (v: unknown): Obj[] =>
  Array.isArray(v) ? v.map(obj).filter((o): o is Obj => o !== undefined) : [];

/** A data set Apple flags temporarilyUnavailable is treated as missing. */
function dataSet(body: Obj, name: WeatherKitDataSet): Obj | undefined {
  const set = obj(body[name]);
  return set && obj(set.metadata)?.temporarilyUnavailable !== true ? set : undefined;
}

function parseCurrent(cw: Obj | undefined): WeatherConditions | null {
  const temperature = num(cw?.temperature);
  if (!cw || temperature === undefined) return null;
  return {
    asOf: str(cw.asOf) ?? '',
    temperature,
    temperatureApparent: num(cw.temperatureApparent),
    humidity: num(cw.humidity),
    conditionCode: str(cw.conditionCode) ?? 'Unknown',
  };
}

function parseHour(h: Obj): HourlyForecast[] {
  const temperature = num(h.temperature);
  const time = str(h.forecastStart);
  if (temperature === undefined || !time) return [];
  const conditionCode = str(h.conditionCode) ?? 'Unknown';
  return [
    { time, temperature, conditionCode, precipitationChance: num(h.precipitationChance) ?? 0 },
  ];
}

function parseDay(d: Obj): DailyForecast[] {
  const temperatureMax = num(d.temperatureMax);
  const temperatureMin = num(d.temperatureMin);
  const date = str(d.forecastStart);
  if (temperatureMax === undefined || temperatureMin === undefined || !date) return [];
  return [
    {
      date,
      temperatureMax,
      temperatureMin,
      conditionCode: str(d.conditionCode) ?? 'Unknown',
      precipitationChance: num(d.precipitationChance) ?? 0,
      precipitationType: str(d.precipitationType) ?? 'precipitation',
    },
  ];
}

function parsePeriod(p: Obj): NextHourPeriod[] {
  const startTime = str(p.startTime);
  const condition = str(p.condition);
  if (!startTime || !condition) return [];
  return [
    {
      condition,
      startTime,
      endTime: str(p.endTime),
      precipitationChance: num(p.precipitationChance) ?? 0,
      precipitationIntensity: num(p.precipitationIntensity) ?? 0,
    },
  ];
}

function parseAlert(a: Obj): WeatherAlert[] {
  const id = str(a.id);
  const description = str(a.description);
  const source = str(a.source);
  if (!id || !description || !source) return [];
  const severity = str(a.severity) ?? 'unknown';
  const expireTime = str(a.expireTime) ?? '';
  return [{ id, description, source, severity, detailsUrl: str(a.detailsUrl), expireTime }];
}

function parseWeather(
  raw: unknown
): { weather: WeatherData; attribution: WeatherKitAttribution } | null {
  const body = obj(raw);
  if (!body) return null;
  const cw = dataSet(body, 'currentWeather');
  const nh = dataSet(body, 'forecastNextHour');
  const weather: WeatherData = {
    current: parseCurrent(cw),
    hourly: list(dataSet(body, 'forecastHourly')?.hours).flatMap(parseHour).slice(0, 24),
    daily: list(dataSet(body, 'forecastDaily')?.days).flatMap(parseDay),
    nextHour: nh ? list(nh.summary).flatMap(parsePeriod) : null,
    alerts: list(dataSet(body, 'weatherAlerts')?.alerts).flatMap(parseAlert),
  };
  const hasData =
    weather.current !== null ||
    weather.hourly.length + weather.daily.length + weather.alerts.length > 0 ||
    (weather.nextHour?.length ?? 0) > 0;
  if (!hasData) return null;
  const legalUrl = [cw, dataSet(body, 'forecastHourly'), dataSet(body, 'forecastDaily')]
    .map((set) => str(obj(set?.metadata)?.attributionURL))
    .find((url) => url !== undefined);
  return {
    weather,
    attribution: { serviceName: 'Apple Weather', legalUrl: legalUrl ?? LEGAL_ATTRIBUTION_URL },
  };
}

// ---------------------------------------------------------------------------
// Alerts, spoken
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { extreme: 4, severe: 3, moderate: 2, minor: 1 };

/** The most severe alert, in Apple's own words, naming the agency that issued it. */
export function formatAlertsForVoice(alerts: WeatherAlert[]): string | null {
  if (alerts.length === 0) return null;
  const top = [...alerts].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
  )[0];
  return `Weather alert from ${top.source}: ${top.description}`;
}
