/**
 * Server-enforced confirmation for every tool that calls, texts or emails
 * someone other than the account owner (see registry/outbound-gate.ts for the
 * list). ON by default; OUTBOUND_CONFIRM=off turns it off for tests only and
 * is ignored when NODE_ENV=production.
 * - The first call sends nothing. It fixes the words, channel, contact and
 *   address (outreach-confirm-specs.ts, telephony/call-confirm.ts), stores
 *   them for this session and user for 5 minutes, and returns the read-back.
 * - The next call for the same action sends that stored action once (a tool
 *   whose spec has `sameAction` may be another tool doing the same thing,
 *   e.g. callAndConverse after callOnBehalf's read-back of the same number),
 *   only if the caller's
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

import { flagOn } from '../../../../config/env-flag.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import { isSyntheticUserId } from '../../../../utils/synthetic-user.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';
import { dropConfirmThread, openConfirmThread, sentConfirmThread } from './confirm-thread.js';
import { consentClassifierOn } from './consent-judge.js';
import {
  cancel,
  forgetAsks,
  previewAllowed,
  unconfirmedReply,
  type AskRecord,
} from './consent-loop.js';
import { isClearNo, words } from './consent-words.js';
import { judgeWindow, windowState, type ConfirmState } from './consent-window.js';
import { serverConfirmOn, type Kin } from './outreach-confirm-family.js';
import {
  gateInFamily,
  settleThenSend,
  type ConfirmGate,
  type Execute,
} from './outreach-server-confirm.js';

const log = getLogger();

export { isClearNo, isClearYes } from './consent-words.js';
export type { ConfirmState } from './consent-window.js';

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
  | { kind: 'caller'; text: string; agentSpeaking: boolean }
  | { kind: 'tool'; callIds: string[] }
  | { kind: 'agent'; text: string }; // what Ferni said, only to find his read-backs
export type ConfirmEvent = SessionEvent & { seq: number };

export interface PendingAction {
  toolId: string;
  userId: string;
  spec: ConfirmSpec;
  readBack: string;
  args: Record<string, unknown>;
  callId: string;
  createdSeq: number;
  expiresAt: number;
  /** OUTREACH_SERVER_CONFIRM: who it reaches and how to send it as read back (outreach-confirm-family.ts). */
  server?: Kin & { readBack: string; send: () => Promise<unknown> };
  /** The owner's first name, lower-case, from the call's user data: a yes may address them. */
  owner?: string[];
  /** Ferni already asked once whether it is still wanted (consent-loop.ts). */
  asked?: boolean;
  /** The arguments the read-back was made from: a call with the same ones is the same request. */
  requested?: Record<string, unknown>;
}

export interface SessionLog {
  seq: number;
  events: ConfirmEvent[];
  pending?: PendingAction;
  speakerIsOwner?: () => boolean; // false: the person on the line is not the account owner
  // OUTREACH_SERVER_CONFIRM: the action last sent on a yes, the yes waiting to settle, and how
  // the model hears what the server did (the live call installs it).
  sent?: Kin & { readBack: string; expiresAt: number };
  settle?: ReturnType<typeof setTimeout>;
  note?: (text: string) => void;
  /** Read-backs per action in this request, so none loops (consent-loop.ts). */
  asks?: Map<string, AskRecord>;
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
  const { pending } = entry;
  if (event.kind !== 'caller' || !pending) return;
  // A no, a redirect or a deferral ends it at once: nothing Ferni says afterwards revives it.
  if (confirmationState(pending, entry.events, Date.now()) === 'declined')
    cancel(entry, pending, 'declined');
  // Judged now, in parallel with the model's reply, so the tool call rarely waits on it.
  else void judgeConfirmation(pending, entry.events);
}

/** The owner's first names, lower-case, from the tool run's user data (userName, name). */
function ownerFirstNames(opts: unknown): string[] {
  const data = (opts as { ctx?: { userData?: Record<string, unknown> } } | undefined)?.ctx
    ?.userData;
  const names = [data?.userName, data?.name].filter((n): n is string => typeof n === 'string');
  return [...new Set(names.flatMap((n) => words(n).slice(0, 1)))];
}

/**
 * Where a pending action stands, given what happened in the session since it was stored
 * (consent-window.ts): the owner's words after Ferni's latest read-back, judged by the fast path
 * or, once it has answered, the consent judge. 'unclear' asks once; 'declined' cancels.
 */
export function confirmationState(
  pending: PendingAction,
  events: ConfirmEvent[],
  now: number
): ConfirmState {
  return windowState(pending, events, now);
}

/** confirmationState after the consent judge has read the answer, if it needed to. */
export async function judgeConfirmation(
  pending: PendingAction,
  events: ConfirmEvent[]
): Promise<ConfirmState> {
  await judgeWindow(pending, events, consentClassifierOn());
  return confirmationState(pending, events, Date.now());
}

/**
 * The turn note after the caller's yes to a read-back: the action goes only when the model calls
 * the tool, so it must call it now. Owner call 2026-10-18: a fourth yes got "I'm on it" and no call.
 */
export function confirmedActionNote(session: object): string {
  const entry = sessions.get(session);
  const pending = entry?.pending;
  if (!pending || speakerIsNotOwner(session)) return '';
  if (confirmationState(pending, entry.events, Date.now()) !== 'confirmed') return '';
  return (
    `The caller just said yes to ${pending.readBack}. Call ${pending.toolId} now with the same ` +
    `details. Don't ask again, and don't say it's done before the tool says so.`
  );
}

/** The same request, word for word: anything changed (who, what, how) is read back afresh. */
const sorted = (v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sorted((v as Record<string, unknown>)[k])])
      )
    : v;
const sameRequest = (a: unknown, b: unknown): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** Whether this call carries on the stored action: the same tool, or `sameAction` says so. */
function continues(
  pending: PendingAction,
  toolId: string,
  spec: ConfirmSpec,
  args: Record<string, unknown>
): boolean {
  if (!spec.sameAction) return pending.toolId === toolId;
  return pending.spec === spec && spec.sameAction(pending.args, args);
}

/**
 * Listeners for a live AgentSession: the caller's final transcripts and tool
 * outputs. If `speakerIsOwner` returns false, no reply on this call confirms.
 * `note` tells the model what the server sent on a yes (OUTREACH_SERVER_CONFIRM).
 */
export function outreachConfirmListeners(
  session: { agentState?: string },
  speakerIsOwner?: () => boolean,
  note?: (text: string) => void
) {
  if (speakerIsOwner) logFor(session).speakerIsOwner = speakerIsOwner;
  if (note) logFor(session).note = note;
  return {
    onTranscript: (event: unknown) => {
      const e = event as { transcript?: string; isFinal?: boolean };
      if (!e.isFinal || !e.transcript?.trim()) return;
      const agentSpeaking = session.agentState === 'speaking';
      record(session, { kind: 'caller', text: e.transcript, agentSpeaking });
      if (serverConfirmOn()) settleThenSend(serverGate, session, logFor(session));
    },
    onToolsExecuted: (event: unknown) => {
      const calls = (event as { functionCalls?: Array<{ callId?: string }> }).functionCalls ?? [];
      record(session, { kind: 'tool', callIds: calls.map((c) => c.callId ?? '') });
    },
    /** Ferni's own words (conversation_item_added), read only to find where he asked again. */
    onItemAdded: (event: unknown) => {
      const item = (event as { item?: { role?: string; type?: string; textContent?: string } })
        ?.item;
      if (item?.role !== 'assistant' || (item.type && item.type !== 'message')) return;
      if (item.textContent?.trim()) record(session, { kind: 'agent', text: item.textContent });
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
  /**
   * Whether a call (to any tool with this spec) is the action read back, `stored` being the
   * prepared args. Omitted: only the same tool is. The stored args are what run, so tools sharing
   * a spec with `sameAction` must take the same args (callOnBehalf, callAndConverse).
   */
  sameAction?: (stored: Record<string, unknown>, next: Record<string, unknown>) => boolean;
}

/** What OUTREACH_SERVER_CONFIRM's half (outreach-server-confirm.ts) borrows from this gate. */
const serverGate: ConfirmGate = {
  confirmationState,
  ownerKnown,
  isClearNo,
  ownerFirstNames,
  windowMs: CONFIRM_WINDOW_MS,
  planOnly: PLAN_ONLY,
  planned: PLANNED,
};
const CALL_CHANNELS = ['call', 'voicemail', 'conversation'];

/**
 * MESSAGING_PIPELINE: the owner's yes to a planned text or call is their
 * attestation that the contact is happy to hear from Ferni on that channel,
 * recorded only for a friends-and-family owner (consent-grants.ts).
 */
async function attestOnConfirm(userId: string, args: Record<string, unknown>): Promise<void> {
  const planned = (args as { [PLANNED]?: Planned })[PLANNED];
  if (!planned?.to || planned.channel === 'email') return;
  if (!flagOn('MESSAGING_PIPELINE')) return;
  const { recordOwnerAttestation } = await import('../../../../utils/consent-port.js');
  const channel = CALL_CHANNELS.includes(planned.channel) ? 'call' : 'sms';
  await recordOwnerAttestation(planned.to, channel, userId);
}

/** Wrap an outbound tool so it acts only on a caller's yes (see the module comment). */
export function withOutreachConfirmation(def: ToolDefinition, spec: ConfirmSpec): ToolDefinition {
  if ((def as unknown as Record<symbol, unknown>)[GATED]) return def;
  const gatedDef: ToolDefinition = {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const gate = { gate: serverGate, toolId: def.id, spec, execute };
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
        if (serverConfirmOn())
          return gateInFamily({ ...gate, session, entry, args, opts, callId, userId: ctx.userId });
        const { pending } = entry;
        if (pending && continues(pending, def.id, spec, args) && pending.userId === ctx.userId) {
          const state = await judgeConfirmation(pending, entry.events);
          // A call racing this one took it (or replaced it) while the judge read the answer.
          if (entry.pending !== pending)
            return 'Nothing more to do here: that was already handled.';
          if (state === 'confirmed') {
            entry.pending = undefined; // taken before sending, so a second call can't repeat it
            forgetAsks(entry, pending);
            log.info(
              { toolId: def.id, previewedBy: pending.toolId },
              'OUTREACH_CONFIRM: caller said yes, sending'
            );
            await attestOnConfirm(ctx.userId, pending.args);
            return sentConfirmThread(pending, execute(pending.args, opts));
          }
          const same = sameRequest(pending.requested, args);
          const expiresAt = Date.now() + CONFIRM_WINDOW_MS;
          const reply = unconfirmedReply(entry, pending, state, { callId, same, expiresAt });
          if (reply !== undefined) return reply;
        }
        if (entry.pending) dropConfirmThread(entry.pending); // replaced or discarded, never sent
        entry.pending = undefined;
        const prepared = await spec.prepare(args, ctx.userId, async (a) =>
          execute({ ...a, [PLAN_ONLY]: true }, opts)
        );
        if (typeof prepared === 'string') return prepared;
        const action = { toolId: def.id, args: prepared.args, readBack: prepared.readBack };
        const enough = previewAllowed(entry, action);
        if (enough !== undefined) return enough;
        entry.pending = {
          toolId: def.id,
          userId: ctx.userId,
          spec,
          readBack: prepared.readBack,
          args: prepared.args,
          requested: args,
          callId,
          createdSeq: entry.seq,
          expiresAt: Date.now() + CONFIRM_WINDOW_MS,
          owner: ownerFirstNames(opts),
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
