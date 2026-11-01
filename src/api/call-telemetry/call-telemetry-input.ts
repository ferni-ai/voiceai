/**
 * What the iPhone app sends to POST /api/call-telemetry (docs/api/call-telemetry.md):
 * a per-call summary, or a "That felt off" report. Privacy is enforced here:
 * numbers, booleans and closed enums only; every string an enum or anchored
 * regex except the felt-off note; every object strict. A missing key means "not
 * measured" (never null). Out-of-range numbers clamp. iOS fixtures pin it (__tests__).
 *
 * @module api/call-telemetry/call-telemetry-input
 */
import { z } from 'zod';

export const CALL_TELEMETRY_LIMITS = {
  maxBodyBytes: 16_384,
  maxRooms: 3,
  maxSamples: 30,
  maxEvents: 200,
  noteMax: 140, // UTF-16 units
  callMs: 86_400_000, // a day: call durations
  latencyMs: 600_000, // ten minutes: any single delay
  count: 1_000_000,
  epochMs: 4_102_444_800_000, // 2100-01-01
} as const;
const L = CALL_TELEMETRY_LIMITS;

export const ROOM_NAME = /^ios-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;
export const DEVICE_MODEL = /^(iPhone|iPad|iPod|Watch)\d{1,3},\d{1,3}$/;

const words = (s: string): [string, ...string[]] => s.split(/\s+/) as [string, ...string[]];
export const ROUTES = words(
  'speaker receiver bluetoothHFP bluetoothLE wired airplay car usb other'
);
export const THERMAL = words('nominal fair serious critical');
export const OUTCOMES = words(
  'endedByYou endedByFerni failed:microphoneDenied failed:notSignedIn failed:offline ' +
    'failed:server failed:ferniDidNotJoin failed:connectionLost'
);
export const PHASES = words('idle connecting waitingForFerni live reconnecting ended failed');
export const AGENT_STATES = words('initializing idle listening thinking speaking');
export const EVENT_KINDS = words(
  'reconnectStartQuick reconnectStartFull reconnectDone rejoin engineStart engineStop ' +
    'engineConfigChange sessionReapply mediaReset routeChange interruptionBegan ' +
    'interruptionEnded speechStart speechEnd agentSpeaking agentListening agentThinking ' +
    'tapInterrupt handoff'
);

/** A number clamped into [0, max]; only a non-number (or NaN, Infinity) is refused. */
const n = (max: number) => z.number().transform((v) => Math.min(max, Math.max(0, v)));
const [ms, callMs, count] = [L.latencyMs, L.callMs, L.count].map(n);
const [ratio, pct, sec] = [1, 100, 86_400].map(n);
const bool = z.boolean();
/** The same validator under several keys. */
const each = <K extends string, T extends z.ZodType>(t: T, ...keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, t])) as Record<K, T>;
/** A strict object whose every key is optional: a missing key is "not measured". */
const section = <S extends z.ZodRawShape>(shape: S) => z.strictObject(shape).partial();

const rooms = z.array(z.string().regex(ROOM_NAME)).min(1).max(L.maxRooms);
const route = z.enum(ROUTES);
const thermal = z.enum(THERMAL);
const percentiles = section(each(ms, 'p50', 'p95', 'max', 'n'));

const build = z.strictObject({
  appVersion: z.string().regex(VERSION),
  appBuild: z.int().min(0).max(L.count),
  os: z.string().regex(VERSION),
  deviceModel: z.string().regex(DEVICE_MODEL).optional(), // omitted on a simulator
  livekit: z.string().regex(VERSION).optional(),
});

const summarySections = {
  build,
  call: section({
    ...each(ms, 'tokenMs', 'roomMs', 'ferniMs'),
    ...each(callMs, 'liveMs', 'mutedMs', 'onHoldMs'),
    ...each(count, 'attempts', 'systemInterruptions'),
    outcome: z.enum(OUTCOMES),
  }).optional(),
  net: section({
    ...each(ms, 'rttMsP50', 'rttMsP95', 'jitterMsP95', 'jitterBufferMsMean'),
    ...each(pct, 'lossPctDown', 'lossPctUp'),
    ...each(count, 'availableInKbpsP5', 'reconnectsQuick', 'reconnectsFull', 'rejoins'),
    ...each(sec, 'qualityPoorSec', 'qualityLostSec'),
  }).optional(),
  audio: section({
    ...each(ratio, 'concealedRatio', 'silentConcealedRatio', 'accelRatio', 'decelRatio'),
    ...each(ms, 'playoutDelayMsMean', 'ioBufferMs'),
    synthesizedMs: callMs,
    sampleRateHz: n(384_000),
    ...each(count, 'concealmentEvents', 'synthesizedEvents', 'renderGaps', 'engineStarts'),
    ...each(count, 'engineStops', 'engineConfigChanges', 'sessionReapplies', 'mediaResets'),
  }).optional(),
  route: section({
    routeStart: route,
    routeEnd: route,
    routeChanges: count,
    routeChangesByReason: section(
      each(count, 'newDevice', 'oldDeviceUnavailable', 'override', 'other')
    ),
  }).optional(),
  turns: section({
    eosToAudioMs: percentiles,
    stateToAudioMs: percentiles,
    ...each(count, 'tapInterrupts', 'bargeIns', 'stopsWithoutSpeech'),
  }).optional(),
  avatar: section({
    ...each(ms, 'frameMsP50', 'frameMsP95', 'frameMsP99', 'gpuMsP95'),
    ...each(count, 'frames', 'frameDrops'),
    dropPct: pct,
    throttledSec: sec,
  }).optional(),
  device: section({
    thermalStart: thermal,
    thermalMax: thermal,
    ...each(sec, 'thermalSeriousSec', 'lowPowerSec'),
    lowPowerStart: bool,
  }).optional(),
};

const sample = section({
  roomIndex: z
    .int()
    .min(0)
    .max(L.maxRooms - 1),
  phase: z.enum(PHASES),
  agentState: z.enum(AGENT_STATES),
  ...each(bool, 'userSpeaking', 'muted', 'onHold', 'renderGap'),
  ...each(ms, 'rttMs', 'jitterMs', 'frameMsP95'),
  lossPctDown: pct,
  concealedMs: n(1000),
  frameDrops: count,
  route,
  thermal,
}).extend({ t: n(L.maxSamples) }); // seconds before the snapshot

export const summaryBodySchema = z.strictObject({
  kind: z.literal('summary'),
  schema: z.literal(1),
  rooms,
  ...summarySections,
});

export const feltOffBodySchema = z.strictObject({
  kind: z.literal('feltOff'),
  schema: z.literal(1),
  rooms,
  tapAt: n(L.epochMs),
  sinceLiveMs: callMs.optional(),
  tapAgainMs: callMs.optional(), // a second tap within the client's 20 s debounce
  summarySoFar: z.strictObject(summarySections),
  ring: z.strictObject({
    samples: z.array(sample).max(L.maxSamples),
    events: z.array(z.strictObject({ tMs: callMs, kind: z.enum(EVENT_KINDS) })).max(L.maxEvents),
  }),
  // The person's own words. UTF-16 units, as the phone counts: zod 4's .max() counts code points
  note: z
    .string()
    .refine((s) => s.length <= L.noteMax)
    .optional(),
});

export const callTelemetryBodySchema = z.discriminatedUnion('kind', [
  summaryBodySchema,
  feltOffBodySchema,
]);

export type SummaryBody = z.infer<typeof summaryBodySchema>;
export type FeltOffBody = z.infer<typeof feltOffBodySchema>;
export type CallTelemetryBody = z.infer<typeof callTelemetryBodySchema>;
