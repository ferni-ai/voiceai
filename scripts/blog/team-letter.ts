/**
 * Letters from the team: which character writes this week, the facts of their
 * life, and the label that says plainly they're a character.
 */

import { docSource, type Source } from './grounding.js';
import { personaColor } from './brand-terms.js';
import type { DraftModel } from './model.js';
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
  // Essence and tone only: a drafter given sample lines pasted them in whole.
  const samples = voice.text.search(/\*\*(?:Signature Patterns|Example Messages|Voice Quirks)\*\*/);
  if (samples >= 0) voice.text = voice.text.slice(0, samples).trim();
  return [
    {
      label: `Letter writer: ${p.name}`,
      text: `This letter is in the voice of ${p.name}, a character on the Ferni team and one of the characters people can talk to on Ferni. Use only the life details below.`,
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

export interface LetterFocus {
  /** The biography's own words for one moment. */
  moment: string;
  idea: string;
}

/** Asks for one moment from the biography, copied word for word, and the idea it shows. */
export function focusPrompt(p: LetterPersona, bio: Source): string {
  return `Below is the biography of ${p.name}, a character on Ferni. A short letter in their voice will be built on ONE moment from it.
Pick the moment a reader who feels alone or stuck could take something from, and the one idea it shows.
Answer with JSON only: {"moment": "one to three sentences of the biography, copied exactly", "idea": "the idea, in one plain sentence"}

${bio.text}`;
}

const plain = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/** The model's pick, or undefined when it isn't JSON or the moment isn't copied from the biography. */
export function parseFocus(raw: string | null | undefined, bio: string): LetterFocus | undefined {
  const json = raw?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;
  let parsed: Partial<LetterFocus>;
  try {
    parsed = JSON.parse(json) as Partial<LetterFocus>;
  } catch {
    return undefined;
  }
  const { moment, idea } = parsed;
  if (typeof moment !== 'string' || typeof idea !== 'string' || !moment.trim() || !idea.trim())
    return undefined;
  return plain(bio).includes(plain(moment))
    ? { moment: plain(moment), idea: idea.trim() }
    : undefined;
}

/**
 * Narrows a letter's biography to one moment before it is written. Given the
 * whole biography, the drafter read it out in order, which the judge scores 1
 * on meaning and message; given one moment, there is nothing to recite. A pick
 * that isn't copied from the biography keeps the whole one.
 */
export async function focusLetter(
  sources: Source[],
  p: LetterPersona,
  model: DraftModel
): Promise<Source[]> {
  const i = sources.findIndex((s) => s.label.endsWith('/biography-core.md'));
  if (i < 0) return sources;
  const focus = parseFocus(await model.generate(focusPrompt(p, sources[i])), sources[i].text);
  if (!focus) {
    console.error(`Letter: no moment copied from ${p.name}'s biography; using all of it.`);
    return sources;
  }
  const moment: Source = {
    label: `${sources[i].label} (one moment)`,
    text: `${focus.moment}\n\nThe idea to write about: ${focus.idea}`,
  };
  return sources.map((s, j) => (j === i ? moment : s));
}
