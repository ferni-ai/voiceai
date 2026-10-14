import { describe, expect, it } from 'vitest';

import { alarms, logFilter, summarize, versionOf } from './ferni-liveness.mjs';

const HOST = 'deployment-p-1gcwootg9al-ca-sitdmheba4fg-7b9cc56c6c-klbss';
let clock = Date.parse('2026-10-11T20:00:00Z');
const entry = (fields, text) => {
  clock += 1000;
  return {
    timestamp: new Date(clock).toISOString(),
    labels: { agent_id: 'CA_siTDMHEba4Fg' },
    textPayload: text ?? JSON.stringify({ level: 30, hostname: HOST, ...fields }),
  };
};
// recordTurn START logs three times per caller turn; count turns, not lines.
const turn = (sessionId, n) =>
  [1, 2, 3].map(() =>
    entry({ sessionId, turnNumber: n, msg: '🧠 [MEMORY-AUDIT] recordTurn START' })
  );
const gap = (sessionId) => entry({ sessionId, msg: 'REPLY_GAP', stopToAudioMs: 900 });
const metrics = (sessionId) => entry({ sessionId, msg: 'TURN_METRICS' });
const receipt = (sessionId, messages) =>
  entry({ sessionId, event: 'TURN_RECEIPT', msg: 'TURN_RECEIPT', reply: { messages } });

describe('ferni-liveness', () => {
  it('a call that is answered is healthy', () => {
    const s = summarize([...turn('s1', 1), gap('s1'), ...turn('s1', 2), gap('s1')]);
    expect(s).toMatchObject({ calls: 1, callerTurns: 2, replies: 2, replyRate: 1, silentCalls: 0 });
    expect(s.version).toBe('7b9cc56c6c');
    expect(alarms(s)).toEqual([]);
  });

  it('a call with two caller turns and no reply alarms (2026-10-11)', () => {
    const s = summarize([...turn('s1', 1), ...turn('s1', 2), ...turn('ok', 1), gap('ok')]);
    expect(s).toMatchObject({ silentCalls: 1, silentSessions: ['s1'], unansweredTurns: 2 });
    expect(alarms(s)).toEqual(['1 call(s) with 2+ caller turns and no reply']);
  });

  it('builds before REPLY_GAP are counted from TURN_METRICS, not as silent', () => {
    const s = summarize([...turn('old', 1), metrics('old'), ...turn('old', 2), metrics('old')]);
    expect(s).toMatchObject({ replies: 2, silentCalls: 0 });
  });

  it('turn receipts give the unanswered turns exactly', () => {
    const s = summarize([
      ...turn('s1', 1),
      gap('s1'),
      receipt('s1', 1),
      ...turn('s1', 2),
      receipt('s1', 0),
    ]);
    expect(s.unansweredTurns).toBe(1);
  });

  it('a runtime module that failed to load alarms on the first line', () => {
    const line = entry(
      {},
      "[voice-agent-entry] ERROR in phase session: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/node_modules/x'"
    );
    expect(alarms(summarize([line]))).toEqual(['1 runtime module load failure line(s)']);
  });

  it('an uncaught-exception spike alarms; one does not', () => {
    const crash = () =>
      entry({ level: 50, msg: '🚨 [CRASH-ANALYTICS] UNCAUGHT_EXCEPTION DETECTED - boom' });
    expect(alarms(summarize([crash()]))).toEqual([]);
    expect(alarms(summarize([crash(), crash(), crash()]))).toEqual([
      '3 uncaught exceptions (max 2)',
    ]);
  });

  it('a low reply rate alarms once there are enough turns', () => {
    const lines = [];
    for (let n = 1; n <= 6; n++) lines.push(...turn('s1', n));
    lines.push(gap('s1'), gap('s1'));
    const s = summarize(lines);
    expect(s.replyRate).toBeCloseTo(0.333, 3);
    expect(alarms(s)).toContain('reply rate 0.333 under 0.5 (6 caller turns)');
    expect(alarms(s, { minTurns: 10 })).toEqual([]);
  });

  it('reads the deploy version from the pod hostname', () => {
    expect(versionOf(HOST)).toBe('7b9cc56c6c');
    expect(versionOf('my-laptop')).toBeNull();
  });

  it('filters server-side to one agent and the lines it reads', () => {
    const f = logFilter('CA_GeFvEpsNXLSF', '2026-10-11T00:00:00Z', 'johnb-2025');
    expect(f).toContain('labels.agent_id="CA_GeFvEpsNXLSF"');
    expect(f).toContain('timestamp>="2026-10-11T00:00:00Z"');
    expect(f).toContain('textPayload:"REPLY_GAP"');
    expect(f).toContain('textPayload:"\\"level\\":50"');
  });
});
