/**
 * Single-session handoffs: a handoff swaps the persona's Agent inside the call's one
 * AgentSession instead of closing that session and starting another.
 *
 * Closing a session from inside its own handoff tool call never finishes: the close
 * waits for the session's speech, which waits for the tool, which waits for the switch.
 * Our 3s timeout gave up, the SDK kept the room's `lk.agent.session` handler (it's only
 * released at the end of a completed close), and the next persona's session could not
 * start. No voice handoff could succeed on a live call (dev, 2026-10-10 15:12Z).
 *
 * Off unless MULTI_AGENT_SINGLE_SESSION=on.
 */
import type { llm, voice } from '@livekit/agents';
import type { UserData } from '../shared/types.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export function singleSessionHandoffs(): boolean {
  return process.env['MULTI_AGENT_SINGLE_SESSION'] === 'on';
}

/** The talk so far, for the next persona: not the outgoing persona's instructions or tools */
export function conversationSoFar<T>(session: voice.AgentSession<T>): llm.ChatContext {
  return session.currentAgent.chatCtx.copy({
    excludeInstructions: true,
    excludeFunctionCall: true,
    excludeConfigUpdate: true,
  });
}

/** How long the next persona has to come up before the swap counts as failed */
export const SWAP_TIMEOUT_MS = 8_000;

type Transitioning = { updateActivityTask?: { result: Promise<unknown> } };

/**
 * Ask the session to swap in `agent`, and return the SDK's transition for it.
 *
 * `updateAgent` returns nothing: the SDK runs the transition as a task it keeps on the
 * session (`updateActivityTask`, @livekit/agents 1.5.1 agent_session.js:446), after any
 * earlier one, and only logs a failure. A session that isn't running starts no task, so an
 * unchanged task means nothing was swapped.
 */
export function beginSwap<T>(
  session: voice.AgentSession<T>,
  agent: voice.Agent<T>
): Promise<unknown> {
  const before = (session as unknown as Transitioning).updateActivityTask;
  session.updateAgent(agent);
  const task = (session as unknown as Transitioning).updateActivityTask;
  if (!task || task === before) throw new Error('The call has no running session to swap in');
  return task.result;
}

/** Rejects if `transition` hasn't finished within `timeoutMs` */
export async function within(transition: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The next persona didn't start within ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    await Promise.race([transition, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** What the factory adds to a persona so it can be swapped in and out of the call's session */
export interface SwapParts {
  agent: voice.Agent<UserData>;
  /** Removes only this persona's own listeners */
  release: () => Promise<void>;
  /** The call's first persona: its cleanup closes the session, so it runs at call end */
  ownsSession: boolean;
}

type SwappablePersona = SwapParts & {
  id: string;
  personaId: string;
  session: unknown;
  userData?: { personaId?: string };
};

export function isSwappable(persona: object): persona is SwappablePersona {
  return 'agent' in persona && 'release' in persona && 'ownsSession' in persona;
}

/**
 * Swap `to` in for `from` in the call's session, with the talk so far and `to`'s voice
 * (userData.personaId picks the voice for every line spoken). If `to` doesn't come up,
 * `from` is swapped back once the failed transition has settled (the SDK runs them in
 * order, so a swap back can't overtake it), and only then gets its voice back. `forget`
 * drops a persona from the orchestrator's agents; the session's owner stays, since its
 * cleanup ends the call.
 */
export async function swapPersona(
  from: SwappablePersona,
  to: object,
  forget: (persona: SwappablePersona) => void,
  timeoutMs = SWAP_TIMEOUT_MS
): Promise<void> {
  if (!isSwappable(to)) throw new Error("The next persona can't join the call's session");
  const session = from.session as voice.AgentSession<UserData>;
  await to.agent.updateChatCtx(conversationSoFar(session));
  const transition = beginSwap(session, to.agent);
  if (to.userData) to.userData.personaId = to.personaId;
  try {
    await within(transition, timeoutMs);
  } catch (error) {
    forget(to);
    void transition
      .catch(() => undefined)
      .then(async () => {
        await within(beginSwap(session, from.agent), timeoutMs);
        if (from.userData) from.userData.personaId = from.personaId;
        await to.release();
      })
      .catch((e: unknown) => log.error({ error: String(e) }, '🎭 Could not swap back'));
    throw error;
  }
  await from.release();
  if (!from.ownsSession) forget(from);
}
