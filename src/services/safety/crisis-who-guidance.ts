/**
 * Guidance for the two routes the who read adds (crisis-who.ts,
 * THIRD_PARTY_SELF_HARM=live). buildCrisisGuidance (crisis-guard.ts) asks here
 * first; anything else keeps its own guidance.
 *
 * Both texts are new copy, written for #2635 and awaiting Seth's review.
 *
 * @module CrisisWhoGuidance
 */

/** Marks a third-party read the who read found the caller at risk in too. */
export const WHO_SELF_AND_OTHER = 'who_self_and_other';
/** Marks a third-party read the who read found to be about someone who has died. */
export const WHO_BEREAVED = 'who_bereaved';

/**
 * The caller is grieving someone who has died. The person can no longer be
 * helped by 988, so "988 on their behalf" would wound; the caller can be.
 */
export const BEREAVED_GUIDANCE = `[CARE - GRIEF]
The user is grieving someone who has died. What they shared (a threat, an attempt, a last message) is about that loss, not a danger happening now.
Your response MUST:
1. Meet the loss with warmth: say you're sorry, and let them talk about the person if they want to
2. NEVER tell them to call 988 or 911 for the person who died
3. NEVER suggest they could have stopped it; if they blame themselves, be gentle
4. Ask how THEY are doing; losing someone this way is heavy. If they say they are struggling or thinking of hurting themselves, take it seriously and offer the 988 Suicide & Crisis Lifeline for themselves
5. If it turns out someone they mention is alive and may still be at risk, they can call or text 988 on that person's behalf, and 911 in immediate danger`;

/** The caller is at risk and is also worried about someone else: the caller first, the other person not dropped. */
function selfAndOther(header: string): string {
  return `${header}

The user may be at risk themselves, and is also worried that someone they know is at risk. Your response MUST:
1. Put the user first: acknowledge their pain with genuine empathy, without pressure
2. Include the 988 Suicide & Crisis Lifeline (call or text 988) for the user themselves
3. If anything they said means they are in danger right now (they have taken something, or have the means with them), ask them to call 911 or get to the nearest emergency room now
4. Take their worry about the other person seriously: they can call or text 988 on their behalf, and 911 if there is immediate danger
5. NEVER be dismissive or use platitudes like "it'll be okay"

You are their lifeline right now. Be fully present.`;
}

/** The who read's guidance for this detection, or null when it is not one of its routes. */
export function whoGuidance(
  crisis: { subject?: string; indicators: readonly string[] },
  header: string
): string | null {
  if (crisis.subject === 'bereaved') return BEREAVED_GUIDANCE;
  if (crisis.subject === 'self' && crisis.indicators.includes(WHO_SELF_AND_OTHER)) {
    return selfAndOther(header);
  }
  return null;
}
