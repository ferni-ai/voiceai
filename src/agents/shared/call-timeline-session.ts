/**
 * Feeds a CallTimeline (call-timeline.ts) from a live AgentSession's events
 * and pause-hold releases. Listeners only: the reply path awaits none of it.
 * One session per call (a persona swap reuses it).
 *
 * @module agents/shared/call-timeline-session
 */
import { getJobContext } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { onPauseHoldReleased } from '../../speech/output-control/pause-hold.js';
import { CallTimeline, FLUSH_EVERY_MS, registerTimeline } from './call-timeline.js';
import type { TimelineOptions } from './call-timeline.js';

interface EventSource {
  on(event: string, handler: (ev: Ev) => void): unknown;
  off(event: string, handler: (ev: Ev) => void): unknown;
}

/** The fields read from LiveKit's session events (voice/events.d.ts). */
interface Ev {
  transcript?: string;
  isFinal?: boolean;
  newState?: string;
  resumed?: boolean;
  isInterruption?: boolean;
  totalDurationInS?: number;
  reason?: string;
  functionCalls?: Array<{ name?: string }>;
  functionCallOutputs?: Array<{ name?: string; isError?: boolean }>;
  item?: {
    type?: string;
    role?: string;
    id?: string;
    newAgentId?: string;
    interrupted?: boolean;
    textContent?: string;
    metrics?: { startedSpeakingAt?: number; stoppedSpeakingAt?: number };
  };
}

/** The LiveKit job and room of this call; none in tests. */
function jobFields(): { jobId?: string; roomName?: string } {
  try {
    const ctx = getJobContext();
    return { jobId: ctx.job.id, roomName: ctx.room.name };
  } catch {
    return {};
  }
}

type SessionData = { personaId?: string; services?: { realtimeConversationId?: string } };
type AttachOptions = Omit<TimelineOptions, 'conversationId' | 'persona'> &
  Partial<Pick<TimelineOptions, 'conversationId' | 'persona'>>;

/**
 * Whose calls are recorded: only the uids in CALL_TIMELINE_UIDS (comma-separated).
 * Fails closed: unset or empty records nobody, so turning the flag on never
 * records every member (the owner decided timelines are his account's only).
 */
export function timelineRecordsFor(userId: string | undefined, env: Env = process.env): boolean {
  if (!userId) return false;
  const uids = (env.CALL_TIMELINE_UIDS ?? '').split(',').map((s) => s.trim());
  return uids.includes(userId);
}

/**
 * CALL_TIMELINE=on, for a caller in CALL_TIMELINE_UIDS: start the call's timeline
 * on this session. Returns the detach, which records the end, writes what is left
 * and stops listening.
 */
export function attachCallTimeline(
  session: EventSource & { userData?: unknown },
  opts: AttachOptions,
  env: Env = process.env
): () => void {
  if (!flagOn('CALL_TIMELINE', env) || !timelineRecordsFor(opts.userId, env)) return () => {};
  // Read when needed: the conversation starts in the background, a swap changes the persona.
  const data = () => session.userData as SessionData | undefined;
  const tl = new CallTimeline({
    ...{ ...jobFields(), buildSha: env.BUILD_SHA },
    conversationId: () => data()?.services?.realtimeConversationId,
    persona: () => data()?.personaId ?? 'ferni',
    ...opts,
  });
  const unregister = registerTimeline(session, tl);
  // SDK speaking times are epoch seconds; the timeline counts ms from its start.
  const rel = (s?: number) => (s === undefined ? undefined : Math.round(s * 1000 - tl.startedAtMs));
  const handlers: Record<string, (e: Ev) => void> = {
    user_input_transcribed: (e) => {
      if (e.isFinal && e.transcript?.trim())
        tl.add({ kind: 'caller_final', speaker: 'caller', text: e.transcript });
    },
    user_state_changed: (e) =>
      tl.add({ kind: 'caller_state', speaker: 'caller', text: e.newState }),
    conversation_item_added: ({ item }) => {
      if (item?.type === 'agent_handoff')
        tl.add({ kind: 'handoff', speaker: 'system', text: item.newAgentId });
      if (item?.role !== 'assistant') return;
      const { startedSpeakingAt: start, stoppedSpeakingAt: stop } = item.metrics ?? {};
      const cut = item.interrupted === true;
      tl.heard(item.textContent ?? '', cut, rel(start), rel(stop), item.id);
    },
    function_tools_executed: (e) => {
      for (const call of e.functionCalls ?? []) tl.add({ kind: 'tool_call', text: call.name });
      for (const out of e.functionCallOutputs ?? [])
        tl.add({ kind: 'tool_result', text: out.name, f: { isError: out.isError === true } });
    },
    agent_false_interruption: (e) =>
      tl.add({ kind: 'false_interruption', f: { resumed: e.resumed === true } }),
    overlapping_speech: (e) => {
      const f = { isInterruption: e.isInterruption === true, durS: e.totalDurationInS ?? 0 };
      tl.add({ kind: 'overlap', speaker: 'caller', overlap: true, f });
    },
    close: (e) => {
      tl.end(e?.reason ?? 'close');
      void tl.flush();
    },
  };
  for (const [event, handler] of Object.entries(handlers)) session.on(event, handler);
  const offHold = onPauseHoldReleased((sessionId, heldMs) => {
    const endMs = tl.msNow();
    const hold = { kind: 'pause_hold', speaker: 'system', f: { heldMs } } as const;
    if (sessionId === opts.sessionId) tl.add({ ...hold, startMs: endMs - heldMs, endMs });
  });
  const timer = setInterval(() => void tl.flush(), FLUSH_EVERY_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    offHold();
    for (const [event, handler] of Object.entries(handlers)) session.off(event, handler);
    tl.end('detached');
    void tl.flush();
    unregister();
  };
}
