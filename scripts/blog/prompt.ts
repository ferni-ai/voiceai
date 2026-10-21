/** The prompt a draft is written from, and how the model's answer is read. */

import { HOUSE_CONSTRAINTS, renderPack, type Source } from './grounding.js';
import type { ExistingPost } from './existing-posts.js';
import type { PostType } from './post-types.js';
import type { GateIssue } from './brand-gate.js';

export interface DraftText {
  title: string;
  excerpt: string;
  body: string;
}

const RULES = `Voice: warm, clear and human, the way a thoughtful friend talks. Contractions, short sentences, plain words. Say "you" or "people", never "users".
Hard rules (a draft that breaks one is rejected):
- Use ONLY the facts in the FACTS section. If a fact isn't there, leave it out. Never invent a person, quote, testimonial, statistic, number, date or event.
- No numbers or percentages unless the same number appears in the FACTS.
- Any example person is a composite: say so once, plainly, in your own words. Never give a composite the name of a Ferni character (Maya, Alex, Jordan, Nayan, Peter, Ferni).
- Never repeat a sentence from an earlier post, and never list a source the post doesn't use.
- No personal handles, emails or payment links in the text.
- Never write "real stories", "real people who", "names changed" or "shared with permission".
- No em dashes and no ellipses. Use commas and full stops.
- Never name Gemini Live, OpenAI Realtime, GCE or Sonata: those are retired.
- Never use these words or phrases: {FORBIDDEN}.`;

export function buildPrompt(
  type: PostType,
  sources: Source[],
  existing: ExistingPost[],
  forbidden: string[],
  feedback: GateIssue[] = []
): string {
  const recent =
    existing
      .slice(0, 30)
      .map((p) => `- ${p.title} (${p.slug})`)
      .join('\n') || '- none yet';
  const retry = feedback.length
    ? `\n\nYOUR LAST DRAFT WAS REJECTED. Fix every one of these and change nothing else:\n${feedback.map((i) => `- [${i.rule}] ${i.message}`).join('\n')}`
    : '';
  // A character's letter stays in its world: no product status in Peter's voice.
  const constraints =
    type.audience === 'consumer' && type.id !== 'team-letter'
      ? `TRUE TODAY (never contradict these; don't mention them unless the post is about them)\n${HOUSE_CONSTRAINTS.map((c) => `- ${c}`).join('\n')}\n\n`
      : '';
  const review =
    type.audience === 'developer'
      ? 'A judge scores it for honesty, voice and whether it matters to developers, and it publishes only if it passes.'
      : "A judge scores it for honesty, voice and whether it matters to the reader, and then Ferni's owner reads it: it publishes only if both say yes.";
  return `You are drafting a post for Ferni's ${type.audience === 'developer' ? 'developer blog' : 'blog'}. ${review}

WHAT TO WRITE
${type.brief}
Length: ${type.words.min} to ${type.words.max} words of body.

${RULES.replace('{FORBIDDEN}', forbidden.join(', '))}

POSTS ALREADY PUBLISHED (don't repeat their topic or title)
${recent}

${constraints}ANSWER FORMAT
Only a JSON object: {"title": "...", "excerpt": "one sentence", "body": "markdown, no front matter, no H1"}, or {"skip": true} when the facts hold nothing worth a post of this kind.

FACTS
${renderPack(sources)}${retry}`;
}

/** The model's JSON, with or without a code fence around it; null when it chose to skip. */
export function parseDraft(raw: string): DraftText | null {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(json) as Partial<DraftText> & { skip?: unknown };
  if (parsed.skip === true) return null;
  for (const key of ['title', 'excerpt', 'body'] as const) {
    if (typeof parsed[key] !== 'string' || !parsed[key])
      throw new Error(`model answer has no "${key}"`);
  }
  return parsed as DraftText;
}
