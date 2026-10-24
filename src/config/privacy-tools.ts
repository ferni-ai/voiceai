/**
 * Privacy controls: a member's "forget that" (forgetMemory) and "that's wrong"
 * (updateMemory). They must always be runnable, so every tool cap keeps them
 * (isEssentialTool in tool-config.ts); they never compete for a slot with music.
 */
export const PRIVACY_TOOLS: readonly string[] = ['forgetMemory', 'updateMemory'];

export function isPrivacyTool(toolName: string): boolean {
  return PRIVACY_TOOLS.includes(toolName);
}
