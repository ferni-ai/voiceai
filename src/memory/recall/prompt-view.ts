/**
 * What prompt readers see of the caller's memory: a filtered view, built at
 * the source instead of reader by reader (FORGET_EVERY_READER=on).
 *
 * More than thirty prompt readers take the caller's profile and this call's
 * key moments straight off the session (services.userProfile,
 * userData.keyMoments). Patching each one missed some, so prompt builders now
 * get views: promptServices and promptUserData wrap the session objects, and
 * every read through them is filtered (every profile field but the allowlist,
 * forget-profile.ts; every userData field but its own allowlist). A read
 * that holds nothing forgotten returns the real value, the same reference, so
 * a builder that writes into it still writes into the session; a write
 * through a view goes to the real object. Writers keep the raw objects.
 *
 * A view filters with the caller's topics as they stand when it is made (one
 * check per turn, one per greeting) and caches what it filtered for that
 * check only, so the next turn filters again: a key moment pushed into the
 * session in place is filtered on the next turn, never served from a cache
 * that holds the raw value. Class instances (the conversation state manager)
 * pass through whole, methods intact; readers of their text filter it with
 * promptText. Flag off: the objects themselves.
 *
 * @module memory/recall/prompt-view
 */
import { forgottenCheck, type ForgottenCheck } from './forget-every-reader.js';
import { isStructuralKey, PROFILE_PASS_THROUGH, scrub, scrubProfile } from './forget-profile.js';

declare const PROMPT_VIEW: unique symbol;
/** An object prompt readers may read: built by promptServices / promptUserData only. */
export type PromptView<T> = T & { readonly [PROMPT_VIEW]: true };

/** userData fields that pass unfiltered: who the caller is and turn bookkeeping. */
export const USER_DATA_PASS_THROUGH: ReadonlySet<string> = new Set([
  ...PROFILE_PASS_THROUGH,
  'userName',
  'isReturningUser',
  'turnCount',
  'sessionDurationMs',
  'availableToolNames',
  'currentPersona',
  'personaId',
]);

/** What each check (one turn) filtered, per raw value: gone with the check. */
const perCheck = new WeakMap<ForgottenCheck, WeakMap<object, unknown>>();

function filtered(value: unknown, check: ForgottenCheck, of: (v: object) => unknown): unknown {
  if (!value || typeof value !== 'object') return scrub(value, check);
  let cache = perCheck.get(check);
  if (!cache) perCheck.set(check, (cache = new WeakMap()));
  if (cache.has(value)) return cache.get(value);
  const out = of(value);
  cache.set(value, out);
  return out;
}

/** A property a Proxy must return unchanged (non-configurable, non-writable): a frozen object's. */
const pinned = (o: object): boolean =>
  Object.isFrozen(o) ||
  Object.values(Object.getOwnPropertyDescriptors(o)).some(
    (d) => !d.configurable && 'value' in d && !d.writable
  );

function view<T extends object>(target: T, read: (key: string, value: unknown) => unknown): T {
  const seen = (key: string | symbol, value: unknown): unknown =>
    typeof key === 'string' && typeof value !== 'function' ? read(key, value) : value;
  if (!pinned(target)) {
    return new Proxy(target, {
      get: (t, key, receiver) => seen(key, Reflect.get(t, key, receiver)),
    });
  }
  // A frozen object's values can't be changed by a Proxy over it, so the Proxy is over an
  // extensible shadow and every read goes to the real object, filtered: own, inherited,
  // getters and non-enumerable alike. Nothing is written to it.
  const shadow = Object.create(Object.getPrototypeOf(target) as object | null) as T;
  const own = (key: string | symbol) => seen(key, Reflect.get(target, key, target));
  return new Proxy(shadow, {
    get: (_s, key) => own(key),
    has: (_s, key) => Reflect.has(target, key),
    ownKeys: () => Reflect.ownKeys(target),
    getOwnPropertyDescriptor: (_s, key) => {
      const d = Reflect.getOwnPropertyDescriptor(target, key);
      return (
        d && { configurable: true, enumerable: d.enumerable, writable: false, value: own(key) }
      );
    },
    set: (_s, key, value) => Reflect.set(target, key, value),
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

/** The session's services with userProfile filtered; writes go to the real services. */
export async function promptServices<S extends { userId?: string | null; userProfile?: unknown }>(
  services: S
): Promise<PromptView<S>> {
  const check = await forgottenCheck(services.userId, 'prompt-view');
  return (check ? servicesView(services, check) : services) as PromptView<S>;
}

/** The services view for a check already made (promptInput makes one per turn). */
export function servicesView<S extends object>(services: S, check: ForgottenCheck): S {
  return view(services, (key, value) =>
    key === 'userProfile' ? filtered(value, check, (p) => scrubProfile(p, check)) : value
  );
}

/** This call's userData with every field but the allowlist filtered (key moments, topics…). */
export function promptUserData<U extends object>(userData: U, check: ForgottenCheck | null): U {
  if (!check) return userData;
  return view(userData, (key, value) => {
    if (USER_DATA_PASS_THROUGH.has(key) || isStructuralKey(key)) return value;
    // userData carries the session's services too: same view as promptServices.
    if (key === 'services' && value && typeof value === 'object') return servicesView(value, check);
    return filtered(value, check, (v) => scrub(v, check));
  });
}

/**
 * Both session views for one prompt build, with one check, and the check for
 * the text the build reads off class instances (turn-processor/context-injections.ts).
 */
export async function promptViews<S extends { userId?: string | null }, U extends object>(
  services: S,
  userData: U
): Promise<{ services: PromptView<S>; userData: U; check: ForgottenCheck | null }> {
  const check = await forgottenCheck(services.userId, 'prompt-view');
  if (!check) return { services: services as PromptView<S>, userData, check };
  return {
    services: servicesView(services, check) as PromptView<S>,
    userData: promptUserData(userData, check),
    check,
  };
}

/** A prompt text with its lines about a forgotten topic left out (a summary a class builds). */
export function promptText(text: string, check: ForgottenCheck | null): string {
  if (!check) return text;
  return text
    .split('\n')
    .filter((line) => !check(line))
    .join('\n');
}

/** A profile read once for a prompt (the builders' input.userProfile). */
export function promptProfile<P>(profile: P, check: ForgottenCheck | null): P {
  if (!check || !profile || typeof profile !== 'object') return profile;
  return filtered(profile, check, (p) => scrubProfile(p, check)) as P;
}

export { forgottenCheck as promptCheck };
