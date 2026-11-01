// The caller's time zone for one run, chosen so the caller's local hour is a known one (#3164).
//
// The agent reads the caller's hour from the wall clock in the zone the job metadata names
// (listen-first.ts lateNightFor). A fixed zone makes the hour depend on when a sweep runs: lane B
// was Asia/Tokyo, so a release sweep at 19:00Z put every caller at 04:00 and LISTEN_FIRST held 45 s
// of quiet presence, which the dead-air check failed. Instead run.sh asks for a local time and this
// picks the zone where it is that time now: 14:00 unless the scenario says otherwise.
//
//   EVAL_TZ=<zone>          that zone, whatever its hour (an explicit override; "none" too)
//   EVAL_CALLER_TIME=HH:MM  this local time, over the scenario's own
//   #@time-of-day HH:MM     a scenario that wants an hour on purpose (quiet-late-night: 02:30)
//
// CLI: node caller-clock.mjs <scenario.txt>  prints "<zone>\t<HH:MM|->\t<source>", exit 2 on a bad
// HH:MM. Dev and prod agents need nothing new: the zone is the only input they read.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DAYTIME = '14:00';
/** The agent's late-night window (listen-first.ts lateNightFor): 23:00 to 05:00. */
export const isNight = (min) => min >= 23 * 60 || min < 5 * 60;

/** Real device zones. US zones come first, so one wins when it fits; then one zone with no
 *  daylight saving for each whole-hour UTC offset from -11 to +14, so every hour is in reach in
 *  every season. The first zone at the best hour wins. */
export const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Pago_Pago', // -11
  'Pacific/Honolulu', // -10
  'Pacific/Gambier', // -9
  'Pacific/Pitcairn', // -8
  'America/Phoenix', // -7
  'America/Regina', // -6
  'America/Bogota', // -5
  'America/La_Paz', // -4
  'America/Sao_Paulo', // -3
  'Atlantic/South_Georgia', // -2
  'Atlantic/Cape_Verde', // -1
  'Africa/Abidjan', // 0
  'Africa/Lagos', // +1
  'Africa/Johannesburg', // +2
  'Europe/Moscow', // +3
  'Asia/Dubai', // +4
  'Asia/Karachi', // +5
  'Asia/Dhaka', // +6
  'Asia/Bangkok', // +7
  'Asia/Singapore', // +8
  'Asia/Tokyo', // +9
  'Australia/Brisbane', // +10
  'Pacific/Noumea', // +11
  'Pacific/Fiji', // +12
  'Pacific/Tongatapu', // +13
  'Pacific/Kiritimati', // +14
];

/** "HH:MM" as minutes after midnight, or null. */
export function minutesOf(hhmm) {
  const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const hhmm = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Minutes after local midnight in zone at now, or null for a zone Intl doesn't know. */
export function localMinutes(now, zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    return get('hour') * 60 + get('minute');
  } catch {
    return null;
  }
}

/** The zone whose local time now is nearest target (minutes), and that local time. */
export function zoneAt(target, now = new Date(), zones = ZONES) {
  const off = (min) => Math.min(Math.abs(min - target), 1440 - Math.abs(min - target));
  let best = null;
  for (const zone of zones) {
    const min = localMinutes(now, zone);
    if (min !== null && (!best || off(min) < off(best.min))) best = { zone, min };
  }
  return { zone: best.zone, local: hhmm(best.min) };
}

/** The scenario's "#@time-of-day HH:MM" line, as written, or null. */
export const scenarioCallerTime = (text) =>
  /^#@time-of-day[ \t]+(\S+)/m.exec(text ?? '')?.[1] ?? null;

/**
 * One run's caller clock: { zone, local ("HH:MM", or null for an unknown zone), source, night (the
 * local time is in the late-night window) }.
 * Throws on a malformed HH:MM, so a typo can't fall back to the wrong hour quietly.
 */
export function callerClock({ env = process.env, scenario = '', now = new Date() } = {}) {
  const fromScenario = scenarioCallerTime(scenario);
  if (env.EVAL_TZ) {
    const min = localMinutes(now, env.EVAL_TZ);
    const local = min === null ? null : hhmm(min);
    return { zone: env.EVAL_TZ, local, source: 'EVAL_TZ', night: min !== null && isNight(min) };
  }
  const [source, want] = env.EVAL_CALLER_TIME
    ? ['EVAL_CALLER_TIME', env.EVAL_CALLER_TIME]
    : fromScenario
      ? ['scenario', fromScenario]
      : ['default', DAYTIME];
  const target = minutesOf(want);
  if (target === null)
    throw new Error(`caller-clock: ${source} is not HH:MM (got ${JSON.stringify(want)})`);
  const { zone, local } = zoneAt(target, now);
  return { zone, local, source, night: isNight(minutesOf(local)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const scenario = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '';
  try {
    const c = callerClock({ scenario });
    if (c.source === 'EVAL_TZ' && c.night)
      console.error(
        `caller-clock: EVAL_TZ=${c.zone} puts the caller at ${c.local}, late night (LISTEN_FIRST holds silence)`
      );
    process.stdout.write(`${c.zone}\t${c.local ?? '-'}\t${c.source}\n`);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
