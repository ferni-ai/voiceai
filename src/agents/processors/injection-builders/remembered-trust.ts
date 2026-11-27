/**
 * What trust-builders.ts may quote from the trust stores (trust_profiles, loaded into memory at
 * call start) once the caller has asked Ferni to forget something.
 *
 * @module agents/processors/injection-builders/remembered-trust
 */

import { remembered } from '../../../memory/index.js';
import type { TrustContext } from '../../../services/trust-systems/index.js';

/**
 * The trust context less every stored item whose quoted text is about a topic the caller asked
 * Ferni to forget (#3682): a win, a growth reflection, a callback moment, a thinking-of-you
 * moment. Each holds the caller's own words, so the passage check reads it (any distinctive word
 * of a topic). Unchanged with no check (FORGET_EVERY_READER off, or no member).
 */
export function rememberedTrust(
  context: TrustContext,
  said: ((text: string) => boolean) | null
): TrustContext {
  if (!said) return context;
  const { celebrationOpportunity: win, growthReflection: growth } = context;
  const callback = context.callbackOpportunity;
  return {
    ...context,
    celebrationOpportunity: win && said(`${win.win.description} ${win.celebration}`) ? null : win,
    growthReflection:
      growth && said(typeof growth === 'string' ? growth : growth.reflection) ? null : growth,
    callbackOpportunity:
      callback && said(`${callback.moment?.content ?? ''} ${callback.suggestedCallback}`)
        ? null
        : callback,
    pendingOutreach: remembered(context.pendingOutreach ?? [], said, (m) =>
      [m.trigger?.context, m.trigger?.theirWords, m.message].join(' ')
    ),
    protectiveMemory: rememberedProtectiveMemory(context.protectiveMemory, said),
  };
}

/** One stored topic per line: a boundary, advice to hold back, a topic that may be reopening. */
const PROTECTIVE_ENTRY = /^(?:- |🚫 |⚠️ |💡 )/u;

/**
 * Protective memory (boundary-memory.ts buildProtectiveMemoryContext) less every entry about a
 * forgotten topic. "Topics that may be reopening" invites Ferni to raise one, so a forgotten
 * topic can't stay listed. A heading left with no entries goes, and with no entry left at all
 * the block is empty, as when nothing was stored.
 */
function rememberedProtectiveMemory(text: string, said: (text: string) => boolean): string {
  if (!text) return text;
  const lines = text.split('\n').filter((line) => !(PROTECTIVE_ENTRY.test(line) && said(line)));
  if (!lines.some((line) => PROTECTIVE_ENTRY.test(line))) return '';
  const heading = (line: string) => !PROTECTIVE_ENTRY.test(line) && line.endsWith(':');
  return lines
    .filter((line, i) => !heading(line) || PROTECTIVE_ENTRY.test(lines[i + 1] ?? ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
