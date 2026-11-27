/**
 * ON_BEHALF_FULL_CONTEXT, decided once per call where the agent job reads its
 * dispatch (metadata-parser.ts): who the person called is to the requester and
 * what the requester said about the call, from the signed dispatch only. The
 * prompt (outbound-call-context.ts) reads only what this sets, never the flag.
 *
 * Prod 2026-11-25: asked to phone the user's mother to thank her, Ferni was
 * told "You are calling: mom" and nothing of who she was to him.
 *
 * @module agents/voice-agent-entry/on-behalf-full-context
 */

import { callBackgroundOf } from '../../services/outreach/on-behalf-dispatch.js';
import { groupOf, relationOf } from '../../memory/domain/index.js';
import type { FullCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';

/** Long enough for a few sentences of background, short enough to stay background. */
const BACKGROUND_MAX_CHARS = 600;

/** Read from metadata the parser only casts: room metadata is not signed and may carry anything. */
interface OnBehalfContextFields {
  recipientName: unknown;
  script: unknown;
  userName: string;
}

/**
 * What ON_BEHALF_FULL_CONTEXT changes in the call's outbound context, for the
 * caller to lay over it. `signedRaw` is the job metadata only when its
 * signature verified: an unsigned dispatch adds no relationship or background.
 */
export function fullContextOf(
  signedRaw: string | undefined,
  context: OnBehalfContextFields
): FullCallContext & { recipientName: string; script: string } {
  const signed = signedRaw ? callBackgroundOf(signedRaw) : {};
  const relationship = signed.relationship ? relationOf(signed.relationship) : undefined;
  const group = relationship
    ? groupOf(relationship)
    : signed.relationship?.trim().toLowerCase() === 'family'
      ? 'family'
      : undefined;
  const placed = typeof context.script === 'string' ? context.script : '';
  const { script, background } = backgroundOutOfScript(
    placed,
    context.userName,
    signed.additionalContext
  );
  return {
    recipientName: typeof context.recipientName === 'string' ? context.recipientName : 'Unknown',
    script,
    fullContext: true,
    ...(relationship && { relationship }),
    ...(group && { relationshipGroup: group }),
    ...(background && { background }),
  };
}

/**
 * The placer's script keeps main's "Additional Context" section (scripts/index.ts
 * buildCallScript). Here it moves out of the script, so the prompt gives it once,
 * as background. If the section is there but not exactly as expected, it stays in
 * the script and no second copy is added.
 */
function backgroundOutOfScript(
  script: string,
  userName: string,
  said: string | undefined
): { script: string; background?: string } {
  if (!said?.trim()) return { script };
  const section = `\n\n### Additional Context (from ${userName}; their "I" means ${userName})\n${said}`;
  const without = script.replace(section, '');
  if (without === script && script.includes('### Additional Context (from ')) return { script };
  return { script: without, background: oneLine(said) };
}

/** Newlines would put the requester's words outside their quote in the prompt. */
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= BACKGROUND_MAX_CHARS) return flat;
  return `${flat.slice(0, BACKGROUND_MAX_CHARS - 1).trimEnd()}…`;
}
