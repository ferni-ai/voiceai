/**
 * What the model is told about teammates the caller hasn't unlocked yet.
 *
 * Handoff tools for locked teammates are kept out of the request
 * (locked-handoffs.ts), but Ferni's character sheet names the whole team
 * ("Peter, Maya, Alex, Jordan and Nayan"), so the model knew Maya and not that
 * Maya was locked. Dev call 2026-10-05 (BYPASS_TEAM_UNLOCKS=peter-john): Ferni
 * offered "my colleague Maya", the caller said "Transfer me to Maya", and with
 * no handoff to Maya Ferni called connectToHumanExpert, the nearest tool left,
 * and said "I'm getting Maya on the line for you right now". The per-turn team
 * context (team-availability.ts) is built in the background and lands after
 * the reply it was built for (turn-intelligence.ts), so it can't prevent this.
 *
 * So every request carries the lock state, from the same unlock view that
 * filters the handoff tools (turn-request.ts):
 * - teamStatusNote(): a line on the caller's turn. It names a locked teammate
 *   only on a turn whose words name one; otherwise it names who IS on the
 *   caller's team and says not to bring up the others. Locked teammates never
 *   come up unprompted (even "not on your team yet" is an upsell nudge), and
 *   no transfer is promised;
 * - askForTeammate: one tool, not a handoff per locked teammate (tool count is
 *   request cost, docs/perf/llm-request-cost.md), for when the caller asks for
 *   one anyway. Its result is the warm decline; it connects no one.
 *
 * The SDK runs a tool call against the agent's own tools, not the request's
 * (agent_activity.js hands the agent's toolCtx to both the LLM node and the
 * executor). A declaration added only to the request was called on dev and
 * answered "Unknown function: askForTeammate" (2026-10-05, 17faf85a4). So the
 * tool is registered on the agent (withTeammateTool, in PersonaVoiceAgent's
 * constructor) and each request forwards or drops that same object; it reads
 * the unlock view from the call's session when it runs, as the handoffs do.
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
import type { UserProfile } from '../../types/user-profile.js';
import { isHandoffTargetOpen } from './handoff-availability.js';
import { createHandoffTools } from './handoff-factory.js';
import type { UnlockView } from './locked-handoffs.js';

export const ASK_FOR_TEAMMATE = 'askForTeammate';

/** Who this user has unlocked, from the session's userData (read as the handoff tools read it). */
export function unlockViewFor(sessionUserData: unknown): UnlockView {
  const userData = sessionUserData as
    { userProfile?: UserProfile | null; personaId?: unknown; services?: unknown } | undefined;
  const services = userData?.services as
    | {
        userProfile?: UserProfile | null;
        devMode?: { enabled?: boolean; bypassUnlocks?: boolean };
      }
    | undefined;
  const userProfile = services?.userProfile ?? userData?.userProfile ?? null;
  const tier = (userProfile?.subscription?.tier as UnlockView['tier'] | undefined) ?? 'free';
  return {
    userProfile,
    tier,
    bypass: Boolean(services?.devMode?.enabled && services.devMode.bypassUnlocks),
    currentAgentId: (userData?.personaId as string | undefined) ?? 'ferni',
  };
}

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

/** The teammates in `members` the caller's words name ("Maya", "maya santos"): whole words only. */
export function teammatesNamedIn(text: string, members: TeamMemberUnlock[]): TeamMemberUnlock[] {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  return members.filter((m) => words.has(m.displayName.toLowerCase()));
}

/**
 * The team line for one request; '' when no teammate is locked.
 *
 * Locked teammates are named only on a turn whose words name one: on every
 * request, the names kept Maya in mind after the decline, and the next reply
 * asked why the caller wanted Maya instead of answering (dev, 2026-10-05,
 * 398674483). Other turns get one line that names no locked teammate.
 */
export function teamStatusNote(view: UnlockView, callerWords = ''): string {
  const locked = lockedTeammates(view);
  if (locked.length === 0) return '';
  const asked = teammatesNamedIn(callerWords, locked).map((m) => m.displayName);
  if (asked.length > 0) {
    const names = nameList(asked);
    return (
      `${names} ${asked.length > 1 ? "aren't" : "isn't"} on this caller's team yet, so you can't bring ${asked.length > 1 ? 'them' : names} in. ` +
      'Say so warmly and briefly, help them yourself, and never offer, promise or start a transfer.'
    );
  }
  const open = TEAM_MEMBERS.filter(
    (m) => !isSpeaker(m.memberId, view) && isOpen(m.memberId, view)
  ).map((m) => m.displayName);
  return open.length > 0
    ? `Of your teammates, only ${nameList(open)} ${open.length > 1 ? 'are' : 'is'} on this caller's team; don't bring up the others.`
    : "None of your teammates are on this caller's team yet; don't bring them up.";
}

/**
 * Director notes for this reply, without any that name a locked teammate the
 * caller didn't just ask for. The 398674483 dev call: after the decline the
 * director wrote "talk about why they want to escape to Maya instead", and the
 * next reply did, instead of answering the caller's question.
 */
export function withoutLockedTeammateNotes(
  notes: string[],
  view: UnlockView,
  callerWords = ''
): string[] {
  const locked = lockedTeammates(view);
  const asked = new Set(teammatesNamedIn(callerWords, locked));
  const unasked = locked.filter((m) => !asked.has(m));
  return notes.filter((note) => teammatesNamedIn(note, unasked).length === 0);
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
      'and offer to help with it yourself right now. Say how they would meet ' +
      `${displayName} only if they ask; no pushing. ` +
      "Then help with what they asked; don't bring this up again unless they do.",
    ...(member ? { how_to_meet: howToMeet(member, view) } : {}),
  };
}

export const ASK_FOR_TEAMMATE_DESCRIPTION =
  "Call when the caller asks by name to talk to, or be transferred to, a teammate who has no handoff tool here because they aren't on the caller's team yet. " +
  "It never connects anyone; it says how to answer. Never bring those teammates up yourself, and don't call this unless the caller named one.";

/**
 * The executable askForTeammate. Anonymous, so it can sit in a tools record
 * (the SDK names record entries by their key). The unlock view is the call's.
 */
export function askForTeammateTool(): llm.AnonFunctionTool<
  { name: string },
  unknown,
  Record<string, unknown>
> {
  return llm.tool({
    description: ASK_FOR_TEAMMATE_DESCRIPTION,
    parameters: z.object({
      name: z.string().describe('The teammate the caller asked for, e.g. "Maya"'),
    }),
    execute: async ({ name }, run) =>
      answerTeammateRequest(
        name,
        unlockViewFor((run as { ctx?: { userData?: unknown } } | undefined)?.ctx?.userData)
      ),
  });
}

/**
 * The tools record an agent is built with, plus askForTeammate, so a call to
 * it can run. Anything but a plain record (a ToolContext, nothing) is returned as is.
 */
export function withTeammateTool<T>(tools: T): T {
  if (tools === null || typeof tools !== 'object' || tools instanceof llm.ToolContext) return tools;
  if (ASK_FOR_TEAMMATE in tools) return tools;
  return { ...tools, [ASK_FOR_TEAMMATE]: askForTeammateTool() };
}

/**
 * This request's tools: the agent's own askForTeammate forwarded while some
 * teammates are locked and dropped when none are. Never added here: a tool the
 * agent doesn't hold can't be executed.
 */
export function withTeammateAsk(toolCtx: llm.ToolContext, view: UnlockView): llm.ToolContext {
  const registered = ASK_FOR_TEAMMATE in toolCtx.functionTools;
  if (!registered || lockedTeammates(view).length > 0) return toolCtx;
  const keep = Object.entries(toolCtx.functionTools)
    .filter(([name]) => name !== ASK_FOR_TEAMMATE)
    .map(([, tool]) => tool);
  return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
}
