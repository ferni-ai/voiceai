/**
 * Story Normalizer
 *
 * Bundle stories were written in several shapes. The canonical one is
 * `{ content: string, triggers: string[] }`, but others exist:
 * - Nayan: no `triggers` (they live in `_index.json` as `topics`), text in
 *   `setup.context` + `narrative.paragraphs[].text`
 * - Maya: `story: { setup, narrative, ... }` + `tags`, or `content: { setup, ... }`
 * - Peter: `content: { opening, body, closing, key_insight }`
 * - Ferni's kintsugi: `core_teaching.content`
 *
 * Every consumer reads `story.triggers.some(...)` and `story.content.slice(...)`,
 * so a raw story reaching them crashed the turn (Nayan, live call 2026-10-17:
 * "Cannot read properties of undefined (reading 'some')"). The loader runs every
 * story through here so the rest of the code can trust the type.
 */

import type { BundleStory } from './types.js';

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/** Flattens the text shapes above into one string ('' when there is none). */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n\n');
  const obj = asRecord(value);
  for (const key of ['text', 'context', 'content', 'paragraphs']) {
    if (key in obj) return textOf(obj[key]);
  }
  return Object.values(obj)
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join('\n\n');
}

/**
 * Coerce a raw story file (plus its `_index.json` entry, whose `triggers` /
 * `topics` fill in when the file has none) into a valid BundleStory.
 */
export function normalizeBundleStory(raw: unknown, indexEntry: unknown): BundleStory {
  const story = asRecord(raw);
  const ref = asRecord(indexEntry);
  const triggers =
    [story.triggers, ref.triggers, ref.topics, asRecord(ref.use_conditions).topics, story.tags]
      .map(stringList)
      .find((list) => list.length > 0) ?? [];
  const content =
    textOf(story.content) ||
    textOf(story.story) ||
    [textOf(story.setup), textOf(story.narrative)].filter(Boolean).join('\n\n') ||
    textOf(story.core_teaching);
  const id = typeof story.id === 'string' ? story.id : String(ref.id ?? '');
  const category = (story.category ?? ref.category) as BundleStory['category'];
  return { ...(story as Partial<BundleStory>), id, triggers, content, category };
}
