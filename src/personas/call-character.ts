/**
 * Who is speaking on a call, for prompts that describe the call to a model
 * (the director's notes, turn understanding, cue lines): a name, pronouns and
 * a one-line sketch. Those prompts once said "Ferni" on every call, so a
 * teammate was steered with Ferni's biography and labelled "Ferni:".
 *
 * Pronouns follow the voice each persona speaks with
 * (services/voice/cartesia-voice-localization.ts).
 *
 * @module personas/call-character
 */

import { ALIAS_TO_CANONICAL, DISPLAY_NAMES, FINANCIAL_LEGENDS } from './persona-ids.js';

export interface CallCharacter {
  id: string;
  name: string;
  pronoun: { he: string; him: string; his: string; himself: string; hes: string };
  /** A sentence or two for a line writer (speech/direction/cue-say.ts). */
  brief: string;
  /** A short phrase in parentheses after the name, for the director. */
  sketch: string;
}

const HE = { he: 'he', him: 'him', his: 'his', himself: 'himself', hes: "he's" };
const SHE = { he: 'she', him: 'her', his: 'her', himself: 'herself', hes: "she's" };
const THEY = { he: 'they', him: 'them', his: 'their', himself: 'themselves', hes: "they're" };

const CHARACTERS: Record<string, Omit<CallCharacter, 'id' | 'name'>> = {
  ferni: {
    pronoun: HE,
    brief: 'A warm, curious, lightly playful friend and life coach. Plain-spoken, never salesy.',
    sketch:
      'warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend',
  },
  'maya-santos': {
    pronoun: SHE,
    brief: 'An upbeat, encouraging habits coach. Practical and kind.',
    sketch: 'upbeat, encouraging, practical and kind; a habits coach',
  },
  'peter-john': {
    pronoun: HE,
    brief: 'A calm, thoughtful money mentor. Steady and plain-spoken.',
    sketch: 'calm, thoughtful, steady and plain-spoken; a money mentor',
  },
  'alex-chen': {
    pronoun: HE,
    brief: 'A crisp, friendly organizer. Efficient and warm.',
    sketch: 'crisp, friendly, efficient and warm; an organizer and communication coach',
  },
  'jordan-taylor': {
    pronoun: SHE,
    brief: 'An energetic, celebratory planner. Bright and personal.',
    sketch: 'energetic, celebratory, bright and personal; a planner',
  },
  'nayan-patel': {
    pronoun: HE,
    brief: 'A gentle, reflective guide. Unhurried and wise.',
    sketch: 'gentle, reflective, unhurried and wise; a guide',
  },
};

const CORE_TEAM = [
  'ferni',
  'maya-santos',
  'alex-chen',
  'peter-john',
  'jordan-taylor',
  'nayan-patel',
] as const;

const NAMES: Record<string, string> = DISPLAY_NAMES;
const LEGENDS: readonly string[] = FINANCIAL_LEGENDS;

export const FERNI_CHARACTER: CallCharacter = { id: 'ferni', name: 'Ferni', ...CHARACTERS.ferni };

/**
 * The character for a persona id (any alias); Ferni when there is none. An id
 * with no sketch here (a legend, a marketplace agent) keeps its own name with
 * a neutral sketch.
 */
export function callCharacter(personaId?: string, displayName?: string): CallCharacter {
  if (!personaId) return FERNI_CHARACTER;
  const id = ALIAS_TO_CANONICAL[personaId.toLowerCase().trim()] ?? personaId;
  const name = NAMES[id] ?? displayName ?? personaId;
  const known = CHARACTERS[id];
  if (known) return { id, name, ...known };
  return {
    id,
    name,
    pronoun: LEGENDS.includes(id) ? HE : THEY,
    brief: `${name}, a warm, plain-spoken guide.`,
    sketch: 'warm and plain-spoken',
  };
}

/** The display names of the persona's teammates (the team they can hand the caller to). */
export function teammatesOf(character: CallCharacter): string[] {
  const team: readonly string[] = LEGENDS.includes(character.id) ? LEGENDS : CORE_TEAM;
  return team.filter((id) => id !== character.id).map((id) => NAMES[id] ?? id);
}

/**
 * One line naming the team, so a model reading the call knows a teammate is a
 * colleague to transfer to, not someone the caller knows. Dev call 2026-10-11:
 * "Can I talk to Naya?" (speech-to-text for Nayan) drew the note "They asked
 * for Naya, not Nayan. He got their friend's name wrong."
 */
export function teamLine(character: CallCharacter): string {
  const names = teammatesOf(character);
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${character.name}'s teammates are ${list}: colleagues on ${character.pronoun.his} team, not friends of the caller. When the caller asks for one of them, even by a name the transcript got slightly wrong, they want to be transferred; never treat it as a mistake.`;
}
