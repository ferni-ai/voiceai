/**
 * Teammate names as speech-to-text hears them.
 *
 * The code that notices a caller asking for a teammate matched the exact first
 * name only. On dev 2026-10-11 the owner said "Can I talk to Nayan?", STT wrote
 * "Can I talk to Naya?", and nothing matched: the team line didn't name Nayan,
 * askForTeammate("Naya") would have answered "there's no teammate called Naya",
 * and the director decided Naya was a friend whose name Ferni got wrong.
 *
 * Only spellings STT produces for these names, and none that is a common
 * English word or another assistant ("Alexa"), so a caller's own friend is
 * rarely mistaken for a teammate. "Naya" is one letter from Maya too; it goes
 * to Nayan, whose final "n" is what STT drops.
 *
 * @module tools/handoff/teammate-names
 */

import { TEAM_MEMBERS, type TeamMemberId } from '../../services/team-unlocks.js';
import { HEARD_AS as SPELLINGS } from '../../utils/teammate-talk.js';

/** STT spellings of each teammate's first name (lowercase), the name itself aside. */
export const HEARD_AS = SPELLINGS as Readonly<Record<string, TeamMemberId>>;

const firstNameOf = (id: TeamMemberId): string =>
  TEAM_MEMBERS.find((m) => m.memberId === id)?.displayName ?? id;

/** The teammate a single spoken word is, by name or STT spelling; null for anything else. */
export function teammateHeardAs(word: string): TeamMemberId | null {
  const w = word.trim().toLowerCase();
  const byName = TEAM_MEMBERS.find((m) => m.displayName.toLowerCase() === w);
  if (byName) return byName.memberId;
  return Object.hasOwn(HEARD_AS, w) ? HEARD_AS[w] : null;
}

/** Each STT spelling in the caller's words, with the teammate it is. Whole words only. */
export function misheardTeammates(text: string): Array<{ heard: string; id: TeamMemberId }> {
  const seen = new Map<string, TeamMemberId>();
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (Object.hasOwn(HEARD_AS, word)) seen.set(word, HEARD_AS[word]);
  }
  return [...seen].map(([heard, id]) => ({ heard, id }));
}

/**
 * One line for a turn whose words hold an STT spelling of a teammate's name,
 * so the model and the transfer it picks know who was asked for; '' otherwise.
 */
export function heardTeammateNote(callerWords: string): string {
  return misheardTeammates(callerWords)
    .map(({ heard, id }) => {
      const name = firstNameOf(id);
      const said = heard[0].toUpperCase() + heard.slice(1);
      return `"${said}" is speech-to-text for ${name}, your teammate: they mean ${name}.`;
    })
    .join(' ');
}
