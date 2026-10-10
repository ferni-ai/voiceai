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

/**
 * Offer `agent` with `onReady` and wait for the SDK to swap it in itself: a handoff the LLM
 * asked for returns it from its tool as `llm.handoff({ agent })`, and the SDK calls
 * `updateAgent` once the tool call is over. Returns that transition (wrapped: an async
 * function would otherwise wait for it).
 */
async function swapBySdk<T>(
  session: voice.AgentSession<T>,
  agent: voice.Agent<T>,
  onReady: (agent: voice.Agent<T>) => void,
  timeoutMs: number
): Promise<{ transition: Promise<unknown> }> {
  const before = (session as unknown as Transitioning).updateActivityTask;
  onReady(agent);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = (session as unknown as Transitioning).updateActivityTask;
    if (task && task !== before && currentAgentOf(session) === agent) {
      return { transition: task.result };
    }
    if (Date.now() >= deadline)
      throw new Error(`The handoff tool didn't swap within ${timeoutMs}ms`);
    const state = session as unknown as { _started?: boolean; _closing?: boolean };
    if (state._started === false || state._closing === true) {
      throw new Error('The call ended before the handoff tool swapped'); // nothing to wait for
    }
    // eslint-disable-next-line no-await-in-loop -- polling for the SDK's own swap
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

function currentAgentOf<T>(session: voice.AgentSession<T>): unknown {
  try {
    return session.currentAgent;
  } catch {
    return undefined; // not running
  }
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
 * Swap `to` in for `from` in the call's session (or, with `onReady`, let the handoff tool
 * hand it to the SDK: swapBySdk), with the talk so far and `to`'s voice
 * (userData.personaId picks the voice for every line spoken). If `to` doesn't come up,
 * `from` is swapped back once the failed transition has settled (the SDK runs them in
 * order, so a swap back can't overtake it), and only then gets its voice back. `forget`
 * drops a persona from the orchestrator's agents; the session's owner stays, since its
 * cleanup ends the call.
 */
/** The latest swap per call: a late swap back must not undo a newer one */
const latestSwap = new WeakMap<object, number>();

export async function swapPersona(
  from: SwappablePersona,
  to: object,
  forget: (persona: SwappablePersona) => void,
  onReady?: (agent: voice.Agent<UserData>) => void,
  timeoutMs = SWAP_TIMEOUT_MS
): Promise<void> {
  if (!isSwappable(to)) throw new Error("The next persona can't join the call's session");
  const session = from.session as voice.AgentSession<UserData>;
  const swapNumber = (latestSwap.get(session) ?? 0) + 1;
  latestSwap.set(session, swapNumber);
  await to.agent.updateChatCtx(conversationSoFar(session));
  let transition: Promise<unknown>;
  try {
    transition = onReady
      ? (await swapBySdk(session, to.agent, onReady, timeoutMs)).transition
      : beginSwap(session, to.agent);
  } catch (error) {
    forget(to); // never swapped in: nothing to swap back
    await to.release();
    throw error;
  }
  if (to.userData) to.userData.personaId = to.personaId;
  try {
    await within(transition, timeoutMs);
  } catch (error) {
    forget(to);
    void transition
      .catch(() => undefined)
      .then(async () => {
        await to.release();
        if (latestSwap.get(session) !== swapNumber) return; // a newer handoff took over
        await within(beginSwap(session, from.agent), timeoutMs);
        if (latestSwap.get(session) === swapNumber && from.userData) {
          from.userData.personaId = from.personaId;
        }
      })
      .catch((e: unknown) => log.error({ error: String(e) }, '🎭 Could not swap back'));
    throw error;
  }
  await from.release();
  if (!from.ownsSession) forget(from);
}
