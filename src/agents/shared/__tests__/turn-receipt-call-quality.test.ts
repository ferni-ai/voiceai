/**
 * Each caller turn's reply latency reaches the call-quality reply SLO, on the
 * TURN_RECEIPT clock: the end of the caller's speech to Ferni's first audio.
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/slack-notifications.js', () => ({ SlackNotificationService: vi.fn() }));
vi.mock('../../../services/predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));

import {
  getActiveCalls,
  resetCallQualityStateForTests,
  startCall,
} from '../../../services/analytics/call-quality-monitor.js';
import { attachTurnReceipts } from '../turn-receipt-session.js';

afterEach(() => resetCallQualityStateForTests());

describe('turn receipts → call quality', () => {
  it("a caller turn answered 1.4 s after they stopped sets the call's first reply", () => {
    let t = 100_000;
    startCall('call-r');
    const session = new EventEmitter();
    const detach = attachTurnReceipts(session, {
      sessionId: 'call-r',
      userId: 'u-1',
      persona: () => 'ferni',
      emit: () => {},
      now: () => t,
    });
    const state = (newState: string) => session.emit('agent_state_changed', { newState });

    // Ferni's greeting opens no caller turn and sets nothing.
    state('speaking');
    state('listening');
    expect(getActiveCalls()[0].firstReplyMs).toBeUndefined();

    t += 20_000;
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 400, lastSpeakingTimeMs: t },
    });
    state('thinking');
    t += 1_400;
    state('speaking');
    state('listening');
    detach();

    expect(getActiveCalls()[0].firstReplyMs).toBe(1_400);
  });
});
