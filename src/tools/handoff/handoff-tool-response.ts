/**
 * What a handoff tool tells the model once the executor has run.
 *
 * @module tools/handoff/handoff-tool-response
 */

import { llm, type voice } from '@livekit/agents';
import type { HandoffResult } from './executor.js';
import { takeOfferedAgent } from './ready-agents.js';

export type HandoffToolResponse =
  | ReturnType<typeof llm.handoff>
  | { unavailable: true; message?: string; instruction: string }
  | { error?: string; rateLimited?: boolean }
  | {
      handoff_complete: true;
      new_agent: string;
      greetingAlreadySpoken: boolean;
      instructionsUpdated: boolean;
      instructions?: string;
      voice_id?: string;
    };

/**
 * The tool result for a handoff to `agentName` that ended with `result`. With single-session
 * handoffs the next persona's Agent is waiting (ready-agents.ts): the tool returns it as an
 * SDK handoff, and the SDK swaps once the tool call is over. With no `returns`, the outgoing
 * persona says nothing more.
 */
export function handoffToolResponse(
  result: HandoffResult,
  agentName: string,
  sessionId?: string
): HandoffToolResponse {
  if (!result.success) {
    if (result.locked) {
      // Without a clear "stop", the model apologised and tried the same
      // handoff again on the next turn (voice eval, 2026-09-28).
      return {
        unavailable: true,
        message: result.error,
        instruction: `${agentName} isn't available to this user. Don't retry this handoff or promise a transfer; keep helping them yourself.`,
      };
    }
    return { error: result.error, rateLimited: result.rateLimited };
  }

  const agent = sessionId ? takeOfferedAgent(sessionId, result.targetAgent) : undefined;
  if (agent) return llm.handoff({ agent: agent as voice.Agent });

  // FIX: The executor now waits for handler completion, so we use actual result values.
  // The handler calls session.say(greeting) before the tool result returns.
  // We tell the LLM not to repeat it.
  return {
    handoff_complete: true,
    new_agent: result.targetAgentName,
    // IMPORTANT: Greeting has ALREADY been spoken by the voice handler via session.say()
    // The LLM should NOT speak the greeting again!
    greetingAlreadySpoken: result.greetingSpoken ?? true,
    instructionsUpdated: result.instructionsUpdated ?? true,
    instructions: result.instructions,
    voice_id: result.voiceId,
  };
}
