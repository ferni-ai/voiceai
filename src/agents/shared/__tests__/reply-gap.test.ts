import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { attachReplyGap, createLoopDelayProbe, type ReplyGapRecord } from '../reply-gap.js';

function rig() {
  const session = new EventEmitter();
  const records: ReplyGapRecord[] = [];
  const detach = attachReplyGap(session, (r) => records.push(r));
  const eou = (lastSpeakingTimeMs: number) =>
    session.emit('metrics_collected', { metrics: { type: 'eou_metrics', lastSpeakingTimeMs } });
  const state = (newState: string, createdAt: number) =>
    session.emit('agent_state_changed', { newState, createdAt });
  return { session, records, detach, eou, state };
}

describe('attachReplyGap', () => {
  it('splits the gap at the commit: caller stop -> thinking -> first audio', () => {
    const r = rig();
    r.eou(10_000);
    r.state('thinking', 10_450);
    r.state('speaking', 11_350);
    expect(r.records).toEqual([{ stopToCommitMs: 450, commitToAudioMs: 900, stopToAudioMs: 1350 }]);
  });

  it('counts only the first audio after a commit, not a tool call speaking again', () => {
    const r = rig();
    r.eou(10_000);
    r.state('thinking', 10_400);
    r.state('speaking', 11_000);
    r.state('thinking', 11_500); // tool call
    r.state('speaking', 13_000);
    expect(r.records).toHaveLength(1);
  });

  it('logs nothing for speech no caller turn asked for (greeting, proactive line)', () => {
    const r = rig();
    r.state('thinking', 1_000);
    r.state('speaking', 1_500);
    expect(r.records).toEqual([]);
  });

  it('ignores metrics without a stop time and other metric types', () => {
    const r = rig();
    r.session.emit('metrics_collected', {
      metrics: { type: 'llm_metrics', lastSpeakingTimeMs: 1_500 },
    });
    r.eou(0);
    r.state('thinking', 2_000);
    r.state('speaking', 2_500);
    expect(r.records).toEqual([]);
  });

  it('stops listening when detached', () => {
    const r = rig();
    r.detach();
    r.eou(10_000);
    r.state('thinking', 10_400);
    r.state('speaking', 11_000);
    expect(r.records).toEqual([]);
  });
});

describe('event-loop stalls in the gap', () => {
  it('reports the worst stall since the caller stopped', () => {
    const session = new EventEmitter();
    const records: ReplyGapRecord[] = [];
    let worst = 0;
    const resets: number[] = [];
    const probe = {
      maxMs: () => worst,
      reset: () => (resets.push(worst), (worst = 0)),
      close: () => undefined,
    };
    attachReplyGap(session, (r) => records.push(r), probe);
    worst = 900; // a stall from the previous reply must not count
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', lastSpeakingTimeMs: 1000 },
    });
    worst = 240;
    session.emit('agent_state_changed', { newState: 'thinking', createdAt: 1400 });
    session.emit('agent_state_changed', { newState: 'speaking', createdAt: 2300 });
    expect(resets).toEqual([900]);
    expect(records[0]?.loopStallMs).toBe(240);
  });

  it('measures a real blocked loop', async () => {
    const probe = createLoopDelayProbe();
    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });
      probe.reset();
      const until = Date.now() + 120;
      while (Date.now() < until) {
        // block the event loop
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 40);
      });
      expect(probe.maxMs()).toBeGreaterThanOrEqual(80);
    } finally {
      probe.close();
    }
  });
});
