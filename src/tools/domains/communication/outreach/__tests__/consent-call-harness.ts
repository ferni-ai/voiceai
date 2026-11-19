/**
 * The live call gate that the consent tests drive: the real withOutreachConfirmation and its
 * transcript and conversation listeners, around a stand-in callOnBehalf that records what it would
 * have sent. Shared by outreach-consent-v2.test.ts and outreach-refusal-and-split-crisis.test.ts.
 */

import type { ToolDefinition } from '../../../../registry/types.js';
import type { ConsentAsk } from '../consent-judge.js';
import {
  outreachConfirmListeners,
  PLAN_ONLY,
  withOutreachConfirmation,
  type ConfirmSpec,
} from '../outreach-confirm.js';

export const DAD = '+15551230002';
export const sends: Array<Record<string, unknown>> = [];

const def = (id: string): ToolDefinition => ({
  id,
  name: id,
  description: 'reach someone',
  domain: 'communication',
  create: () => {
    const tool = {
      execute: async (args: Record<string, unknown>) => {
        if (PLAN_ONLY in args) return 'plan';
        sends.push(args);
        return 'Calling Dad now.';
      },
    };
    return tool as never;
  },
});
const spec = (what: string): ConfirmSpec => ({
  prepare: async (args) => ({
    args: { ...args, phoneNumber: DAD },
    readBack: `${what} to Dad at 555-123-0002, right now`,
  }),
});

interface Gated {
  execute: (a: unknown, o: unknown) => Promise<unknown>;
}

/** One call's gate, driven turn by turn. */
export interface LiveCall {
  session: { agentState: string };
  /** The model calls the tool; its output then reaches the model. */
  call: (callId: string, args?: Record<string, unknown>) => Promise<string>;
  owner: (text: string) => void;
  /** The owner speaks over Ferni. */
  ownerOver: (text: string) => void;
  ferni: (text: string) => void;
  /** Another tool's output reaches the model; with no name it counts as outbound. */
  otherTool: (callId: string, name?: string) => void;
  /** Ferni starts speaking (agent_state_changed), e.g. the read-back starts playing; `at` is the
   * event's createdAt. */
  speaks: (at?: number) => void;
  /** The owner starts speaking (user_state_changed); their final lands later. */
  ownerStarts: (at?: number) => void;
  /** Another gated tool on the same call (e.g. sendTextMessage), called by the model. */
  callOther: (toolId: string, callId: string, args?: Record<string, unknown>) => Promise<string>;
}

export function liveCall(toolId = 'callOnBehalf', what = 'a call'): LiveCall {
  const session = { agentState: 'listening' };
  const on = outreachConfirmListeners(session, () => true);
  const gated = (id: string, kind: string): Gated =>
    withOutreachConfirmation(def(id), spec(kind)).create({
      userId: 'owner-1',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    }) as Gated;
  const tools = new Map([[toolId, gated(toolId, what)]]);
  const run = async (
    id: string,
    callId: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    if (!tools.has(id)) tools.set(id, gated(id, 'a text'));
    const out = await tools.get(id)?.execute(args, { ctx: { session }, toolCallId: callId });
    on.onToolsExecuted({ functionCalls: [{ callId }] });
    return String(out);
  };
  return {
    session,
    call: async (callId: string, args: Record<string, unknown> = { contactQuery: 'my dad' }) =>
      run(toolId, callId, args),
    callOther: async (id, callId, args = { contactQuery: 'my dad' }) => run(id, callId, args),
    owner: (text: string) => on.onTranscript({ transcript: text, isFinal: true }),
    ownerOver: (text: string) => {
      session.agentState = 'speaking';
      on.onTranscript({ transcript: text, isFinal: true });
      session.agentState = 'listening';
    },
    ferni: (text: string) =>
      on.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }),
    otherTool: (callId: string, name?: string) =>
      on.onToolsExecuted({ functionCalls: [{ callId, name }] }),
    speaks: (at?: number) => on.onAgentState({ newState: 'speaking', createdAt: at }),
    ownerStarts: (at?: number) => on.onUserState({ newState: 'speaking', createdAt: at }),
  };
}

/** A judge that reads the window the way the prompt asks, deterministically. */
export const fairJudge: ConsentAsk = async (_system, input) => {
  const said = input.split("Owner's reply, in order:")[1].toLowerCase();
  const textWaiting = input.startsWith('Read-back: a text');
  if (/\b(call (you|me|us)|check in with me|instead|later|tomorrow|her\b|mom)/.test(said))
    return '{"verdict":"unclear","reason":"redirect"}';
  if (textWaiting && /\bcall\b/.test(said)) return '{"verdict":"unclear","reason":"other_channel"}';
  if (/\b(no|don't|not)\b/.test(said)) return '{"verdict":"no","reason":"declined"}';
  if (/\b(yes|yeah|yep|okay|sure)\b/.test(said)) return '{"verdict":"yes","reason":"agreed"}';
  return '{"verdict":"unclear","reason":"off_topic"}';
};
export const alwaysYes: ConsentAsk = async () => '{"verdict":"yes","reason":"agreed"}';

/** Ferni's turn classifier stubbed to always say read-back: only the vetoes take it away. */
export const alwaysReadBack: ConsentAsk = async () => '{"kind":"readback"}';
