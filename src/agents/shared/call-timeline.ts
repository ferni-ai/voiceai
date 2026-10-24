/**
 * CALL_TIMELINE=on: one ordered record of everything said and heard on a call:
 * the sounds, cuts, holds and overlaps that turns (words only) leave out, and
 * each reply as generated vs as heard (prod-call-audit-2026-10-24/CAPTURE-MAP.md).
 * add() is a synchronous push that never throws into the reply path. Written
 * every 60 s and at call end to bogle_users/{uid}/conversations/{conv}/timeline,
 * as turns are: members with a conversation only, never while memory is held.
 * Logs carry counts and ids, never words.
 *
 * @module agents/shared/call-timeline
 */
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { memoryHeld, userHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { SoundKind as Heard } from '../integrations/sound-signal.js';
import { VOICED_TAKES } from './reaction-clips.js';

const log = createLogger({ module: 'CallTimeline' });

type CallerKind = 'caller_final' | 'caller_state' | 'overlap' | 'barge_in';
type SoundKind = 'backchannel' | 'opener_sound' | 'laugh' | 'sound' | 'clip_cut';
type ReplyKind = 'ferni_reply' | 'pause_hold' | 'false_interruption';
type CallKind = 'tool_call' | 'tool_result' | 'handoff' | 'call_end';
export type TimelineKind = CallerKind | SoundKind | ReplyKind | CallKind;

export interface TimelineEvent {
  seq: number;
  tMs: number; // ms since the recorder started
  speaker: string; // 'caller', 'system', or the speaking persona
  kind: TimelineKind;
  text?: string; // caller words, or a clip / tool / state label
  heardText?: string;
  generatedText?: string; // only when it differs from what was heard
  startMs?: number;
  endMs?: number;
  cut?: boolean;
  overlap?: boolean;
  turnId?: string;
  f?: Record<string, number | string | boolean>; // numeric / enum extras, never words
}

export type TimelineInput = Omit<TimelineEvent, 'seq' | 'tMs' | 'speaker'> & { speaker?: string };
export type TimelineWrite = (uid: string, conv: string, id: string, d: object) => Promise<void>;

export interface TimelineOptions {
  sessionId: string;
  userId: string | undefined;
  conversationId: () => string | undefined; // read at write time: it starts in the background
  persona: () => string;
  jobId?: string;
  roomName?: string;
  buildSha?: string;
  write?: TimelineWrite;
  now?: () => number;
}

export const MAX_EVENTS = 4_000;
export const CHUNK_EVENTS = 200; // 200 events with 2 KB texts stay under Firestore's 1 MiB doc
export const MAX_TEXT = 2_000;
export const FLUSH_EVERY_MS = 60_000;

/** bogle_users/{uid}/conversations/{conv}/timeline/{docId}, beside the turns. */
export const writeTimelineDoc: TimelineWrite = async (uid, conv, docId, data) => {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const conversation = db.collection('bogle_users').doc(uid).collection('conversations').doc(conv);
  await conversation.collection('timeline').doc(docId).set(data);
};

export class CallTimeline {
  readonly events: TimelineEvent[] = [];
  readonly startedAtMs: number;
  private readonly now: () => number;
  private written = 0; // events already in a stored chunk
  private dropped = 0;
  private ended: { atMs: number; reason: string } | null = null;
  private pending: { text: string; atMs: number; speaker: string } | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly personas = new Set<string>();

  constructor(readonly opts: TimelineOptions) {
    this.now = opts.now ?? Date.now;
    this.startedAtMs = this.now();
  }

  /** ms since the recorder started. */
  msNow(): number {
    return Math.round(this.now() - this.startedAtMs);
  }

  /** Never throws: callers sit on the reply path. */
  add(input: TimelineInput, atMs = this.now()): void {
    try {
      if (this.events.length >= MAX_EVENTS && input.kind !== 'call_end') return void this.dropped++;
      const speaker = input.speaker ?? this.opts.persona();
      if (speaker !== 'caller' && speaker !== 'system') this.personas.add(speaker);
      const tMs = Math.max(0, Math.round(atMs - this.startedAtMs));
      const ev: TimelineEvent = { ...input, seq: this.events.length, tMs, speaker };
      for (const k of ['text', 'heardText', 'generatedText'] as const)
        if (ev[k] !== undefined) ev[k] = ev[k].slice(0, MAX_TEXT);
      this.events.push(JSON.parse(JSON.stringify(ev)) as TimelineEvent); // no undefined fields
    } catch {
      // bookkeeping only
    }
  }

  /** The reply text at the TTS hand-off, held until LiveKit commits what was heard. */
  generated(text: string): void {
    if (!text.trim()) return;
    this.unheard();
    this.pending = { text, atMs: this.now(), speaker: this.opts.persona() };
  }

  /** The assistant message LiveKit committed: the part of the reply the caller heard. */
  heard(heardText: string, cut: boolean, startMs?: number, endMs?: number, turnId?: string): void {
    const gen = this.pending?.text;
    this.pending = null;
    const generatedText = gen !== undefined && gen.trim() !== heardText.trim() ? gen : undefined;
    const reply = { kind: 'ferni_reply', heardText, generatedText, cut: cut || undefined } as const;
    this.add({ ...reply, startMs, endMs, turnId });
  }

  /** A generated reply that never became a heard message: cut before any of it played. */
  private unheard(): void {
    const p = this.pending;
    this.pending = null;
    const reply = { kind: 'ferni_reply', heardText: '', cut: true } as const;
    if (p) this.add({ ...reply, speaker: p.speaker, generatedText: p.text }, p.atMs);
  }

  end(reason: string): void {
    if (this.ended) return;
    this.unheard();
    this.ended = { atMs: this.now(), reason };
    this.add({ kind: 'call_end', speaker: 'system', text: reason });
  }

  /** Write the chunks that changed, then the header. Serialized; never rejects. */
  flush(): Promise<void> {
    const sessionId = this.opts.sessionId;
    this.chain = this.chain
      .then(async () => this.writeDirty())
      .catch((error: unknown) =>
        log.warn({ sessionId, error: String(error) }, 'CALL_TIMELINE write failed')
      );
    return this.chain;
  }

  private async writeDirty(): Promise<void> {
    const { userId, sessionId, conversationId, write = writeTimelineDoc } = this.opts;
    const total = this.events.length;
    if (total === this.written) return; // nothing new (the end adds call_end)
    const conv = conversationId();
    // As turns are stored: a member with a conversation, and never while memory is held.
    if (!isMemberIdentity(userId) || !conv || memoryHeld(sessionId) || userHeld(userId)) {
      return log.info({ sessionId, events: total }, 'CALL_TIMELINE skipped');
    }
    const chunks = Math.ceil(total / CHUNK_EVENTS);
    for (let c = Math.floor(this.written / CHUNK_EVENTS); c < chunks; c++) {
      const events = this.events.slice(c * CHUNK_EVENTS, (c + 1) * CHUNK_EVENTS);
      const id = timelineDocId(sessionId, `chunk-${String(c).padStart(3, '0')}`);
      await write(userId, conv, id, { v: 1, chunk: c, events });
    }
    const byKind: Record<string, number> = {};
    for (const e of this.events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    const { jobId = null, roomName = null, buildSha = null } = this.opts;
    const ids = { v: 1, sessionId, jobId, roomName, conversationId: conv, buildSha, chunks };
    const end = { endedAtMs: this.ended?.atMs ?? null, endReason: this.ended?.reason ?? null };
    const counts = { events: total, dropped: this.dropped, byKind };
    await write(userId, conv, timelineDocId(sessionId, 'meta'), {
      ...ids,
      startedAtMs: this.startedAtMs,
      ...end,
      counts,
      personas: [...this.personas],
    });
    this.written = total;
    log.info({ sessionId, events: total, chunks }, 'CALL_TIMELINE written');
  }
}

/**
 * A timeline doc's id: the session first, so a handoff that starts a new session in the
 * same conversation writes its own chunks instead of overwriting the first persona's.
 */
export function timelineDocId(sessionId: string, name: string): string {
  return `${sessionId.replace(/[^\w-]/g, '_')}.${name}`;
}

// The call's recorder by session object (clip player, barge-in) or id (TTS, resume logs).
const bySession = new WeakMap<object, CallTimeline>();
const byId = new Map<string, CallTimeline>();

export function registerTimeline(session: object, tl: CallTimeline): () => void {
  bySession.set(session, tl);
  byId.set(tl.opts.sessionId, tl);
  return () => {
    bySession.delete(session);
    if (byId.get(tl.opts.sessionId) === tl) byId.delete(tl.opts.sessionId);
  };
}

export function timelineFor(key: object | string | undefined): CallTimeline | undefined {
  return typeof key === 'string' ? byId.get(key) : key && bySession.get(key);
}

/** tts-wrapper: the full reply text at the TTS hand-off. */
export function noteGeneratedReply(sessionId: string | undefined, text: string): void {
  try {
    timelineFor(sessionId)?.generated(text);
  } catch {
    // bookkeeping only
  }
}

const EVENT_KINDS: Record<string, TimelineKind> = {
  backchannel: 'backchannel',
  opener: 'opener_sound',
  laugh: 'laugh',
};
/** sound-signal.ts's kinds, plus whistle; by the take's category first, then by the gate. */
const BY_TAKE: Record<string, Heard | 'whistle'> = {
  ...{ 'morning-yawn': 'breath', 'content-sigh': 'sigh', laugh: 'laugh', surprised: 'laugh' },
  ...{ mmhm: 'mm-hmm', aww: 'mm-hmm', recognition: 'mm-hmm', 'thinking-hum': 'hum' },
};
const BY_GATE: Record<string, Heard> = {
  backchannel: 'mm-hmm',
  opener: 'opener',
  laugh: 'laugh',
};
const TAKES = new Map(
  Object.entries(VOICED_TAKES).flatMap(([category, takes]) => takes.map((t) => [t, category]))
);

/** What a judge hears a clip as: laugh, mm-hmm, hum, opener, breath, sigh or whistle. */
export function soundKindOf(gateKind: string, clip: string): Heard | 'whistle' {
  const byTake = BY_TAKE[TAKES.get(clip) ?? ''];
  if (byTake) return byTake;
  if (clip === 'whistle' || clip.startsWith('recorded-whistle:')) return 'whistle';
  if (clip === 'snore') return 'breath';
  return BY_GATE[gateKind] ?? (gateKind === 'slow_turn' ? 'opener' : 'hum');
}

type Gate<K extends string> = (kind: K, clip: string, play: () => boolean) => boolean;

/**
 * The clip player's sound gate, recording each clip that played: every
 * backchannel, laugh, opener, presence sound and tool hum passes through it.
 * `text` is the clip text the gate was given (the same label sound_played
 * carries); startMs is when play() was accepted. Looked up per clip, so a
 * player started before the timeline still records.
 */
export function withTimelineSounds<K extends string>(
  session: object,
  gate: Gate<K>,
  sessionId: () => string | undefined
): Gate<K> {
  return (kind, label, play) => {
    if (!gate(kind, label, play)) return false;
    const tl = timelineFor(session) ?? timelineFor(sessionId());
    const take = TAKES.get(label);
    const f = { sound: soundKindOf(kind, label), source: kind, ...(take && { take }) };
    const startMs = tl?.msNow() ?? 0; // the event's own time, so tMs === startMs
    tl?.add(
      { kind: EVENT_KINDS[kind] ?? 'sound', text: label, startMs, f },
      tl.startedAtMs + startMs
    );
    return true;
  };
}

/** A clip cut short because the caller carried on (direct-clip-track.ts, clip-player.ts). */
export function noteClipCut(session: object, by: string): void {
  timelineFor(session)?.add({ kind: 'clip_cut', f: { by } });
}
