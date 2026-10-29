/**
 * rememberAboutUser's results (tools.ts and tools-unified.ts): short, honest,
 * and not something to read out. Never empty, since an empty result reads to
 * the model as "nothing happened" (agents/personas/tool-output-guard.ts).
 * REMEMBERED doesn't say "saved": tools.ts hands the fact on without
 * waiting for the write.
 *
 * @module tools/domains/memory/remember-results
 */
export const REMEMBERED = 'Noted for next time. Carry on; no need to mention it.';
export const REMEMBERED_THIS_CALL =
  "Noted for this call, but it couldn't be saved for next time. Carry on; no need to mention it.";

/** rememberImportantFact's answers once the fact is kept, by its type. */
const IMPORTANT_REPLIES: Record<string, string[]> = {
  life_event: [
    `That's a significant moment in your life. I'll remember this.`,
    `Thank you for trusting me with that. It's important.`,
  ],
  decision: [
    `That's a big decision. I'll keep this in mind.`,
    `I understand the weight of that choice. I won't forget.`,
  ],
  breakthrough: [
    `That's wonderful progress! I'm so glad you shared that.`,
    `What a breakthrough. This is really important.`,
  ],
  milestone: [
    `Congratulations on reaching that milestone. I'll remember this moment.`,
    `That's worth celebrating. I'll keep this in mind.`,
  ],
  concern: [
    `I hear that this is weighing on you. I'll remember.`,
    `That concern is valid. I'll keep this in mind.`,
  ],
  default: [`I'll hold onto that. It feels important.`, `Thank you for trusting me with that.`],
};

export function importantReply(type: string): string {
  const options = IMPORTANT_REPLIES[type] ?? IMPORTANT_REPLIES.default;
  return options[Math.floor(Math.random() * options.length)];
}
