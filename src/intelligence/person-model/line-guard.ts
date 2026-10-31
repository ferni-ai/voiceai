/**
 * The line-level privacy guard for private notes in a prompt: the call sheet (render.ts) and
 * the caller card (agents/multi-agent/caller-card) both use it, so there is one copy.
 *
 * @module intelligence/person-model/line-guard
 */
import { isForgotten, isSensitiveThread } from '../../memory/index.js';
import { hasContactData } from './util.js';

/**
 * Internal markup that must not reach the prompt: "[CONTEXT: ...]" style tags,
 * "{{...}}", HTML tags, emoji and a leading "#". Text left empty is dropped by callers.
 */
const MARKUP = [
  /\[\s*[A-Z][A-Z _-]{2,}[^\]]*\]/g,
  /\{\{[^}]*\}\}/g,
  /<[^>]*>/g,
  /\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3/gu,
];
export const oneLine = (s: string): string =>
  MARKUP.reduce((t, re) => t.replace(re, ' '), s)
    .replace(/^\s*#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * May this line be rendered: not about a forgotten topic, not sensitive (grief, health,
 * money...), and no contact data (a run of 7+ digits however split or written, an "@", a
 * spoken email; the shared rule in memory/domain/contact-data).
 */
export function lineIsSafe(text: string, o: { forgottenTopics: readonly string[] }): boolean {
  return !hasContactData(text) && !isForgotten(text, o.forgottenTopics) && !isSensitiveThread(text);
}
