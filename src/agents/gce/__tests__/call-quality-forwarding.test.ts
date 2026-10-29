import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushBqEvents, setBqTransportForTests } from '../../../services/analytics/bq-events.js';

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
  setBqTransportForTests(null);
  vi.unstubAllEnvs();
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

  it("a placed call's job type rides startCall, so the worker times it from pickup", async () => {
    const sent: Array<[string, unknown[]]> = [];
    setCallQualityForwarder((op, args) => void sent.push([op, args]));
    startCall('call-4', 'user-4', 'ferni', 'on_behalf_call');
    expect(sent).toEqual([['startCall', ['call-4', 'user-4', 'ferni', 'on_behalf_call']]]);
    setCallQualityForwarder(null);
    await replayCallQuality('startCall', sent[0]?.[1] ?? [], () => undefined);
    expect(getActiveCalls().map((c) => [c.callId, c.outbound])).toEqual([['call-4', true]]);
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

  it("the child's turn count rides endCall to the worker's call_events row", async () => {
    const rows: Array<Record<string, unknown>> = [];
    setBqTransportForTests(async (_table, batch) => void rows.push(...batch));
    vi.stubEnv('BQ_EVENTS', 'on');
    const sent: Array<[string, unknown[]]> = [];
    setCallQualityForwarder((op, args) => void sent.push([op, args]));
    endCall('call-3', 'natural', { turns: 4 });
    expect(sent).toEqual([['endCall', ['call-3', 'natural', { turns: 4 }]]]);
    setCallQualityForwarder(null);
    const log = () => undefined;
    await replayCallQuality('startCall', ['call-3', 'user-3', 'ferni'], log);
    await replayCallQuality('endCall', sent[0]?.[1] ?? [], log);
    await flushBqEvents();
    expect(rows).toEqual([expect.objectContaining({ event_type: 'call_end', turns: 4 })]);
  });
});
