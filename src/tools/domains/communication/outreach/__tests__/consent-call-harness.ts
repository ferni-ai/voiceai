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

/** One call's gate, driven turn by turn. */
export interface LiveCall {
  session: { agentState: string };
  /** The model calls the tool; its output then reaches the model. */
  call: (callId: string, args?: Record<string, unknown>) => Promise<string>;
  owner: (text: string) => void;
  /** The owner speaks over Ferni. */
  ownerOver: (text: string) => void;
  ferni: (text: string) => void;
  otherTool: (callId: string) => void;
}

export function liveCall(toolId = 'callOnBehalf', what = 'a call'): LiveCall {
  const session = { agentState: 'listening' };
  const on = outreachConfirmListeners(session, () => true);
  const tool = withOutreachConfirmation(def(toolId), spec(what)).create({
    userId: 'owner-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  }) as { execute: (a: unknown, o: unknown) => Promise<unknown> };
  return {
    session,
    call: async (callId: string, args: Record<string, unknown> = { contactQuery: 'my dad' }) => {
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      on.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    owner: (text: string) => on.onTranscript({ transcript: text, isFinal: true }),
    ownerOver: (text: string) => {
      session.agentState = 'speaking';
      on.onTranscript({ transcript: text, isFinal: true });
      session.agentState = 'listening';
    },
    ferni: (text: string) =>
      on.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }),
    otherTool: (callId: string) => on.onToolsExecuted({ functionCalls: [{ callId }] }),
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
