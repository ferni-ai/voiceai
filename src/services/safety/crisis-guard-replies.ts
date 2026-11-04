/**
 * The crisis guard's pre-written replies, by who is at risk and how. Moved out of crisis-guard.ts
 * unchanged (500-line ratchet), beside the reply for an emergency happening to someone else.
 *
 * @module CrisisGuardReplies
 */

import type { CrisisSubject } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';

/** Where to turn when someone is in danger now; the action-claim guard reuses it (issue 1553). */
export const IN_DANGER_NOW =
  'please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.';

/**
 * Someone else is down and not getting up, or won't wake (owner, 2026-11-02): an emergency for
 * them, so the reply leads with 911 for them and stays with the caller. No 988: it isn't the
 * caller's crisis, and it isn't a mental-health line's call to make.
 */
export const EMERGENCY_FOR_THEM = `That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?`;

/**
 * Get appropriate crisis response based on severity
 */
export function getCrisisResponse(
  severity: number,
  subject: CrisisSubject | undefined,
  language: 'en' | 'es' | undefined,
  imminent: boolean
): string {
  if (imminent && language !== 'es') {
    return `I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, ${IN_DANGER_NOW}

I'm staying right here with you. Is anyone nearby who can be with you?`;
  }
  if (subject === 'third_party') {
    return `It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?`;
  }
  if (language === 'es') {
    return `Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?`;
  }
  if (severity >= SEVERITY.block) {
    // Severe crisis - immediate support + resources
    return `I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?`;
  }
  // High distress - validate + gentle support
  return `I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?`;
}
