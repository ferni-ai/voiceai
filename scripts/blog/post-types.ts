/**
 * The kinds of post the drafter writes: where each goes, who it's from, how
 * long it runs, and what it's about. Every type is grounded (type-sources.ts);
 * these briefs only say what to write from the facts.
 */

export type Audience = 'developer' | 'consumer';

export interface PostType {
  id: string;
  audience: Audience;
  /** Folder for the draft, relative to the repo root. */
  folder: string;
  category: string;
  /** team-letter swaps in the persona (team-letter.ts). */
  author: { name: string; initials: string; color: string };
  series?: string;
  words: { min: number; max: number };
  brief: string;
}

const FOLDERS: Record<Audience, string> = {
  developer: 'apps/website/developers-portal/src/blog',
  consumer: 'apps/website/ferni-website/src/blog',
};
const TEAM = { name: 'The Ferni Team', initials: 'FE', color: '#4a6741' };

type Spec = [Audience, string, [number, number], string, string?];

const SPECS: Record<string, Spec> = {
  'whats-new': [
    'developer',
    "What's New",
    [300, 900],
    `A "what's new" post for developers building on Ferni: on its SDK, API, CLI or developer portal.
Pick the ONE change in the facts that matters most to them, or two that are really the same story. Say what changed, why we changed it, and what a developer can try or must change now. Link each pull request you write about as [#N](url), and no others.
This is not a changelog: no list of pull requests, no "In #N, we..." paragraphs, no dates.
Merged is not the same as live in production: say "merged" or "landed", never "now available".`,
  ],
  'building-in-public': [
    'consumer',
    'Building in Public',
    [500, 1100],
    `A "building in public" post for people curious about how Ferni is made.
Pick ONE merged pull request from the facts and tell its story: what wasn't right, what we noticed, what we changed, and what we're still unsure about. Link it as [#N](url).
Tell it from the team's side ("we"). Keep it honest and a little humble. No engineering jargon a non-engineer couldn't follow.`,
    'building-in-public',
  ],
  'mission-essay': [
    'consumer',
    'Mission',
    [600, 1200],
    `A short essay on why Ferni exists: loneliness, friendship, and what it means to be present for someone.
Think out loud, the way a thoughtful friend would. Use the brand and mission excerpts in the facts for what Ferni believes.
Never claim Ferni replaces people: Ferni is for the gaps, when your people aren't around.
No statistics unless they appear word for word in the facts. Any example person is a composite and the post must say so.`,
  ],
  'how-ferni-works': [
    'consumer',
    'Product',
    [500, 1000],
    `A plain-language "how Ferni works" post about one or two features.
Only describe features that a merged pull request in the facts shows us building; link each PR as [#N](url). The capabilities excerpt is what we're aiming for, not what ships: never present it as done.
We can't tell from here what's live for everyone, so phrase it as "we've been building" or "we've been working on", never "you can now" or "available today".`,
  ],
  'team-letter': [
    'consumer',
    'Letters from the Team',
    [350, 750],
    `A letter written in the voice of the character named in the facts, to the people who talk to them.
Write about ONE idea they care about, shown through one small moment from their life. Open inside that moment, not with who they are: no list of their habits, family or history.
The moment must be one their biography already tells. Retell it in their voice, and add nothing to it: no new event, person, place, line of dialogue, or how it turned out.
Write the way they talk: first person, contractions, warm and specific, in their own words rather than lines or catchphrases from the facts.
Stay in character: a letter never mentions product news, releases, speeds or how Ferni is built, and never says they are a character (a note above the letter already does).
End by inviting the reader to talk to them on Ferni, naming one specific thing to bring to that conversation.
Never claim they are a real person or that they have met real people who use Ferni.`,
    'letters-from-the-team',
  ],
};

export const POST_TYPES: Record<string, PostType> = Object.fromEntries(
  Object.entries(SPECS).map(([id, [audience, category, [min, max], brief, series]]) => {
    const folder = FOLDERS[audience];
    return [
      id,
      { id, audience, folder, category, author: TEAM, series, words: { min, max }, brief },
    ];
  })
);

export function getPostType(id: string): PostType {
  if (!(id in POST_TYPES)) throw new Error(`unknown post type "${id}"`);
  return POST_TYPES[id];
}
