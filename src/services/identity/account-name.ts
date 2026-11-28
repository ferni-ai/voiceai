/**
 * Writing a name onto the account, and the one NAME_SAVED line each write logs (#4389).
 *
 * The morning brief and every later call greet the person by the account's
 * preferredName (or name), so a rename is worth one log line. Before this,
 * nothing logged the save itself, and three renames in 30 days could not be
 * traced to a session. NAME_SAVED is words-free: where the write came from,
 * which kind of session, and whether the account had a name. Never the name,
 * nor any string from it.
 *
 * - confirm: a yes on a call (remember-name.ts), app or phone;
 * - settings: the account or profile screens (api/user-routes.ts, account-routes.ts);
 * - onboarding: the first name, from the onboarding screens or the call's dispatch.
 *
 * @module services/identity/account-name
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AccountName' });

export type NameSource = 'confirm' | 'settings' | 'onboarding';
/** api: a screen, not a call; call: a call's start, phone and app not told apart. */
export type NameSessionKind = 'app' | 'phone' | 'call' | 'api';
export type NameField = 'name' | 'preferredName';

export interface NameSave {
  source: NameSource;
  sessionKind: NameSessionKind;
  /** The account had a name before this write. */
  hadName: boolean;
}

const BOTH: readonly NameField[] = ['name', 'preferredName'];

/** The settings screen's preferred-name field (api/user-routes.ts). */
export const SETTINGS_PREFERRED_NAME = {
  source: 'settings',
  sessionKind: 'api',
  fields: ['preferredName'],
} as const;

/** One words-free line per account name write. Only these three fields are logged. */
export function logNameSaved({ source, sessionKind, hadName }: NameSave): void {
  log.info({ source, sessionKind, hadName }, 'NAME_SAVED');
}

/**
 * Writes `name` to these fields of the profile (both by default) and logs
 * NAME_SAVED. Storing the profile is the caller's, as before.
 */
export function writeAccountName(
  profile: Partial<Record<NameField, string>>,
  name: string,
  how: { source: NameSource; sessionKind: NameSessionKind; fields?: readonly NameField[] }
): void {
  const fields = how.fields ?? BOTH;
  const hadName = fields.some((field) => !!profile[field]);
  for (const field of fields) profile[field] = name;
  logNameSaved({ source: how.source, sessionKind: how.sessionKind, hadName });
}
