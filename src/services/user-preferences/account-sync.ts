/**
 * Keeps the account profile's preference fields and the preference profile in
 * step, so existing personalization (PUT /api/account/profile, context builders
 * that read `profile.preferences.verbosity` / `topicsToAvoid`) and the new
 * profile agree.
 *
 * Direction:
 *   account settings → profile  (syncAccountPreferences, deliberate user settings)
 *   profile → account view      (applyPreferencesToAccountView: profile wins)
 *   profile → user profile doc  (mirrorToUserProfile, after voice/API changes)
 *
 * @module services/user-preferences/account-sync
 */

import { getDefaultStore } from '../../memory/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { accountPreferencesToInputs, responseLengthToVerbosity } from './legacy.js';
import { isActive } from './rules.js';
import { deletePreference, listPreferences, upsertPreference } from './store.js';
import type { UserPreference } from './types.js';

const log = createLogger({ module: 'UserPreferenceAccountSync' });

type Verbosity = 'concise' | 'balanced' | 'storytelling';

export interface AccountPreferenceFields {
  readonly verbosity?: string;
  readonly topicsToAvoid?: readonly string[];
}

/**
 * Write account-settings preferences into the profile. When `topicsToAvoid` is
 * given it is the full list: user-set avoid topics missing from it are removed.
 */
export async function syncAccountPreferences(
  userId: string,
  fields: AccountPreferenceFields
): Promise<void> {
  const inputs = accountPreferencesToInputs(fields);
  const keep = new Set<string>();
  for (const input of inputs) {
    const result = await upsertPreference(userId, input);
    if (result.preference) keep.add(result.preference.id);
  }
  if (fields.topicsToAvoid) {
    const prefs = await listPreferences(userId);
    for (const p of prefs) {
      if (
        p.domain === 'boundaries' &&
        p.key.startsWith('avoidTopic:') &&
        p.userEdited &&
        !keep.has(p.id)
      ) {
        await deletePreference(userId, p.id, 'user_deleted');
      }
    }
  }
}

function accountView(prefs: readonly UserPreference[]): {
  verbosity?: Verbosity;
  topicsToAvoid: string[];
} {
  const active = prefs.filter(isActive);
  const length = active.find(
    (p) => p.domain === 'conversation' && p.key === 'responseLength'
  )?.value;
  const verbosity = length ? (responseLengthToVerbosity(length) ?? undefined) : undefined;
  const topicsToAvoid = active
    .filter((p) => p.domain === 'boundaries' && p.key.startsWith('avoidTopic:'))
    .map((p) => p.value);
  return { ...(verbosity ? { verbosity } : {}), topicsToAvoid };
}

/** Overlay the profile onto an account `preferences` object (the profile wins). */
export async function applyPreferencesToAccountView<
  T extends { verbosity?: string; topicsToAvoid?: string[] },
>(userId: string, accountPrefs: T): Promise<T> {
  const view = accountView(await listPreferences(userId));
  return {
    ...accountPrefs,
    ...(view.verbosity ? { verbosity: view.verbosity } : {}),
    topicsToAvoid: view.topicsToAvoid,
  };
}

/**
 * Mirror verbosity / avoid topics onto the stored user profile so context
 * builders that still read `profile.preferences` stay consistent.
 */
export async function mirrorToUserProfile(userId: string): Promise<void> {
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    if (!profile?.preferences) return;
    const view = accountView(await listPreferences(userId));
    if (view.verbosity) profile.preferences.verbosity = view.verbosity;
    profile.preferences.topicsToAvoid = view.topicsToAvoid;
    await store.saveProfile(profile);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Could not mirror preferences onto user profile');
  }
}
