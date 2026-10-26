/**
 * rememberName with CALL_ME_VOCATIVE=on (conversation-tools.ts hands the call
 * here; with the flag off the tool is unchanged).
 *
 * PR #2698 made "call me X" a confirm-before-rename flow, but rememberName
 * wrote profile.name and preferredName at once, so the model could rename the
 * caller and skip the question. Here a new name is never written on the
 * call that names it: the model is told to ask "Want me to call you X from
 * now on?", and the name is saved when the tool is called again for it on
 * the caller's next turn and that turn is a clear yes (isClearYes, the yes
 * that sends a text). Which name is being confirmed follows the tool calls
 * (name-confirm-calls.ts). A first name is checked the same way, as #2698
 * checks it. Ferni's own name is refused; a name like it or a teammate's is
 * asked about twice (name-likeness.ts); a callback time ("later", "in five
 * minutes") is never a name (utils/callback-time.ts).
 *
 * @module tools/domains/conversation/remember-name
 */

import { nameCaptureStrict, rejectsAsName } from '../../../utils/caller-name.js';
import { callMeVocativeEnabled } from '../../../utils/call-me-vocative.js';
import { isCallbackTime } from '../../../utils/callback-time.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { stepFor } from './name-confirm-calls.js';
import { nameLikeness, secondQuestion } from './name-likeness.js';

export { callMeVocativeEnabled };

/** What this reads and writes of the session's userData (services: services/types.ts). */
interface NameToolUser {
  name?: string;
  userName?: string;
  personaId?: string;
  services?: {
    userProfile?: { id?: string; name?: string; preferredName?: string } | null;
    saveProfile: () => Promise<void>;
  };
}

const TAIL = 'Do NOT read this aloud.]';

/** The name on the account (or saved by this tool, without a profile). */
function onFile(user: NameToolUser): string | undefined {
  const profile = user.services?.userProfile;
  return (profile ? profile.preferredName || profile.name : user.name) || undefined;
}

const askNote = (name: string, current: string | undefined): string =>
  current
    ? `[INTERNAL: Not saved yet. Ask in one short line: "Want me to call you ${name} from now on?" ` +
      `Keep calling them ${current} until they say yes; on a yes, call rememberName with "${name}" again. ${TAIL}`
    : `[INTERNAL: Not saved yet. Check you heard it right in one short line ("${name}, did I get that right?") ` +
      `before you use it; on a yes, call rememberName with "${name}" again. ${TAIL}`;

const secondNote = (name: string, team: string, user: NameToolUser): string =>
  `[INTERNAL: Not saved yet. ${name} sounds like ${team}, so check once more: ` +
  `"${secondQuestion(name, team, user.personaId?.split('-')[0] ?? 'ferni')}" ` +
  `Only on a yes to that, call rememberName with "${name}" again. ${TAIL}`;

const noYesNote = (name: string, current: string | undefined): string =>
  `[INTERNAL: They didn't say yes to "${name}", so it is not saved.` +
  `${current ? ` Keep calling them ${current}.` : ''} ${TAIL}`;

/** The tool's write, as it is with the flag off: this call, then the profile, saved now. */
async function save(name: string, user: NameToolUser): Promise<string> {
  getLogger().info(`Remembering user name: ${name}`);
  user.name = name;
  const { services } = user;
  if (services?.userProfile) {
    services.userProfile.name = name;
    services.userProfile.preferredName = name;
    try {
      await services.saveProfile();
    } catch (saveError) {
      getLogger().error({ error: String(saveError), name }, 'Failed to persist name to Firestore');
    }
  }
  return `[INTERNAL: Name "${name}" stored. Respond naturally - do NOT read this message aloud.]`;
}

/** CALL_ME_VOCATIVE=on: refuse a non-name, ask (once or twice) before a new name, else save. */
export async function rememberNameConfirmed(
  name: string,
  userData: unknown,
  session: object
): Promise<string> {
  const user = userData as NameToolUser;
  const like = nameLikeness(name);
  if (like.kind === 'ferni') {
    return `[INTERNAL: "${name}" is a team member name, not the user's name. Ask the user for their actual name.]`;
  }
  if (like.kind === 'name' && nameCaptureStrict() && rejectsAsName(name.trim().split(/\s+/)[0])) {
    return `[INTERNAL: "${name}" is not a name. Do not call them that; ask their name if you need it.]`;
  }
  if (isCallbackTime(name)) {
    return `[INTERNAL: "${name}" is when they want a call, not their name. Don't save it as a name.]`;
  }
  // Loaded here so the flag-off tool's import graph is unchanged.
  const { isClearYes } = await import('../communication/outreach/outreach-confirm.js');
  const step = stepFor(session, name, {
    twice: like.kind === 'twice',
    onFile: onFile(user),
    isYes: (words, asked) => isClearYes(words, [asked.toLowerCase()]),
  });
  const current = user.userName || onFile(user);
  if (step.kind === 'save') return save(name, user);
  if (step.kind === 'no') return noYesNote(name, current);
  getLogger().info({ second: step.second, hadName: !!current }, 'rememberName: waits for a yes');
  return step.second && like.kind === 'twice'
    ? secondNote(name, like.team, user)
    : askNote(name, current);
}
