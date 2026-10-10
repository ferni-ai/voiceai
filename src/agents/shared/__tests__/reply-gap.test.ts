import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { attachReplyGap, type ReplyGapRecord } from '../reply-gap.js';

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
