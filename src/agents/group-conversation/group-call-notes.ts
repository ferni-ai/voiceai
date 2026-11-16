/**
 * GROUP_CALL: what Ferni is told about who is on the call, as system notes.
 *
 * The copy for each note (guest joined, guest left, owner dropped off, owner back) and
 * the bookkeeping that keeps them in the persona's context: a persona handoff drops
 * system notes (persona-swap.ts), so every note so far goes to the next persona again.
 * Names reach here already cleaned; every note names the guest with her role
 * (guestRole, guest-display-name.ts), so the model never sees a bare guest name.
 *
 * @module agents/group-conversation/group-call-notes
 */
import { firstNameOf } from '../../utils/caller-name.js';
import { dispatchedUserName } from '../../utils/ferni-intro.js';
import { addRecallNote, type RecallAgent } from '../multi-agent/recall-note.js';
import { guestLabel, guestRole } from './guest-display-name.js';

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

export function joinNote(name: string, owner: string): string {
  const guest = guestRole(name);
  return (
    `${sentence(guest)} is on this call by phone with ${owner}. ` +
    `Lines that start with ${guestLabel(name).trim()} are hers, and lines that start with [${owner}] are ${owner}'s. ` +
    'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
    'Talk with both of them, use their names, and let them talk to each other. ' +
    `${sentence(guest)} can hear everything you say, so don't bring up ${owner}'s private things unless ${owner} does.`
  );
}

export const guestLeftNote = (name: string): string =>
  `${sentence(guestRole(name))} has left the call.`;

export function ownerGoneNote(owner: string, name: string): string {
  return (
    `${sentence(owner)} has dropped off the call. Wait for ${owner} to come back, ` +
    `and don't talk about ${owner}'s private things with ${guestRole(name)}.`
  );
}

export const ownerBackNote = (owner: string): string => `${sentence(owner)} is back on the call.`;

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
 * `note` tells the persona on the call now; `renote` (on every agent state change) tells
 * a persona that took over every note so far. Note ids are stable, one per note.
 */
export function callNotes(
  session: CallSession,
  agent: RecallAgent,
  sessionId: string
): { note: (text: string) => void; renote: () => void } {
  const notes: Array<{ note: string; id: string }> = [];
  let notedAgent: RecallAgent | undefined;
  return {
    note: (text) => {
      const entry = { note: text, id: `group_call_${sessionId}_${notes.length + 1}` };
      notes.push(entry);
      notedAgent = agentNow(session, agent);
      addRecallNote(notedAgent, entry.note, undefined, entry.id);
    },
    renote: () => {
      const current = agentNow(session, agent);
      if (notes.length === 0 || current === notedAgent) return;
      notedAgent = current;
      for (const n of notes) addRecallNote(current, n.note, undefined, n.id);
    },
  };
}
