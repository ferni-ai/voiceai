/**
 * rememberName: the model's tool for the caller's name (conversation-tools.ts).
 *
 * PR #2698 made "call me X" a confirm-before-rename flow behind
 * CALL_ME_VOCATIVE (name-confirm.ts), but this tool wrote profile.name and
 * preferredName at once and saved them, so the model could rename the caller
 * on "call me X" and skip the question. Prod also saved "Fern"
 * (speech-to-text for "Ferni") as a caller's name.
 *
 * - Always (a bug fix, flag on or off), after normalising (name-likeness.ts):
 *   "ferni" and "fern" are refused. A word like Ferni ("Furnee", "Jenni") or
 *   a team member's name ("Maya") is never refused and never saved on the
 *   first yes: a second "Just checking..." question must get a yes too.
 * - CALL_ME_VOCATIVE=on: a callback time ("later", "in five minutes",
 *   utils/callback-time.ts) is never a name. A new name is not written: it
 *   waits as #2698's pending `rename` question and the model is told to ask;
 *   the tool saves when called again after the caller's yes (the same settle()
 *   and yes as name-correction.ts). A first name is checked too, as #2698
 *   does. The question always holds the name the caller said last: a call
 *   with another name can't replace it. Without a question, only the name on
 *   the profile or one they said yes to on this call saves at once, never a
 *   session name from an unconfirmed correction.
 * - Off: otherwise unchanged.
 *
 * @module tools/domains/conversation/remember-name
 */

import { nameCaptureStrict, rejectsAsName } from '../../../utils/caller-name.js';
import { callMeVocativeEnabled } from '../../../utils/call-me-vocative.js';
import { isCallbackTime } from '../../../utils/callback-time.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Env } from '../../../config/env-flag.js';
import {
  confirmedOf,
  pendingOf,
  propose,
  settle,
  turnWordsOf,
  type Pending,
  type PendingKind,
} from './name-confirm.js';
import { doubleCheckLine, lastStatedName, nameLikeness } from './name-likeness.js';

/** What this tool reads and writes of the session's userData (services: services/types.ts). */
export interface NameToolUser {
  name?: string;
  userName?: string;
  personaId?: string;
  services?: {
    userProfile?: { id?: string; name?: string; preferredName?: string } | null;
    saveProfile: () => Promise<void>;
  };
}

const first = (name: string | undefined): string =>
  name?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
const sameName = (a: string, b: string | undefined): boolean => !!b && first(a) === first(b);

/** The name saved on the account (or by this tool, without a profile). */
function onFile(user: NameToolUser): string | undefined {
  const profile = user.services?.userProfile;
  return (profile ? profile.preferredName || profile.name : user.name) || undefined;
}

/** The name Ferni calls them now: this call's, then the profile's. */
const shown = (user: NameToolUser): string | undefined => user.userName || onFile(user);

const TAIL = 'Do NOT read this aloud.]';

const askNote = (name: string, current: string | undefined): string =>
  current
    ? `[INTERNAL: Not saved yet. Ask in one short line: "Want me to call you ${name} from now on?" ` +
      `Keep calling them ${current} until they say yes; on a yes, call rememberName with "${name}" again. ${TAIL}`
    : `[INTERNAL: Not saved yet. Check you heard it right in one short line ("${name}, did I get that right?") ` +
      `before you use it; on a yes, call rememberName with "${name}" again. ${TAIL}`;

const noYesNote = (name: string, current: string | undefined): string =>
  `[INTERNAL: They didn't say yes to "${name}", so it is not saved.` +
  `${current ? ` Keep calling them ${current}.` : ''} ${TAIL}`;

const latestNote = (latest: string, name: string): string =>
  `[INTERNAL: Not saved. The name they said last is ${latest}, not ${name}: don't use ${name}. ` +
  `Ask about ${latest} ("Want me to call you ${latest} from now on?"), and on a yes call ` +
  `rememberName with "${latest}". ${TAIL}`;

interface Ask {
  user: NameToolUser;
  /** The team name it sounds like, for a name asked twice. */
  team?: string;
}

/** The note for the open question about `p.name`: the usual one, or the second check. */
function noteFor(p: Pending, ask: Ask): string {
  if (p.check !== 'second' || !ask.team) return askNote(p.name, shown(ask.user));
  const speaking = ask.user.personaId?.split('-')[0] ?? 'ferni';
  return (
    `[INTERNAL: Not saved yet. ${doubleCheckLine(p.name, ask.team, speaking)} ` +
    `On that yes, call rememberName with "${p.name}" again. ${TAIL}`
  );
}

function ask(session: object, name: string, check: Pending['check'], a: Ask): string {
  const p: Pending = { kind: 'rename', name, askedOn: turnWordsOf(session), check };
  propose(session, p);
  getLogger().info({ hadName: !!shown(a.user), check }, 'rememberName: name waits for a yes');
  return noteFor(p, a);
}

interface Answer {
  yes: boolean;
  check?: Pending['check'];
}

/** How the caller answered an earlier question about `name`, on this turn's words; null if not asked. */
function answerFor(session: object, name: string): Answer | null {
  const words = turnWordsOf(session);
  if (!words) return null;
  for (const kind of ['rename', 'either'] as PendingKind[]) {
    // An open ring-or-name question is call-me-note.ts's to settle; only read its outcome here.
    if (kind === 'either' && pendingOf(session, kind)) continue;
    const done = settle(session, kind, words);
    if (!done || done.outcome === 'waiting' || !sameName(done.pending.name, name)) continue;
    return { yes: done.outcome === 'yes' || done.outcome === 'name', check: done.pending.check };
  }
  return null;
}

/** The name the caller said last: this turn, else on the turn the open question was asked. */
function latestStated(session: object): string | null {
  const open = pendingOf(session, 'rename');
  return lastStatedName(turnWordsOf(session)) ?? (open ? lastStatedName(open.askedOn) : null);
}

/** A call naming someone other than the caller's latest: the question stays on (or moves to) the latest. */
function keepLatest(session: object, latest: string, name: string): string {
  if (!sameName(pendingOf(session, 'rename')?.name ?? '', latest)) {
    const like = nameLikeness(latest);
    propose(session, {
      kind: 'rename',
      name: latest,
      askedOn: turnWordsOf(session),
      check: like.kind === 'name' ? undefined : 'first',
    });
  }
  return latestNote(latest, name);
}

/** With nothing asked: the name on the profile, or one they said yes to on this call (twice if like a team name). */
function savesAtOnce(session: object, name: string, a: Ask): boolean {
  const said = confirmedOf(session, name);
  return sameName(name, onFile(a.user)) || said === 'second' || (said === 'plain' && !a.team);
}

/** The note to return instead of saving, or null to save now. `vocative`: CALL_ME_VOCATIVE=on. */
function confirmFirst(session: object, name: string, a: Ask, vocative: boolean): string | null {
  const latest = vocative ? latestStated(session) : null;
  if (latest && !sameName(name, latest)) return keepLatest(session, latest, name);
  const answer = answerFor(session, name);
  if (answer && !answer.yes) return noYesNote(name, shown(a.user));
  if (answer?.yes)
    return a.team && answer.check !== 'second' ? ask(session, name, 'second', a) : null;
  // Nothing asked: only a name already confirmed saves (never a session name from an unconfirmed correction).
  if (savesAtOnce(session, name, a)) return null;
  const open = pendingOf(session, 'rename');
  if (open && sameName(open.name, name)) return noteFor(open, a); // never back to an earlier step
  return ask(session, name, a.team ? 'first' : undefined, a);
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

/** rememberName's body: refuse a non-name, ask before a rename, else save. */
export async function rememberName(
  name: string,
  user: NameToolUser,
  session: object,
  env: Env = process.env
): Promise<string> {
  const like = nameLikeness(name);
  // "Ferni!", "Fern.": the persona's own name, never the caller's (name-likeness.ts).
  if (like.kind === 'ferni') {
    getLogger().warn(
      `Blocked saving persona name "${name}" as user name - this is a team member, not the user!`
    );
    return `[INTERNAL: "${name}" is a team member name, not the user's name. Ask the user for their actual name.]`;
  }
  // NAME_CAPTURE_STRICT=on: a common word ("not", "sure") or a teammate's spelling (caller-name.ts).
  const firstWord = name.toLowerCase().trim().split(/\s+/)[0] ?? '';
  if (like.kind === 'name' && nameCaptureStrict(env) && rejectsAsName(firstWord)) {
    getLogger().warn({ name }, 'Blocked saving a non-name as the user name');
    return `[INTERNAL: "${name}" is not a name. Do not call them that; ask their name if you need it.]`;
  }
  const vocative = callMeVocativeEnabled(env);
  if (vocative && isCallbackTime(name)) {
    return `[INTERNAL: "${name}" is when they want a call, not their name. Don't save it as a name.]`;
  }
  if (!vocative && like.kind === 'name') return save(name, user);
  const team = like.kind === 'like' ? like.team : undefined;
  return confirmFirst(session, name, { user, team }, vocative) ?? save(name, user);
}
