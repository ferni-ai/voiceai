import { describe, expect, it } from 'vitest';
import {
  callerPauses,
  callsOfEntries,
  poolLogCalls,
  poolRuns,
  turnTakingOfLines,
  // @ts-expect-error plain .mjs script, no types
} from '../../../scripts/voice-eval/turn-taking.mjs';

const START = 1_791_700_000_000;
const SESSION = `session-AJ_tt-${START}`;
const OWNER = 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';

type Line = Record<string, unknown>;
const at = (dt: number, msg: string, extra: Line = {}): Line => ({
  time: START + dt,
  msg,
  ...extra,
});
const tts = (dt: number, text: string) =>
  at(dt, 'E2E TRACE', { trace: 'E2E_TTS_OUTPUT', ttsText: text, isEmpty: false });

const CALL: Line[] = [
  at(1000, 'Processing user turn', { preview: 'I had a long day and' }),
  tts(2000, 'Oh no, what happened?'),
  // back within 1.2 s of Ferni's reply: Ferni took a mid-thought pause
  at(3200, 'Processing user turn', { preview: 'my boss moved the deadline' }),
  at(3300, 'REPLY_GAP', { stopToAudioMs: 900 }),
  at(3400, 'TURN_METRICS', { eouDelayMs: 300 }),
  tts(4000, 'That is rough.'),
  // a backchannel this soon is not a cut-in
  at(5000, 'Processing user turn', { preview: 'Mm-hmm.' }),
  at(5100, 'REPLY_GAP', { stopToAudioMs: 1500 }),
  at(5200, 'TURN_METRICS', { eouDelayMs: 600 }),
  tts(6000, 'Anyway.'),
  at(20000, 'Processing user turn', { preview: 'So what now' }),
  at(21000, 'BARGE_IN_FALSE_INTERRUPTION', { resumed: true }),
  at(22000, 'BARGE_IN_FALSE_INTERRUPTION', { resumed: false }),
  at(23000, 'BARGE_IN_DECISION', { isInterruption: true, detectionDelayS: 0.2 }),
  at(24000, 'BARGE_IN_DECISION', { isInterruption: true, detectionDelayS: 0.5 }),
  at(25000, 'BARGE_IN_DECISION', { isInterruption: false, detectionDelayS: 0.8 }),
  at(26000, 'BARGE_IN_FASTPATH', { reason: 'sustained-speech' }),
  at(27000, 'backchannel clip played', { text: 'Mm' }),
  at(27001, 'CLIP_WIRE', { pauseToWireMs: 260, playToWireMs: 40, track: 'direct' }),
  at(28000, 'backchannel clip played', { text: 'Yeah' }),
  at(29000, 'TURN_RECEIPT', {
    timing: { firstAudioMs: null },
    reply: { interrupted: false },
  }),
];

describe('turn-taking scorecard from logs', () => {
  it('measures one call', () => {
    const m = turnTakingOfLines(CALL);
    expect(m.callerTurns).toBe(4);
    expect(m.replyGapMs).toEqual([900, 1500]);
    expect(m.eouDelayMs).toEqual([300, 600]);
    expect(m.firstTurnEouDelayMs).toEqual([300]);
    expect(m.laterTurnEouDelayMs).toEqual([600]);
    expect(m.falseInterruptions).toEqual({ n: 2, unresumed: 1 });
    expect(m.silentReplies).toBe(1);
    expect(m.bargeIns).toMatchObject({
      decisions: 3,
      n: 2,
      yieldMs: [200, 500],
      fastPath: 1,
      missedYield: 1,
    });
    expect(m.cutInProxy).toBe(1);
    expect(m.backchannels).toMatchObject({ played: 2, direct: 1, pauseToWireMs: [260] });
  });

  it('pools calls into rates', () => {
    const card = poolLogCalls([turnTakingOfLines(CALL), turnTakingOfLines(CALL.slice(0, 2))]);
    expect(card.calls).toBe(2);
    expect(card.replyGapMs).toMatchObject({ p50: 1500, n: 2 });
    expect(card.falseInterruptions).toMatchObject({ n: 2, unresumed: 1, callsWithAny: 1 });
    // missed yields: the 500 ms model stop plus the fast-path stop, of 3 barge-ins
    expect(card.bargeIns).toMatchObject({ n: 2, missedYield: 2, missedYieldRate: 0.667 });
    expect(card.backchannels.directShare).toBe(0.5);
    expect(card.cutInProxy).toEqual({ n: 1, perCallerTurn: 0.2 });
  });

  it('reads only reviewable callers from gcloud entries', () => {
    const entry = (j: Line) => ({
      timestamp: new Date(Number(j.time)).toISOString(),
      textPayload: JSON.stringify({ hostname: 'pod-a', ...j }),
    });
    const lines = [
      at(0, '🌍 Session language initialized', { sessionId: SESSION, userId: OWNER }),
      ...CALL.map((l) => ({ ...l, sessionId: SESSION })),
      at(60_000, 'Session ended', { module: 'FinOps', sessionId: SESSION }),
      at(0, '🌍 Session language initialized', {
        sessionId: `session-AJ_x-${START}`,
        userId: 'someone',
      }),
    ];
    const calls = callsOfEntries(lines.map(entry));
    expect(calls.map((c: { userKind: string }) => c.userKind)).toEqual(['owner']);
  });
});

describe('turn-taking scorecard from recordings', () => {
  // One caller turn, 1000-6000 ms: phrases with a 300 ms and a 900 ms pause.
  const phrases: Array<[number, number]> = [
    [1000, 2500],
    [2800, 4000],
    [4900, 6000],
  ];
  const run = (replyStarts: number[], results: unknown[] = []) => ({
    userSpeech: [[1000, 6000]],
    tracks: [
      { name: 'agent:roomio_audio', voice: replyStarts.map((s) => [s, s + 2000]) },
      { name: 'agent:background_audio', voice: [[4100, 4400]] },
    ],
    results,
    mic: { file: 'mic.wav', startT: 0 },
  });

  it('counts a reply that starts inside a mid-thought pause as a cut-off', () => {
    expect(callerPauses(run([4300]), phrases)).toEqual([
      { ms: 300, cutOff: false },
      { ms: 900, cutOff: true },
    ]);
    // a clip on the side track is not a reply; a reply after the turn is not a cut-off
    expect(callerPauses(run([6800]), phrases).some((p: { cutOff: boolean }) => p.cutOff)).toBe(
      false
    );
  });

  it('scores talk-over and the reply gap', () => {
    const RATE = 16000;
    const pcm = new Int16Array(RATE * 7);
    for (const [a, b] of phrases)
      for (let i = (RATE * a) / 1000; i < (RATE * b) / 1000; i++)
        pcm[i] = Math.round(8000 * Math.sin(i / 5));
    const card = poolRuns(
      [
        run(
          [4300],
          [
            { replyDelayMs: 800 },
            { mode: 'backchannel', agentTalking: true, stopped: true, stopLatencyMs: 600 },
            { mode: 'backchannel', agentTalking: true, stopped: false, stopLatencyMs: null },
            { mode: 'interrupt', agentTalking: true, stopped: true, stopLatencyMs: 250 },
            { mode: 'interrupt', agentTalking: true, stopped: true, stopLatencyMs: 1400 },
            { mode: 'interrupt', agentTalking: false, stopped: false, stopLatencyMs: null },
          ]
        ),
      ],
      () => ({ pcm, rate: RATE })
    );
    expect(card.replyGapMs).toMatchObject({ p50: 800, n: 1 });
    expect(card.cutOffs).toMatchObject({ midTurnPauses: 2, n: 1, rate: 0.5 });
    expect(card.falseInterruptions).toEqual({ backchannels: 2, stoppedFerni: 1 });
    expect(card.bargeIns).toMatchObject({ n: 2, yielded: 2, missedYield: 1 });
  });
});
