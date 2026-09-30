/**
 * The stories a persona has already told this caller.
 *
 * People retell their stories ("did I tell you about my grandmother's
 * garden?"). A friend who never does, and who can say "like that summer I
 * told you about", is rarer. The persona's anecdotes come from its backstory
 * through the LLM, so nothing stopped it telling the same one as new on
 * every call. This spots an anecdote in the persona's own reply, keeps a
 * short gist, and on later calls lists what was already told: refer back to
 * it, never retell it as new.
 *
 * Pure: detection, dedupe and wording. Storage lives with the recall store.
 *
 * @module memory/recall/told-stories
 */

import { contentWords } from './words.js';

export interface ToldStory {
  id: string;
  personaId: string;
  gist: string;
  at: number;
}

/** First-person past narrative: the persona telling one of its own stories. */
const ANECDOTE =
  /\b(i remember (when|once|the time|the day)|when i was (a kid|little|young|growing up|in school|a teenager|\d{1,2})|back when i|i once\b|years ago,? i|my (grand(ma|mother|pa|father)|mom|dad|mother|father|brother|sister|uncle|aunt)\b[^.!?]{0,80}\b(used to|would always|once|taught me|told me))/i;

const MAX_GIST = 160;
/** Content words a new story shares with a known one before it is the same story. */
const SAME_STORY_OVERLAP = 3;

function sentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]*/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

/** The gist of an anecdote in a reply (its opening sentence or two), or null. */
export function anecdoteIn(reply: string): string | null {
  const all = sentences(reply);
  const i = all.findIndex((s) => ANECDOTE.test(s));
  if (i < 0) return null;
  let gist = all[i];
  const next = all[i + 1];
  if (next && gist.length + next.length < MAX_GIST) gist = `${gist} ${next}`;
  gist = gist.replace(/\s+/g, ' ').trim();
  if (contentWords(gist).size < 4) return null;
  return gist.length > MAX_GIST ? `${gist.slice(0, MAX_GIST - 1).trimEnd()}…` : gist;
}

/** True when two gists tell the same story. */
export function sameStory(a: string, b: string): boolean {
  const words = contentWords(b);
  let shared = 0;
  for (const w of contentWords(a)) if (words.has(w)) shared++;
  return shared >= SAME_STORY_OVERLAP;
}

/** A stable id for a story: its first content words. */
export function storyId(personaId: string, gist: string): string {
  return `${personaId}-${[...contentWords(gist)].slice(0, 8).join('-')}`.slice(0, 120);
}

/** The lines for the recall note; empty when nothing has been told. */
export function formatToldStories(stories: readonly ToldStory[]): string[] {
  if (stories.length === 0) return [];
  return [
    'Stories of yours they have already heard (never retell one as new; you can refer back: "like I told you about..."):',
    ...stories.map((s) => `- ${s.gist}`),
  ];
}
