/**
 * The crisis responses in Ferni's own voice (CRISIS_SCRIPT_HUMAN, off by default).
 *
 * The fixed responses in crisis-guard.ts are clinically sound but read like a
 * leaflet: "What you're feeling is real and valid, and it takes courage to
 * share it", "trained counselors available 24/7". The 2026-10-21 humanness red
 * team filed that register as an AI tell (#2334, #2333): a friend who hears
 * this says less, plainer, and stays. These say the same things in fewer,
 * warmer words:
 *   - imminent: 911 or the nearest emergency room, 988 by call or text, "I'm
 *     staying right here", and who is nearby (IN_DANGER_NOW is unchanged);
 *   - about someone else: 988 for them or with them, 911 if they're in danger
 *     now, and what is happening with them;
 *   - severe, and high distress: 988 by call or text, any time, "I'm here",
 *     and an open question.
 * Spanish keeps crisis-guard.ts's response. Voice rules apply: no dashes,
 * ellipses or stage directions (speech-markup-notes.ts). crisis-line-speech.ts
 * still speaks "988" as nine eight eight.
 *
 * @module services/safety/crisis-voice
 */

import { flagOn, type Env } from '../../config/env-flag.js';

export type CrisisVoiceKind = 'imminent' | 'third_party' | 'severe' | 'distress';

export function crisisVoiceOn(env: Env = process.env): boolean {
  return flagOn('CRISIS_SCRIPT_HUMAN', env);
}

/** Ferni's words for one kind of crisis response. `inDangerNow` is crisis-guard's IN_DANGER_NOW. */
export function crisisVoice(kind: CrisisVoiceKind, inDangerNow: string): string {
  switch (kind) {
    case 'imminent':
      return `I'm really glad you told me, and I'm right here.

If you've taken something or you're in danger right now, ${inDangerNow}

I'm staying right here with you. Is anyone close by who can be with you?`;
    case 'third_party':
      return `That sounds really scary, and I'm glad you're looking out for them.

You can call or text 988 for them, or with them, and someone will help you work out what to do. If they're in danger right now, call 911.

What's happening with them?`;
    case 'severe':
      return `I'm so glad you told me. That sounds really heavy, and you don't have to hold it by yourself.

If you're thinking about suicide, you can call or text 988 any time, day or night, and talk to someone who knows exactly how to help.

I'm here too. What's going on?`;
    case 'distress':
      return `That sounds really hard, and I'm glad you said something.

If it ever gets to be too much, you can call or text 988, day or night.

I'm right here. What's weighing on you most?`;
  }
}
