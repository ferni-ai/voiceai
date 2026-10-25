/**
 * Time to Ferni's first word (TTFW_METRIC, off by default): one "Time to first
 * word" line per call, to see where a launch's wait goes (goal: 2 s at p95).
 *
 * Marks, monotonic in this process: (a) job start and (b) agent joined from
 * job-executor.ts; (c) caller joined from the room's participantConnected (the
 * agent's join if the caller was there first), bound to the session when the
 * entry notes the caller (sip-caller.ts); (d) first TTS audio and (e) opener
 * text sent to TTS from the gateway's first audio (onGatewayFirstAudio: its
 * ttfb and push stages give (e)). The app's moments arrive on
 * CLIENT_TIMING_TOPIC (shape in time-to-first-word-record.ts) as offsets.
 * The line has the session id, platform and ms only: no names, numbers or words.
 * Off: nothing is registered, nothing is logged.
 *
 * @module agents/shared/time-to-first-word
 */
import { performance } from 'node:perf_hooks';

import { flagOn, type Env } from '../../config/env-flag.js';
import { onGatewayFirstAudio } from '../../speech/tts-gateway/first-audio-observer.js';
import { createLogger } from '../../utils/safe-logger.js';
import { registerTtfwRoom, unregisterTtfwRoom } from './time-to-first-word-caller.js';
import {
  CLIENT_TIMING_TOPIC,
  computeTtfwRecord,
  parseClientTiming,
  platformOf,
  type ClientTiming,
  type ParticipantLike,
  type TtfwMarks,
} from './time-to-first-word-record.js';

const log = createLogger({ module: 'TimeToFirstWord' });

/** How long after first audio to wait for the app's timing before logging without it. */
const GRACE_MS = 15_000;
/** Participants whose join time is kept; a call room has two or three. */
const MAX_SEEN = 16;

type ParticipantListener = (participant: ParticipantLike) => void;
type DataListener = (
  payload: Uint8Array,
  participant?: ParticipantLike,
  kind?: unknown,
  topic?: string
) => void;

type RoomSubscribe = ((event: 'participantConnected', listener: ParticipantListener) => unknown) &
  ((event: 'dataReceived', listener: DataListener) => unknown);

/** The room events this needs (a LiveKit Room satisfies it). */
export interface TtfwRoom {
  remoteParticipants: ReadonlyMap<string, unknown>;
  on: RoomSubscribe;
  off: RoomSubscribe;
}

export interface TtfwWatch {
  /** (b) the agent joined the room (JobContext onConnect). */
  agentJoined: () => void;
  /** The job ended: log the line if it has not gone out, and detach. */
  finish: () => void;
}

export interface TtfwOptions {
  env?: Env;
  now?: () => number;
  graceMs?: number;
}

const NOOP: TtfwWatch = { agentJoined: () => undefined, finish: () => undefined };

class CallTtfw implements TtfwWatch {
  private readonly marks: TtfwMarks;
  private readonly seen = new Map<string, number>();
  private presentAtJoin = new Set<string>();
  private client?: ClientTiming;
  private sessionId?: string;
  private platform?: string;
  private emitted = false;
  private graceTimer?: ReturnType<typeof setTimeout>;
  private unsubscribeAudio?: () => void;

  constructor(
    private readonly room: TtfwRoom,
    private readonly jobId: string,
    private readonly now: () => number,
    private readonly graceMs: number
  ) {
    this.marks = { jobStart: now() };
    room.on('participantConnected', this.onParticipant);
    room.on('dataReceived', this.onData);
  }

  agentJoined(): void {
    if (this.marks.agentJoined !== undefined) return;
    this.marks.agentJoined = this.now();
    this.presentAtJoin = new Set(this.room.remoteParticipants.keys());
  }

  /** The entry knows who the caller is and which session this call is. */
  bindCaller(sessionId: string, participant: ParticipantLike): void {
    if (this.sessionId !== undefined || this.emitted) return;
    this.sessionId = sessionId;
    const identity = participant.identity ?? '';
    const { agentJoined } = this.marks;
    this.marks.callerJoined =
      this.presentAtJoin.has(identity) && agentJoined !== undefined
        ? agentJoined
        : (this.seen.get(identity) ?? this.now());
    this.platform = platformOf(participant) ?? this.platform;
    this.unsubscribeAudio = onGatewayFirstAudio(this.onFirstAudio);
  }

  private readonly onParticipant = (participant: ParticipantLike): void => {
    const { identity } = participant;
    if (!identity || this.seen.has(identity) || this.seen.size >= MAX_SEEN) return;
    this.seen.set(identity, this.now());
  };

  private readonly onData: DataListener = (payload, participant, _kind, topic) => {
    if (topic !== CLIENT_TIMING_TOPIC || !participant || this.client || this.emitted) return;
    const { timing, error } = parseClientTiming(payload);
    if (!timing) {
      log.debug({ jobId: this.jobId, error }, 'Ignored a client timing message');
      return;
    }
    this.client = timing;
    this.platform ??= timing.platform;
    if (this.marks.firstAudio !== undefined && timing.firstAudioHeardAt !== undefined)
      this.finish();
  };

  private readonly onFirstAudio = (sessionId: string, ttfbMs: number, pushMs?: number): void => {
    if (sessionId !== this.sessionId || this.marks.firstAudio !== undefined || this.emitted) return;
    const at = this.now();
    this.marks.firstAudio = at;
    this.marks.ttsFirstAudioMs = Math.round(ttfbMs);
    // pushMs and ttfbMs are both from the TTS node's start: text went out at start + pushMs.
    if (pushMs !== undefined) this.marks.openerText = at - ttfbMs + pushMs;
    if (this.client?.firstAudioHeardAt !== undefined) return this.finish();
    this.graceTimer = setTimeout(() => this.finish(), this.graceMs);
    this.graceTimer.unref?.();
  };

  /** Log the line once (first audio + app timing, the grace period, or the job's end), then detach. */
  finish(): void {
    if (!this.emitted) {
      this.emitted = true;
      const record = computeTtfwRecord(this.marks, this.client);
      const id = this.sessionId ? { sessionId: this.sessionId } : { jobId: this.jobId };
      const platform = this.platform ? { platform: this.platform } : {};
      log.info({ ...id, ...platform, ...record }, 'Time to first word');
    }
    this.detach();
  }

  private detach(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
    this.unsubscribeAudio?.();
    this.unsubscribeAudio = undefined;
    this.room.off('participantConnected', this.onParticipant);
    this.room.off('dataReceived', this.onData);
    unregisterTtfwRoom(this.room);
  }
}

/** Start measuring one job's call. A no-op that registers nothing when TTFW_METRIC is off. */
export function watchTimeToFirstWord(
  room: TtfwRoom,
  jobId: string,
  options: TtfwOptions = {}
): TtfwWatch {
  if (!flagOn('TTFW_METRIC', options.env)) return NOOP;
  const watch = new CallTtfw(
    room,
    jobId,
    options.now ?? (() => performance.now()),
    options.graceMs ?? GRACE_MS
  );
  registerTtfwRoom(room, watch);
  return watch;
}

export { noteTtfwCaller } from './time-to-first-word-caller.js';
