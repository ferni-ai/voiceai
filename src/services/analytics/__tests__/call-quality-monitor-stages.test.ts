import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startCall,
  markCallStage,
  recordCallEvent,
  endCall,
  getMetrics,
  resetCallQualityStateForTests,
} from '../call-quality-monitor.js';

describe('call quality stage timings', () => {
  beforeEach(() => {
    resetCallQualityStateForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes jobToFirstAudioMs after first_response', () => {
    const t0 = Date.now() - 250;
    startCall('c1', 'u1', 'ferni');
    const sessionStart = Date.now();
    markCallStage('c1', 'prewarm_done', sessionStart + 50);
    recordCallEvent({
      callId: 'c1',
      type: 'first_response',
      timestamp: sessionStart + 200,
    });
    const m = getMetrics();
    expect(m.avgFirstResponseTimeMs).toBeGreaterThan(0);
    expect(m.lastSessionStages?.prewarm_done).toBeTypeOf('number');
    expect(m.lastSessionStages?.first_audio).toBeTypeOf('number');
    void t0;
  });

  it('keeps relative stage marks after endCall', () => {
    const sessionStart = Date.now();
    startCall('c2', 'u2', 'ferni');
    markCallStage('c2', 'session_initialized', sessionStart + 10);
    recordCallEvent({
      callId: 'c2',
      type: 'first_response',
      timestamp: sessionStart + 180,
    });
    endCall('c2', 'natural');
    const m = getMetrics();
    expect(m.lastSessionStages?.session_initialized).toBeTypeOf('number');
    expect(m.avgFirstResponseTimeMs).toBeGreaterThan(0);
  });

  it('exposes absolute first-audio timing contract with elapsed stage marks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    startCall('c3', 'u3', 'ferni');
    markCallStage('c3', 'prewarm_done', 1_050);
    recordCallEvent({
      callId: 'c3',
      type: 'first_response',
      timestamp: 1_180,
    });

    const m = getMetrics();

    expect(m.lastSessionStages?.sessionStartMs).toBe(1_000);
    expect(m.lastSessionStages?.firstAudioMs).toBe(1_180);
    expect(m.lastSessionStages?.jobToFirstAudioMs).toBe(180);
    expect(m.lastSessionStages?.stages?.prewarm_done).toBe(50);
    expect(m.lastSessionStages?.stages?.first_audio).toBe(180);
  });
});
