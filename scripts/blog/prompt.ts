/** The prompt a draft is written from, and how the model's answer is read. */

import { renderPack, type Source } from './grounding.js';
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
- Any example person is a composite: say so in the post ("a composite we wrote, not a real person").
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
  return `You are drafting a post for Ferni's ${type.audience === 'developer' ? 'developer blog' : 'blog'}. A judge scores it for honesty, voice and whether it matters to the reader, and it publishes only if it passes.

WHAT TO WRITE
${type.brief}
Length: ${type.words.min} to ${type.words.max} words of body.

${RULES.replace('{FORBIDDEN}', forbidden.join(', '))}

POSTS ALREADY PUBLISHED (don't repeat their topic or title)
${recent}

ANSWER FORMAT
Only a JSON object: {"title": "...", "excerpt": "one sentence", "body": "markdown, no front matter, no H1"}

FACTS
${renderPack(sources)}${retry}`;
}

/** The model's JSON, with or without a code fence around it. */
export function parseDraft(raw: string): DraftText {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(json) as Partial<DraftText>;
  for (const key of ['title', 'excerpt', 'body'] as const) {
    if (typeof parsed[key] !== 'string' || !parsed[key])
      throw new Error(`model answer has no "${key}"`);
  }
  return parsed as DraftText;
}
