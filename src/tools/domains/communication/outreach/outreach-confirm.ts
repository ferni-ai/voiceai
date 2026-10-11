/**
 * Server-enforced confirmation for reachOut (and quickText/quickEmail, which
 * hand off to it), multiOutreach and sendBatchMessages, which otherwise send
 * at once with model-written text. With OUTREACH_CONFIRM=on (off by default):
 * - The first call sends nothing. It fixes what would be sent (the exact words
 *   and channel; see outreach-confirm-specs.ts), stores it for this session
 *   and user for 5 minutes, and returns the read-back.
 * - The next call sends that stored action once, only if the caller's first
 *   speech-to-text turn after the preview is a plain yes with no other tool
 *   output in between. Tool output and model text are never read.
 * - Anything else (a no, a question, another tool's output, expiry, no live
 *   call, a speaker who isn't the account owner) sends nothing.
 *
 * NOT covered yet: calls by callOnBehalf and callAndConverse (telephony) dial
 * with no confirmation; that is a follow-up, and the flag stays off until then.
 * In-app chat has no transcript, so these tools send nothing there.
 *
 * @module tools/domains/communication/outreach/outreach-confirm
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';

const log = getLogger();

export const CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 50;

/** Arguments marker: run the tool's planning only and return the plan (reachOut). */
export const PLAN_ONLY = Symbol('outreach-plan-only');

export function isOutreachConfirmOn(): boolean {
  return process.env.OUTREACH_CONFIRM === 'on';
}

type SessionEvent =
  { kind: 'caller'; text: string; agentSpeaking: boolean } | { kind: 'tool'; callIds: string[] };
type ConfirmEvent = SessionEvent & { seq: number };

interface PendingAction {
  toolId: string;
  userId: string;
  args: Record<string, unknown>;
  callId: string;
  createdSeq: number;
  expiresAt: number;
  binding: readonly unknown[]; // spec.binding() at preview time
}

interface SessionLog {
  seq: number;
  events: ConfirmEvent[];
  pending?: PendingAction;
  speakerIsOwner?: () => boolean; // false: the person on the line is not the account owner
}

/** Keyed by the AgentSession object, so a pending action never crosses sessions. */
const sessions = new WeakMap<object, SessionLog>();

function logFor(session: object): SessionLog {
  const entry = sessions.get(session) ?? { seq: 0, events: [] };
  sessions.set(session, entry);
  return entry;
}

function record(session: object, event: SessionEvent): void {
  const entry = logFor(session);
  entry.events.push({ ...event, seq: ++entry.seq });
  if (entry.events.length > MAX_EVENTS) entry.events.shift();
}

// Replies made only of these count as a yes. Longest first, so "yes please" beats "yes".
const YES_PHRASES = [
  ...'go ahead|do it|send it|send them|please do|please send|thats right|sounds good'.split('|'),
  ...'yes yeah yep yup ya sure ok okay correct absolutely definitely'.split(' '),
];
const FILLERS = ['thank you', 'please', 'thanks'];
const NOES = 'no nope nah not dont never wait stop cancel'.split(' ');

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z]+/g) ?? [];

/** A reply made only of yes phrases (and please/thanks); never with a "?" or "Sure, to Bob". */
export function isClearYes(text: string): boolean {
  let w = words(text);
  // A question word is never a yes phrase, so "which one, yes" already fails below.
  if (text.includes('?') || w.length === 0) return false;
  let sawYes = false;
  while (w.length > 0) {
    const rest = w;
    const phrase = [...YES_PHRASES, ...FILLERS].find((p) =>
      p.split(' ').every((part, i) => rest[i] === part)
    );
    if (!phrase) return false;
    sawYes ||= YES_PHRASES.includes(phrase);
    w = w.slice(phrase.split(' ').length);
  }
  return sawYes;
}

export function isClearNo(text: string): boolean {
  return words(text).some((x) => NOES.includes(x));
}

/** Where a pending action stands, given what happened in the session since it was stored. */
export function confirmationState(
  pending: PendingAction,
  events: ConfirmEvent[],
  now: number
): 'confirmed' | 'waiting' | 'void' {
  if (now > pending.expiresAt) return 'void';
  const after = events.filter((e) => e.seq > pending.createdSeq);
  let delivered = false;
  for (let i = 0; i < after.length; i++) {
    const e = after[i];
    if (e.kind === 'tool') {
      // The preview's own output reaching the model is expected once; any other output voids it.
      if (!delivered && e.callIds.length > 0 && e.callIds.every((id) => id === pending.callId)) {
        delivered = true;
        continue;
      }
      return 'void';
    }
    if (isClearNo(e.text)) return 'void';
    // Words before the preview was read, or over Ferni reading it, are not the answer.
    if (!delivered || e.agentSpeaking) continue;
    return isClearYes(e.text) && i === after.length - 1 ? 'confirmed' : 'void';
  }
  return 'waiting';
}

/**
 * Listeners for a live AgentSession: the caller's final transcripts and tool
 * outputs. If `speakerIsOwner` returns false, no reply on this call confirms.
 */
export function outreachConfirmListeners(
  session: { agentState?: string },
  speakerIsOwner?: () => boolean
) {
  if (speakerIsOwner) logFor(session).speakerIsOwner = speakerIsOwner;
  return {
    onTranscript: (event: unknown) => {
      const e = event as { transcript?: string; isFinal?: boolean };
      if (!e.isFinal || !e.transcript?.trim()) return;
      const agentSpeaking = session.agentState === 'speaking';
      record(session, { kind: 'caller', text: e.transcript, agentSpeaking });
    },
    onToolsExecuted: (event: unknown) => {
      const calls = (event as { functionCalls?: Array<{ callId?: string }> }).functionCalls ?? [];
      record(session, { kind: 'tool', callIds: calls.map((c) => c.callId ?? '') });
    },
  };
}

export interface ConfirmSpec {
  /**
   * Fix the exact args to send and the read-back, without sending (`plan`
   * runs the tool with PLAN_ONLY). A string answers without storing anything.
   */
  prepare: (
    args: Record<string, unknown>,
    userId: string,
    plan: (args: Record<string, unknown>) => Promise<unknown>
  ) => Promise<{ args: Record<string, unknown>; readBack: string } | string>;
  /** State the send reads besides its args; a yes holds only if it is unchanged (by reference). */
  binding?: (userId: string) => readonly unknown[];
}

function sameBinding(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/** Wrap an outreach tool so that, with OUTREACH_CONFIRM=on, it acts only on a caller's yes. */
export function withOutreachConfirmation(def: ToolDefinition, spec: ConfirmSpec): ToolDefinition {
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (a: unknown, o?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const gated = async (args: Record<string, unknown>, opts?: unknown): Promise<unknown> => {
        if (!isOutreachConfirmOn()) return execute(args, opts);
        const run = opts as { ctx?: { session?: object }; toolCallId?: string } | undefined;
        const session = run?.ctx?.session;
        const callId = run?.toolCallId;
        if (!session || !ctx.userId || !callId) {
          log.warn({ toolId: def.id }, 'OUTREACH_CONFIRM: no live session, nothing sent');
          return 'Nothing was sent: I can only send this after the caller says yes on a call.';
        }
        const entry = logFor(session);
        if (entry.speakerIsOwner?.() === false) {
          log.warn({ toolId: def.id }, 'OUTREACH_CONFIRM: speaker is not the owner, nothing sent');
          return "Nothing was sent: only the account owner can confirm this, and they aren't on the line.";
        }
        const { pending } = entry;
        if (
          pending?.toolId === def.id &&
          pending.userId === ctx.userId &&
          confirmationState(pending, entry.events, Date.now()) === 'confirmed' &&
          sameBinding(pending.binding, spec.binding?.(ctx.userId) ?? [])
        ) {
          entry.pending = undefined; // taken before sending, so a second call can't repeat it
          log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: caller said yes, sending');
          return execute(pending.args, opts);
        }
        entry.pending = undefined;
        const prepared = await spec.prepare(args, ctx.userId, async (a) =>
          execute({ ...a, [PLAN_ONLY]: true }, opts)
        );
        if (typeof prepared === 'string') return prepared;
        entry.pending = {
          toolId: def.id,
          userId: ctx.userId,
          args: prepared.args,
          callId,
          createdSeq: entry.seq,
          expiresAt: Date.now() + CONFIRM_WINDOW_MS,
          binding: spec.binding?.(ctx.userId) ?? [],
        };
        log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: preview stored, waiting for caller');
        return (
          `NOT SENT YET. Read this to the caller word for word and ask if you should send it: ` +
          `${prepared.readBack}. Call ${def.id} again only after the caller says yes.`
        );
      };
      return { ...tool, execute: gated } as Tool;
    },
  };
}
