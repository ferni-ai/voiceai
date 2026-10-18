/**
 * CALL_START_STAGES: one structured line per call with the start-up stage timings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }),
}));

import {
  endCall,
  markCallStage,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
} from '../call-quality-monitor.js';

const stageLines = () => info.mock.calls.filter(([, msg]) => msg === 'CALL_START_STAGES');

describe('CALL_START_STAGES log line', () => {
  beforeEach(() => {
    resetCallQualityStateForTests();
    info.mockClear();
  });

  it('logs numeric stage fields once, at first audio', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    startCall('c1', 'u1', 'ferni');
    vi.restoreAllMocks();
    markCallStage('c1', 'identify_start', 10_020);
    markCallStage('c1', 'identify_done', 10_140);
    markCallStage('c1', 'services_init_start', 10_150);
    markCallStage('c1', 'services_init_done', 10_400);
    markCallStage('c1', 'profile_ready', 10_600);
    markCallStage('c1', 'context_built', 11_000);
    markCallStage('c1', 'greeting_say', 11_200);
    markCallStage('c1', 'tts_first_frame', 11_900);
    recordCallEvent({ callId: 'c1', type: 'first_response', timestamp: 11_950 });
    endCall('c1', 'natural');

    expect(stageLines()).toHaveLength(1);
    const [fields] = stageLines()[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({
      event: 'CALL_START_STAGES',
      callId: 'c1',
      identifyMs: 120,
      servicesInitMs: 250,
      profileReadyAtMs: 600,
      contextBuiltAtMs: 1_000,
      greetingSayAtMs: 1_200,
      firstAudioAtMs: 1_900,
    });
  });

  it('a call that never spoke still logs at the end, with nulls for missing stages', () => {
    startCall('c2', 'u2', 'ferni');
    markCallStage('c2', 'identify_start');
    markCallStage('c2', 'identify_done');
    endCall('c2', 'disconnect');

    expect(stageLines()).toHaveLength(1);
    const [fields] = stageLines()[0] as [Record<string, unknown>];
    expect(fields.identifyMs).toBeTypeOf('number');
    expect(fields.profileReadyAtMs).toBeNull();
    expect(fields.firstAudioAtMs).toBeNull();
  });
});
