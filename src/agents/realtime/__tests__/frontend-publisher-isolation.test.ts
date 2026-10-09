/**
 * One worker process hosts several calls (USE_SINGLE_PROCESS=true).
 * Each call now gets its own publisher keyed by session ID; when it can't
 * tell which call a message belongs to and more than one is live, it sends
 * nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getFrontendPublisher,
  initializeFrontendPublisher,
  releaseFrontendPublisher,
  resetFrontendPublisher,
  type RoomRef,
} from '../frontend-publisher.js';

function room(name: string) {
  const sent: string[] = [];
  const ref: RoomRef = {
    localParticipant: {
      identity: name,
      publishData: async (data: Uint8Array) => {
        sent.push(new TextDecoder().decode(data));
      },
    },
  };
  return { ref, sent };
}

afterEach(() => resetFrontendPublisher());

describe('frontend publisher isolation between calls', () => {
  it('with one call live, behaves as before', async () => {
    const a = room('a');
    initializeFrontendPublisher('a', a.ref);
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(a.sent).toHaveLength(1);
  });

  it("sends each call's messages only to that call's room", async () => {
    const a = room('a');
    const b = room('b');
    initializeFrontendPublisher('a', a.ref);
    initializeFrontendPublisher('b', b.ref);
    await getFrontendPublisher('a').sendData('from-a', {});
    await getFrontendPublisher('b').sendData('from-b', {});
    await getFrontendPublisher('a').sendData('later-from-a', {});
    expect(a.sent.map((m) => JSON.parse(m).type)).toEqual(['from-a', 'later-from-a']);
    expect(b.sent.map((m) => JSON.parse(m).type)).toEqual(['from-b']);
  });

  it('sends nothing when two calls are live and the message has no call', async () => {
    const a = room('a');
    const b = room('b');
    initializeFrontendPublisher('a', a.ref);
    initializeFrontendPublisher('b', b.ref);
    expect(await getFrontendPublisher().sendData('who-am-i', {})).toBe(false);
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(0);
  });

  it('falls back to the one call left after the other ends', async () => {
    const a = room('a');
    const b = room('b');
    initializeFrontendPublisher('a', a.ref);
    initializeFrontendPublisher('b', b.ref);
    releaseFrontendPublisher('a');
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(b.sent).toHaveLength(1);
  });
});

describe('a call that ends', () => {
  it('is forgotten when its session is released', async () => {
    const a = room('a');
    const b = room('b');
    initializeFrontendPublisher('a', a.ref);
    initializeFrontendPublisher('b', b.ref);
    releaseFrontendPublisher('a');
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(b.sent).toHaveLength(1);
  });
});
