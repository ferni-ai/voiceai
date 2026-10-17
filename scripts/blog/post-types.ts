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
    `A "what's new" post for developers building on Ferni, covering the merged pull requests in the facts.
Group related changes under a few plain headings. For each change, say what changed and why it matters to a developer, and link its PR as [#N](url).
Leave out changes a developer wouldn't notice (CI, refactors, docs) unless they explain something bigger.
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
    [500, 1000],
    `A letter written in the voice of the character named in the facts, to the people who talk to them.
Use only that character's life details from their biography; never invent a new relative, place or event. Write it in first person, warm and specific, about one idea they care about.
The character is a character: the letter must not claim they are a real person or that they have met real people who use Ferni.`,
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
