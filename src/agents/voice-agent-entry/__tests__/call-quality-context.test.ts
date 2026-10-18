/**
 * What call quality learns when the caller joins: eval traffic, and when a phone
 * Ferni dialed was answered (the greeting clock never includes ringing).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/slack-notifications.js', () => ({ SlackNotificationService: vi.fn() }));
vi.mock('../../../services/predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));

import {
  getActiveCalls,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
} from '../../../services/analytics/call-quality-monitor.js';
import { evaluateSlos, type SloLimits } from '../../../services/analytics/call-quality-slo.js';
import { noteCallQualityContext } from '../call-quality-context.js';

class FakeRoom extends EventEmitter {
  constructor(readonly name: string) {
    super();
  }
}

const stages = (id: string) => getActiveCalls().find((c) => c.callId === id)?.stages ?? {};

describe('noteCallQualityContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    resetCallQualityStateForTests();
    vi.useRealTimers();
  });

  it('starts the greeting clock when a dialed phone is answered, not while it rings', () => {
    startCall('out-1');
    const room = new FakeRoom('bogle-call-1');
    const phone = { identity: 'sip_1', attributes: { 'sip.callStatus': 'dialing' } };
    noteCallQualityContext({ participant: phone, room, sessionId: 'out-1' });
    vi.advanceTimersByTime(20_000);
    expect(stages('out-1').call_answered).toBeUndefined();

    room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, phone);
    expect(stages('out-1').call_answered).toBe(20_000);
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });

  it('a web caller or an inbound phone can hear Ferni from the moment they join', () => {
    startCall('web-1');
    vi.advanceTimersByTime(800);
    noteCallQualityContext({
      participant: { identity: 'user-1', attributes: {} },
      room: new FakeRoom('voice-abc'),
      sessionId: 'web-1',
    });
    expect(stages('web-1').call_answered).toBe(800);
  });

  it('stops watching a phone that hangs up unanswered', () => {
    startCall('out-2');
    const room = new FakeRoom('bogle-call-2');
    const phone = { identity: 'sip_2', attributes: { 'sip.callStatus': 'ringing' } };
    noteCallQualityContext({ participant: phone, room, sessionId: 'out-2' });
    room.emit('participantAttributesChanged', { 'sip.callStatus': 'hangup' }, phone);
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
    expect(stages('out-2').call_answered).toBeUndefined();
  });

  const LIMITS: SloLimits = {
    reply_p90: { warn: 3000, critical: 5000 },
    greeting_p90: { warn: 4000, critical: Infinity },
    drop_rate: { warn: 0.05, critical: 0.1 },
    connect_fail: { warn: 0.05, critical: 0.1 },
    minCalls: 10,
    minTurns: 10,
    windowMs: 3_600_000,
  };

  it.each([
    ['eval-long-day-prod-1', 'caller', 0],
    ['keycheck-s1-120715', 'keycheck-caller', 0],
    ['voice-xyz', 'voice-eval-7', 0],
    ['voice-xyz', 'user-7', 12],
  ])('room %s, caller %s: %i reply samples count', (roomName, identity, counted) => {
    for (let i = 0; i < 12; i++) {
      const id = `${roomName}-${identity}-${i}`;
      startCall(id);
      noteCallQualityContext({
        participant: { identity },
        room: new FakeRoom(roomName),
        sessionId: id,
      });
      const metadata = { firstAudioMs: 9000, userKind: 'other' };
      recordCallEvent({ callId: id, timestamp: Date.now(), type: 'first_response', metadata });
    }
    const [reply] = evaluateSlos([], getActiveCalls(), LIMITS);
    expect(reply).toMatchObject({ key: 'reply_p90', samples: counted });
  });
});
