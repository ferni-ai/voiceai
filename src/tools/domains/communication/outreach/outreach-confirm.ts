/**
 * Server-enforced confirmation for tools that text, call or email people.
 *
 * reachOut (and quickText/quickEmail, which hand off to it), multiOutreach and
 * sendBatchMessages act as soon as the model calls them, with text the model
 * wrote. sendBatchMessages' `confirm` is a flag the model sets itself, so
 * nothing guaranteed that the caller agreed.
 *
 * With OUTREACH_CONFIRM=on (off by default):
 * - The first call sends nothing. It stores a pending action for this session
 *   and user (the tool's arguments, 5-minute expiry) and returns a preview
 *   for Ferni to read back.
 * - The next call sends that stored action, and only that one, if the
 *   caller's first transcript after the preview reached the model is a clear
 *   yes, and no other tool output came in between. Only speech-to-text of
 *   the caller counts: tool output and model text are never read.
 * - Anything else (a no, a different request, another tool's output, expiry,
 *   no live session) leaves nothing sent, and the call stores a fresh preview.
 *
 * @module tools/domains/communication/outreach/outreach-confirm
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';

const log = getLogger();

export const CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 50;

export function isOutreachConfirmOn(): boolean {
  return process.env.OUTREACH_CONFIRM === 'on';
}

type SessionEvent =
  { kind: 'caller'; text: string; agentSpeaking: boolean } | { kind: 'tool'; callIds: string[] };
type ConfirmEvent = SessionEvent & { seq: number };

interface PendingAction {
  toolId: string;
  userId: string;
  args: unknown;
  callId: string;
  createdSeq: number;
  expiresAt: number;
}

interface SessionLog {
  seq: number;
  events: ConfirmEvent[];
  pending?: PendingAction;
}

/** Keyed by the AgentSession object, so a pending action never crosses sessions. */
const sessions = new WeakMap<object, SessionLog>();

function logFor(session: object): SessionLog {
  let entry = sessions.get(session);
  if (!entry) {
    entry = { seq: 0, events: [] };
    sessions.set(session, entry);
  }
  return entry;
}

function record(session: object, event: SessionEvent): void {
  const entry = logFor(session);
  entry.events.push({ ...event, seq: ++entry.seq });
  if (entry.events.length > MAX_EVENTS) entry.events.shift();
}

const YES_STARTS = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'ya',
  'sure',
  'ok',
  'okay',
  'correct',
  'absolutely',
  'definitely',
  'go ahead',
  'do it',
  'send it',
  'send them',
  'please do',
  'thats right',
  'sounds good',
  'please send',
];
const NEGATIONS = [
  'no',
  'nope',
  'nah',
  'not',
  'dont',
  'never',
  'wait',
  'stop',
  'cancel',
  'hold',
  'actually',
  'but',
  'change',
  'instead',
  'wrong',
];

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** A short, unhedged yes. Whole words only: "yesterday" is not "yes". */
export function isClearYes(text: string): boolean {
  const w = words(text);
  if (w.length === 0 || w.length > 6 || w.some((x) => NEGATIONS.includes(x))) return false;
  const joined = w.join(' ');
  return YES_STARTS.some((p) => joined === p || joined.startsWith(`${p} `));
}

const NOES = ['no', 'nope', 'nah', 'not', 'dont', 'never', 'wait', 'stop', 'cancel'];

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

interface SessionLike {
  agentState?: string;
}

/** Listeners for a live AgentSession: the caller's final transcripts and tool outputs. */
export function outreachConfirmListeners(session: SessionLike): {
  onTranscript: (event: unknown) => void;
  onToolsExecuted: (event: unknown) => void;
} {
  return {
    onTranscript: (event) => {
      const e = event as { transcript?: string; isFinal?: boolean };
      if (!e.isFinal || !e.transcript?.trim()) return;
      record(session, {
        kind: 'caller',
        text: e.transcript,
        agentSpeaking: session.agentState === 'speaking',
      });
    },
    onToolsExecuted: (event) => {
      const calls = (event as { functionCalls?: Array<{ callId?: string }> }).functionCalls ?? [];
      record(session, { kind: 'tool', callIds: calls.map((c) => c.callId ?? '') });
    },
  };
}

export interface ConfirmSpec {
  /** What the caller hears before saying yes: who, how, and what it says. */
  describe: (args: Record<string, unknown>) => string;
  /** The arguments the real tool runs with once the caller said yes. */
  confirmedArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
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
        if (!session || !ctx.userId) {
          log.warn({ toolId: def.id }, 'OUTREACH_CONFIRM: no live session, nothing sent');
          return 'Nothing was sent: I can only send this after the caller says yes on a call.';
        }
        const entry = logFor(session);
        const { pending } = entry;
        if (
          pending?.toolId === def.id &&
          pending.userId === ctx.userId &&
          confirmationState(pending, entry.events, Date.now()) === 'confirmed'
        ) {
          entry.pending = undefined; // taken before sending, so a second call can't repeat it
          log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: caller said yes, sending');
          const stored = pending.args as Record<string, unknown>;
          return execute(spec.confirmedArgs ? spec.confirmedArgs(stored) : stored, opts);
        }
        entry.pending = {
          toolId: def.id,
          userId: ctx.userId,
          args,
          callId: run?.toolCallId ?? '',
          createdSeq: entry.seq,
          expiresAt: Date.now() + CONFIRM_WINDOW_MS,
        };
        log.info({ toolId: def.id }, 'OUTREACH_CONFIRM: preview stored, waiting for caller');
        return (
          `NOT SENT YET. Read this back to the caller and ask if you should send it: ` +
          `${spec.describe(args)}. Call ${def.id} again only after the caller says yes.`
        );
      };
      return { ...tool, execute: gated } as Tool;
    },
  };
}
