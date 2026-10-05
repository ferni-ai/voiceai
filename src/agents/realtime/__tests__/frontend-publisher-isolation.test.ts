/**
 * One worker process hosts several calls (USE_SINGLE_PROCESS=true); the
 * publisher was a process singleton that every new call re-pointed with
 * setRoom, so call A's app messages went to call B's room once B started.
 * Each call now gets its own publisher; when it can't tell which call a
 * message belongs to and more than one is live, it sends nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getFrontendPublisher,
  initializeFrontendPublisher,
  releaseFrontendPublisher,
  resetFrontendPublisher,
  runInCall,
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
    initializeFrontendPublisher(a.ref);
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(a.sent).toHaveLength(1);
  });

  it("sends each call's messages only to that call's room", async () => {
    const a = room('a');
    const b = room('b');
    await runInCall(a.ref, async () => {
      initializeFrontendPublisher(a.ref);
      await new Promise((r) => setTimeout(r, 1));
      await getFrontendPublisher().sendData('from-a', {});
    });
    await runInCall(b.ref, async () => {
      initializeFrontendPublisher(b.ref);
      await getFrontendPublisher().sendData('from-b', {});
    });
    await runInCall(a.ref, () => getFrontendPublisher().sendData('later-from-a', {}));
    expect(a.sent.map((m) => JSON.parse(m).type)).toEqual(['from-a', 'later-from-a']);
    expect(b.sent.map((m) => JSON.parse(m).type)).toEqual(['from-b']);
  });

  it('sends nothing when two calls are live and the message has no call', async () => {
    const a = room('a');
    const b = room('b');
    runInCall(a.ref, () => initializeFrontendPublisher(a.ref));
    runInCall(b.ref, () => initializeFrontendPublisher(b.ref));
    expect(await getFrontendPublisher().sendData('who-am-i', {})).toBe(false);
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(0);
  });

  it('falls back to the one call left after the other ends', async () => {
    const a = room('a');
    const b = room('b');
    initializeFrontendPublisher(a.ref);
    initializeFrontendPublisher(b.ref);
    releaseFrontendPublisher(a.ref);
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(b.sent).toHaveLength(1);
  });
});

describe('a call that ends', () => {
  it('is forgotten when its room disconnects', async () => {
    const { EventEmitter } = await import('node:events');
    const a = Object.assign(new EventEmitter(), room('a').ref);
    const b = room('b');
    runInCall(a, () => initializeFrontendPublisher(a));
    runInCall(b.ref, () => initializeFrontendPublisher(b.ref));
    a.emit('disconnected');
    expect(await getFrontendPublisher().sendData('ping', {})).toBe(true);
    expect(b.sent).toHaveLength(1);
  });
});
