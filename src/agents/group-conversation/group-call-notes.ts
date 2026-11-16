/**
 * GROUP_CALL: what Ferni is told about who is on the call, as system notes.
 *
 * The copy for each note (guest joined, guest left, owner dropped off, owner back) and
 * the bookkeeping that keeps the call's state in the persona's context. Notes are state,
 * not events: a persona handoff drops system notes (persona-swap.ts), so a persona that
 * has not been told the call is told it as it stands (the join note while the guest is
 * on, the owner-gone note while the owner is away) before any new note.
 * Names reach here already cleaned; every note names the guest with her role
 * (guestRole, guest-display-name.ts), so the model never sees a bare guest name.
 *
 * @module agents/group-conversation/group-call-notes
 */
import { firstNameOf } from '../../utils/caller-name.js';
import { dispatchedUserName } from '../../utils/ferni-intro.js';
import { addRecallNotes, type RecallAgent, type RecallNote } from '../multi-agent/recall-note.js';
import { guestLabel, guestRole } from './guest-display-name.js';

/**
 * A note about the guest or the owner. A standing note (the guest is on, the owner is
 * away) holds until the next note about the same person.
 */
export interface CallNote {
  readonly about: 'guest' | 'owner';
  readonly standing: boolean;
  readonly text: string;
}

/** First letter up, for a note that starts with a name like "the guest". */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The owner's first name from the session's profile, as calls on their behalf name them. */
export function ownerFirstName(userData: unknown): string {
  const user = userData as
    | {
        userName?: string;
        services?: { userProfile?: { preferredName?: string; name?: string } | null };
      }
    | undefined;
  const profile = user?.services?.userProfile;
  const name = dispatchedUserName(profile?.preferredName, profile?.name ?? user?.userName, false);
  return (name !== 'the user' && firstNameOf(name)) || 'the caller';
}

export function joinNote(name: string, owner: string): CallNote {
  const guest = guestRole(name);
  const text =
    `${sentence(guest)} is on this call by phone with ${owner}. ` +
    `Lines that start with ${guestLabel(name).trim()} are hers, and lines that start with [${owner}] are ${owner}'s. ` +
    'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
    'Talk with both of them, use their names, and let them talk to each other. ' +
    `${sentence(guest)} can hear everything you say, so don't bring up ${owner}'s private things unless ${owner} does.`;
  return { about: 'guest', standing: true, text };
}

export const guestLeftNote = (name: string): CallNote => ({
  about: 'guest',
  standing: false,
  text: `${sentence(guestRole(name))} has left the call.`,
});

export function ownerGoneNote(owner: string, name: string): CallNote {
  const text =
    `${sentence(owner)} has dropped off the call. Wait for ${owner} to come back, ` +
    `and don't talk about ${owner}'s private things with ${guestRole(name)}.`;
  return { about: 'owner', standing: true, text };
}

export const ownerBackNote = (owner: string): CallNote => ({
  about: 'owner',
  standing: false,
  text: `${sentence(owner)} is back on the call.`,
});

/** The slice of the SDK AgentSession this needs: the persona on the call now. */
interface CallSession {
  readonly currentAgent: RecallAgent;
}

/** The persona on the call now: a handoff swaps the session's agent (persona-swap.ts). */
function agentNow(session: CallSession, fallback: RecallAgent): RecallAgent {
  try {
    return session.currentAgent ?? fallback;
  } catch {
    return fallback; // the session is not running
  }
}

/**
 * `note` tells the persona on the call now; `renote` (on every agent state change) brings
 * a persona that took over up to date. A persona not told the call yet is first told the
 * standing notes, each under the id it first went in with, then the new note.
 */
export function callNotes(
  session: CallSession,
  agent: RecallAgent,
  sessionId: string
): { note: (callNote: CallNote) => void; renote: () => void } {
  let count = 0;
  const standing: Partial<Record<CallNote['about'], RecallNote>> = {};
  let toldAgent: RecallAgent | undefined;
  const tell = (fresh: RecallNote[]): void => {
    const current = agentNow(session, agent);
    const asItStands = current === toldAgent ? [] : [standing.guest, standing.owner];
    toldAgent = current;
    const notes = [...asItStands.filter((n): n is RecallNote => n !== undefined), ...fresh];
    addRecallNotes(current, notes);
  };
  return {
    note: (callNote) => {
      const entry = { note: callNote.text, id: `group_call_${sessionId}_${++count}` };
      tell([entry]);
      standing[callNote.about] = callNote.standing ? entry : undefined;
    },
    renote: () => tell([]),
  };
}
