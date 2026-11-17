/**
 * FAST_LANE_SHADOW=decision: with CASCADE_FAST_LANE off, the TURN_RECEIPT logs where the
 * fast-lane router would send the turn (prompt.laneShadow), taken from the request the reported
 * metric measures, by the router's own decision. A crisis-marked request, and every request of a
 * held call (crisis, minor, care- or write-held), logs nothing for the rest of the call.
 * prompt.lane and the turn_metrics `lane` column keep meaning "where the turn went": null with
 * the lane off. Only the lane and the router's reason are logged, never words. The real
 * recorder runs; the caller lines are invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnReceiptRecorder, type TurnReceipt } from '../turn-receipt.js';
import { turnMetricsRow } from '../turn-receipt-bq.js';
import { routeOf } from '../../model-provider/fast-lane.js';
import { mainLaneRequired, withLane } from '../../model-provider/lane-request.js';
import type { LlmMetric } from '../turn-metrics.js';
import * as crisisHold from '../../../utils/crisis-memory-hold.js';
import {
  beginCrisisRead,
  holdForCrisis,
  resetCrisisMemoryHold,
} from '../../../utils/crisis-memory-hold.js';
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
import { holdForSexualTopic, resetSexualTopicHold } from '../../../utils/sexual-topic-hold.js';

// Pass-through: the real reader everywhere, so one row can make it throw.
vi.mock('../../../utils/crisis-memory-hold.js', async (real) => {
  const mod = await real<typeof import('../../../utils/crisis-memory-hold.js')>();
  return { ...mod, crisisReadsSettled: vi.fn(mod.crisisReadsSettled) };
});

/** Words the router reads as chat: no tool word (MAY_NEED_TOOL), no question, no teammate. */
const CHAT = 'the garden looks lovely after a sunny morning';
const said = (text: string) => ({ items: [{ type: 'message', role: 'user', textContent: text }] });
const metric = (o: Partial<LlmMetric> = {}): LlmMetric => ({
  type: 'llm_metrics',
  ttftMs: 600,
  promptTokens: 14_000,
  promptCachedTokens: 12_000,
  completionTokens: 30,
  ...o,
});
/** A stream closed before usage came: a dropped preemptive request. */
const DROPPED = metric({ cancelled: true, ttftMs: -1, promptTokens: 0, completionTokens: 0 });
const SHADOW = { FAST_LANE_SHADOW: 'decision' };

/** An open call: nothing ever holds it, so the rows above it log. */
const OPEN = { sessionId: 'RM_lane_shadow', userId: undefined as string | undefined };

/** One turn on the real recorder: `requests` run in order, each with its metric. */
function receipt(
  env: Record<string, string>,
  requests: Array<[object, LlmMetric]>,
  call: { sessionId: string; userId: string | undefined } = OPEN
): TurnReceipt {
  const receipts: TurnReceipt[] = [];
  const rec = new TurnReceiptRecorder({
    sessionId: call.sessionId,
    userId: call.userId,
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env,
  });
  rec.onMetric({ type: 'eou_metrics', endOfUtteranceDelayMs: 300, transcriptionDelayMs: 90 });
  for (const [request, m] of requests) {
    rec.onRequest(request as { items: readonly unknown[] }, 90);
    rec.onMetric({ ...m });
  }
  rec.onAgentState('speaking');
  rec.onItem({ role: 'assistant', textContent: 'Sounds lovely.' });
  rec.onAgentState('listening');
  expect(receipts).toHaveLength(1);
  return receipts[0];
}

describe('TURN_RECEIPT prompt.laneShadow (FAST_LANE_SHADOW)', () => {
  it("the fixture's chat line routes as chat (the rows below rest on it)", () => {
    expect(routeOf(said(CHAT))).toEqual({ lane: 'fast', reason: 'chat' });
  });

  it('lane off, shadow on: the router decision is logged and prompt.lane stays null', () => {
    const r = receipt(SHADOW, [[said(CHAT), metric()]]);
    expect(r.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' });
    expect(r.prompt.lane).toBeNull();
  });

  it('a request the crisis gate marked: no laneShadow, though its words read as chat', () => {
    expect(routeOf(withLane(said(CHAT), { mainLane: true }))).toEqual({
      lane: 'main',
      reason: 'crisis',
    });
    const marked = withLane(said(CHAT), { mainLane: true });
    const r = receipt(SHADOW, [[marked, metric()]], { sessionId: 'RM_marked', userId: undefined });
    expect(r.prompt.laneShadow).toBeNull();
    expect(r.prompt.lane).toBeNull();
  });

  it('flag unset or off: no laneShadow (the manifest default is off)', () => {
    expect(receipt({}, [[said(CHAT), metric()]]).prompt.laneShadow).toBeNull();
    const off = receipt({ FAST_LANE_SHADOW: 'off' }, [[said(CHAT), metric()]]);
    expect(off.prompt.laneShadow).toBeNull();
    const unknown = receipt({ FAST_LANE_SHADOW: 'yes please' }, [[said(CHAT), metric()]]);
    expect(unknown.prompt.laneShadow).toBeNull();
  });

  it('sample logs the same decision (no sampled reply exists yet)', () => {
    const r = receipt({ FAST_LANE_SHADOW: 'Sample' }, [[said(CHAT), metric()]]);
    expect(r.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' });
    expect(r.prompt.lane).toBeNull();
  });

  it('lane on: laneShadow is null and prompt.lane is the decision, as before', () => {
    const r = receipt({ ...SHADOW, CASCADE_FAST_LANE: 'on' }, [[said(CHAT), metric()]]);
    expect(r.prompt.laneShadow).toBeNull();
    expect(r.prompt.lane).toEqual({ lane: 'fast', reason: 'chat' });
  });

  it('the kept request is logged, not the first: a dropped preemptive one, then the reply', () => {
    const r = receipt(SHADOW, [
      [said('can I talk to Maya'), DROPPED], // preemptive, dropped
      [said(CHAT), metric()], // the reply the metric measures
    ]);
    expect(r.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' });
  });

  it('on a tool turn the kept request is logged, not the latest one after the tool', () => {
    const r = receipt(SHADOW, [
      [said(CHAT), metric({ ttftMs: 700 })], // completed first: the one kept
      [{ items: [{ type: 'function_call', name: 'getWeather' }] }, metric({ ttftMs: 500 })],
    ]);
    expect(r.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' });
  });

  it("the turn_metrics row's lane is unchanged: null with the lane off, shadow or not", () => {
    expect(turnMetricsRow(receipt(SHADOW, [[said(CHAT), metric()]])).lane).toBeNull();
    expect(turnMetricsRow(receipt({}, [[said(CHAT), metric()]])).lane).toBeNull();
    const on = receipt({ ...SHADOW, CASCADE_FAST_LANE: 'on' }, [[said(CHAT), metric()]]);
    expect(turnMetricsRow(on).lane).toBe('fast');
  });

  it('only the lane and a reason are logged as words: no caller words reach the receipt', () => {
    const r = receipt(SHADOW, [[said(CHAT), metric()]]);
    const fields = Object.entries(r.prompt.laneShadow ?? {});
    const strings = fields.filter(([, v]) => typeof v === 'string').map(([k]) => k);
    expect(strings.sort()).toEqual(['lane', 'reason']);
    expect(JSON.stringify(r)).not.toContain('garden');
  });
});

/**
 * Held calls: the shadow logs nothing for the rest of the call, and fails closed. Each row holds
 * its own session through the production setter, then reads the real recorder's receipt.
 */
describe('TURN_RECEIPT prompt.laneShadow stays null for a held call', () => {
  const chat = (): Array<[object, LlmMetric]> => [[said(CHAT), metric()]];
  const call = (sessionId: string, userId?: string) => ({ sessionId, userId });
  const MINOR_ON = { ...SHADOW, MINOR_CARE: 'on' };

  afterEach(() => {
    resetCrisisMemoryHold();
    resetMinorCare();
    resetSexualTopicHold();
    vi.mocked(crisisHold.crisisReadsSettled).mockClear();
  });

  it('control: an open call with a fresh session logs the decision', () => {
    const r = receipt(SHADOW, chat(), call('RM_open_control'));
    expect(r.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' });
  });

  it("a crisis-marked request, then the call's later unmarked chat turn: both null", () => {
    const c = call('RM_crisis_mark_then_chat');
    const marked = withLane(said(CHAT), { mainLane: true });
    expect(receipt(SHADOW, [[marked, metric()]], c).prompt.laneShadow).toBeNull();
    expect(routeOf(said(CHAT))).toEqual({ lane: 'fast', reason: 'chat' }); // reads as chat alone
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
  });

  it('a crisis-held call: null, and still null after the hold itself is gone', () => {
    const c = call('RM_crisis_held');
    holdForCrisis(c.sessionId);
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
    resetCrisisMemoryHold();
    expect(crisisHold.crisisMemoryHeld(c.sessionId)).toBe(false);
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
  });

  it('a crisis read still running: null (its verdict could hold the call)', () => {
    const c = call('RM_crisis_reading');
    const read = beginCrisisRead(c.sessionId, 'invented words for a read');
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
    read.end();
  });

  it('a caller who sounds under 18: null, even read with MINOR_CARE off', () => {
    const c = call('RM_minor');
    expect(noteCallerWords(c.sessionId, "I'm 14 years old", { env: MINOR_ON })).toBe(true);
    expect(receipt(MINOR_ON, chat(), c).prompt.laneShadow).toBeNull();
    const later = call('RM_minor_flag_off_read');
    expect(noteCallerWords(later.sessionId, "I'm 14 years old", { env: MINOR_ON })).toBe(true);
    expect(receipt(SHADOW, chat(), later).prompt.laneShadow).toBeNull();
  });

  it("another live call of the same user sounds under 18: this call's shadow is null", () => {
    const uid = 'user_lane_shadow_age';
    bindSessionUser('RM_other_call', uid);
    const env = { env: MINOR_ON, userId: uid };
    expect(noteCallerWords('RM_other_call', "I'm 13 years old", env)).toBe(true);
    expect(receipt(MINOR_ON, chat(), call('RM_this_call', uid)).prompt.laneShadow).toBeNull();
  });

  it('a call held for a sexual topic (SEXUAL_TOPIC_BOUNDARY on): null', () => {
    const c = call('RM_sexual_topic');
    holdForSexualTopic(c.sessionId);
    const env = { ...SHADOW, SEXUAL_TOPIC_BOUNDARY: 'on' };
    expect(receipt(env, chat(), c).prompt.laneShadow).toBeNull();
  });

  it("an anonymous try-first visitor's call: null", () => {
    const c = call('RM_try_first', 'device:demo_lane_shadow');
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
  });

  it('a request with no session: null', () => {
    expect(receipt(SHADOW, chat(), call('')).prompt.laneShadow).toBeNull();
  });

  it('a hold reader that throws: null, and the call stays quiet afterwards', () => {
    const c = call('RM_reader_throws');
    vi.mocked(crisisHold.crisisReadsSettled).mockImplementationOnce(() => {
      throw new Error('reader failed');
    });
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
    expect(receipt(SHADOW, chat(), c).prompt.laneShadow).toBeNull();
  });

  // MEMORY_ONLY row (crisis-flag-homes.ts): the model gets the same request, so no reply changes.
  it('the flag on leaves the request the model gets as it came: an open call logs, a guided one is quiet', () => {
    const openOn = said(CHAT);
    const openOff = said(CHAT);
    const openSent = structuredClone(openOn);
    const on = receipt(SHADOW, [[openOn, metric()]], call('RM_unchanged_open_on'));
    const off = receipt({}, [[openOff, metric()]], call('RM_unchanged_open_off'));
    expect(on.prompt.laneShadow).toEqual({ lane: 'fast', reason: 'chat' }); // the flag writes
    expect(off.prompt.laneShadow).toBeNull();
    expect(openOn).toEqual(openOff);
    expect(openOn).toEqual(openSent);

    const guidedOn = withLane(said(CHAT), { mainLane: true });
    const guidedOff = withLane(said(CHAT), { mainLane: true });
    const guidedSent = structuredClone(guidedOn);
    const quietOn = receipt(SHADOW, [[guidedOn, metric()]], call('RM_unchanged_guided_on'));
    receipt({}, [[guidedOff, metric()]], call('RM_unchanged_guided_off'));
    expect(quietOn.prompt.laneShadow).toBeNull();
    expect(structuredClone(guidedOn)).toEqual(structuredClone(guidedOff));
    expect(structuredClone(guidedOn)).toEqual(guidedSent);
    // The main-lane mark is a WeakSet entry, so clones can't carry it: read it directly.
    expect([mainLaneRequired(guidedOn), mainLaneRequired(guidedOff)]).toEqual([true, true]);
  });

  it('lane on: a held call still reports where the turn went (prompt.lane is untouched)', () => {
    const c = call('RM_held_lane_on');
    holdForCrisis(c.sessionId);
    const r = receipt({ ...SHADOW, CASCADE_FAST_LANE: 'on' }, chat(), c);
    expect(r.prompt.lane).toEqual({ lane: 'fast', reason: 'chat' });
    expect(r.prompt.laneShadow).toBeNull();
  });
});
