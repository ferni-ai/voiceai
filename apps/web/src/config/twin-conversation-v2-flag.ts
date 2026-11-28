/**
 * Talk to Twin, conversation v2 (web). Off by default.
 *
 * When on, the panel opens with the app's own note instead of a canned line in
 * the person's voice: the twin's first words are the model's, never ours.
 * Turn it on for a build with VITE_TWIN_CONVERSATION_V2=true, or for one browser
 * with localStorage `ferni:flag:twin-conversation-v2` = 'true' ('false' forces it off).
 *
 * The server's twin is TWIN_CONVERSATION_V2 (src/config/flags); the two promote together.
 *
 * @module config/twin-conversation-v2-flag
 */

export const TWIN_CONVERSATION_V2_STORAGE_KEY = 'ferni:flag:twin-conversation-v2';

export function isTwinConversationV2On(): boolean {
  try {
    const override = localStorage.getItem(TWIN_CONVERSATION_V2_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_TWIN_CONVERSATION_V2 === 'true';
}
