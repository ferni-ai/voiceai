/**
 * TOOL_ACK_CLIP's words (integrations/tool-ack-clip.ts): which tools get a voiced
 * acknowledgement as they start, and which lines. Never gameState or an unasked
 * memory save. No line sounds finished: actions get "Sure." / "On it.", never
 * "Okay." / "Yep."; calls and texts only "On it." / "One sec.", as a read-back
 * for a yes follows (OUTBOUND_CONFIRM).
 *
 * @module agents/personas/tool-ack-clip-lines
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import {
  ACTION_TOOLS,
  LEAD_INS,
  LOOKUP_TOOLS,
  ON_IT,
  WIDE_ACTION_TOOLS,
  WIDE_LOOKUP_TOOLS,
} from './tool-lead-in.js';

export type AckKind = 'lookup' | 'action' | 'outreach' | 'recall';

/** Every list has at least two lines, so a call never hears the same clip twice in a row. */
export const ACK_CLIP_LINES: Readonly<Record<AckKind, readonly string[]>> = {
  lookup: LEAD_INS,
  action: ['Sure.', ON_IT, 'Sure, one sec.'],
  outreach: [ON_IT, 'One sec.'],
  recall: ['Let me think back.', 'Let me think.'],
};

const CLIP_LOOKUPS: ReadonlySet<string> = new Set(['findBusiness']);
const CLIP_ACTIONS: ReadonlySet<string> = new Set([
  'journal',
  'restaurant',
  'createHabit',
  'softTeamIntro',
  'introduceMember',
]);
const CLIP_OUTREACH: ReadonlySet<string> = new Set([...WIDE_ACTION_TOOLS, 'quickText', 'reachOut']);
const CLIP_RECALL: ReadonlySet<string> = new Set([
  'recallFromMemory',
  'recallPreviousConversation',
]);
const NEVER: ReadonlySet<string> = new Set(['gameState']);
const MEMORY_SAVES: ReadonlySet<string> = new Set(['rememberAboutUser', 'rememberImportantFact']);
/** The caller asked to keep something, not "do you remember…". */
const ASKED_TO_SAVE =
  /\b(remember (?:that|this)|don'?t forget|keep (?:that|this|it) in mind|make a note|write (?:that|this) down)\b/i;

export function toolAckClipOn(env: Env = process.env): boolean {
  return flagOn('TOOL_ACK_CLIP', env);
}

/** The caller's words ask for something a tool does (TOOL_ACK=off: never). */
export function askedForTool(words: string, env: Env = process.env): boolean {
  return env.TOOL_ACK !== 'off' && mayNeedTool(words);
}

/** Which lines a tool starting now gets, or null for none. */
export function ackKindFor(tool: string, words: string, asked: boolean): AckKind | null {
  if (NEVER.has(tool)) return null;
  if (MEMORY_SAVES.has(tool)) return asked && ASKED_TO_SAVE.test(words) ? 'action' : null;
  if (LOOKUP_TOOLS.has(tool) || CLIP_LOOKUPS.has(tool)) return 'lookup';
  if (CLIP_RECALL.has(tool)) return 'recall';
  if (!asked) return null;
  if (WIDE_LOOKUP_TOOLS.has(tool)) return 'lookup';
  if (ACTION_TOOLS.has(tool) || CLIP_ACTIONS.has(tool)) return 'action';
  return CLIP_OUTREACH.has(tool) ? 'outreach' : null;
}

/** Every line to render in each persona's voice; none with the flag off. */
export function toolAckClipTexts(env: Env = process.env): string[] {
  return toolAckClipOn(env) ? [...new Set(Object.values(ACK_CLIP_LINES).flat())] : [];
}
