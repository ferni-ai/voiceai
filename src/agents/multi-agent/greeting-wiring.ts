/**
 * When a call's deferred handlers get wired: as the greeting starts (default),
 * or once it has played out (GREETING_WIRE_AFTER=on).
 *
 * FAST-AGENT-JOIN defers wireHandlers() past the greeting's start so the
 * greeting begins sooner, but "in parallel with speech" is on the same event
 * loop: the tool loader, updateAgentTools (65 -> 159 tools), music/DJ and
 * humanization setup ran while the greeting's first audio frames were being
 * queued (handlerWireMs 837 on prod, 2026-10-12). Prod call AJ_B8EJgUk8qGdj
 * had loop blocks of 211 and 250 ms either side of the greeting's first audio
 * frame, and Seth heard "Morning, Seth..." then the audio hang.
 *
 * With the flag on, wiring waits for the agent to leave the speaking state
 * (or GREETING_WIRE_MAX_WAIT_MS, default 8000, so a greeting that never plays
 * can't leave the call unwired).
 *
 * @module agents/multi-agent/greeting-wiring
 */
import { getLogger } from '../../utils/safe-logger.js';
import { watchGreetingEnd } from './missed-greeting-end.js';

const log = getLogger();

interface StateEvents {
  on: (event: string, fn: (ev: { oldState?: string; newState?: string }) => void) => unknown;
  off: (event: string, fn: (ev: { oldState?: string; newState?: string }) => void) => unknown;
}

export function wireAfterGreeting(env: Record<string, string | undefined> = process.env): boolean {
  return env.GREETING_WIRE_AFTER === 'on';
}

/** Resolves when the agent next stops speaking, or after `maxWaitMs`. */
export async function greetingPlayedOut(session: unknown, maxWaitMs = 8000): Promise<void> {
  const events = session as Partial<StateEvents> | null;
  if (typeof events?.on !== 'function' || typeof events.off !== 'function') return;
  const { on, off } = events as StateEvents;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      off.call(events, 'agent_state_changed', onState);
      resolve();
    };
    const onState = (ev: { oldState?: string; newState?: string }): void => {
      if (ev?.oldState === 'speaking' && ev.newState !== 'speaking') done();
    };
    const timer = setTimeout(done, maxWaitMs);
    on.call(events, 'agent_state_changed', onState);
  });
}

/** Wires a just-greeted agent's deferred handlers; never throws. */
export function wireDeferredHandlers(
  agent: { personaId: string; session: unknown; wireHandlers?: () => Promise<void> },
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const wire = agent.wireHandlers;
  if (!wire) return Promise.resolve();
  const after = wireAfterGreeting(env);
  const maxWait =
    Number(env.GREETING_WIRE_MAX_WAIT_MS) > 0 ? Number(env.GREETING_WIRE_MAX_WAIT_MS) : 8000;
  const started = Date.now();
  // HANDOFF_FIRST_FIX: the coordinator may miss the greeting's end (missed-greeting-end.ts)
  const greetingEnd = watchGreetingEnd(agent.session, agent.personaId, env);
  return (after ? greetingPlayedOut(agent.session, maxWait) : Promise.resolve())
    .then(async () => {
      const waitedMs = Date.now() - started;
      await wire();
      greetingEnd?.settle();
      log.info(
        { personaId: agent.personaId, afterGreeting: after, waitedMs },
        '⚡ Deferred handlers wired after greeting'
      );
    })
    .catch((err: unknown) => {
      // Don't swallow errors: the music handler won't work if this fails.
      log.error(
        { error: String(err), personaId: agent.personaId },
        '🚨 CRITICAL: Deferred handler wiring FAILED! Music/tools may not work.'
      );
    });
}
