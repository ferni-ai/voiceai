/**
 * Live transcription: agents-js publishes transcripts as `lk.transcription`
 * text streams. The web reads them, shows them live, and hands finished
 * utterances to the real data-message handlers (conversation tracker, journal
 * capture, repeat-last).
 */

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Code under test schedules timers at import (luxo-expressions auto-init, 100 ms)
// and while handling messages (hold-space end, delayed expressions). Real timers
// would fire after the file finishes and jsdom is torn down ("document is not
// defined"). Fake them from before the first import and drop them after each test.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

import {
  attachLiveTranscription,
  TRANSCRIPTION_TOPIC,
  type TranscriptionRoom,
  type TranscriptionStreamReader,
} from '../../src/services/live-transcription.service.js';
import { getLastAgentResponse, handleDataMessage } from '../../src/app/data-message-handlers.js';
import { conversationTracker } from '../../src/services/conversation-tracker.service.js';
import type { DataMessage } from '../../src/types/events.js';

type Handler = Parameters<TranscriptionRoom['registerTextStreamHandler']>[1];

/** livekit-client Room double: records the registered text-stream handler. */
function fakeRoom(): TranscriptionRoom & { handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    localParticipant: {
      identity: 'user-123',
      getTrackPublications: () => [{ trackSid: 'TR_user_mic' }],
    },
    registerTextStreamHandler(topic, handler) {
      if (handlers.has(topic)) throw new Error(`handler already set for ${topic}`);
      handlers.set(topic, handler);
    },
    unregisterTextStreamHandler(topic) {
      handlers.delete(topic);
    },
  };
}

/** A text stream as agents-js writes it: chunks plus header attributes. */
function stream(chunks: string[], attributes: Record<string, string>): TranscriptionStreamReader {
  return {
    info: { id: `stream-${Math.random()}`, attributes },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

async function deliver(
  room: ReturnType<typeof fakeRoom>,
  reader: TranscriptionStreamReader,
  identity: string
): Promise<void> {
  room.handlers.get(TRANSCRIPTION_TOPIC)?.(reader, { identity });
  // let the async reader drain (setImmediate runs after all pending microtasks)
  await new Promise((resolve) => setImmediate(resolve));
}

const live: Array<{ type: string; text: string; isFinal: boolean }> = [];
const onLive = (e: Event): void => {
  live.push((e as CustomEvent<{ type: string; text: string; isFinal: boolean }>).detail);
};

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  window.removeEventListener('ferni:transcript', onLive);
  live.length = 0;
  vi.restoreAllMocks();
});

describe('attachLiveTranscription', () => {
  it('registers on lk.transcription and unregisters on cleanup', () => {
    const room = fakeRoom();
    const detach = attachLiveTranscription(room, () => undefined);
    expect(room.handlers.has('lk.transcription')).toBe(true);
    detach();
    expect(room.handlers.has('lk.transcription')).toBe(false);
  });

  it('a room without text streams (old client) is reported and left alone', () => {
    const detach = attachLiveTranscription({ localParticipant: { identity: 'u' } }, () => undefined);
    expect(() => detach()).not.toThrow();
  });

  it('user interim results show live; only the final one becomes a transcript', async () => {
    window.addEventListener('ferni:transcript', onLive);
    const room = fakeRoom();
    const received: DataMessage[] = [];
    attachLiveTranscription(room, (m) => received.push(m));

    await deliver(room, stream(['I was'], { 'lk.transcription_final': 'false' }), 'user-123');
    await deliver(
      room,
      stream(['I was thinking about it'], { 'lk.transcription_final': 'true' }),
      'user-123'
    );

    expect(live).toEqual([
      { type: 'user', text: 'I was', isFinal: false },
      { type: 'user', text: 'I was thinking about it', isFinal: true },
    ]);
    expect(received).toEqual([{ type: 'user_transcript', text: 'I was thinking about it' }]);
  });

  it("a user transcript published by the agent on the user's track counts as the user", async () => {
    const room = fakeRoom();
    const received: DataMessage[] = [];
    attachLiveTranscription(room, (m) => received.push(m));
    await deliver(
      room,
      stream(['hello'], { 'lk.transcription_final': 'true', 'lk.transcribed_track_id': 'TR_user_mic' }),
      'agent-1'
    );
    expect(received).toEqual([{ type: 'user_transcript', text: 'hello' }]);
  });

  it('agent deltas build up live and the closed segment becomes the agent transcript', async () => {
    window.addEventListener('ferni:transcript', onLive);
    const room = fakeRoom();
    const received: DataMessage[] = [];
    attachLiveTranscription(room, (m) => received.push(m));

    await deliver(
      room,
      stream(['That ', 'sounds ', 'hard.'], {
        'lk.transcription_final': 'false',
        'lk.transcribed_track_id': 'TR_agent_voice',
      }),
      'agent-1'
    );

    expect(live).toEqual([
      { type: 'agent', text: 'That ', isFinal: false },
      { type: 'agent', text: 'That sounds ', isFinal: false },
      { type: 'agent', text: 'That sounds hard.', isFinal: false },
      { type: 'agent', text: 'That sounds hard.', isFinal: true },
    ]);
    expect(received).toEqual([{ type: 'agent_transcript', text: 'That sounds hard.' }]);
  });

  it('finished utterances reach the conversation tracker through the real handlers', async () => {
    const addMessage = vi.spyOn(conversationTracker, 'addMessage');
    const room = fakeRoom();
    attachLiveTranscription(room, handleDataMessage);

    await deliver(room, stream(['how are you'], { 'lk.transcription_final': 'true' }), 'user-123');
    await deliver(room, stream(['Doing well.'], { 'lk.transcribed_track_id': 'TR_agent' }), 'agent-1');

    expect(addMessage).toHaveBeenCalledWith('user', 'how are you');
    expect(addMessage).toHaveBeenCalledWith('agent', 'Doing well.', undefined);
    expect(getLastAgentResponse()?.text).toBe('Doing well.');
  });
});
