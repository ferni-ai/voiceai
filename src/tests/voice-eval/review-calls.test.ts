import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  callMetrics,
  indexSessions,
  linesOf,
  parseEntries,
  runOf,
  SETH_UID,
  summaryOutcome,
  timelineOf,
  userKind,
} from '../../../scripts/voice-eval/review-calls.mjs';

const START = 1_791_700_000_000;
const SESSION = `session-AJ_test-${START}`;
const OTHER = `session-AJ_other-${START + 60_000}`;

type Line = Record<string, unknown>;
const entry = (j: Line) => ({
  timestamp: new Date(Number(j.time)).toISOString(),
  textPayload: JSON.stringify({ hostname: 'pod-a', pid: 1, level: 30, ...j }),
});
const line = (dt: number, msg: string, extra: Line = {}) =>
  entry({ time: START + dt, msg, ...extra });

const callLines = () =>
  parseEntries([
    line(0, '🌍 Session language initialized', { sessionId: SESSION, userId: SETH_UID }),
    line(100, '🔍 E2E TRACE [4/4] → TTS', {
      trace: 'E2E_TTS_OUTPUT',
      ttsText: 'Hey Sam, <break time="80ms"/>how was the day?',
    }),
    line(5000, 'Processing user turn', { preview: 'long day at work' }),
    line(6000, 'REPLY_GAP', { sessionId: SESSION, stopToAudioMs: 900 }),
    line(6100, '🔍 E2E TRACE [4/4] → TTS', {
      trace: 'E2E_TTS_OUTPUT',
      ttsText: 'My garden needs water.',
    }),
    line(9000, 'Processing user turn', { preview: 'oh really' }),
    line(10000, 'REPLY_GAP', { sessionId: SESSION, stopToAudioMs: 1500 }),
    line(10100, '🔍 E2E TRACE [4/4] → TTS', {
      trace: 'E2E_TTS_OUTPUT',
      ttsText: 'The garden is dry again.',
    }),
    line(10150, 'CRISIS_CLASSIFIER', { risk: 'crisis', agree: false }),
    line(13000, 'Processing user turn', { preview: 'okay' }),
    line(14000, '🔍 E2E TRACE [4/4] → TTS', {
      trace: 'E2E_TTS_OUTPUT',
      ttsText: "I've set a reminder about the garden. You still there?",
    }),
    line(14500, 'PRESENCE_SOUND hum', { kind: 'hum' }),
    line(15000, 'FAST_LANE', { lane: 'fast', reason: 'no_words' }),
    line(16000, 'DIRECTOR_NOTES', { sessionId: SESSION, notes: ['drop the garden'] }),
    line(60_000, 'Session ended', { module: 'FinOps', sessionId: SESSION }),
    line(62_000, '✅ LLM summarization succeeded', { sessionId: SESSION }),
    line(72_000, 'Operation timed out, using fallback', {
      sessionId: SESSION,
      operation: 'summarizeWithLLM',
    }),
  ]);

describe('review-calls privacy', () => {
  it('reviews only the owner, eval accounts and explicit opt-ins', () => {
    expect(userKind(SETH_UID)).toBe('owner');
    expect(userKind('voice-eval-real-call-1')).toBe('eval');
    expect(userKind('someone-else')).toBeNull();
    expect(userKind('someone-else', new Set(['someone-else']))).toBe('opt-in');
    expect(userKind(null)).toBeNull();
  });

  it('drops lines without a sessionId when another session shared the pod', () => {
    const lines = parseEntries([
      line(0, 'x', { sessionId: SESSION, userId: SETH_UID }),
      line(30_000, 'Processing user turn', { preview: 'mine' }),
      line(61_000, 'x', { sessionId: OTHER, userId: 'stranger' }),
      line(70_000, 'Processing user turn', { preview: 'maybe theirs' }),
      line(71_000, 'x', { sessionId: OTHER }),
    ]);
    const sessions = indexSessions(lines);
    const mine = sessions.find((s: { id: string }) => s.id === SESSION);
    const { lines: own, interleaved } = linesOf(mine, lines, sessions);
    const previews = own.map((l: Line) => l.preview).filter(Boolean);
    expect(previews).toEqual(['mine']);
    expect(interleaved).toBe(true);
    // the other session's own lines never leak in
    expect(own.some((l: Line) => l.sessionId === OTHER)).toBe(false);
  });
});

describe('review-calls timeline and metrics', () => {
  const lines = callLines();
  const [session] = indexSessions(lines);
  const timeline = timelineOf(session, lines);

  it('rebuilds the call in order with SSML stripped and session times', () => {
    expect(session).toMatchObject({
      id: SESSION,
      userId: SETH_UID,
      start: START,
      end: START + 60_000,
    });
    expect(timeline[0]).toEqual({ t: 100, who: 'agent', text: 'Hey Sam, how was the day?' });
    expect(timeline.map((e: { who: string }) => e.who)).toEqual([
      'agent',
      'user',
      'agent',
      'user',
      'agent',
      'user',
      'agent',
    ]);
    const run = runOf(session, timeline, lines, {});
    expect(run.userSpeech).toEqual([[5000, 5000]]);
    expect(run.notes).toEqual([{ t: 16000, notes: ['drop the garden'] }]);
    expect(run.tools).toEqual([]);
  });

  it('measures gaps, presence checks, crisis, notes and summary', () => {
    const m = callMetrics(timeline, lines);
    expect(m.replyGapMs).toMatchObject({ p50: 1500, first: 900, n: 2, source: 'reply-gap' });
    expect(m.presence).toEqual({ spokenChecks: 1, sounds: { hum: 1 }, noWordsReplies: 1 });
    expect(m.crisis).toMatchObject({ disagreements: 1, flagged: 1, resourcesSpoken: 0 });
    expect(m.directorNotes).toMatchObject({ notes: 1, turnsWithNotes: 1, ignored: null });
    expect(m.summary).toEqual({ source: 'llm', fallback: false });
    expect(m.fallbacks.summary).toBe(0);
  });

  it('estimates the gap from TURN_METRICS on builds without REPLY_GAP', () => {
    const old = parseEntries([
      line(1, 'TURN_METRICS', { eouDelayMs: 300, llmTtftMs: 600, ttsTtfbMs: 200 }),
    ]);
    expect(callMetrics(timeline, old).replyGapMs).toMatchObject({
      p50: 1100,
      source: 'turn-metrics-estimate',
    });
  });
});

describe('review-calls summary outcome', () => {
  it('ignores the timeout line logged after a summary that succeeded', () => {
    expect(summaryOutcome(callLines())).toEqual({ source: 'llm', fallback: false });
  });

  it('reports a fallback when only the timeout fired, or the logged source says so', () => {
    const timeoutOnly = parseEntries([
      line(1, 'Operation timed out, using fallback', { operation: 'summarizeWithLLM' }),
    ]);
    expect(summaryOutcome(timeoutOnly)).toEqual({ source: 'fallback', fallback: true });
    const sourced = parseEntries([
      line(1, '✅ LLM summarization succeeded', { source: 'fallback' }),
    ]);
    expect(summaryOutcome(sourced)).toEqual({ source: 'fallback', fallback: true });
    expect(summaryOutcome([])).toEqual({ source: null, fallback: null });
  });
});
