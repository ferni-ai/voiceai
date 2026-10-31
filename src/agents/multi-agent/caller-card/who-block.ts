/**
 * The "Who You're Talking To" block of every persona's model instructions, moved out of
 * agent-setup.ts: the profile lines agent-setup builds, then the caller card when there is
 * one. With no card it is the block agent-setup built before the card, byte for byte.
 *
 * @module agents/multi-agent/caller-card/who-block
 */
export function whoYoureTalkingTo(awareness: readonly string[], cardText: string | null): string {
  if (awareness.length === 0 && !cardText) return '';
  const parts = cardText
    ? [...awareness, ...(awareness.length > 0 ? [''] : []), cardText]
    : awareness;
  return `
---

## Who You're Talking To

${parts.join('\n')}

Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.
Reference past context when relevant, but don't force it. Let the conversation flow.
`;
}
