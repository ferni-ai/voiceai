/**
 * Voice cloning flag. Off by default.
 *
 * The clone flow had no consent step: it took any uploaded audio file and its
 * copy invited people to clone "someone you cherish". Until there is a consent
 * design (whose voices may be cloned, and how the speaker agrees), every way in
 * is hidden: the "Clone a Voice" wizard option, the legacy card's "Voice"
 * button and the recorder it opens. The server refuses the same routes behind
 * VOICE_CLONE_CREATION. Turn both on together with `VITE_VOICE_CLONE_CREATION=true`.
 */
export function isVoiceCloneCreationOn(): boolean {
  return import.meta.env.VITE_VOICE_CLONE_CREATION === 'true';
}
