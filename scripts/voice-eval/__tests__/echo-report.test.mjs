import { describe, expect, it } from 'vitest';
import {
  callLines,
  callerFrame,
  compareReports,
  echoMetrics,
  payloadsOf,
  reportOf,
  summaryOf,
} from '../echo-report.mjs';

const ROOM = 'eval-long-day-a-101010';
const JOB = 'AJ_echo1';
const SESSION = `session-${JOB}-1791700000000`;
const OTHER = 'session-AJ_other-1791700000500';
const SECRET_WORDS = 'please stop talking about my sister';

const pino = (msg, fields) =>
  `2026-10-22T10:10:10Z  ${JSON.stringify({ level: 30, time: 1791700001000, msg, ...fields })}`;
const frame = (fn, line, col) =>
  `at ${fn} (file:///app/dist/agents/multi-agent/live-call-behaviors.js:${line}:${col})`;
const receipt = (sessionId, timing, endedBy, interrupted) =>
  pino('TURN_RECEIPT', {
    event: 'TURN_RECEIPT',
    sessionId,
    timing,
    endedBy,
    reply: { interrupted },
  });

const interrupt = pino('SESSION_INTERRUPT', {
  sessionId: SESSION,
  caller: frame('BargeIn.fire', 92, 19),
  agentState: 'speaking',
});
const LOG = [
  'worker starting, no json here',
  pino('Starting job', { jobId: JOB, roomName: ROOM }),
  `[10:10:10.000] [INFO] [job] [SESSION] ✅ Connected to room ${JSON.stringify({ sessionId: JOB, roomName: ROOM })}`,
  pino('Starting job', { jobId: 'AJ_other', roomName: 'eval-other-b-1' }),
  interrupt,
  interrupt, // a reconnecting capture replays the line: counted once
  pino('SESSION_INTERRUPT', {
    sessionId: SESSION,
    caller: frame('BargeIn.fire', 92, 7),
    agentState: 'speaking',
    time: 2,
  }),
  pino('SESSION_INTERRUPT', {
    sessionId: SESSION,
    caller: frame('Handoff.swap', 40, 3),
    agentState: 'listening',
  }),
  pino('SESSION_INTERRUPT', {
    sessionId: OTHER,
    caller: frame('BargeIn.fire', 92, 19),
    agentState: 'speaking',
  }),
  pino('BARGE_IN_FASTPATH', { sessionId: SESSION, reason: 'sustained-speech', ms: 950 }),
  pino('BARGE_IN_FASTPATH', { sessionId: SESSION, reason: 'sustained-speech', ms: 1200 }),
  pino('BARGE_IN_FASTPATH', {
    sessionId: SESSION,
    reason: 'transcript',
    transcript: SECRET_WORDS,
    words: 6,
  }),
  pino('BARGE_IN_FASTPATH', { sessionId: OTHER, reason: 'sustained-speech', ms: 990 }),
  pino('BARGE_IN_FALSE_INTERRUPTION', { sessionId: SESSION, resumed: true }),
  pino('BARGE_IN_FALSE_INTERRUPTION', { sessionId: SESSION, resumed: false }),
  pino('BARGE_IN_SOFT_PAUSE', { sessionId: SESSION, outcome: 'interrupted' }),
  pino('BARGE_IN_SOFT_PAUSE', { sessionId: SESSION, outcome: 'resumed', time: 3 }),
  pino('BARGE_IN_SOFT_PAUSE', { sessionId: SESSION, outcome: 'resumed', time: 4 }),
  pino('LOOP_STALL', { jobId: JOB, ms: 120, agentState: 'speaking', speakingMs: 400 }),
  pino('LOOP_STALL', { jobId: JOB, ms: 340, agentState: 'listening', speakingMs: null }),
  pino('LOOP_STALL', { jobId: 'AJ_other', ms: 900, agentState: 'speaking', speakingMs: 10 }),
  pino('LOOP_SUMMARY', { jobId: JOB, stalls: 2, maxMs: 340, speakingStalls: 1 }),
  receipt(SESSION, { firstAudioMs: 900, commitToAudioMs: 400 }, 'listening', false),
  receipt(SESSION, { firstAudioMs: 800, commitToAudioMs: 300 }, 'superseded', true),
  receipt(SESSION, { firstAudioMs: null, commitToAudioMs: null }, 'superseded', false),
  receipt(SESSION, { firstAudioMs: null, commitToAudioMs: 350 }, 'listening', false),
  receipt(OTHER, { firstAudioMs: 700 }, 'listening', false),
  `2026-10-22T10:10:11Z  {"msg":"LOOP_STALL","jobId":"${JOB}","ms":99`, // cut by lk: unreadable
].join('\n');

const RUN = {
  meta: { env: 'dev', scenario: 'long-day', label: 'a', room: ROOM, uid: 'voice-eval-x' },
  wallT0: 1791700000000,
  echo: { gainDb: -18, delayMs: 120, noiseDb: null, echoSamples: 10, sentFile: '/tmp/x.sent.wav' },
  events: [{ t: 100, who: 'user', text: SECRET_WORDS }],
};

describe('finding the call in the log', () => {
  it('ties lines to the room through its job id, and leaves other calls out', () => {
    const call = callLines(payloadsOf(LOG), ROOM);
    expect(call.jobs).toEqual([JOB]);
    expect(call.sessions).toEqual([SESSION]);
    expect(call.lines.some((l) => l.sessionId === OTHER || l.jobId === 'AJ_other')).toBe(false);
  });

  it('finds nothing for an unknown room unless the job is named', () => {
    expect(callLines(payloadsOf(LOG), 'eval-nope').lines).toEqual([]);
    expect(callLines(payloadsOf(LOG), 'eval-nope', [JOB]).sessions).toEqual([SESSION]);
  });

  it('reads saved gcloud JSON the same as an lk capture', () => {
    const entries = LOG.split('\n').map((textPayload) => ({
      textPayload,
      timestamp: '2026-10-22T10:10:10Z',
    }));
    expect(echoMetrics(callLines(payloadsOf(JSON.stringify(entries)), ROOM).lines)).toEqual(
      echoMetrics(callLines(payloadsOf(LOG), ROOM).lines)
    );
  });
});

describe('echo metrics', () => {
  const m = echoMetrics(callLines(payloadsOf(LOG), ROOM).lines);

  it('groups SESSION_INTERRUPT by caller frame and agent state', () => {
    expect(m.sessionInterrupts).toEqual({
      n: 3,
      byCaller: {
        'BargeIn.fire (live-call-behaviors.js:92)': 2,
        'Handoff.swap (live-call-behaviors.js:40)': 1,
      },
      byAgentState: { speaking: 2, listening: 1 },
    });
  });

  it('counts fast-path stops by reason, false interruptions and soft-pause outcomes', () => {
    expect(m.bargeInFastPath).toEqual({ n: 3, byReason: { 'sustained-speech': 2, transcript: 1 } });
    expect(m.falseInterruptions).toEqual({ n: 2, unresumed: 1 });
    expect(m.softPause).toEqual({ n: 3, byOutcome: { resumed: 2, interrupted: 1 } });
  });

  it('counts loop stalls, the worst one and those while Ferni spoke', () => {
    expect(m.loopStalls).toEqual({
      n: 2,
      maxMs: 340,
      totalMs: 460,
      whileSpeaking: 1,
      summary: { stalls: 2, maxMs: 340, speakingStalls: 1 },
    });
  });

  it('counts replies started, completed and cut', () => {
    expect(m.replies).toEqual({ turns: 4, started: 3, completed: 2, cut: 1 });
  });
});

describe('the report', () => {
  const report = reportOf(RUN, payloadsOf(LOG));

  it('holds counts and ids, never what anyone said', () => {
    const json = JSON.stringify(report);
    expect(report.metrics.bargeInFastPath.n).toBe(3);
    expect(json).not.toContain('sister');
    expect(json).not.toContain('sent.wav');
    expect(report).toMatchObject({
      room: ROOM,
      jobs: [JOB],
      echo: { gainDb: -18, delayMs: 120, noiseDb: null },
    });
  });

  it('prints a summary that warns when no line matched', () => {
    expect(summaryOf(report)).toMatch(/barge-in fast path\s+3 {2}2 sustained-speech, 1 transcript/);
    expect(summaryOf(report)).not.toMatch(/NO LOG LINES/);
    expect(summaryOf(reportOf({ ...RUN, meta: { room: 'eval-nope' } }, payloadsOf(LOG)))).toMatch(
      /NO LOG LINES/
    );
  });

  it('compares two reports metric by metric, a missing count as 0', () => {
    const baseline = reportOf(
      { ...RUN, echo: undefined },
      payloadsOf(
        LOG.split('\n')
          .filter((l) => !l.includes('sustained'))
          .join('\n')
      )
    );
    const rows = compareReports(baseline, report);
    expect(rows).toContainEqual(['bargeInFastPath.n', 1, 3, 2]);
    expect(rows).toContainEqual(['bargeInFastPath.byReason.sustained-speech', 0, 2, 2]);
    expect(rows).toContainEqual(['replies.completed', 2, 2, 0]);
  });
});

describe('callerFrame', () => {
  it('drops the directory and column, keeps function, file and line', () => {
    expect(callerFrame('at file:///app/dist/agent.js:100:5')).toBe('agent.js:100');
    expect(callerFrame(undefined)).toBe('unknown');
  });
});
