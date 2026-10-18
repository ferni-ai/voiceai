/**
 * FIRST_CALL_INTRO=on: the hello on someone's first call says who is calling.
 *
 * On four synthetic first calls (dev, 2026-10-18) the hello was "Morning,
 * Sam." and the stranger's first words were "Hello? Who is this?": an unknown
 * voice saying their name, like a spam call. GREETING_DIRECTION forbids an
 * intro on every call, and nothing told the director it was a first meeting.
 * Composes with FERNI_PLAYFUL: the name first, any tease after it.
 *
 * @module agents/multi-agent/first-call-greeting
 */

import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { returningOnceLoaded } from '../../services/session/deferred-profile.js';
import { firstCallIntroEnabled, isFirstCall } from '../personas/first-call-rapport.js';
import type { CallerHistory, GreetingUserData } from './greeting-direction.js';

/** How long the hello waits for a deferred profile, like its other lookups. */
const PROFILE_WAIT_MS = 400;

export function firstCallIntroDirection(personaName: string): string {
  return ` This is your first call together and they may not know your voice yet: open with hello, their name if you have it, and who you are, in a few words, the way a friend calling for the first time would ("Hi Sam, it's ${personaName}."). Your name comes first; anything playful comes after it and stays gentle, since you have only just met.`;
}

/** The base directions forbid an intro; a first call's hello needs one. */
const NO_INTRO = ' or introduce yourself';

/** A hello direction with the ban lifted and the first-call intro added. */
export function withFirstCallIntro(base: string, personaName: string): string {
  return base.replace(NO_INTRO, '') + firstCallIntroDirection(personaName);
}

/** Whether the profile, once loaded, is new; undefined if it is too slow. */
async function newOnceLoaded(
  services: NonNullable<GreetingUserData['services']>
): Promise<boolean | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), PROFILE_WAIT_MS);
  });
  const returning = await Promise.race([returningOnceLoaded(services, false), late]);
  clearTimeout(timer);
  return returning === undefined ? undefined : !returning;
}

/**
 * The name to introduce with: FIRST_CALL_INTRO on and a known account's first
 * call (first-call-rapport.ts), or undefined. A profile still loading can make
 * a returning caller look new, so this waits for it and stays quiet if it is
 * too slow.
 */
export async function firstMeeting(
  personaId: string,
  userData: GreetingUserData | undefined,
  history: CallerHistory | undefined
): Promise<string | undefined> {
  if (history || !firstCallIntroEnabled() || !isFirstCall(userData)) return undefined;
  const services = userData?.services;
  if (services && (await newOnceLoaded(services)) !== true) return undefined;
  return getPersonaDisplayName(personaId);
}

/** The understudy for a first call: hello and who is calling, nothing more. */
export function firstCallFallback(userName: string | undefined, personaName: string): string {
  return `Hi${userName ? ` ${userName}` : ''}, it's ${personaName}. How's it going?`;
}
