/**
 * Barge-in drops the session's pending Stage 2 reply audio plan, so an
 * opening breath/sigh or tempo planned for an interrupted reply can't play
 * on whatever the agent says next.
 */
import { voice } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearReplyAudioPlan,
  pendingReplyAudioPlanCount,
  setReplyAudioPlan,
  takeReplyAudioPlan,
} from '../../../speech/reply-audio-plan.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const SID = 'barge-in-plan-test';

function setup(agentSpeaking: boolean) {
  const handlers = new Map<string, (e: unknown) => void>();
  const session = { on: (evt: string, h: (e: unknown) => void) => handlers.set(evt, h) };
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: { isAgentSpeaking: () => agentSpeaking },
    userData: {},
    sessionId: SID,
  } as unknown as SessionStateContext);
  const userSpeaks = () => {
    try {
      handlers.get(voice.AgentSessionEventTypes.UserStateChanged)?.({
        newState: 'speaking',
        oldState: 'listening',
      });
    } catch {
      // Later, unrelated work in the handler may need a live session; not under test.
    }
  };
  return { userSpeaks, result };
}

describe('session-state-handler: barge-in and the Stage 2 plan', () => {
  afterEach(() => clearReplyAudioPlan(SID));

  it('user barges in while the agent speaks: the pending plan is dropped', () => {
    const { userSpeaks, result } = setup(true);
    setReplyAudioPlan(SID, 2, { opening: { kind: 'sigh', intensity: 1 } });
    expect(pendingReplyAudioPlanCount()).toBe(1);
    userSpeaks();
    result.clearTimers();
    expect(takeReplyAudioPlan(SID, 2)).toBeUndefined();
  });

  it('user speaks while the agent is silent (not a barge-in): the plan stays', () => {
    const { userSpeaks, result } = setup(false);
    setReplyAudioPlan(SID, 2, { tempo: 1.1 });
    userSpeaks();
    result.clearTimers();
    expect(takeReplyAudioPlan(SID, 2)).toEqual({ tempo: 1.1 });
  });
});
