/**
 * The caller's words since Ferni last spoke, this transcript included: what the sight cue reads
 * (CRISIS_SIGHT_NEEDS_CUE, sight-emergency.ts), so a turn that arrives in pieces ("I can't see
 * your text" / "and my face went numb") is read whole (#3267). The same words the reply gate
 * reads (crisis-gate-words.ts callerWords().latest), plus the transcript if the chat context
 * doesn't hold it yet.
 *
 * @module agents/multi-agent/caller-words-since-ferni
 */
import { callerWords } from '../personas/crisis-gate-words.js';

interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** undefined when they can't be read: the sight cue then never drops main's alarm. */
export function callerWordsSinceFerni(
  items: readonly ItemView[],
  transcript: string
): string | undefined {
  try {
    const said = callerWords({ items } as never).latest;
    // This turn may already be in the chat context, whole or in part.
    if (said.endsWith(transcript) || said === '') return said || transcript;
    if (transcript.startsWith(said)) return transcript;
    return `${said} ${transcript}`;
  } catch {
    return undefined;
  }
}
