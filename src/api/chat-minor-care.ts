/**
 * MINOR_CARE in text chat (api/chat-routes.ts): a caller held from a voice call keeps nothing here.
 *
 * The hold (utils/minor-care.ts) is bound to the user for 6 h, but chat has no session and runs
 * in the API server, which sees a call's hold only through the shared record
 * (services/outreach/minor-care-shared-hold.ts, MINOR_CARE_SHARED_HOLD). So the route reads it
 * once per request: the model gets the voice path's note (never promise to remember), and every
 * tool gets ctx.held and no message text (the dispatcher's learning loop keeps inputText).
 *
 * @module api/chat-minor-care
 */
import { MINOR_CARE_NOTE, userHeld } from '../utils/minor-care.js';
import { sharedHeld } from '../services/outreach/minor-care-shared-hold.js';

export interface ChatHold {
  held: boolean;
  /** For the model's prompt: MINOR_CARE_NOTE when held, else ''. */
  note: string;
}

/** This chat caller's hold: one held in this process, or the shared record. Never a placeholder id. */
export async function chatHold(userId: string): Promise<ChatHold> {
  const held = userHeld(userId) || (await sharedHeld(userId));
  return { held, note: held ? MINOR_CARE_NOTE : '' };
}

/** The tool context for this caller: held (the writers keep nothing), or the text to learn from. */
export function chatToolContext(
  userId: string,
  hold: ChatHold,
  inputText: string,
  personaId?: string
): { userId: string; personaId?: string; held?: true; inputText?: string } {
  return { userId, personaId, ...(hold.held ? { held: true } : { inputText }) };
}
