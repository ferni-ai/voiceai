/**
 * The TTFW line's numbers: pure calculation, no clocks, no I/O.
 *
 * Server marks are monotonic ms (performance.now()) in the agent process.
 * Client moments are epoch ms on the caller's device, so they are only ever
 * compared with each other (offsets), never with server marks: the two clocks
 * can disagree by seconds.
 *
 * @module agents/shared/time-to-first-word-record
 */
import { ParticipantKind } from '@livekit/rtc-node';

/** Data topic the app sends its own moments on. */
export const CLIENT_TIMING_TOPIC = 'ferni.client_timing';

/**
 * What the app sends once per call, as UTF-8 JSON on topic `ferni.client_timing`
 * (reliable data message), all values epoch ms from the device clock:
 *
 *   { "tapAt": 1760000000000,            // the caller tapped to talk
 *     "roomConnectedAt": 1760000000600,  // the app joined the LiveKit room
 *     "firstAudioHeardAt": 1760000001700, // Ferni's first audio played on the device
 *     "platform": "ios" }                // optional: ios | android | web | mac
 *
 * Any field may be missing. Send it after firstAudioHeardAt is known; the agent
 * keeps the first valid message and ignores the rest. Non-numbers, values that
 * are not plausible epoch ms, payloads over 1 KB and out-of-order moments are
 * ignored, field by field.
 */
export interface ClientTiming {
  tapAt?: number;
  roomConnectedAt?: number;
  firstAudioHeardAt?: number;
  platform?: string;
}

/** Monotonic ms marks for one call. Missing marks leave their segments out. */
export interface TtfwMarks {
  /** (a) the job started on this agent process. */
  jobStart?: number;
  /** (b) the agent joined the room. */
  agentJoined?: number;
  /** (c) the caller joined (the agent's join when the caller was there first). */
  callerJoined?: number;
  /** (e) the opener's first text went to TTS. */
  openerText?: number;
  /** (d) the first TTS audio frame of the call. */
  firstAudio?: number;
  /** The TTS node's own start -> first audio, as the gateway reports it. */
  ttsFirstAudioMs?: number;
}

export interface TtfwRecord {
  /** First audio minus the later of agent join and caller join. */
  ttfwMs?: number;
  jobToAgentJoinMs?: number;
  agentJoinToCallerMs?: number;
  readyToOpenerTextMs?: number;
  openerTextToAudioMs?: number;
  ttsFirstAudioMs?: number;
  jobToFirstAudioMs?: number;
  clientTapToRoomMs?: number;
  clientTapToHeardMs?: number;
  clientRoomToHeardMs?: number;
}

/** Device moments before 2020 or after 2100 are not epoch ms. */
const MIN_EPOCH_MS = 1_577_836_800_000;
const MAX_EPOCH_MS = 4_102_444_800_000;
/** A client offset longer than this is a stale or broken clock, not a launch. */
const MAX_CLIENT_OFFSET_MS = 120_000;
const MAX_PAYLOAD_BYTES = 1024;
const PLATFORMS = new Set(['ios', 'android', 'web', 'mac', 'phone']);

function span(from: number | undefined, to: number | undefined): number | undefined {
  if (from === undefined || to === undefined) return undefined;
  const ms = Math.round(to - from);
  return Number.isFinite(ms) ? ms : undefined;
}

function clientSpan(from: number | undefined, to: number | undefined): number | undefined {
  const ms = span(from, to);
  return ms !== undefined && ms >= 0 && ms <= MAX_CLIENT_OFFSET_MS ? ms : undefined;
}

/** The line's fields. A segment whose ends are not both known is left out, never NaN. */
export function computeTtfwRecord(marks: TtfwMarks, client?: ClientTiming): TtfwRecord {
  const { jobStart, agentJoined, callerJoined, openerText, firstAudio } = marks;
  const ready =
    agentJoined !== undefined && callerJoined !== undefined
      ? Math.max(agentJoined, callerJoined)
      : undefined;
  const fields: TtfwRecord = {
    ttfwMs: span(ready, firstAudio),
    jobToAgentJoinMs: span(jobStart, agentJoined),
    agentJoinToCallerMs: span(agentJoined, callerJoined),
    readyToOpenerTextMs: span(ready, openerText),
    openerTextToAudioMs: span(openerText, firstAudio),
    ttsFirstAudioMs: marks.ttsFirstAudioMs,
    jobToFirstAudioMs: span(jobStart, firstAudio),
    clientTapToRoomMs: clientSpan(client?.tapAt, client?.roomConnectedAt),
    clientTapToHeardMs: clientSpan(client?.tapAt, client?.firstAudioHeardAt),
    clientRoomToHeardMs: clientSpan(client?.roomConnectedAt, client?.firstAudioHeardAt),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, ms]) => typeof ms === 'number' && Number.isFinite(ms))
  ) as TtfwRecord;
}

const MOMENTS = ['tapAt', 'roomConnectedAt', 'firstAudioHeardAt'] as const;

const isEpochMs = (v: unknown): v is number =>
  typeof v === 'number' && v >= MIN_EPOCH_MS && v <= MAX_EPOCH_MS;

/** A platform name from the allow-list, or undefined. Never free text. */
export function knownPlatform(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  return PLATFORMS.has(v) ? v : undefined;
}

/**
 * The app's timing message, validated; null for anything unusable. Never
 * throws: a malformed payload is the sender's bug, reported in `error`.
 */
export function parseClientTiming(payload: Uint8Array): {
  timing: ClientTiming | null;
  error?: string;
} {
  if (payload.byteLength === 0 || payload.byteLength > MAX_PAYLOAD_BYTES) {
    return { timing: null, error: `payload size ${payload.byteLength}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(payload));
  } catch (error: unknown) {
    return { timing: null, error: `not JSON: ${String(error)}` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { timing: null, error: 'not an object' };
  }
  const obj = raw as Record<string, unknown>;
  const timing: ClientTiming = {};
  for (const key of MOMENTS) {
    const v = obj[key];
    if (isEpochMs(v)) timing[key] = v;
  }
  if (Object.keys(timing).length === 0) return { timing: null, error: 'no usable moments' };
  const platform = knownPlatform(obj.platform);
  if (platform) timing.platform = platform;
  return { timing };
}

export interface ParticipantLike {
  identity?: string;
  kind?: ParticipantKind;
  attributes?: Record<string, string>;
}

/** 'phone' for a SIP caller, else an allow-listed `platform` attribute, else undefined. */
export function platformOf(participant: ParticipantLike): string | undefined {
  if (participant.kind === ParticipantKind.SIP) return 'phone';
  return knownPlatform(participant.attributes?.platform);
}
