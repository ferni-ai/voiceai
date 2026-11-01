/**
 * HANDOFF_FAILED_SAY_SO (off by default): a handoff that fails after the handoff tool was
 * told it worked is said out loud, and the persona still on the call knows it is still
 * itself.
 *
 * With one session per call the tool can't wait for the swap (ready-agents.ts): it is told
 * the handoff worked once the next persona is built, returns that persona to the SDK, and
 * the SDK swaps after the tool call ends. When the SDK then drops the swap (an interrupted
 * tool speech, handoff-talk-through.ts) the swap times out and the call stays with the
 * outgoing persona, but only the app heard about it (`handoff_failed`). The tool's output
 * was dropped from the chat too, so the model's context said the teammate was on. Dev red
 * team 2026-10-26 (#2935): after "I'll bring in Jordan", 2 of 3 swaps failed, the caller
 * said "Hi Jordan", and Ferni answered as Jordan.
 *
 * With the flag on, the persona still on the call gets a note in its chat (the teammate
 * didn't join; you are still you) and says one plain line in its own voice. The line is
 * skipped while a crisis verdict holds the reply; the note is still added.
 *
 * @module agents/multi-agent/handoff-failed-say-so
 */
import type { llm, voice } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { personaName } from '../personas/said-by.js';
import { crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { generateReply } from '../shared/generate-reply-gateway.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export function handoffFailedSaySo(env: Env = process.env): boolean {
  return flagOn('HANDOFF_FAILED_SAY_SO', env);
}

const FAILED_HANDOFF_NOTE =
  "[HANDOFF DIDN'T GO THROUGH] {to} couldn't join the call. You are still {self}, and you are the only one on the call with them. Anything they say to {to} is said to you: answer as yourself, never as {to}, and don't take on {to}'s job.";

const FAILED_HANDOFF_SAY =
  "Say one short line in your own voice, as {self}: {to} couldn't join just now, it's still you, and you can try {to} again if they'd like. Don't make up a reason.";

/** The persona still on the call (orchestrator.ts PersonaAgent; `agent` when swappable) */
interface StillOn {
  personaId: string;
  session: unknown;
  agent?: unknown;
}

type NotedAgent = Pick<voice.Agent, 'chatCtx' | 'updateChatCtx'>;

const fill = (text: string, self: string, to: string): string =>
  text.replaceAll('{self}', self).replaceAll('{to}', to);

/** The session's agent now, or undefined when the session isn't running (the getter throws) */
function currentAgentOf(session: voice.AgentSession): unknown {
  try {
    return session.currentAgent;
  } catch {
    return undefined;
  }
}

/** Why the line isn't said now, or null to say it */
function notNow(session: voice.AgentSession, agent: unknown): string | null {
  if (currentAgentOf(session) !== agent) return 'not swapped back yet';
  if (crisisVerdictPending(session) !== null) return 'a crisis verdict holds the reply';
  return null;
}

/**
 * Tell the persona still on the call that the handoff to `targetPersonaId` failed, then
 * have it say so. Resolves once the note is in its chat; the line is not waited for, and
 * is said only while that persona is the session's agent (a swap that timed out after the
 * SDK made it is swapped back later: persona-swap.ts). Never throws: the handoff has
 * already failed, this only reports it.
 */
export async function sayHandoffFailed(
  stillOn: StillOn | null,
  targetPersonaId: string,
  sessionId: string
): Promise<void> {
  const session = stillOn?.session as voice.AgentSession | undefined;
  if (!stillOn || !session) return;
  const self = personaName(stillOn.personaId);
  const to = personaName(targetPersonaId);
  const logged = { sessionId, to: targetPersonaId };
  const agent = (stillOn.agent ?? currentAgentOf(session)) as NotedAgent | undefined;
  try {
    if (!agent) throw new Error('no agent on the call');
    const talk: llm.ChatContext = agent.chatCtx.copy();
    talk.addMessage({ role: 'system', content: fill(FAILED_HANDOFF_NOTE, self, to) });
    await agent.updateChatCtx(talk);
  } catch (error) {
    log.warn({ ...logged, error: String(error) }, 'Failed-handoff note not added');
    return;
  }
  const skip = notNow(session, agent);
  if (skip) {
    log.info({ ...logged, skip }, 'Failed handoff not said');
    return;
  }
  generateReply(session, sessionId, {
    instructions: fill(FAILED_HANDOFF_SAY, self, to),
    context: 'handoff-failed-say-so',
    priority: 'high',
    waitForPlayout: false,
  })
    .then((result) => log.info({ ...logged, success: result.success }, 'Failed handoff said'))
    .catch((error: unknown) => {
      log.warn({ ...logged, error: String(error) }, 'Failed handoff not said');
    });
}
