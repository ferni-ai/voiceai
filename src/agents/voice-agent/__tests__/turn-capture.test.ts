/**
 * Turn capture: assistant replies are recorded from conversation_item_added,
 * user transcripts via captureUserTurn, and both share one monotonic turn
 * number per session.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordAgentMessage = vi.fn(async () => undefined);
const recordUserMessage = vi.fn(async () => undefined);
vi.mock('../../../services/conversation-thread/thread-recorder.js', () => ({
  recordAgentMessage,
  recordUserMessage,
}));

const fastCapture = vi.fn(async (_input: { turnNumber: number; sessionId: string }) => ({
  mentionedEntities: [],
  emotionSignals: [],
  topicHints: [],
  dateSignals: [],
  relationshipSignals: [],
  linkingSignals: [],
  asyncJobId: null,
  captureTimeMs: 1,
}));
const recordTurn = vi.fn();
vi.mock('../../../memory/dynamic/index.js', () => ({ fastCapture, recordTurn }));

vi.mock('../active-listening-handler.js', () => ({
  processActiveListeningFinal: vi.fn(() => ({ capturedCount: 0, capturedTypes: [] })),
}));

// Attribution/on-behalf side paths of the recorder are not under test.
vi.mock('../../../memory/retrieval/index.js', () => ({
  getAndClearInjectedMemories: () => [],
  parseAttributions: vi.fn(),
  applyAttributionFeedback: vi.fn(),
}));
vi.mock('../../integrations/on-behalf-transcript-capture.js', () => ({
  isOnBehalfCall: () => false,
  captureAgentTurn: vi.fn(),
  captureRecipientTurn: vi.fn(),
}));
vi.mock('../../../memory/dynamic/metrics.js', () => ({
  recordMemoryAttribution: vi.fn(),
  recordMemoriesInjected: vi.fn(),
}));

import {
  cleanSpokenText,
  recordAssistantTurn,
  wireAssistantTurnCapture,
} from '../assistant-turn-capture.js';
import { captureUserTurn } from '../user-turn-capture.js';
import { clearAllTurnSequences } from '../../../services/memory/turn-sequencer.js';
import {
  getMemoryCaptureMetrics,
  resetMemoryCaptureMetrics,
} from '../../../services/memory/memory-capture-metrics.js';
import {
  clearSessionTurns,
  getPrecedingAssistantText,
} from '../../../memory/capture/session-turn-ring.js';
import type { SessionServices } from '../../../services/index.js';
import type { UserData } from '../../shared/types.js';

type AddTurnCall = [string, string, number | undefined, { turnNumber?: number; personaId?: string }];

function fakeServices(): { services: SessionServices; addTurn: ReturnType<typeof vi.fn> } {
  const addTurn = vi.fn();
  return { services: { addTurn } as unknown as SessionServices, addTurn };
}

function assistantItem(id: string, text: string) {
  return { item: { id, type: 'message', role: 'assistant', textContent: text } };
}

const SESSION = 'sess-capture-test';

beforeEach(() => {
  clearAllTurnSequences();
  clearSessionTurns(SESSION);
  resetMemoryCaptureMetrics();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cleanSpokenText', () => {
  it('drops SSML and leaked JSON function calls, keeps the words', () => {
    expect(
      cleanSpokenText('<break time="200ms"/>Sure! {"fn":"playMusic","args":{"genre":"jazz"}} Here you go.')
    ).toBe('Sure! Here you go.');
  });

  it('returns empty for pure markup', () => {
    expect(cleanSpokenText('<break time="1s"/>')).toBe('');
  });
});

describe('wireAssistantTurnCapture', () => {
  it('records assistant messages as assistant turns with persona and turn number', async () => {
    const session = new EventEmitter();
    const { services, addTurn } = fakeServices();
    const stop = wireAssistantTurnCapture({
      session,
      sessionId: SESSION,
      userId: 'user-1',
      services,
      getPersonaId: () => 'maya',
      getThreadId: () => 'thread-1',
    });

    session.emit('conversation_item_added', assistantItem('m1', 'Morning! How did you sleep?'));

    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(1));
    const [role, text, , meta] = addTurn.mock.calls[0] as AddTurnCall;
    expect(role).toBe('assistant');
    expect(text).toBe('Morning! How did you sleep?');
    expect(meta).toEqual({ turnNumber: 1, personaId: 'maya' });
    await vi.waitFor(() =>
      expect(recordAgentMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          sessionId: SESSION,
          personaId: 'maya',
          threadId: 'thread-1',
          content: 'Morning! How did you sleep?',
        })
      )
    );
    expect(getMemoryCaptureMetrics().assistantTurnsCaptured).toBe(1);
    stop();
  });

  it('ignores user items and duplicate ids, and stops after unsubscribe', async () => {
    const session = new EventEmitter();
    const { services, addTurn } = fakeServices();
    const stop = wireAssistantTurnCapture({
      session,
      sessionId: SESSION,
      services,
      getPersonaId: () => 'ferni',
    });

    session.emit('conversation_item_added', {
      item: { id: 'u1', type: 'message', role: 'user', textContent: 'hi' },
    });
    session.emit('conversation_item_added', assistantItem('m1', 'Hey there.'));
    session.emit('conversation_item_added', assistantItem('m1', 'Hey there.'));
    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(1));
    expect(getMemoryCaptureMetrics().assistantTurnsDeduped).toBe(1);

    stop();
    session.emit('conversation_item_added', assistantItem('m2', 'Still here?'));
    await new Promise<void>((r) => {
      setTimeout(r, 20);
    });
    expect(addTurn).toHaveBeenCalledTimes(1);
  });

  it('skips the thread write when there is no user id', async () => {
    const { services, addTurn } = fakeServices();
    await recordAssistantTurn({
      sessionId: SESSION,
      services,
      text: 'Okay.',
      personaId: 'ferni',
    });
    expect(addTurn).toHaveBeenCalledTimes(1);
    expect(recordAgentMessage).not.toHaveBeenCalled();
  });
});

describe('captureUserTurn', () => {
  const userData = {} as UserData;

  it('records the user turn, thread message and dynamic memory with the same turn number', async () => {
    const { services, addTurn } = fakeServices();
    const n = captureUserTurn({
      transcript: 'My sister Sarah is visiting next week',
      sessionId: SESSION,
      userId: 'user-1',
      services,
      personaId: 'ferni',
      userData,
    });
    expect(n).toBe(1);
    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(1));
    expect(addTurn.mock.calls[0]).toEqual([
      'user',
      'My sister Sarah is visiting next week',
      undefined,
      { turnNumber: 1, personaId: 'ferni' },
    ]);
    await vi.waitFor(() => expect(fastCapture).toHaveBeenCalledTimes(1));
    expect(fastCapture.mock.calls[0]?.[0]).toMatchObject({ turnNumber: 1, sessionId: SESSION });
    await vi.waitFor(() => expect(recordTurn).toHaveBeenCalledTimes(1));
    expect(recordTurn.mock.calls[0]?.[4]).toBe(1);
    await vi.waitFor(() => expect(recordUserMessage).toHaveBeenCalledTimes(1));
  });

  it('returns 0 and records nothing for an empty transcript', () => {
    const { services, addTurn } = fakeServices();
    expect(
      captureUserTurn({ transcript: '  ', sessionId: SESSION, userId: 'u', services, personaId: 'ferni', userData })
    ).toBe(0);
    expect(addTurn).not.toHaveBeenCalled();
  });
});

describe('turn numbering across roles', () => {
  it('is monotonic per session and interleaves user and assistant turns', async () => {
    const session = new EventEmitter();
    const { services, addTurn } = fakeServices();
    wireAssistantTurnCapture({ session, sessionId: SESSION, services, getPersonaId: () => 'ferni' });
    const userData = {} as UserData;

    session.emit('conversation_item_added', assistantItem('g', 'Hi, I am Ferni. What is on your mind?'));
    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(1));
    captureUserTurn({ transcript: 'Work stress, honestly', sessionId: SESSION, userId: undefined, services, personaId: 'ferni', userData });
    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(2));
    session.emit('conversation_item_added', assistantItem('r1', 'That sounds heavy. What part weighs most?'));
    await vi.waitFor(() => expect(addTurn).toHaveBeenCalledTimes(3));

    const numbers = (addTurn.mock.calls as AddTurnCall[]).map((c) => [c[0], c[3].turnNumber]);
    expect(numbers).toEqual([
      ['assistant', 1],
      ['user', 2],
      ['assistant', 3],
    ]);
    // Extraction context: the agent's question before the user's answer
    expect(getPrecedingAssistantText(SESSION, 2)).toBe('Hi, I am Ferni. What is on your mind?');
  });

  it('numbers sessions independently', () => {
    const { services } = fakeServices();
    const userData = {} as UserData;
    expect(captureUserTurn({ transcript: 'a', sessionId: 's-a', userId: undefined, services, personaId: 'ferni', userData })).toBe(1);
    expect(captureUserTurn({ transcript: 'b', sessionId: 's-b', userId: undefined, services, personaId: 'ferni', userData })).toBe(1);
    expect(captureUserTurn({ transcript: 'c', sessionId: 's-a', userId: undefined, services, personaId: 'ferni', userData })).toBe(2);
  });
});
