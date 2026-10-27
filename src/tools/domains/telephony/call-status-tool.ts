/**
 * callStatus: "did you call my dad?" answered from the owner's own records,
 * never with a new call; and that status told before callOnBehalf reads back
 * another call to someone just called (call-confirm.ts). Owner call 2026-10-26
 * 21:46 UTC: asked "Did you call my dad?", Ferni ran callOnBehalf and read back
 * a fresh call. Read-only, for the owner proven on the live call only.
 *
 * Tools (L3) may not import outreach (L4), so the live call installs the
 * records side (services/outreach/call-recall.ts). Not installed: "can't check".
 * The tool definition is in index.ts.
 *
 * @module tools/domains/telephony/call-status-tool
 */

import {
  CONFIRM_WINDOW_MS,
  ownerKnown,
  pendingFor,
} from '../communication/outreach/outreach-confirm.js';
import { getConfirmThreadPort } from '../communication/outreach/confirm-thread.js';
import { liveSessionFor } from '../../registry/live-session.js';

export interface CallQuery {
  /** Person words ("dad", "sam"), as call-status names them. */
  readonly words: readonly string[];
  readonly phone?: string;
}
/** A read-back waiting on the owner's yes: who, and when. */
export interface SeenCall {
  readonly name: string;
  readonly phone?: string;
  readonly at: number;
}
export interface RecalledCall {
  readonly state: 'awaiting_yes' | 'set' | 'in_progress' | 'done' | 'failed';
  readonly name: string;
  readonly at: number;
  /** 'set': when it rings, their time. 'done': how it went. 'failed': why. */
  readonly detail?: string;
  /** Screened: what they said or a summary of it; reported speech only. */
  readonly said?: string;
}
export type Recalled = RecalledCall | undefined | 'unread';

/** The records side, installed by the live call (call-recall.ts installCallRecallPort). */
export interface CallRecallPort {
  enabled: () => boolean;
  mayRecall: (userId: string | undefined) => boolean;
  queryWords: (text: string) => string[];
  recall: (userId: string, q: CallQuery, awaiting: SeenCall[], now: number) => Promise<Recalled>;
  line: (call: Recalled, who: string, now: number) => string;
  blocksNewCall: (call: RecalledCall, now: number) => boolean;
  windowMs: number;
}
let port: CallRecallPort | undefined;
export function setCallRecallPort(next: CallRecallPort | undefined): void {
  port = next;
}

const CALL_TOOLS = new Set(['callOnBehalf', 'callAndConverse']);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Read-backs of a call waiting on a yes: this session's, and kept ones at least `minAgeMs` old. */
async function awaitingFor(
  p: CallRecallPort,
  userId: string,
  session: object | undefined,
  now: number,
  minAgeMs = 0
): Promise<SeenCall[]> {
  const out: SeenCall[] = [];
  const pending = pendingFor(session);
  if (pending && pending.userId === userId && CALL_TOOLS.has(pending.toolId)) {
    const { contactQuery, phoneNumber } = pending.args;
    const at = pending.expiresAt - CONFIRM_WINDOW_MS;
    out.push({ name: text(contactQuery), phone: text(phoneNumber), at });
  }
  try {
    const live = (await getConfirmThreadPort()?.store()?.live(userId)) ?? [];
    for (const f of live) {
      const at = Date.parse(f.createdAt);
      if (f.source.store !== 'outreach_confirm' || f.action?.waitingOn !== 'you') continue;
      const age = now - at;
      if (CALL_TOOLS.has(f.action.tool) && age >= minAgeMs && age <= p.windowMs)
        out.push({ name: f.text, at });
    }
  } catch {
    // No kept read-backs readable: this session's is still counted.
  }
  return out;
}

/** The person words and number for who they mean, resolved through their contacts when possible. */
async function queryFor(p: CallRecallPort, userId: string, who: string): Promise<CallQuery> {
  const words = p.queryWords(who);
  try {
    const { findContact } = await import('./call-on-behalf.js');
    const found = await findContact(who, userId);
    if (found && !('ask' in found)) {
      const more = p.queryWords(`${found.name ?? ''} ${found.relationship ?? ''}`);
      return { words: [...new Set([...words, ...more])], phone: found.phone };
    }
  } catch {
    // Unresolved: the words alone.
  }
  return { words };
}

/** The records side, when it may be read: installed, on, a verified uid, the owner proven on the call. */
function portFor(userId: string | undefined, session: object | undefined): CallRecallPort | null {
  const p = port;
  if (!p?.enabled() || !p.mayRecall(userId) || !ownerKnown(session)) return null;
  return p;
}

export const NOT_THE_OWNER =
  'Nothing to report: only the account owner can ask about calls Ferni made for them.';

/**
 * What callStatus answers. `session` is the live call's AgentSession, or its id
 * (the executor path): no session, or a speaker not proven the owner, is a no.
 * Never throws, never calls anyone.
 */
export async function callStatusReply(
  userId: string | undefined,
  who: string,
  session?: object | string,
  now = Date.now()
): Promise<string> {
  if (!port?.enabled()) return "I can't check on calls from here right now.";
  const live = typeof session === 'string' ? liveSessionFor(session) : session;
  const p = portFor(userId, live);
  if (!p || !userId) return NOT_THE_OWNER;
  const person = who.trim();
  if (!person) return 'Ask the caller who they mean.';
  const q = await queryFor(p, userId, person);
  const call = await p.recall(userId, q, await awaitingFor(p, userId, live, now), now);
  return p.line(call, person, now);
}

const TOLD_MS = 10 * 60 * 1000;
const told = new Map<string, number>();

/**
 * Before callOnBehalf reads back a call: the status of one to this person in the
 * last two days (read back on an earlier call with no yes, under way, or done), told
 * once; a request within 10 minutes after reads back as usual. Undefined: read
 * back as before. A read-back on this call is the confirm gate's own.
 */
export async function statusBeforeReadBack(
  userId: string,
  phone: string,
  name: string,
  session: object | undefined,
  now = Date.now()
): Promise<string | undefined> {
  const p = portFor(userId, session);
  if (!p) return undefined;
  const key = `${userId}|${phone}`;
  if ((told.get(key) ?? 0) > now) {
    told.delete(key);
    return undefined;
  }
  const kept = await awaitingFor(p, userId, undefined, now, CONFIRM_WINDOW_MS);
  const call = await p.recall(userId, { words: p.queryWords(name), phone }, kept, now);
  if (!call || call === 'unread' || !p.blocksNewCall(call, now)) return undefined;
  told.set(key, now + TOLD_MS);
  if (told.size > 500) told.delete(told.keys().next().value as string);
  return (
    `Nothing new was read back. ${p.line(call, name, now)}\n` +
    `If the caller was asking for another call (not asking whether you called), call callOnBehalf ` +
    `again now and read back what it returns.`
  );
}
