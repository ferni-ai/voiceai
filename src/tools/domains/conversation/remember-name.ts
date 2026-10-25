/**
 * rememberName: the model's tool for the caller's name (conversation-tools.ts).
 *
 * PR #2698 made "call me X" a confirm-before-rename flow behind
 * CALL_ME_VOCATIVE (name-confirm.ts), but this tool wrote
 * profile.name and preferredName at once and saved them, so the model could
 * rename the caller on "call me X" and skip the question. Prod also saved
 * "Fern" (speech-to-text for "Ferni") as a caller's name.
 *
 * - Always: Ferni's own name and its speech-to-text spellings ("Fern",
 *   "Fernie", "Ferny", "Furny", "Fernee", "Ferney") are never the caller's
 *   name, next to the persona names already refused. This is a bug fix and
 *   applies with the flag off too.
 * - CALL_ME_VOCATIVE=on: a callback time ("later", "in five minutes", "at 5",
 *   utils/callback-time.ts) is never a name. A new name is not written: it
 *   waits as the pending `rename` question #2698 uses, and the model is told
 *   to ask. It is saved when the tool is called again after the caller's yes
 *   (the same settle() and yes as name-correction.ts). A first name, with
 *   none on file, is checked the same way, as #2698 checks it
 *   (confirmNameNote). The same name as the current one saves as before.
 * - Off: unchanged, apart from the spellings above.
 *
 * @module tools/domains/conversation/remember-name
 */

import { nameCaptureStrict, rejectsAsName } from '../../../utils/caller-name.js';
import { callMeVocativeEnabled } from '../../../utils/call-me-vocative.js';
import { isCallbackTime } from '../../../utils/callback-time.js';
import { FERNI_HEARD_AS } from '../../../utils/teammate-talk.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Env } from '../../../config/env-flag.js';
import { pendingOf, propose, settle, turnWordsOf, type PendingKind } from './name-confirm.js';

/** What this tool reads and writes of the session's userData (services: services/types.ts). */
export interface NameToolUser {
  name?: string;
  userName?: string;
  services?: {
    userProfile?: { id?: string; name?: string; preferredName?: string } | null;
    saveProfile: () => Promise<void>;
  };
}

/** Team members (first, last and full names), and Ferni as speech-to-text hears it. */
const TEAM_NAMES = new Set<string>([
  ...'ferni|maya|peter|alex|jordan|nayan|santos|chen|taylor|john|patel|maya santos|alex chen|jordan taylor|peter john|nayan patel'.split(
    '|'
  ),
  ...FERNI_HEARD_AS,
  'fern',
  'fernee',
  'ferney',
]);

const first = (name: string | undefined): string =>
  name?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
const sameName = (a: string, b: string | undefined): boolean => !!b && first(a) === first(b);

/** The name Ferni has for them now: this call's, then the profile's. */
function currentName(user: NameToolUser): string | undefined {
  const profile = user.services?.userProfile;
  return user.userName || profile?.preferredName || profile?.name || user.name || undefined;
}

const askNote = (name: string, current: string | undefined): string =>
  current
    ? `[INTERNAL: Not saved yet. Ask in one short line: "Want me to call you ${name} from now on?" ` +
      `Keep calling them ${current} until they say yes; on a yes, call rememberName with "${name}" again. ` +
      `Do NOT read this aloud.]`
    : `[INTERNAL: Not saved yet. Check you heard it right in one short line ("${name}, did I get that right?") ` +
      `before you use it; on a yes, call rememberName with "${name}" again. Do NOT read this aloud.]`;

const noYesNote = (name: string, current: string | undefined): string =>
  `[INTERNAL: They didn't say yes to "${name}", so it is not saved.` +
  `${current ? ` Keep calling them ${current}.` : ''} Do NOT read this aloud.]`;

/** How the caller answered an earlier question about `name`, on this turn's words; null if not asked. */
function answerFor(session: object, name: string): 'yes' | 'no' | null {
  const words = turnWordsOf(session);
  if (!words) return null;
  for (const kind of ['rename', 'either'] as PendingKind[]) {
    // An open ring-or-name question is call-me-note.ts's to settle; only read its outcome here.
    if (kind === 'either' && pendingOf(session, kind)) continue;
    const done = settle(session, kind, words);
    if (!done || done.outcome === 'waiting' || !sameName(done.pending.name, name)) continue;
    return done.outcome === 'yes' || done.outcome === 'name' ? 'yes' : 'no';
  }
  return null;
}

/** CALL_ME_VOCATIVE=on: the note to return instead of saving, or null to save now. */
function confirmFirst(session: object, name: string, user: NameToolUser): string | null {
  const current = currentName(user);
  if (sameName(name, current)) return null;
  const answer = answerFor(session, name);
  if (answer === 'yes') return null;
  if (answer === 'no') return noYesNote(name, current);
  propose(session, { kind: 'rename', name, askedOn: turnWordsOf(session) });
  getLogger().info({ hadName: !!current }, 'rememberName: new name waits for a yes');
  return askNote(name, current);
}

/** Today's write: this call, the profile's name and preferredName, saved now. */
async function save(name: string, user: NameToolUser): Promise<string> {
  getLogger().info(`Remembering user name: ${name}`);
  user.name = name;
  const { services } = user;
  if (services?.userProfile) {
    services.userProfile.name = name;
    services.userProfile.preferredName = name;
    try {
      await services.saveProfile();
      getLogger().info(
        { name, userId: services.userProfile.id },
        '🎉 User name persisted to Firestore!'
      );
    } catch (saveError) {
      getLogger().error(
        { error: String(saveError), name },
        'Failed to persist name to Firestore - will be saved at session end'
      );
    }
  }
  return `[INTERNAL: Name "${name}" stored. Respond naturally - do NOT read this message aloud.]`;
}

/** rememberName's body: refuse a non-name, ask before a rename (flag on), else save. */
export async function rememberName(
  name: string,
  user: NameToolUser,
  session: object,
  env: Env = process.env
): Promise<string> {
  const nameLower = name.toLowerCase().trim();
  // "Hi Maya" after Maya introduces herself, or "call me, Ferni" heard as "call me Fern".
  if (TEAM_NAMES.has(nameLower)) {
    getLogger().warn(
      `Blocked saving persona name "${name}" as user name - this is a team member, not the user!`
    );
    return `[INTERNAL: "${name}" is a team member name, not the user's name. Ask the user for their actual name.]`;
  }
  // NAME_CAPTURE_STRICT=on: a common word ("not", "sure") or a teammate's spelling (caller-name.ts).
  if (nameCaptureStrict(env) && rejectsAsName(nameLower.split(/\s+/)[0] ?? '')) {
    getLogger().warn({ name }, 'Blocked saving a non-name as the user name');
    return `[INTERNAL: "${name}" is not a name. Do not call them that; ask their name if you need it.]`;
  }
  if (callMeVocativeEnabled(env)) {
    if (isCallbackTime(name)) {
      return `[INTERNAL: "${name}" is when they want a call, not their name. Don't save it as a name.]`;
    }
    const note = confirmFirst(session, name, user);
    if (note) return note;
  }
  return save(name, user);
}
