/**
 * Call-quality SLOs, judged on real prod calls and paged once per incident:
 *   reply_p90     caller stops speaking → Ferni's first audio (TURN_RECEIPT firstAudioMs) ≤ 3 s, critical 5 s
 *   greeting_p90  caller joins, or the dialed phone answers → first audio ≤ 4 s (never ringing)
 *   drop_rate     agent lost a caller still on the line ≤ 5 %, critical 10 %
 *   connect_fail  calls that never connected (judged 30 s in) ≤ 5 %, critical 10 %
 * Rates need minCalls completed calls in the window, latencies minCalls calls or minTurns turns.
 * Eval and key-check calls never count (58 of 107 prod calls, 10-11..18). Prod paged 126 times
 * in 6 h on 10-18 (ringing in the clock, one-call 100 % rates, re-pages) at reply p90 2.9 s.
 *
 * @module services/analytics/call-quality-slo
 */
import type { CallEvent, CallSession } from './call-quality-monitor.js';

export type SloKey = 'reply_p90' | 'greeting_p90' | 'drop_rate' | 'connect_fail';
export type Severity = 'warning' | 'critical';
export type SloLimits = Record<SloKey, { warn: number; critical: number }> & {
  minCalls: number;
  minTurns: number;
  windowMs: number;
};

export const RECOVERY_MARGIN = 0.1;
export const CONNECT_DEADLINE_MS = 30_000;
const EVAL_PREFIXES = ['eval-', 'keycheck-', 'voice-eval-'];
const MAX_REPLIES = 5000;
const MAX_EXCLUDED = 2000;

const replies: Array<{ callId: string; at: number; ms: number }> = [];
const excluded = new Set<string>();

/** An eval or synthetic call, by room name, caller identity or user id. */
export function isEvalTraffic(...names: Array<string | undefined>): boolean {
  return names.some((n) => !!n && EVAL_PREFIXES.some((p) => n.startsWith(p)));
}

function exclude(callId: string): void {
  if (excluded.size >= MAX_EXCLUDED) excluded.delete(excluded.values().next().value as string);
  excluded.add(callId);
}

/** 'call_context' and 'first_response' (a caller turn), before the monitor opens a session. */
export function noteSloEvent(event: CallEvent, session: CallSession | undefined): boolean {
  if (event.type === 'call_context') {
    if (event.metadata?.traffic === 'eval') exclude(event.callId);
    return true;
  }
  if (event.type !== 'first_response') return false;
  const ms = event.metadata?.firstAudioMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return true;
  if (event.metadata?.userKind === 'eval') exclude(event.callId);
  replies.push({ callId: event.callId, at: event.timestamp, ms });
  if (replies.length > MAX_REPLIES) replies.splice(0, replies.length - MAX_REPLIES);
  if (session && session.firstReplyMs === undefined) session.firstReplyMs = ms;
  return true;
}

/** Caller joined (or the phone answered) → Ferni's first audio, from the call's stages. */
export function greetingMs(session: CallSession): number | undefined {
  const from = session.stages?.call_answered ?? session.stages?.participant_ready;
  const to = session.stages?.first_audio;
  return from !== undefined && to !== undefined && to >= from ? to - from : undefined;
}

/** Nearest-rank p90, or null for no values. */
function p90(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.ceil(0.9 * sorted.length) - 1] : null;
}
const share = (n: number, of: number): number | null => (of > 0 ? n / of : null);

/** startCall precedes connection_success (session-init-handler.ts): in between is neither. */
function connecting(s: CallSession, now: number): boolean {
  const done = s.endTime !== undefined || s.connectionTimeMs !== undefined;
  return !done && now - s.startTime < CONNECT_DEADLINE_MS;
}

/** One SLO's verdict; `recovered` = RECOVERY_MARGIN inside the warning line. */
function judge(limits: SloLimits, key: SloKey, sampled: boolean, n: number, value: number | null) {
  const { warn, critical } = limits[key];
  const has = sampled && value !== null;
  const severity: Severity | null =
    has && value > critical ? 'critical' : has && value > warn ? 'warning' : null;
  const recovered = has && value <= warn * (1 - RECOVERY_MARGIN);
  return { key, sampled: has, samples: n, value, severity, recovered };
}
export type SloCondition = ReturnType<typeof judge>;

/** Every SLO over the window ending at `now`, live (non-eval) calls only. */
export function evaluateSlos(
  completed: readonly CallSession[],
  active: readonly CallSession[],
  limits: SloLimits,
  now: number = Date.now()
): SloCondition[] {
  const since = now - limits.windowMs;
  const calls = completed.filter((s) => s.startTime >= since && !excluded.has(s.callId));
  const all = [...calls, ...active.filter((s) => !excluded.has(s.callId))];
  const turns = replies.filter((r) => r.at >= since && !excluded.has(r.callId)).map((r) => r.ms);
  const greetings = all.map(greetingMs).filter((g) => g !== undefined);
  const ended = calls.filter((s) => s.endReason !== undefined);
  const drops = ended.filter((s) => s.endReason === 'disconnect').length;
  const settled = all.filter((s) => !connecting(s, now));
  const unconnected = settled.filter((s) => s.connectionTimeMs === undefined).length;
  const callsOk = calls.length >= limits.minCalls;
  const latencyOk = callsOk || turns.length >= limits.minTurns;
  const ends = ended.length;
  return [
    judge(limits, 'reply_p90', latencyOk, turns.length, p90(turns)),
    judge(limits, 'greeting_p90', latencyOk, greetings.length, p90(greetings)),
    judge(limits, 'drop_rate', ends >= limits.minCalls, ends, share(drops, ends)),
    judge(limits, 'connect_fail', callsOk, settled.length, share(unconnected, settled.length)),
  ];
}

export type OpenIncidents = Map<SloKey, { severity: Severity; quietSince?: number }>;

/** Opens an incident once (escalating once); closes it on recovery or after `quietMs` unjudged. */
export function trackIncidents(
  open: OpenIncidents,
  conds: readonly SloCondition[],
  now: number,
  quietMs: number
) {
  const changes: Array<{ kind: 'opened' | 'closed'; condition: SloCondition }> = [];
  for (const c of conds) {
    const was = open.get(c.key);
    if (was) was.quietSince = c.sampled ? undefined : (was.quietSince ?? now);
    const quiet = was?.quietSince !== undefined && now - was.quietSince >= quietMs;
    const escalates = c.severity === 'critical' && was?.severity === 'warning';
    if (c.sampled && c.severity && (!was || escalates)) {
      open.set(c.key, { severity: c.severity });
      changes.push({ kind: 'opened', condition: c });
    } else if (was && (quiet || c.recovered)) {
      open.delete(c.key);
      changes.push({ kind: 'closed', condition: c });
    }
  }
  return changes;
}

/** Test seam: forget samples and exclusions. */
export function resetSloStateForTests(): void {
  replies.length = 0;
  excluded.clear();
}
