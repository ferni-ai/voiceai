import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Room } from '@livekit/rtc-node';
import { openIfOnBehalfCall, waitForCallActive } from '../livekit-call-opening.js';

/** A room stand-in: the SIP leg's attributes change as the call progresses. */
function fakeRoom() {
  const room = Object.assign(new EventEmitter(), {
    remoteParticipants: new Map<string, { identity: string; attributes: Record<string, string> }>(),
  });
  const phone = (status: string) => {
    const p = { identity: 'phone_c1', attributes: { 'sip.callStatus': status } };
    room.remoteParticipants.set(p.identity, p);
    room.emit('participantAttributesChanged', { 'sip.callStatus': status }, p);
    return p;
  };
  return { room, phone, asRoom: room as unknown as Room };
}

describe('waitForCallActive', () => {
  it('waits through dialing and resolves when the call is answered', async () => {
    const { phone, asRoom } = fakeRoom();
    const answered = waitForCallActive(asRoom, 'phone_c1', 1_000);
    phone('dialing');
    phone('active');
    await expect(answered).resolves.toBe(true);
  });

  it('does not treat a ringing phone as answered', async () => {
    const { phone, asRoom } = fakeRoom();
    const answered = waitForCallActive(asRoom, 'phone_c1', 30);
    phone('dialing');
    await expect(answered).resolves.toBe(false);
  });

  it('resolves at once if the call was already answered', async () => {
    const { room, asRoom } = fakeRoom();
    room.remoteParticipants.set('phone_c1', {
      identity: 'phone_c1',
      attributes: { 'sip.callStatus': 'active' },
    });
    await expect(waitForCallActive(asRoom, 'phone_c1', 1_000)).resolves.toBe(true);
  });

  it('gives up on a hang-up, a dropped leg, or a timeout', async () => {
    const a = fakeRoom();
    const hungUp = waitForCallActive(a.asRoom, 'phone_c1', 1_000);
    a.phone('hangup');
    await expect(hungUp).resolves.toBe(false);

    const b = fakeRoom();
    const dropped = waitForCallActive(b.asRoom, 'phone_c1', 1_000);
    b.room.emit('participantDisconnected', { identity: 'phone_c1' });
    await expect(dropped).resolves.toBe(false);

    const c = fakeRoom();
    await expect(waitForCallActive(c.asRoom, 'phone_c1', 20)).resolves.toBe(false);
  });

  it('ignores other participants', async () => {
    const { room, phone, asRoom } = fakeRoom();
    const answered = waitForCallActive(asRoom, 'phone_c1', 1_000);
    room.emit(
      'participantAttributesChanged',
      {},
      { identity: 'someone_else', attributes: { 'sip.callStatus': 'active' } }
    );
    phone('active');
    await expect(answered).resolves.toBe(true);
  });
});

describe('openIfOnBehalfCall', () => {
  it('leaves ordinary sessions to their normal greeting', () => {
    expect(openIfOnBehalfCall('s-ordinary', { session: {} })).toBe(false);
  });
});
