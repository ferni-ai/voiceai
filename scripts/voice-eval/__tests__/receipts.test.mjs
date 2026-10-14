import { describe, expect, it } from 'vitest';
import { logFilter, receiptOf, receiptsFrom, rows, table } from '../receipts.mjs';

const receipt = (turn, extra = {}) => ({
  event: 'TURN_RECEIPT',
  v: 1,
  sessionId: 'RM_abc',
  turn,
  personaId: 'ferni',
  userKind: 'eval',
  endedBy: 'listening',
  timing: {
    eouDelayMs: 310,
    llmTtftMs: 420,
    llmReadyMs: 700,
    firstAudioMs: 980,
    replyDoneMs: 3100,
  },
  tokens: { prompt: 4000, promptCached: 3000, completion: 20 },
  prompt: {
    requests: 1,
    lane: null,
    totalTokensEst: 3900,
    sections: [
      { name: 'instructions', tokensEst: 3000 },
      { name: 'caller_turn', tokensEst: 12 },
      { name: 'memory_recall', tokensEst: 80 },
      { name: 'turn_reminder', tokensEst: 300 },
    ],
  },
  director: { offered: 2, kept: 1, droppedIdx: [1] },
  tools: {
    offered: 12,
    called: ['handoffToMaya'],
    errors: 0,
    handoff: { attempted: true, tool: 'handoffToMaya', result: 'switched' },
  },
  reply: { messages: 1, chars: 64, sentences: 2, interrupted: true, ttsCancelled: true },
  ...extra,
});
const entry = (r, timestamp, prefix = '') => ({
  timestamp,
  textPayload: `${prefix}${JSON.stringify({ level: 30, ...r, msg: 'TURN_RECEIPT' })}`,
});

describe('receipts', () => {
  it('builds the filter the runbook uses, and refuses a session id that could break it', () => {
    expect(logFilter('RM_abc', 'johnb-2025')).toBe(
      'logName="projects/johnb-2025/logs/cloud-agents" AND textPayload:"TURN_RECEIPT" AND textPayload:"RM_abc"'
    );
    expect(() => logFilter('x" OR "1', 'johnb-2025')).toThrow();
  });

  it('reads a receipt from a log line, with or without a prefix, and nothing else', () => {
    expect(
      receiptOf(`2026-10-11T10:00:00Z ${JSON.stringify({ msg: 'TURN_RECEIPT', turn: 1 })}`)
    ).toMatchObject({ turn: 1 });
    expect(receiptOf(JSON.stringify({ msg: 'TURN_METRICS' }))).toBeNull();
    expect(receiptOf('not json {')).toBeNull();
    expect(receiptOf(undefined)).toBeNull();
  });

  it("keeps this call's receipts, oldest first, each once", () => {
    const entries = [
      entry(receipt(2), '2026-10-11T10:00:05Z'),
      entry(receipt(1), '2026-10-11T10:00:01Z', 'stderr: '),
      entry(receipt(1), '2026-10-11T10:00:01Z'),
      entry(receipt(1, { sessionId: 'RM_other' }), '2026-10-11T10:00:00Z'),
    ];
    expect(receiptsFrom(entries, 'RM_abc').map((r) => r.turn)).toEqual([1, 2]);
  });

  it('prints one row per turn: timings, tokens, top sections, director, tools, handoff, reply', () => {
    const [row] = rows([receipt(1)]);
    expect(row).toMatchObject({
      turn: '1',
      ready: '700',
      audio: '980',
      prompt: '4000 (75%c)',
      est: '3900',
      sections: 'instructions:3000 turn_reminder:300 memory_recall:80',
      director: '1/2',
      tools: '12→handoffToMaya',
      handoff: 'handoffToMaya:switched',
      reply: '64c/2s INT',
    });
    const out = table(rows([receipt(1), receipt(2, { prompt: { requests: 1, lane: null } })]));
    expect(out.split('\n')).toHaveLength(3);
    expect(out.split('\n')[0]).toMatch(/^turn\s+persona/);
    expect(out.split('\n')[2]).toContain('-'); // a receipt without sections still prints
    expect(table([])).toBe('(no TURN_RECEIPT lines)');
  });
});
