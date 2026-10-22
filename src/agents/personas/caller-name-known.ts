/**
 * Whether this call already has the caller's name, by any path: the dispatch
 * metadata or the profile (userData.userName, the profile's preferredName or
 * name), or the caller saying it ("I'm Jess").
 *
 * Prod sweep 2026-10-21: in 4 of 16 first calls Ferni said "I'm Ferni, by the
 * way. What should I call you?" right after "Morning, Sam". The greeting used
 * the name from the dispatch metadata (user_name, as the app sends for every
 * signed-in caller, token.ts), but the first-call note (first-call-rapport.ts)
 * never looked at it: it told the model "if you don't know their name yet,
 * swap names" and quoted the exact line, and the model said it. The judge
 * scored conduct 1 on those calls.
 *
 * Placeholders are not names: "the user" (metadata-parser.ts), "Visitor" (the
 * demo room, livekit.ts) and the like.
 *
 * @module agents/personas/caller-name-known
 */

import type { llm } from '@livekit/agents';

import { extractCallerName } from '../../utils/caller-name.js';

const PLACEHOLDERS = new Set([
  'the user',
  'user',
  'the caller',
  'caller',
  'guest',
  'visitor',
  'anonymous',
  'unknown',
  'friend',
  'there',
  'someone',
]);

/** A name, not a blank, a placeholder or an "(unknown)" marker. */
function realName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  return (
    name.length >= 2 &&
    /\p{L}/u.test(name) &&
    !/unknown|^\(/i.test(name) &&
    !PLACEHOLDERS.has(name.toLowerCase())
  );
}

interface NamedUser {
  userName?: unknown;
  name?: unknown;
  services?: { userProfile?: { preferredName?: unknown; name?: unknown } | null };
}

/** The name the call was set up with (metadata or profile), or undefined. */
export function accountName(userData: unknown): string | undefined {
  const u = userData as NamedUser | undefined;
  const profile = u?.services?.userProfile;
  const found = [profile?.preferredName, u?.userName, profile?.name, u?.name].find(realName);
  return found?.trim();
}

/** What the caller has said so far, this turn included. */
function callerLines(chatCtx: llm.ChatContext, callerWords: string): string[] {
  const said = chatCtx.items.flatMap((item) =>
    item.type === 'message' && item.role === 'user' ? [item.textContent ?? ''] : []
  );
  return callerWords ? [...said, callerWords] : said;
}

/** They gave their own name on this call ("I'm Jess"), this turn included. */
export function nameSaidOnCall(chatCtx: llm.ChatContext, callerWords = ''): boolean {
  return callerLines(chatCtx, callerWords).some((line) => extractCallerName(line) !== null);
}

/** The call has their name: from the account, or they said it on this call. */
export function callerNameKnown(
  chatCtx: llm.ChatContext,
  userData: unknown,
  callerWords = ''
): boolean {
  return accountName(userData) !== undefined || nameSaidOnCall(chatCtx, callerWords);
}
