/**
 * What the model is told about teammates the caller hasn't unlocked yet.
 *
 * Handoff tools for locked teammates are kept out of the request
 * (locked-handoffs.ts), but Ferni's character sheet names the whole team
 * ("Peter, Maya, Alex, Jordan and Nayan"), so the model knew Maya and not that
 * she was locked. Dev call 2026-10-05 (BYPASS_TEAM_UNLOCKS=peter-john): Ferni
 * offered "my colleague Maya", the caller said "Transfer me to Maya", and with
 * no handoff to Maya Ferni called connectToHumanExpert, the nearest tool left,
 * and said "I'm getting Maya on the line for you right now". The per-turn team
 * context (team-availability.ts) is built in the background and lands after
 * the reply it was built for (turn-intelligence.ts), so it can't prevent this.
 *
 * So every request carries the lock state, from the same unlock view that
 * filtered the handoff tools (turn-request.ts):
 * - teamStatusNote(): one line on the caller's turn naming who isn't on their
 *   team yet, so Ferni neither offers them nor promises a transfer;
 * - askForTeammate: one tool, not a handoff per locked teammate (tool count is
 *   request cost, docs/perf/llm-request-cost.md), for when the model reaches
 *   for a transfer anyway. Its result is the warm decline; it connects no one.
 *
 * @module tools/handoff/locked-teammates
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { teamMemberIdOf } from '../../intelligence/context-builders/team/team-availability.js';
import { ALIAS_TO_CANONICAL, isCoach } from '../../personas/persona-ids.js';
import {
  getTeamMemberUnlockStatus,
  getTeamUnlockState,
  TEAM_MEMBERS,
  type TeamMemberUnlock,
} from '../../services/team-unlocks.js';
import { isHandoffTargetOpen } from './handoff-availability.js';
import { createHandoffTools } from './handoff-factory.js';
import type { UnlockView } from './locked-handoffs.js';

export const ASK_FOR_TEAMMATE = 'askForTeammate';

const speaking = (view: UnlockView): string => view.currentAgentId ?? 'ferni';

/** Persona ID for a name or alias ("Maya", "maya santos", "Peter Lynch"), exact matches only. */
function personaIdOf(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/_/g, '-');
  for (const candidate of [key, key.replace(/\s+/g, '-')]) {
    if (Object.hasOwn(ALIAS_TO_CANONICAL, candidate)) return ALIAS_TO_CANONICAL[candidate];
  }
  return null;
}

const isOpen = (id: string, view: UnlockView): boolean =>
  Boolean(view.bypass) || isHandoffTargetOpen(id, view.userProfile, view.tier);

const isSpeaker = (id: string, view: UnlockView): boolean => {
  const current = speaking(view);
  return (isCoach(id) && isCoach(current)) || teamMemberIdOf(current) === id || current === id;
};

/** Ferni's teammates (by first name) this caller can't be handed to yet, the speaker aside. */
export function lockedTeammates(view: UnlockView): TeamMemberUnlock[] {
  return TEAM_MEMBERS.filter(
    (m) => !isCoach(m.memberId) && !isSpeaker(m.memberId, view) && !isOpen(m.memberId, view)
  );
}

/** "Maya", "Maya and Alex", "Maya, Alex and Jordan". */
function nameList(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The line each request carries while some teammates are locked; '' when none are. */
export function teamStatusNote(view: UnlockView): string {
  const locked = lockedTeammates(view).map((m) => m.displayName);
  if (locked.length === 0) return '';
  const names = nameList(locked);
  return (
    `Not on this caller's team yet: ${names}. You can't bring ${locked.length > 1 ? 'them' : names} in, ` +
    "so never offer, promise or start a transfer to them and don't mention them as if they were available. " +
    "If the caller asks for one, say warmly and briefly that they aren't on their team yet and help them yourself."
  );
}

/** How the caller would meet a locked core teammate, if the unlock rules say. */
function howToMeet(member: TeamMemberUnlock, view: UnlockView): string | undefined {
  const { stage } = getTeamUnlockState(view.userProfile, view.tier);
  return getTeamMemberUnlockStatus(member, stage, view.tier).unlockHint;
}

/** The tool's answer for `name`: a warm decline, a pointer to the real handoff, or "that's you". */
export async function answerTeammateRequest(
  name: string,
  view: UnlockView
): Promise<Record<string, unknown>> {
  const id = personaIdOf(name);
  if (!id) {
    return {
      unknown: true,
      instruction: `There's no teammate called ${name}. Don't promise a transfer; help them yourself.`,
    };
  }
  const member = TEAM_MEMBERS.find((m) => m.memberId === id);
  const displayName = member?.displayName ?? name.trim();
  if (isSpeaker(id, view)) {
    return {
      you: true,
      instruction: `You are ${displayName}; they're already talking with you. Don't transfer.`,
    };
  }
  if (isOpen(id, view)) {
    const tool = (await createHandoffTools()).toolsByAgentId.get(id)?.name;
    return {
      available: true,
      instruction: tool
        ? `${displayName} is on their team: call ${tool} to bring them in.`
        : `${displayName} can't be reached from here. Don't promise a transfer; help them yourself.`,
    };
  }
  return {
    unavailable: true,
    teammate: displayName,
    instruction:
      `${displayName} isn't on this caller's team yet, so nobody is being connected. ` +
      `Tell them that warmly in a sentence, without saying you're getting or connecting ${displayName}, ` +
      "and offer to help with it yourself right now. Say how they'd meet " +
      `${displayName} only if it fits naturally; no pushing.`,
    ...(member ? { how_to_meet: howToMeet(member, view) } : {}),
  };
}

/** The askForTeammate tool for this request's unlock view. */
export function askForTeammateTool(
  view: UnlockView,
  locked: TeamMemberUnlock[]
): llm.FunctionTool<{ name: string }, unknown, Record<string, unknown>> {
  const names = nameList(locked.map((m) => m.displayName));
  return llm.tool({
    name: ASK_FOR_TEAMMATE,
    description:
      `Call when the caller asks to talk to, or be transferred to, a teammate who isn't on their team yet (right now: ${names}). ` +
      'It never connects anyone; it says how to answer. Teammates on their team have their own handoff tool.',
    parameters: z.object({
      name: z.string().describe('The teammate the caller asked for, e.g. "Maya"'),
    }),
    execute: async ({ name }) => answerTeammateRequest(name, view),
  });
}

/** `toolCtx` plus askForTeammate while some teammates are locked (the same object otherwise). */
export function withTeammateAsk(toolCtx: llm.ToolContext, view: UnlockView): llm.ToolContext {
  const locked = lockedTeammates(view);
  if (locked.length === 0 || ASK_FOR_TEAMMATE in toolCtx.functionTools) return toolCtx;
  return new llm.ToolContext([
    ...Object.values(toolCtx.functionTools),
    askForTeammateTool(view, locked),
    ...toolCtx.providerTools,
    ...toolCtx.toolsets,
  ]);
}
