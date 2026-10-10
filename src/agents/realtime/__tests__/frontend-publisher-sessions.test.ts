/**
 * One worker process runs several calls at once. Each call's frontend messages
 * must reach only that call's room.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getFrontendPublisher,
  initializeFrontendPublisher,
  releaseFrontendPublisher,
  resetFrontendPublisher,
  type RoomRef,
} from '../frontend-publisher.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
  sendFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  clearSignalEmitter,
  emitTrustSignal,
  setSignalEmitter,
} from '../../../services/trust-systems/trust-signal-emitter.js';

interface FakeRoom extends RoomRef {
  received: Array<{ type: string } & Record<string, unknown>>;
}

function fakeRoom(): FakeRoom {
  const received: FakeRoom['received'] = [];
  return {
    received,
    localParticipant: {
      publishData: async (data: Uint8Array): Promise<void> => {
        received.push(JSON.parse(new TextDecoder().decode(data)));
      },
    },
  };
}

describe('frontend publisher with concurrent calls', () => {
  afterEach(() => {
    resetFrontendPublisher();
  });

  it('sends each session only to its own room', async () => {
    const roomA = fakeRoom();
    const roomB = fakeRoom();
    initializeFrontendPublisher('session-a', roomA);
    initializeFrontendPublisher('session-b', roomB);

    await getFrontendPublisher('session-a').sendData('music_state', { caller: 'a' });
    await getFrontendPublisher('session-b').sendData('music_state', { caller: 'b' });

    expect(roomA.received.map((m) => m.caller)).toEqual(['a']);
    expect(roomB.received.map((m) => m.caller)).toEqual(['b']);
  });

  it('drops an unkeyed send while several calls are live', async () => {
    const roomA = fakeRoom();
    const roomB = fakeRoom();
    initializeFrontendPublisher('session-a', roomA);
    initializeFrontendPublisher('session-b', roomB);

    const publisher = getFrontendPublisher();

    expect(publisher.isConnected()).toBe(false);
    expect(await publisher.sendData('music_state', {})).toBe(false);
    expect(roomA.received).toHaveLength(0);
    expect(roomB.received).toHaveLength(0);
  });

  it('uses the only live call for an unkeyed send', async () => {
    const roomA = fakeRoom();
    initializeFrontendPublisher('session-a', roomA);

    await getFrontendPublisher().sendData('music_state', {});

    expect(roomA.received).toHaveLength(1);
  });

  it('stops publishing to a room once its session is released', async () => {
    const roomA = fakeRoom();
    const roomB = fakeRoom();
    const publisherA = initializeFrontendPublisher('session-a', roomA);
    initializeFrontendPublisher('session-b', roomB);

    releaseFrontendPublisher('session-a');

    expect(await publisherA.sendData('late_message', {})).toBe(false);
    expect(getFrontendPublisher('session-a').isConnected()).toBe(false);
    await getFrontendPublisher().sendData('after_release', {});
    expect(roomA.received).toHaveLength(0);
    expect(roomB.received.map((m) => m.type)).toEqual(['after_release']);
  });
});

describe('frontend signals with concurrent calls', () => {
  afterEach(() => {
    resetFrontendSignal();
  });

  it('ends only the call the signal names', async () => {
    const endA = vi.fn().mockResolvedValue(undefined);
    const endB = vi.fn().mockResolvedValue(undefined);
    initFrontendSignal('session-a', endA);
    initFrontendSignal('session-b', endB);

    const sent = await sendFrontendSignal(
      'conversation_end',
      { reason: 'agent_exit' },
      'session-b'
    );

    expect(sent).toBe(true);
    expect(endA).not.toHaveBeenCalled();
    expect(endB).toHaveBeenCalledWith('conversation_end', { reason: 'agent_exit' });
  });

  it('refuses an unkeyed signal while several calls are live', async () => {
    const endA = vi.fn().mockResolvedValue(undefined);
    const endB = vi.fn().mockResolvedValue(undefined);
    initFrontendSignal('session-a', endA);
    initFrontendSignal('session-b', endB);

    expect(await sendFrontendSignal('conversation_end')).toBe(false);
    expect(endA).not.toHaveBeenCalled();
    expect(endB).not.toHaveBeenCalled();
  });

  it('does not reach a session after it is reset', async () => {
    const endA = vi.fn().mockResolvedValue(undefined);
    initFrontendSignal('session-a', endA);
    resetFrontendSignal('session-a');

    expect(await sendFrontendSignal('conversation_end', {}, 'session-a')).toBe(false);
    expect(endA).not.toHaveBeenCalled();
  });
});

describe('trust signals with concurrent calls', () => {
  afterEach(() => {
    clearSignalEmitter();
  });

  const signal = {
    type: 'growth' as const,
    title: 'You handled that differently',
    message: 'I noticed.',
    timing: 'end_of_turn' as const,
  };

  it('is not shown to another caller while several calls are live', () => {
    const emitA = vi.fn();
    const emitB = vi.fn();
    setSignalEmitter('session-a', emitA);
    setSignalEmitter('session-b', emitB);

    emitTrustSignal(signal);

    expect(emitA).not.toHaveBeenCalled();
    expect(emitB).not.toHaveBeenCalled();
  });

  it('keeps de-duplication per call', () => {
    const emitA = vi.fn();
    setSignalEmitter('session-a', emitA);
    emitTrustSignal(signal);
    clearSignalEmitter('session-a');

    const emitB = vi.fn();
    setSignalEmitter('session-b', emitB);
    emitTrustSignal(signal);

    expect(emitA).toHaveBeenCalledTimes(1);
    expect(emitB).toHaveBeenCalledTimes(1);
  });
});
