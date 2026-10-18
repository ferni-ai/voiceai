/**
 * HANDOFF_FIRST_FIX (off by default): tell the speech coordinator about a greeting end
 * it missed while the call's handlers were still being wired.
 *
 * The coordinator (speech-coordinator.ts) holds every coordinated line while its last
 * one is SPEAKING, and learns that one ended only from the session-state handler's
 * `coordinator.onSpeechEnded` (session-state-handler.ts). That handler is one of the
 * handlers FAST-AGENT-JOIN wires after the greeting (greeting-wiring.ts). With
 * GREETING_WIRE_AFTER=on (dev) they are wired on the very state change that ends the
 * greeting, so the end of the greeting, the coordinator's first line, reaches nobody:
 * it stays SPEAKING until some later reply ends.
 *
 * A call whose first turn is a handoff has no such reply: Ferni answers with tools
 * only (softTeamIntro, handoffToMaya), and both scripted handoff lines go through the
 * coordinator. Dev, release check 2026-10-18 (AJ_BaQpMifqtn6c), and every
 * handoff-every-teammate call of the 2026-10-17 A/B:
 * - 01:56:18.350 the greeting is the coordinator's speech-1; handlers wired 01:56:22.037
 *   ("Deferred handlers wired after greeting", afterGreeting true), after it ended;
 * - 01:56:30.307 Ferni's goodbye is queued as speech-2 and never sent to TTS; the
 *   orchestrator waits its 2.8 s estimate and swaps to Maya; nothing plays;
 * - 01:56:34.470 Maya's greeting is queued as speech-3; the session is quiet, so the
 *   turn keeper answers the caller's still-unanswered turn at 01:56:35.720
 *   (TURN_KEEPER_RECOVERED): Maya's LLM line "Well, mornings can be rough..." is the
 *   first voice after 11 s;
 * - that reply's end frees the coordinator (01:56:43.143): the goodbye, 12.8 s old, has
 *   expired (10 s maxAge) and is dropped, and Maya's greeting plays as a second arrival.
 * Later handoffs are fine because a spoken reply has freed the coordinator by then.
 *
 * With the flag on, once the handlers are wired: if the agent has stopped speaking since
 * wiring began, the coordinator is still SPEAKING, and it has started nothing since that
 * stop, the coordinator is told that speech ended. With GREETING_WIRE_AFTER off the
 * handlers are usually wired before the greeting ends, and nothing is released.
 *
 * @module agents/multi-agent/missed-greeting-end
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import {
  CoordinatorState,
  getSpeechCoordinator,
} from '../../speech/coordination/speech-coordinator.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export function handoffFirstFix(env: Env = process.env): boolean {
  return flagOn('HANDOFF_FIRST_FIX', env);
}

interface StateEvents {
  on: (event: string, fn: (ev: { oldState?: string; newState?: string }) => void) => unknown;
  off: (event: string, fn: (ev: { oldState?: string; newState?: string }) => void) => unknown;
  agentState?: string;
}

/** Started before the deferred handlers are wired; `settle` runs once they are. */
export interface MissedGreetingEnd {
  /** Releases the coordinator if it missed the end; true when it did. */
  settle: () => boolean;
}

/** Watches `session` from now until `settle()`; null when the flag is off. */
export function watchGreetingEnd(
  session: unknown,
  personaId: string,
  env: Env = process.env
): MissedGreetingEnd | null {
  if (!handoffFirstFix(env)) return null;
  const events = session as Partial<StateEvents> | null;
  if (typeof events?.on !== 'function' || typeof events.off !== 'function') return null;
  const { on, off } = events as StateEvents;
  const coordinator = getSpeechCoordinator();
  let startedAt = 0;
  let ended: { spoken: number; spokeMs: number } | undefined;
  // Registered before the handlers being wired, so this runs first on the same change
  const onState = (ev: { oldState?: string; newState?: string }): void => {
    if (ev?.newState === 'speaking') startedAt = Date.now();
    else if (ev?.oldState === 'speaking') {
      const spokeMs = startedAt ? Date.now() - startedAt : 0;
      ended = { spoken: coordinator.getStats().requestsSpoken, spokeMs };
    }
  };
  on.call(events, 'agent_state_changed', onState);
  return {
    settle: () => {
      off.call(events, 'agent_state_changed', onState);
      const missed =
        ended !== undefined &&
        coordinator.getState() === CoordinatorState.SPEAKING &&
        coordinator.getStats().requestsSpoken === ended.spoken && // nothing new since
        events.agentState !== 'speaking';
      if (!missed || !ended) return false;
      coordinator.onSpeechEnded(false, ended.spokeMs);
      log.info({ personaId, spokeMs: ended.spokeMs }, 'GREETING_COORDINATOR_RELEASED');
      return true;
    },
  };
}
