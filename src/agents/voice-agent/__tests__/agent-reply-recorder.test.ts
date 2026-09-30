/**
 * Agent reply recording on live calls.
 *
 * Drives the real session-state handlers with a fake session and emits the
 * LiveKit `conversation_item_added` event, so these tests fail if the
 * handler registration in session-state-handler.ts is removed.
 */

import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../conversation/advanced-humanization-integration.js', () => ({
  recordAgentResponse: vi.fn(),
  recordAdviceGiven: vi.fn(),
}));

import {
  recordAdviceGiven,
  recordAgentResponse,
} from '../../../conversation/advanced-humanization-integration.js';
import type { PersonaConfig } from '../../../personas/types.js';
import type { ConversationManager } from '../../../services/conversation-manager.js';
import type { SessionServices } from '../../../services/index.js';
import type { UserData } from '../../shared/types.js';
import { classifyAgentReply } from '../agent-reply-recorder.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const ITEM_ADDED = voice.AgentSessionEventTypes.ConversationItemAdded;

function assistantItem(content: string, interrupted = false): llm.ChatMessage {
  return llm.ChatMessage.create({ role: 'assistant', content, interrupted });
}

describe('agent reply recording (conversation_item_added)', () => {
  let session: EventEmitter;
  let userData: UserData;
  let services: {
    addTurn: ReturnType<typeof vi.fn>;
    humorCalibration: { recordHumorAttempt: ReturnType<typeof vi.fn> };
    storyPreference: { recordStory: ReturnType<typeof vi.fn> };
  };
  let clearTimers: () => void;
  const sessionId = `test-reply-${Date.now()}`;

  beforeEach(() => {
    vi.mocked(recordAgentResponse).mockClear();
    vi.mocked(recordAdviceGiven).mockClear();
    session = new EventEmitter();
    Object.assign(session, { say: vi.fn(), generateReply: vi.fn(), interrupt: vi.fn() });
    userData = { lastTopic: 'moving' } as UserData;
    services = {
      addTurn: vi.fn(),
      humorCalibration: { recordHumorAttempt: vi.fn() },
      storyPreference: { recordStory: vi.fn() },
    };
    const ctx: SessionStateContext = {
      session: session as unknown as SessionStateContext['session'],
      sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
      conversationManager: {} as ConversationManager,
      userData,
      sessionId,
      services: services as unknown as SessionServices,
    };
    ({ clearTimers } = setupSessionStateHandlers(ctx));
  });

  afterEach(() => {
    clearTimers();
  });

  it('records a normal LLM reply as the agent turn and last response', async () => {
    const reply = "That sounds like a heavy week. What's weighing on you most?";
    expect(userData.lastAgentResponse).toBeUndefined();
    expect(services.addTurn).not.toHaveBeenCalled();

    session.emit(ITEM_ADDED, { type: 'conversation_item_added', item: assistantItem(reply) });

    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(1));
    expect(services.addTurn).toHaveBeenCalledWith('assistant', reply);
    expect(userData.lastAgentResponse).toBe(reply);
    expect(userData.lastAgentResponseTime).toEqual(expect.any(Number));
    expect(recordAgentResponse).toHaveBeenCalledWith(sessionId, reply);
  });

  it('records the committed text with SSML removed', async () => {
    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('<break time="200ms"/>So I was think', true),
    });

    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(1));
    expect(services.addTurn).toHaveBeenCalledWith('assistant', 'So I was think');
    expect(userData.lastAgentResponse).toBe('So I was think');
  });

  it('ignores user items, empty replies and handoff items', async () => {
    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: llm.ChatMessage.create({ role: 'user', content: 'hey there' }),
    });
    session.emit(ITEM_ADDED, { type: 'conversation_item_added', item: assistantItem('   ') });
    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: llm.AgentHandoffItem.create({ oldAgentId: 'ferni', newAgentId: 'maya' }),
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(services.addTurn).not.toHaveBeenCalled();
    expect(userData.lastAgentResponse).toBeUndefined();
    expect(recordAgentResponse).not.toHaveBeenCalled();
  });

  it('keeps the question as last response when a backchannel commits after it', async () => {
    const question = "What's been the hardest part of settling in?";
    session.emit(ITEM_ADDED, { type: 'conversation_item_added', item: assistantItem(question) });
    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(1));

    // Live backchannels are spoken with say(), so they commit like a reply.
    session.emit(ITEM_ADDED, { type: 'conversation_item_added', item: assistantItem('Mm-hmm.') });
    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('I hear you'),
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(userData.lastAgentResponse).toBe(question);
    expect(services.addTurn).toHaveBeenCalledTimes(1);
    expect(recordAgentResponse).toHaveBeenCalledTimes(1);
  });

  it('marks advice only when the reply gives advice', async () => {
    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('That makes sense to me.'),
    });
    await vi.waitFor(() => expect(recordAgentResponse).toHaveBeenCalledTimes(1));
    expect(recordAdviceGiven).not.toHaveBeenCalled();

    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('You might want to take a break tonight and get some sleep.'),
    });
    await vi.waitFor(() => expect(recordAgentResponse).toHaveBeenCalledTimes(2));
    expect(recordAdviceGiven).toHaveBeenCalledWith(sessionId);
  });

  it('sets humor and story flags and records the attempts', async () => {
    expect(userData.lastResponseHadHumor).toBeUndefined();
    expect(userData.lastResponseHadStory).toBeUndefined();

    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('Haha, that reminds me of the time I got lost moving boxes.'),
    });

    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(1));
    expect(userData.lastResponseHadHumor).toBe(true);
    expect(userData.lastResponseHadStory).toBe(true);
    expect(services.humorCalibration.recordHumorAttempt).toHaveBeenCalledWith(
      expect.stringContaining('Haha'),
      'moving'
    );
    expect(services.storyPreference.recordStory).toHaveBeenCalledWith(
      expect.stringContaining('reminds me of the time'),
      'moving'
    );

    session.emit(ITEM_ADDED, {
      type: 'conversation_item_added',
      item: assistantItem('How did the rest of the day go?'),
    });
    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(2));
    expect(userData.lastResponseHadHumor).toBe(false);
    expect(userData.lastResponseHadStory).toBe(false);
    expect(services.humorCalibration.recordHumorAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('classifyAgentReply', () => {
  it('does not read serious replies as humor or stories', () => {
    expect(classifyAgentReply("It's funny how grief shows up sideways.").hasHumor).toBe(false);
    expect(classifyAgentReply('I want to hear your story.').hasStory).toBe(false);
    expect(classifyAgentReply('Wow! That is huge!').hasHumor).toBe(false);
    expect(classifyAgentReply('Do you remember when you first felt this way?').hasStory).toBe(
      false
    );
    expect(classifyAgentReply('There was this sense of relief, right?').hasStory).toBe(false);
  });

  it('reads first-person stories and plain laughter', () => {
    expect(classifyAgentReply('I remember when my sister moved away.').hasStory).toBe(true);
    expect(classifyAgentReply('Hahaha, okay, fair.').hasHumor).toBe(true);
  });
});
