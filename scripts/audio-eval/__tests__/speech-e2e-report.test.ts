/**
 * The harness's verdict logic and Cartesia socket tap, without the network.
 * Run: pnpm vitest run scripts/audio-eval/__tests__/speech-e2e-report.test.ts
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { judge, renderTable, type ReplyResult } from '../speech-e2e-report.js';
import { CartesiaTap, type ReplyTrace } from '../speech-e2e-seams.js';

function result(over: Partial<ReplyResult>): ReplyResult {
  return {
    scenario: 's',
    config: 'FULL',
    repeat: 0,
    sessionId: 'x',
    pushedText: '',
    pushes: [],
    errors: [],
    ttfaMs: 300,
    ttfsMs: 300,
    wireTtfbMs: 300,
    durationMs: 1000,
    stage2LeadMs: 0,
    stage2: { renderNonverbal: 0, tempoStretchers: 0 },
    leadingEnergyMs: 0,
    firstWordMs: 0,
    silences: [],
    longestSilenceMs: 0,
    transcript: 'hi',
    wer: { wer: 0, errors: 0, refWords: 1, bestRef: 'hi', hyp: 'hi' },
    stageWords: [],
    soundAnnotations: [],
    flags: [],
    words: [],
    warnings: [],
    wav: 's.wav',
    ...over,
  };
}

const ruleOf = (v: ReturnType<typeof judge>, prefix: string) =>
  v.rules.find((r) => r.rule.startsWith(prefix))!;

describe('judge', () => {
  it('passes a clean run', () => {
    const v = judge([result({ config: 'BASELINE' }), result({})]);
    expect(v.pass).toBe(true);
  });

  it('fails each rule on its own violation', () => {
    const base = result({ config: 'BASELINE', ttfsMs: 300 });
    expect(ruleOf(judge([base, result({ errors: ['cartesia error 404'] })]), 'R1').pass).toBe(
      false
    );
    expect(ruleOf(judge([base, result({ stageWords: ['sighs'] })]), 'R2').pass).toBe(false);
    const badWer = result({ wer: { wer: 0.2, errors: 1, refWords: 5, bestRef: '', hyp: '' } });
    expect(ruleOf(judge([base, badWer]), 'R3').pass).toBe(false);
    expect(ruleOf(judge([base, result({ wer: null })]), 'R3').pass).toBe(false);
    expect(ruleOf(judge([base, result({ ttfsMs: 551 })]), 'R4').pass).toBe(false);
    expect(ruleOf(judge([base, result({ ttfsMs: 550 })]), 'R4').pass).toBe(true);
    expect(ruleOf(judge([base, result({ longestSilenceMs: 1300 })]), 'R5').pass).toBe(false);
    const silentPlan = result({
      flags: ['director planned an opening sigh, Stage 2 rendered none'],
    });
    expect(ruleOf(judge([base, silentPlan]), 'R6').pass).toBe(false);
    expect(ruleOf(judge([base, result({ flags: ['10/3 misread'] })]), 'R6').pass).toBe(true);
    const midOnly = result({ flags: ['1 mid-reply breath/sigh planned, not rendered (known gap)'] });
    expect(ruleOf(judge([base, midOnly]), 'R6').pass).toBe(true);
    // BASELINE is never held to R6: Stage 2 is off there by design.
    expect(ruleOf(judge([{ ...silentPlan, config: 'BASELINE' }, result({})]), 'R6').pass).toBe(
      true
    );
  });

  it('holds BASELINE only to R1, and fails R4 without timings', () => {
    const base = result({ config: 'BASELINE', stageWords: ['sighs'], longestSilenceMs: 5000 });
    expect(judge([base, result({})]).pass).toBe(true);
    expect(judge([result({ config: 'BASELINE', errors: ['no audio'] }), result({})]).pass).toBe(
      false
    );
    expect(ruleOf(judge([result({})]), 'R4').pass).toBe(false);
  });

  it('counts errors seen outside any reply', () => {
    expect(judge([result({ config: 'BASELINE' }), result({})], ['socket error: x']).pass).toBe(
      false
    );
  });

  it('renders one table row per result', () => {
    const table = renderTable([result({ config: 'BASELINE' }), result({ wer: null })]);
    const lines = table.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/BASE.*ok\s*$/);
    expect(lines[3]).toMatch(/FULL.*FAIL\s*$/);
  });
});

describe('CartesiaTap', () => {
  class FakeSocket extends EventEmitter {
    readonly sent: string[] = [];
    send(data: string): void {
      this.sent.push(data);
    }
  }
  const newTrace = (): ReplyTrace => ({ sends: [], errors: [], firstWireChunkAt: null, logs: [] });

  it('records what is sent to Cartesia and still sends it', () => {
    const tap = new CartesiaTap();
    const ws = tap.wrap(new FakeSocket());
    tap.trace = newTrace();
    const req = {
      context_id: 'c1',
      transcript: 'Hi. ',
      continue: true,
      model_id: 'm',
      voice: { id: 'v' },
    };
    ws.send(JSON.stringify(req));
    expect(ws.sent).toEqual([JSON.stringify(req)]);
    expect(tap.trace.sends[0]).toMatchObject({
      contextId: 'c1',
      transcript: 'Hi. ',
      model: 'm',
      voice: 'v',
    });
    expect([...tap.contexts]).toEqual(['c1']);
  });

  it('records error events to the current reply, or as orphans between replies', () => {
    const tap = new CartesiaTap();
    const ws = tap.wrap(new FakeSocket());
    ws.emit(
      'message',
      JSON.stringify({ type: 'error', status_code: 404, error: 'Voice not found' })
    );
    expect(tap.orphanErrors).toEqual(['cartesia error 404 Voice not found']);
    tap.trace = newTrace();
    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'chunk', context_id: 'c1', data: 'AA==' }))
    );
    expect(tap.trace.firstWireChunkAt).not.toBeNull();
    ws.emit('error', new Error('boom'));
    ws.emit('close');
    expect(tap.trace.errors).toEqual(['socket error: boom', 'socket closed during reply']);
  });
});
