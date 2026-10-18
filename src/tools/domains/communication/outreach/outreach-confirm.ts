/**
 * Server-enforced confirmation for every tool that calls, texts or emails
 * someone other than the account owner (see registry/outbound-gate.ts for the
 * list). ON by default; OUTBOUND_CONFIRM=off turns it off for tests only and
 * is ignored when NODE_ENV=production.
 * - The first call sends nothing. It fixes the words, channel, contact and
 *   address (outreach-confirm-specs.ts, telephony/call-confirm.ts), stores
 *   them for this session and user for 5 minutes, and returns the read-back.
 * - The next call sends that stored action once, only if the caller's
 *   speech-to-text turns after the preview, read together, are a plain yes
 *   with no other tool output in between ("Yeah, go ahead." then "Go ahead and
 *   give her a call." is one answer split in two). Tool output and model text
 *   are never read.
 * - Anything else (a no, a question, another tool's output, expiry, no live
 *   call, a speaker not proven to be the account owner) sends nothing.
 * - Test accounts (voice-eval-*, e2e-*) never reach anyone, flag or no flag.
 *
 * multiOutreach and sendBatchMessages send nothing yet (their read-back is a
 * follow-up). In-app chat has no transcript, so these tools send nothing there.
 *
 * @module tools/domains/communication/outreach/outreach-confirm
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { isSyntheticUserId } from '../../../../utils/synthetic-user.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';
import { dropConfirmThread, openConfirmThread, sentConfirmThread } from './confirm-thread.js';

const log = getLogger();

export const CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 50;

/** Arguments marker: run the tool's planning only and return the plan (reachOut). */
export const PLAN_ONLY = Symbol('outreach-plan-only');
/** Arguments marker on a confirmed send: send to exactly this, as read back (reachOut). */
export const PLANNED = Symbol('outreach-planned');
export interface Planned {
  contactId: string;
  to: string;
  channel: string;
}

/** On unless OUTBOUND_CONFIRM=off outside production (the escape hatch is for tests). */
export function isOutreachConfirmOn(): boolean {
  if (process.env.OUTBOUND_CONFIRM !== 'off') return true;
  if (process.env.NODE_ENV !== 'production') return false;
  log.warn('OUTBOUND_CONFIRM=off is ignored in production');
  return true;
}

/** What a gated tool says for a test account, which never reaches a real person. */
export function testAccountReply(toolId: string): string {
  return `Nothing was sent: this is a test account, so ${toolId} never calls, texts or emails anyone.`;
}

/** Marks a definition already wrapped, so wrapping it again (e.g. at registration) is a no-op. */
const GATED = Symbol.for('ferni.outbound-confirm');

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

/** Whether the person on this call is known not to be the account owner (outreachConfirmListeners). */
export function speakerIsNotOwner(session: object): boolean {
  return sessions.get(session)?.speakerIsOwner?.() === false;
}

/**
 * Whether the person on this call is known to be the account owner. Unknown is
 * false: no session, or no owner check registered (a session built without
 * outreachConfirmListeners, or OUTBOUND_CONFIRM=off outside production).
 */
export function ownerKnown(session: object | undefined): boolean {
  return session !== undefined && sessions.get(session)?.speakerIsOwner?.() === true;
}

function record(session: object, event: SessionEvent): void {
  const entry = logFor(session);
  entry.events.push({ ...event, seq: ++entry.seq });
  if (entry.events.length > MAX_EVENTS) entry.events.shift();
  if (event.kind === 'caller' && entry.pending && isClearNo(event.text))
    dropConfirmThread(entry.pending);
}

// Replies made only of these count as a yes. Longest first, so "yes please" beats "yes".
const YES_PHRASES = [
  ...'go ahead|do it|send it|send them|please do|please send|thats right|sounds good'.split('|'),
  ...'call them|call her|call him|make the call'.split('|'),
  ...'yes yeah yep yup ya sure ok okay correct absolutely definitely'.split(' '),
];
// Words a yes may carry that add nothing to send: a name for whoever is speaking, a filler, or an
// echo of the question ("Should I call her?" "Yes, she should."). Never a yes on their own.
// Owner calls 10-14..10-16 placed nothing on "Go ahead, Ferni." and "Yes, she should."
// Owner call 10-17 placed nothing on "Uh, yeah, go ahead. Go ahead and give her a call." and
// "Yes, you, you need to call her.": a yes may restate the same action, never add to it.
const FILLERS = [
  ...'thank you|that works|you can|for sure|of course'.split('|'),
  ...'give her a call|give him a call|give them a call|you need to|need to|right now'.split('|'),
  ...'and you now'.split(' '),
  ...'she should|he should|they should|you should|she can|he can|they can'.split('|'),
  ...'please thanks ferni fern maya jordan peter alex nayan buddy bud man dude pal um uh oh hey'.split(
    ' '
  ),
];
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
  // Speech-to-text may cut one answer into several finals; they are judged as one reply.
  const answer: string[] = [];
  for (const e of after) {
    if (e.kind === 'tool') {
      // The preview's own output reaching the model is expected once; any other output voids it.
      if (!delivered && e.callIds.length > 0 && e.callIds.every((id) => id === pending.callId)) {
        delivered = true;
        continue;
      }
      return 'void';
    }
    if (isClearNo(e.text)) return 'void';
    // Words before the preview was read are not the answer.
    if (!delivered) continue;
    // Words over Ferni are not the answer, and once the answer has begun they void it.
    if (e.agentSpeaking) {
      if (answer.length > 0) return 'void';
      continue;
    }
    answer.push(e.text);
  }
  if (answer.length === 0) return 'waiting';
  // Every part must be a yes phrase or a filler: "Yes." then "Call Bob instead." is not a yes.
  return isClearYes(answer.join(' ')) ? 'confirmed' : 'void';
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
  /** Whether these arguments reach anyone (e.g. a post, not a draft); omitted means always. */
  applies?: (args: Record<string, unknown>) => boolean;
  /**
   * Fix the exact args to send and the read-back, without sending (`plan`
   * runs the tool with PLAN_ONLY). A string answers without storing anything.
   */
  prepare: (
    args: Record<string, unknown>,
    userId: string,
    plan: (args: Record<string, unknown>) => Promise<unknown>
  ) => Promise<{ args: Record<string, unknown>; readBack: string } | string>;
}

/** Wrap an outbound tool so it acts only on a caller's yes (see the module comment). */
export function withOutreachConfirmation(def: ToolDefinition, spec: ConfirmSpec): ToolDefinition {
  if ((def as unknown as Record<symbol, unknown>)[GATED]) return def;
  const gatedDef: ToolDefinition = {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (a: unknown, o?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const gated = async (args: Record<string, unknown>, opts?: unknown): Promise<unknown> => {
        if (spec.applies && !spec.applies(args)) return execute(args, opts);
        if (isSyntheticUserId(ctx.userId)) {
          log.info({ toolId: def.id }, 'OUTBOUND_CONFIRM: test account, nothing sent');
          return testAccountReply(def.id);
        }
        if (!isOutreachConfirmOn()) return execute(args, opts);
        const run = opts as { ctx?: { session?: object }; toolCallId?: string } | undefined;
        const session = run?.ctx?.session;
        const callId = run?.toolCallId;
        if (!session || !ctx.userId || !callId) {
          log.warn({ toolId: def.id }, 'OUTREACH_CONFIRM: no live session, nothing sent');
          return 'Nothing was sent: I can only send this after the caller says yes on a call.';
        }
        const entry = logFor(session);
        if (speakerIsNotOwner(session)) {
          log.warn({ toolId: def.id }, 'OUTREACH_CONFIRM: speaker is not the owner, nothing sent');
          return "Nothing was sent: only the account owner can confirm this, and they aren't on the line.";
        }
        const { pending } = entry;
        if (
          pending?.toolId === def.id &&
          pending.userId === ctx.userId &&
          confirmationState(pending, entry.events, Date.now()) === 'confirmed'
        ) {
          entry.pending = undefined; // taken before sending, so a second call can't repeat it
          log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: caller said yes, sending');
          return sentConfirmThread(pending, execute(pending.args, opts));
        }
        if (entry.pending) dropConfirmThread(entry.pending); // replaced or discarded, never sent
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
        };
        openConfirmThread(entry.pending, {
          userId: ctx.userId,
          toolId: def.id,
          args: prepared.args,
          planned: (prepared.args as { [PLANNED]?: Planned })[PLANNED],
          ownerVerified: ownerKnown(session),
        });
        log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: preview stored, waiting for caller');
        return (
          `NOT SENT YET. Read this to the caller word for word and ask if you should go ahead: ` +
          `${prepared.readBack}. Call ${def.id} again only after the caller says yes.`
        );
      };
      return { ...tool, execute: gated } as Tool;
    },
  };
  (gatedDef as unknown as Record<symbol, unknown>)[GATED] = true;
  return gatedDef;
}
