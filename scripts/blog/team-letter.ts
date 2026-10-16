/**
 * Letters from the team: which character writes this week, the facts of their
 * life, and the label that says plainly they're a character.
 */

import { docSource, type Source } from './grounding.js';
import { personaColor } from './brand-terms.js';
import type { PostType } from './post-types.js';

export interface LetterPersona {
  key: string;
  name: string;
  initials: string;
  bundle: string;
  /** Their section of brand/voice-tone/README.md */
  voiceHeading: string;
}

const persona = (
  key: string,
  name: string,
  initials: string,
  bundle: string,
  role: string
): LetterPersona => ({
  key,
  name,
  initials,
  bundle,
  voiceHeading: `### ${name.split(' ')[0]} (${role})`,
});

export const LETTER_PERSONAS: LetterPersona[] = [
  persona('maya', 'Maya Santos', 'MS', 'maya-santos', 'The Habits Coach'),
  persona('peter', 'Peter John', 'PJ', 'peter-john', 'The Quant'),
  persona('jordan', 'Jordan Taylor', 'JT', 'jordan-taylor', 'The Lifetime Planner'),
  persona('alex', 'Alex Chen', 'AC', 'alex-chen', 'The Chief of Staff'),
  persona('nayan', 'Nayan', 'NA', 'nayan-patel', 'The Sage'),
  persona('ferni', 'Ferni', 'FE', 'ferni', 'The Heart'),
];

/** `--persona <key>`, else one per ISO week in turn. */
export function pickPersona(isoWeek: number, key?: string): LetterPersona {
  if (!key) return LETTER_PERSONAS[isoWeek % LETTER_PERSONAS.length];
  const found = LETTER_PERSONAS.find((p) => p.key === key);
  if (!found) throw new Error(`unknown persona "${key}"`);
  return found;
}

export function personaSources(root: string, p: LetterPersona): Source[] {
  const bio = `src/personas/bundles/${p.bundle}/identity/biography-core.md`;
  const voice = docSource(root, 'brand/voice-tone/README.md', { fromHeading: p.voiceHeading });
  voice.label += ' [how they sound; where its life details differ, the biography is right]';
  return [
    {
      label: `Letter writer: ${p.name}`,
      text: `This letter is in the voice of ${p.name}, a character on the Ferni team. Use only the life details below.`,
    },
    docSource(root, bio, { maxChars: 4000 }),
    // How they sound only: its life details (Peter's "Carolyn", caddy days) predate the bios.
    voice,
  ];
}

export function letterAuthor(root: string, p: LetterPersona): PostType['author'] {
  return { name: p.name, initials: p.initials, color: personaColor(root, p.key) };
}

/** Put first in the body by the drafter, not left to the model. */
export function characterLabel(p: LetterPersona): string {
  const first = p.name.split(' ')[0];
  return `*${first} is one of the characters you can talk to on Ferni. We wrote this letter in ${first}'s voice. ${first} is a character, not a real person.*`;
}
