import { afterEach, describe, expect, it } from 'vitest';

import {
  endCall,
  getActiveCalls,
  getRecentCalls,
  markCallStage,
  resetCallQualityStateForTests,
  setCallQualityForwarder,
  startCall,
} from '../../../services/analytics/call-quality-monitor.js';
import { replayCallQuality } from '../job-runner.js';

afterEach(() => {
  setCallQualityForwarder(null);
  resetCallQualityStateForTests();
});

describe('call quality across processes', () => {
  it('a child forwards its call events with their resolved times, and keeps none itself', () => {
    const sent: Array<[string, unknown[]]> = [];
    setCallQualityForwarder((op, args) => void sent.push([op, args]));
    startCall('call-1', 'user-1', 'ferni');
    markCallStage('call-1', 'first_audio', 1234);
    endCall('call-1', 'disconnect');
    expect(sent).toEqual([
      ['startCall', ['call-1', 'user-1', 'ferni']],
      ['markCallStage', ['call-1', 'first_audio', 1234]],
      ['endCall', ['call-1', 'disconnect']],
    ]);
    expect(getActiveCalls()).toEqual([]);
    expect(getRecentCalls()).toEqual([]);
  });

  it('the worker replays them into its own monitor, and ignores anything else', async () => {
    const logs: string[] = [];
    const log = (msg: string) => void logs.push(msg);
    await replayCallQuality('startCall', ['call-2', 'user-2', 'ferni'], log);
    expect(getActiveCalls().map((c) => c.callId)).toEqual(['call-2']);
    await replayCallQuality('endCall', ['call-2', 'natural'], log);
    expect(getRecentCalls().map((c) => [c.callId, c.endReason])).toEqual([['call-2', 'natural']]);
    await replayCallQuality('resetCallQualityStateForTests', [], log);
    await replayCallQuality('constructor', [], log);
    expect(getRecentCalls()).toHaveLength(1);
    expect(logs).toEqual([
      'Ignored an unknown call-quality message from a child',
      'Ignored an unknown call-quality message from a child',
    ]);
  });
});
