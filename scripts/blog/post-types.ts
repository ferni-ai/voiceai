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
    `A "what's new" post for developers building on Ferni: the SDK, the developer API and the developer portal. Every pull request in the facts changed one of those, and none was covered by an earlier post.
Group related changes under a few plain headings. For each change, say in a full sentence with a subject ("We added...", "The API now...") what changed and why it matters to a developer, and link its PR as [#N](url).
Leave out a change a developer wouldn't notice. If none of them would, answer {"skip": true}.
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
    `A plain-language "how Ferni works" post about ONE feature a person can see or hear, on a call, in the app or on the site.
Pick the one merged pull request in the facts that changed what people see or hear, and tell it through the moment someone notices it: what they see or hear, then why we cared enough to build it. Link that PR as [#N](url).
Skip plumbing, policy, pricing and fixes nobody would notice. If no PR in the facts changed what a person sees or hears, answer {"skip": true}.
The capabilities excerpt is what we're aiming for, not what ships: never present it as done.
We can't tell from here what's live for everyone, so phrase it as "we've been building" or "we've been working on", never "you can now" or "available today".`,
  ],
  'team-letter': [
    'consumer',
    'Letters from the Team',
    [500, 1000],
    `A letter written in the voice of the character named in the facts, to the people who talk to them.
Tell ONE scene from their biography in detail: one place, one moment, what they noticed and what it taught them. Use at most three life details from the biography, never recite it, and never invent a new relative, place or event.
End by inviting the reader to call them on Ferni and try the idea together. First person, warm and specific.
The character is a character: the letter must not claim they are a real person or that they have met real people who use Ferni, and it says nothing about how Ferni is built, how fast it replies or how many people use it.`,
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
