/**
 * The reply-opener and catchphrase hints from response naturalness
 * (src/speech/response-naturalness.ts). Moved out of context-injections.ts.
 *
 * Both quote a canned line for the model to say ("Start your response with:
 * ...", "weave in this signature phrase: You've got this."), so they are off
 * unless FERNI_SCRIPTED_HINT_LINES=on (see intelligence/scripted-hint-lines.ts).
 *
 * @module agents/processors/turn-processor/response-style-hints
 */
import { scriptedHintLinesEnabled } from '../../../intelligence/scripted-hint-lines.js';
import type { ContextInjection } from '../types.js';

export function responseStyleHints(enhancements: {
  prefix: string | null;
  suffix: string | null;
}): ContextInjection[] {
  if (!scriptedHintLinesEnabled()) return [];
  const injections: ContextInjection[] = [];
  if (enhancements.prefix) {
    injections.push({
      category: 'response_prefix',
      content: `[RESPONSE STYLE]\nStart your response with: "${enhancements.prefix.replace(/<[^>]+>/g, '')}"\nThen continue with your substantive response.\n\n⛔ NEVER SAY: "Good question", "Great question", "Well...", "That's a great point" - these are AI clichés. Just respond naturally.`,
      priority: 15,
    });
  }
  if (enhancements.suffix) {
    injections.push({
      category: 'catchphrase',
      content: `[CATCHPHRASE MOMENT]\nIf appropriate, weave in this signature phrase naturally: "${enhancements.suffix.replace(/<[^>]+>/g, '')}"`,
      priority: 12,
    });
  }
  return injections;
}
