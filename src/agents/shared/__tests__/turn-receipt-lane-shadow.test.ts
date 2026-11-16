/**
 * FAST_LANE_SHADOW=decision: with CASCADE_FAST_LANE off, the TURN_RECEIPT logs where the
 * fast-lane router would send the turn (prompt.laneShadow), taken from the request the reported
 * metric measures, by the router's own decision (the crisis gate's mark, then the words).
 * prompt.lane and the turn_metrics `lane` column keep meaning "where the turn went": null with
 * the lane off. Only the lane and the router's reason are logged, never words. The real
 * recorder runs; the caller lines are invented.
 */
import { describe, expect, it } from 'vitest';
import { TurnReceiptRecorder, type TurnReceipt } from '../turn-receipt.js';
import { turnMetricsRow } from '../turn-receipt-bq.js';
import { routeOf } from '../../model-provider/fast-lane.js';
import { withLane } from '../../model-provider/lane-request.js';
import type { LlmMetric } from '../turn-metrics.js';

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

/** One turn on the real recorder: `requests` run in order, each with its metric. */
function receipt(env: Record<string, string>, requests: Array<[object, LlmMetric]>): TurnReceipt {
  const receipts: TurnReceipt[] = [];
  const rec = new TurnReceiptRecorder({
    sessionId: 'RM_lane_shadow',
    userId: undefined,
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

  it('a request the crisis gate marked: main for the crisis, though its words read as chat', () => {
    const marked = withLane(said(CHAT), { mainLane: true });
    const r = receipt(SHADOW, [[marked, metric()]]);
    expect(r.prompt.laneShadow).toEqual({ lane: 'main', reason: 'crisis' });
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
