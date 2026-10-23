/**
 * What the iPhone app sends to POST /api/call-telemetry: a per-call summary at
 * hang-up, or a "That felt off" report (the last 30 s of 1 Hz samples plus the
 * summary so far). The contract is docs/api/call-telemetry.md; the iOS client's
 * own fixtures are checked against it in __tests__/fixtures.
 *
 * Privacy is enforced here, not in review: numbers, booleans and closed enums
 * only. Every string is an enum or an anchored regex, except the felt-off note
 * the person types themselves. Every object is strict, so an unknown key is a
 * 400. A missing key means "not measured" (optionals are omitted, never null).
 * A number outside its range is clamped into it, so one outlier never costs the
 * whole report.
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
  kbps: 10_000_000,
  sampleRateHz: 384_000,
  epochMs: 4_102_444_800_000, // 2100-01-01
} as const;
const L = CALL_TELEMETRY_LIMITS;

export const ROOM_NAME = /^ios-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;
export const DEVICE_MODEL = /^(iPhone|iPad|iPod|Watch)\d{1,3},\d{1,3}$/;

export const ROUTES = [
  'speaker',
  'receiver',
  'bluetoothHFP',
  'bluetoothLE',
  'wired',
  'airplay',
  'car',
  'usb',
  'other',
] as const;
export const THERMAL = ['nominal', 'fair', 'serious', 'critical'] as const;
export const OUTCOMES = [
  'endedByYou',
  'endedByFerni',
  'failed:microphoneDenied',
  'failed:notSignedIn',
  'failed:offline',
  'failed:server',
  'failed:ferniDidNotJoin',
  'failed:connectionLost',
] as const;
export const PHASES = [
  'idle',
  'connecting',
  'waitingForFerni',
  'live',
  'reconnecting',
  'ended',
  'failed',
] as const;
export const AGENT_STATES = ['initializing', 'idle', 'listening', 'thinking', 'speaking'] as const;
export const EVENT_KINDS = [
  'reconnectStartQuick',
  'reconnectStartFull',
  'reconnectDone',
  'rejoin',
  'engineStart',
  'engineStop',
  'engineConfigChange',
  'sessionReapply',
  'mediaReset',
  'routeChange',
  'interruptionBegan',
  'interruptionEnded',
  'speechStart',
  'speechEnd',
  'agentSpeaking',
  'agentListening',
  'agentThinking',
  'tapInterrupt',
  'handoff',
] as const;

/** A number clamped into [0, max]; only a non-number (or NaN, Infinity) is refused. */
const n = (max: number) => z.number().transform((v) => Math.min(max, Math.max(0, v)));
const ms = n(L.latencyMs);
const callMs = n(L.callMs);
const count = n(L.count);
const ratio = n(1);
const pct = n(100);
const sec = n(L.callMs / 1000);
const opt = <T extends z.ZodType>(t: T) => t.optional();
/** A strict object whose every key is optional: a missing key is "not measured". */
const section = <S extends z.ZodRawShape>(shape: S) => z.strictObject(shape).partial();

const rooms = z.array(z.string().regex(ROOM_NAME)).min(1).max(L.maxRooms);
const route = z.enum(ROUTES);
const thermal = z.enum(THERMAL);
const percentiles = section({ p50: ms, p95: ms, max: ms, n: count });

const build = z.strictObject({
  appVersion: z.string().regex(VERSION),
  appBuild: z.number().int().min(0).max(L.count),
  os: z.string().regex(VERSION),
  deviceModel: opt(z.string().regex(DEVICE_MODEL)), // omitted on a simulator
  livekit: opt(z.string().regex(VERSION)),
});

const summarySections = {
  build,
  call: opt(
    section({
      tokenMs: ms,
      roomMs: ms,
      ferniMs: ms,
      attempts: count,
      liveMs: callMs,
      mutedMs: callMs,
      systemInterruptions: count,
      onHoldMs: callMs,
      outcome: z.enum(OUTCOMES),
    })
  ),
  net: opt(
    section({
      rttMsP50: ms,
      rttMsP95: ms,
      jitterMsP95: ms,
      lossPctDown: pct,
      lossPctUp: pct,
      jitterBufferMsMean: ms,
      availableInKbpsP5: n(L.kbps),
      reconnectsQuick: count,
      reconnectsFull: count,
      rejoins: count,
      qualityPoorSec: sec,
      qualityLostSec: sec,
    })
  ),
  audio: opt(
    section({
      concealedRatio: ratio,
      silentConcealedRatio: ratio,
      concealmentEvents: count,
      accelRatio: ratio,
      decelRatio: ratio,
      synthesizedMs: callMs,
      synthesizedEvents: count,
      playoutDelayMsMean: ms,
      renderGaps: count,
      engineStarts: count,
      engineStops: count,
      engineConfigChanges: count,
      sessionReapplies: count,
      mediaResets: count,
      ioBufferMs: ms,
      sampleRateHz: n(L.sampleRateHz),
    })
  ),
  route: opt(
    section({
      routeStart: route,
      routeEnd: route,
      routeChanges: count,
      routeChangesByReason: section({
        newDevice: count,
        oldDeviceUnavailable: count,
        override: count,
        other: count,
      }),
    })
  ),
  turns: opt(
    section({
      eosToAudioMs: percentiles,
      stateToAudioMs: percentiles,
      tapInterrupts: count,
      bargeIns: count,
      stopsWithoutSpeech: count,
    })
  ),
  avatar: opt(
    section({
      frames: count,
      frameMsP50: ms,
      frameMsP95: ms,
      frameMsP99: ms,
      frameDrops: count,
      dropPct: pct,
      gpuMsP95: ms,
      throttledSec: sec,
    })
  ),
  device: opt(
    section({
      thermalStart: thermal,
      thermalMax: thermal,
      thermalSeriousSec: sec,
      lowPowerStart: z.boolean(),
      lowPowerSec: sec,
    })
  ),
};

const sample = z
  .strictObject({
    t: n(L.maxSamples), // seconds before the snapshot
    roomIndex: z
      .number()
      .int()
      .min(0)
      .max(L.maxRooms - 1),
    phase: z.enum(PHASES),
    agentState: z.enum(AGENT_STATES),
    userSpeaking: z.boolean(),
    muted: z.boolean(),
    onHold: z.boolean(),
    rttMs: ms,
    jitterMs: ms,
    lossPctDown: pct,
    concealedMs: n(1000),
    renderGap: z.boolean(),
    frameMsP95: ms,
    frameDrops: count,
    route,
    thermal,
  })
  .partial()
  .required({ t: true });

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
  sinceLiveMs: opt(callMs),
  tapAgainMs: opt(callMs), // a second tap within the client's 20 s debounce
  summarySoFar: z.strictObject(summarySections),
  ring: z.strictObject({
    samples: z.array(sample).max(L.maxSamples),
    events: z
      .array(z.strictObject({ tMs: n(L.callMs), kind: z.enum(EVENT_KINDS) }))
      .max(L.maxEvents),
  }),
  // The person's own words, stored admin-only. Counted in UTF-16 units as the
  // client counts them: zod 4's .max() counts code points, so an emoji note
  // the phone allowed would be refused.
  note: opt(z.string().refine((s) => s.length <= L.noteMax, 'over 140 UTF-16 units')),
});

export const callTelemetryBodySchema = z.discriminatedUnion('kind', [
  summaryBodySchema,
  feltOffBodySchema,
]);

export type SummaryBody = z.infer<typeof summaryBodySchema>;
export type FeltOffBody = z.infer<typeof feltOffBodySchema>;
export type CallTelemetryBody = z.infer<typeof callTelemetryBodySchema>;
