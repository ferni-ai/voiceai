/**
 * The idle check-in: Ferni gently lets a quiet caller know they're still here. One cue, said
 * by session-state-handler.ts's idle warning and, with IDLE_END_CHECKIN on, by the
 * multi-agent idle check-in (phases/idle-checkin.ts).
 *
 * @module agents/voice-agent/idle-checkin-cue
 */
import type { Cue } from '../../speech/direction/index.js';

export const IDLE_CHECKIN_CUE: Cue = {
  moment: 'idle_checkin',
  direction:
    "They've gone quiet for a while. Gently let them know you're still here, with no pressure to talk. Don't ask if everything is okay.",
  fallback: "Hey, I'm still here if you need me. Just let me know when you want to continue.",
  urgency: 'soon',
};
