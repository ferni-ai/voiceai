/**
 * One night of Oura sleep: daily_sleep (score, contributors), sleep (the period) and
 * daily_readiness, joined. Every number is one Oura sent; a field Oura left out is null.
 * A night with no record is `no_data`; a link that cannot be read says why. Oura's `day` is
 * the day the sleep ended, so "last night" is the latest `day` up to today.
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getOuraAccessToken } from './oura-auth.js';

const log = createLogger({ module: 'oura-night' });

const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Contributors = Record<string, number>;

export interface OuraNight {
  date: string; // the day the sleep ended, as Oura dates it
  sleep: {
    score: number | null; // Oura's sleep score, 0-100
    contributors: Contributors | null;
    totalSleepMinutes: number | null;
    timeInBedMinutes: number | null;
    efficiencyPercent: number | null; // percent of time in bed asleep, as Oura reports it
    latencyMinutes: number | null;
    deepMinutes: number | null;
    remMinutes: number | null;
    lightMinutes: number | null;
    awakeMinutes: number | null;
    averageHrv: number | null;
    lowestHeartRate: number | null;
  } | null;
  readiness: {
    score: number | null;
    temperatureDeviation: number | null;
    contributors: Contributors | null;
  } | null;
}

export type OuraNightResult =
  | { status: 'ok'; night: OuraNight }
  | { status: 'no_data'; date: string | null }
  | { status: 'not_connected' | 'needs_reauth' | 'unavailable' };

type Doc = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const minutes = (seconds: unknown): number | null => {
  const s = num(seconds);
  return s === null ? null : Math.round(s / 60);
};
const record = (v: unknown): Doc | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : null;

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isNight = (p: Doc): boolean => p.type === 'long_sleep' || p.type === 'sleep';

/** One GET on a usercollection endpoint: its `data` array, or null if Oura did not answer. */
async function collection(
  token: string,
  endpoint: string,
  startDate: string,
  endDate: string
): Promise<Doc[] | null> {
  const url = new URL(`${OURA_API_BASE}/${endpoint}`);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn({ endpoint, status: response.status }, 'Oura collection read failed');
      return null;
    }
    const body = record(await response.json());
    return Array.isArray(body?.data)
      ? (body.data as unknown[]).map(record).filter((d): d is Doc => d !== null)
      : null;
  } catch (error) {
    log.warn({ endpoint, error: String(error) }, 'Oura collection request failed');
    return null;
  }
}

function contributors(doc: Doc | null): Contributors | null {
  const c = record(doc?.contributors);
  if (!c) return null;
  return Object.fromEntries(
    Object.entries(c).filter((e): e is [string, number] => num(e[1]) !== null)
  );
}

const mainPeriod = (periods: Doc[]): Doc | null =>
  periods
    .filter(isNight)
    .sort((a, b) => (num(b.total_sleep_duration) ?? 0) - (num(a.total_sleep_duration) ?? 0))[0] ??
  null;

export function buildNight(
  day: string,
  dailySleep: Doc | null,
  periods: Doc[],
  readiness: Doc | null
): OuraNight {
  const period = mainPeriod(periods);
  return {
    date: day,
    sleep:
      dailySleep !== null || period !== null
        ? {
            score: num(dailySleep?.score),
            contributors: contributors(dailySleep),
            totalSleepMinutes: minutes(period?.total_sleep_duration),
            timeInBedMinutes: minutes(period?.time_in_bed),
            efficiencyPercent: num(period?.efficiency),
            latencyMinutes: minutes(period?.latency),
            deepMinutes: minutes(period?.deep_sleep_duration),
            remMinutes: minutes(period?.rem_sleep_duration),
            lightMinutes: minutes(period?.light_sleep_duration),
            awakeMinutes: minutes(period?.awake_time),
            averageHrv: num(period?.average_hrv),
            lowestHeartRate: num(period?.lowest_heart_rate),
          }
        : null,
    readiness: readiness
      ? {
          score: num(readiness.score),
          temperatureDeviation: num(readiness.temperature_deviation),
          contributors: contributors(readiness),
        }
      : null,
  };
}

const byDay = (docs: Doc[], day: string): Doc | null => docs.find((d) => d.day === day) ?? null;

/**
 * The person's sleep for `date` (YYYY-MM-DD), or their latest night when omitted.
 * `now` is for tests.
 */
export async function getOuraNight(
  userId: string,
  date?: string,
  now: number = Date.now()
): Promise<OuraNightResult> {
  const access = await getOuraAccessToken(userId);
  if (access.status !== 'ok') return { status: access.status };

  // A window wide enough for the person's time zone: Oura's end date is not inclusive of the last day.
  const around = date ? Date.parse(`${date}T00:00:00Z`) : now;
  const start = isoDay(around - (date ? 1 : 4) * DAY_MS);
  const end = isoDay(around + 2 * DAY_MS);

  const [dailySleep, periods, readiness] = await Promise.all([
    collection(access.token, 'daily_sleep', start, end),
    collection(access.token, 'sleep', start, end),
    collection(access.token, 'daily_readiness', start, end),
  ]);
  // Oura did not answer at all: that is not "no sleep recorded".
  if (dailySleep === null && periods === null) return { status: 'unavailable' };

  const sleepDocs = dailySleep ?? [];
  const periodDocs = periods ?? [];
  const readinessDocs = readiness ?? [];

  let day = date ?? null;
  if (!day) {
    const today = isoDay(now + DAY_MS); // a day of slack ahead for time zones east of UTC
    const days = [...sleepDocs, ...periodDocs.filter(isNight)]
      .map((d) => str(d.day))
      .filter((d): d is string => d !== null && d <= today)
      .sort();
    day = days[days.length - 1] ?? null;
  }
  if (!day) return { status: 'no_data', date: null };

  const night = buildNight(
    day,
    byDay(sleepDocs, day),
    periodDocs.filter((p) => p.day === day),
    byDay(readinessDocs, day)
  );
  if (!night.sleep) return { status: 'no_data', date: day };
  return { status: 'ok', night };
}
