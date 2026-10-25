/**
 * A director's note that has to be given twice becomes a hard rule for the
 * next reply (DIRECTOR_ESCALATE=on, off by default).
 *
 * Dev call 2026-10-11 (Seth, quiet, short answers): the director said six
 * times, in different words, that Ferni was talking about himself ("you
 * talked about yourself twice. Give him space", "Stop explaining your kitchen
 * habits and let the silence sit"), and every next reply went on about his
 * kitchen. Each note was written fresh, sat in the middle of the turn
 * reminder behind the turn shape (which itself invited "a story of your own"),
 * and the character sheet says to use a note "if it fits, ignore it if it
 * doesn't". Nothing remembered that the same thing had been said before.
 *
 * Here each note is sorted into a theme. A theme in the notes on two of the
 * last four replies escalates: the next request ends with one plain rule for
 * that reply, after everything else, and it stays while the director keeps
 * raising it. The director is also told to write to Ferni as "you" (one note
 * said "Let him talk about his own day instead of pushing Seth", and Ferni
 * talked about his own day) and that a quiet caller is no cue to fill.
 *
 * @module agents/personas/director-escalation
 */

import { FERNI_CAST, self, type Cast } from './director-cast.js';

export function directorEscalates(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIRECTOR_ESCALATE === 'on';
}

export type NoteTheme = 'self' | 'lecture' | 'filling' | 'questions';

const THEMES: Array<[NoteTheme, RegExp]> = [
  [
    'self',
    /\b(?:talk(?:ed|s|ing)? about (?:yourself|himself|your own)|about yourself|your own (?:day|sunday|life|stor(?:y|ies)|routine|habits|plans)|your (?:kitchen|cooking|chores|habits|routine)|(?:give|leave) (?:him|her|them) (?:space|room)|let (?:him|her|them) (?:talk|answer|lead|share)|stop explaining your|sharing your own|back to (?:him|her|them)\b|focus on (?:him|her|them)\b)/i,
  ],
  [
    'lecture',
    /\b(?:lectur\w*|advice|advis\w*|over-?explain\w*|explaining|preach\w*|moraliz\w*|life lessons?|sermon|fix(?:ing)? (?:it|things|him|her|them)|telling (?:him|her|them) what)/i,
  ],
  [
    'filling',
    /\b(?:fill(?:ing)? (?:the )?(?:silence|quiet|space)|let (?:the )?(?:silence|quiet|pause) (?:sit|be|breathe)|rambl\w*|long speech\w*|too long|keep it (?:short|brief)|shorter)/i,
  ],
  [
    'questions',
    /\b(?:too many questions|stop asking|two questions|questions? to fill|another question)/i,
  ],
];

/** The themes a note raises. */
export function themesOf(note: string): NoteTheme[] {
  return THEMES.filter(([, re]) => re.test(note)).map(([theme]) => theme);
}

const RULES: Record<NoteTheme, string> = {
  self: 'nothing about yourself or your own day: react to what they said in a few words, or ask one short thing about them',
  lecture: 'no advice, lessons or explanations: a few plain words about what they actually said',
  filling: 'a few words at most, then leave the room to them',
  questions: 'no question: a short reaction only',
};

/** How many recent replies' notes count, and how many of them must raise a theme. */
const WINDOW = 4;
const TIMES = 2;

/** The themes the director raised for each reply, oldest first. */
export class NoteHistory {
  private readonly turns: NoteTheme[][] = [];

  /** The notes written for one reply. */
  record(notes: string[]): void {
    this.turns.push([...new Set(notes.flatMap(themesOf))]);
    if (this.turns.length > WINDOW) this.turns.shift();
  }

  /** Themes the director has raised for at least two of the last four replies, including the latest. */
  escalated(): NoteTheme[] {
    const latest = this.turns[this.turns.length - 1] ?? [];
    return latest.filter((t) => this.turns.filter((turn) => turn.includes(t)).length >= TIMES);
  }
}

/** The hard rule for this reply, or '' (goes last in the turn reminder: turn-request.ts). */
export function hardRuleFor(themes: NoteTheme[]): string {
  if (!themes.length) return '';
  const rules = themes.map((t) => RULES[t]).join('; ');
  return `[The director has had to say this twice, so it is not optional for THIS reply: ${rules}.]`;
}

/** Added to the director's instructions when DIRECTOR_ESCALATE=on. */
export const directorAddress = (c: Cast): string =>
  `Write to ${c.name} as "you" and call the caller by name or "they"; never "${c.p.object}" for ${c.name}. A quiet caller giving short answers is never a cue for ${c.name} to talk about ${self(c)}, explain or fill the silence: nudge ${c.p.object} toward shorter replies that leave them room.`;
export const DIRECTOR_ADDRESS = directorAddress(FERNI_CAST);
