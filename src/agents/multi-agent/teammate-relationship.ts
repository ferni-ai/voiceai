/**
 * What a teammate joining by handoff (Peter, Maya, Alex, Jordan, Nayan) is
 * told about the caller and the handoff, with DIRECTOR_PERSONA_AWARE=on.
 *
 * The profile's conversation count, relationship stage and last summary are
 * the caller's history with the team, mostly with Ferni. Every persona was
 * told them as its own, so after a handoff (dev, 2026-10-12) Peter heard
 * "You've had 654 conversations together - you know each other well. They
 * trust you and share openly." about someone he had never spoken to. A caller
 * who opens the app on a teammate directly is not a handoff and keeps the old
 * lines. Off, or for Ferni, nothing changes.
 *
 * @module agents/multi-agent/teammate-relationship
 */
import { flagOn } from '../../config/env-flag.js';
import { getDisplayName, toCanonical } from '../../personas/persona-ids.js';

interface ProfileCounts {
  humanizingState?: { perPersonaMeetingCounts?: Record<string, number> };
}

interface Joining {
  persona: { id: string };
  isHandoff?: boolean;
  previousPersonaId?: string;
}

/**
 * The teammate's own relationship with the caller, replacing the team's;
 * undefined unless a persona other than Ferni joined by handoff with the flag
 * on. Its own count comes from the profile's per-persona meeting counts when
 * there are any.
 */
export function teammateRelationship(
  { persona, isHandoff, previousPersonaId: from }: Joining,
  profile: ProfileCounts
): string[] | undefined {
  const id = toCanonical(persona.id);
  if (!isHandoff || !from || id === 'ferni' || !flagOn('DIRECTOR_PERSONA_AWARE')) return undefined;
  const own = profile.humanizingState?.perPersonaMeetingCounts?.[id] ?? 0;
  if (own === 1) return ["You've talked with them once yourself."];
  if (own > 1) return [`You've talked with them ${own} times yourself.`];
  return [
    `You're meeting them through ${getDisplayName(from)}: this is your first conversation with them yourself.`,
  ];
}

/**
 * How the profile's last-call summary reads: a teammate hears it as the
 * caller's last call with the team, not with itself.
 */
export function lastTalkedAbout(teammate: boolean, summary: string): string {
  return teammate
    ? `Last time they called, they talked about: ${summary}`
    : `Last time you talked about: ${summary}`;
}

/**
 * The opening lines of the handoff context. With the flag on, the earlier
 * replies are the previous persona's (persona-swap.ts marks them) and the
 * teammate speaks as itself; off, the lines from before.
 */
export function handoffIntro(previousPersonaId: string): string[] {
  if (!flagOn('DIRECTOR_PERSONA_AWARE'))
    return [
      `You just received this conversation from ${previousPersonaId}.`,
      'Continue naturally - acknowledge the handoff briefly but focus on helping.',
    ];
  const before = getDisplayName(previousPersonaId);
  return [
    `You just joined this call; ${before} was talking with them before you.`,
    `Earlier replies marked with a name, like "(${before} said:)", were said by that person, not you. Speak as yourself, in your own words and manner, and never start a reply with a mark like that.`,
    'Acknowledge the handoff briefly and carry on naturally.',
  ];
}
