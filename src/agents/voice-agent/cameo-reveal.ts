/**
 * Shows the app Ferni's introduction of a teammate, for this call only.
 *
 * The introduceMember tool emits `memberUnlocked` once Ferni has finished speaking the
 * introduction. Nothing listened, so the app's cameo_unlock handler (the reveal, the
 * roster, the intro) never ran. The emitter is shared by every call in the process,
 * so each call forwards only the reveals tagged with its own session.
 */
import { cameoUnlockEvents } from '../../tools/handoff/state.js';
import { createDataMessageSender, type DataMessageRoom } from '../shared/data-message-envelope.js';
import type { CameoUnlockEventData } from './cleanup-handler.js';

/** Forward this call's teammate reveals to the app; returns the cleanup */
export function forwardCameoReveals(
  room: DataMessageRoom | undefined,
  sessionId: string
): () => void {
  const send = createDataMessageSender(room);
  const onReveal = (data: CameoUnlockEventData) => {
    if (data.sessionId !== sessionId) return;
    void send('cameo_unlock', {
      memberId: data.memberId,
      displayName: data.displayName,
      role: data.role,
      spokenIntro: data.spokenIntro,
      timestamp: Date.now(),
    });
  };
  cameoUnlockEvents.on('memberUnlocked', onReveal);
  return () => void cameoUnlockEvents.off('memberUnlocked', onReveal);
}
