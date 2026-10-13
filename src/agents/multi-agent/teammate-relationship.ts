/**
 * What a teammate (Peter, Maya, Alex, Jordan, Nayan) is told about the caller
 * and the handoff, with TEAM_PERSONA_AWARE=on.
 *
 * The profile's conversation count, relationship stage and last summary are
 * the caller's history with Ferni. Every persona was told them as its own, so
 * after a handoff Peter heard "You've had 654 conversations together - you
 * know each other well. They trust you and share openly." about someone he
 * had never spoken to. Off, or for Ferni, nothing changes.
 *
 * @module agents/multi-agent/teammate-relationship
 */
import { flagOn } from '../../config/env-flag.js';
import { getDisplayName, toCanonical } from '../../personas/persona-ids.js';

interface ProfileCounts {
  humanizingState?: { perPersonaMeetingCounts?: Record<string, number> };
}

/**
 * The teammate's own relationship with the caller, replacing Ferni's; undefined
 * for Ferni or with the flag off. Its own count comes from the profile's
 * per-persona meeting counts when there are any.
 */
export function teammateRelationship(
  personaId: string,
  profile: ProfileCounts
): string[] | undefined {
  if (!flagOn('TEAM_PERSONA_AWARE') || toCanonical(personaId) === 'ferni') return undefined;
  const own = profile.humanizingState?.perPersonaMeetingCounts?.[personaId] ?? 0;
  if (own === 1) return ["You've talked with them once yourself."];
  if (own > 1) return [`You've talked with them ${own} times yourself.`];
  return ["You're meeting them through Ferni: this is your first conversation with them yourself."];
}

/**
 * How the profile's last-call summary reads for this persona: a teammate
 * hears it as the caller's last talk with Ferni, not with itself.
 */
export function lastTalkedAbout(teammate: boolean, summary: string): string {
  return teammate
    ? `Last time they talked with Ferni about: ${summary}`
    : `Last time you talked about: ${summary}`;
}

/**
 * The handoff lines a persona joining the call gets with the flag on: the
 * earlier replies are the previous persona's (persona-swap.ts marks them), and
 * it speaks as itself. Undefined with the flag off.
 */
export function handoffIntro(previousPersonaId: string): string[] | undefined {
  if (!flagOn('TEAM_PERSONA_AWARE')) return undefined;
  const before = getDisplayName(previousPersonaId);
  return [
    `You just joined this call; ${before} was talking with them before you.`,
    `Replies marked "(${before} said:)" are ${before}'s, not yours. Speak as yourself, in your own words and manner, and never start a reply with a mark like that.`,
    'Acknowledge the handoff briefly and carry on naturally.',
  ];
}
