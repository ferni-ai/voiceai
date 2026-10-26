/**
 * A handoff the LLM asked for, on a multi-agent call: its handoff tool emits voiceSwitch,
 * and this runs it through the orchestrator, tells the app and answers the tool.
 *
 * Who the call is rolled back to comes from the orchestrator, the persona actually on the
 * call. It used to come from the event's previousAgentId, the handoff tools' own state,
 * which a tap never updates and which starts as "ferni": after Ferni, a tap to Maya and a
 * failed handoff to Peter, the app was told to roll back to Ferni (and showed him) while
 * the orchestrator had kept Maya on the call.
 *
 * @module agents/multi-agent/llm-handoff
 */
import { handoffEvents } from '../../handoff/index.js';
import { earlyGoodbyePending } from '../../tools/handoff/early-goodbye.js';
import { offerAgent, withdrawAgent } from '../../tools/handoff/ready-agents.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { noteTurnTiming } from '../../speech/output-control/turn-timing.js';
import { handoffStartMessages } from './handoff-messages.js';
import type { handleHandoffFromDataChannel } from './multi-agent-entry.js';
import type { AgentOrchestrator } from './orchestrator.js';

const log = getLogger();

export interface VoiceSwitchEvent {
  persona: { id: string };
  /** The handoff tools' idea of who was on: not trusted for rollback (see above) */
  previousAgentId?: string;
}

export interface LlmHandoffCall {
  orchestrator: AgentOrchestrator;
  services: SessionServices;
  lock: { acquire: () => Promise<boolean>; release: () => void };
  publish: (message: Record<string, unknown>) => Promise<void>;
  runHandoff: typeof handleHandoffFromDataChannel;
}

/** The voiceSwitch listener for one call */
export function llmHandoffHandler(call: LlmHandoffCall): (event: VoiceSwitchEvent) => void {
  return (event) => {
    void runLlmHandoff(call, event);
  };
}

export async function runLlmHandoff(call: LlmHandoffCall, event: VoiceSwitchEvent): Promise<void> {
  const targetPersonaId = event.persona?.id;
  if (!targetPersonaId) {
    log.warn('🎭 voiceSwitch event missing persona ID');
    return;
  }
  const sessionId = String(call.services.sessionId);
  noteTurnTiming(sessionId, 'handoffEvent', 0); // the turn's TURN_RECEIPT timing.handoffSteps
  if (!(await call.lock.acquire())) {
    log.warn({ targetPersonaId }, '🔒 Handoff already in progress, ignoring LLM request');
    // HANDOFF_EARLY_GOODBYE: after a goodbye, answer the tool now, not at its timeout (dead air)
    if (earlyGoodbyePending(String(call.services.sessionId))) {
      handoffEvents.emit('handoffHandlerComplete', {
        targetId: targetPersonaId,
        success: false,
        greetingSpoken: false,
        instructionsUpdated: false,
        error: 'Handoff already in progress',
      });
    }
    return;
  }
  noteTurnTiming(sessionId, 'handoffLock', 0);
  try {
    const currentPersonaId = call.orchestrator.getCurrentPersonaId();
    log.info(
      { from: currentPersonaId, to: targetPersonaId, toolThought: event.previousAgentId },
      '🎭 LLM-triggered handoff via voiceSwitch'
    );
    for (const m of handoffStartMessages(targetPersonaId, currentPersonaId)) {
      // eslint-disable-next-line no-await-in-loop -- in order: the app reads them in sequence
      await call.publish(m);
    }
    noteTurnTiming(sessionId, 'handoffPublished', 0);

    // With one session per call the tool hands the next persona to the SDK: it stops
    // waiting once that persona is built (ready-agents.ts)
    const handoffTool = { targetId: targetPersonaId, greetingSpoken: false };
    const result = await call.runHandoff(
      call.orchestrator,
      targetPersonaId,
      'LLM requested handoff',
      call.services,
      (agent) => {
        offerAgent(sessionId, targetPersonaId, agent);
        handoffEvents.emit('handoffHandlerComplete', { ...handoffTool, success: true });
      }
    );

    if (!result.success) {
      log.warn({ targetPersonaId, error: result.error }, '🎭 LLM handoff failed');
      await call.publish({
        type: 'handoff_failed',
        target: targetPersonaId,
        error: result.error,
        rollbackTo: currentPersonaId,
        timestamp: Date.now(),
      });
    }

    handoffEvents.emit('handoffHandlerComplete', {
      targetId: targetPersonaId,
      success: result.success,
      greetingSpoken: result.success,
      instructionsUpdated: result.success,
      error: result.error,
    });
  } finally {
    withdrawAgent(sessionId, targetPersonaId); // if the tool never took it
    call.lock.release();
  }
}
