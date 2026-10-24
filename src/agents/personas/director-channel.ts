/**
 * The director is told where the call is happening (DIRECTOR_KNOWS_CHANNEL).
 *
 * The director's role line says every call is "a live, unscripted phone call"
 * (director-notes.ts roleFor), including calls in the web and iOS apps. Prod
 * 2026-10-23 (#2709): the owner, in the web app, asked Ferni to ring his phone;
 * `callUser` ran, and the director wrote "He thinks you're on a different
 * platform. Clarify you're already talking on the phone line." Ferni then told
 * the app call "We're on the line now" while the phone rang.
 *
 * With the flag on, an app call's director prompt says it is in the Ferni app,
 * not on a phone line, and that a request to be called means their phone
 * should ring. Phone calls, unknown channels and the flag off leave the prompt
 * exactly as it was.
 *
 * @module agents/personas/director-channel
 */

import { flagOn } from '../../config/env-flag.js';

export type CallChannel = 'app' | 'phone';

type Env = Record<string, string | undefined>;

export function directorKnowsChannel(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_KNOWS_CHANNEL', env);
}

const PHONE_ROLE = 'a live, unscripted phone call';
const APP_ROLE = 'a live, unscripted voice call in the Ferni app';

/** The line added for an app call. */
export const APP_CHANNEL_NOTE =
  'This call is in the Ferni app on their phone or computer, not a phone line. If they ask to be called or rung, they want their phone to ring: a real request, not confusion. Never tell the speaker to say they are already on the phone.';

/**
 * The director's system prompt for this call's channel. Unchanged unless the
 * flag is on and the call is known to be in the app.
 */
export function withCallChannel(
  system: string,
  channel: CallChannel | undefined,
  env: Env = process.env
): string {
  if (channel !== 'app' || !directorKnowsChannel(env)) return system;
  return `${system.replace(PHONE_ROLE, APP_ROLE)}\n${APP_CHANNEL_NOTE}`;
}

// Keyed by the AgentSession object, like the director itself (director-notes.ts setDirector).
const channels = new WeakMap<object, CallChannel>();

/** Record the call's channel when the turn listeners are installed (turn-observers.ts). */
export function rememberCallChannel(session: object, phone: boolean | undefined): void {
  if (phone === undefined) return; // not known: the director keeps today's wording
  channels.set(session, phone ? 'phone' : 'app');
}

export function callChannelOf(session: object): CallChannel | undefined {
  return channels.get(session);
}
