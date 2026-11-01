// converse.mjs's recorded audio length and greeting wait (converse-timing.mjs). converse.mjs
// itself needs a live room, so the last test checks that it uses these helpers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GREETING_WAIT_MS, audioMsOf, callerLine, peakOf } from '../converse-timing.mjs';
import { SILENT_PEAK, callerSilent, callerStalled } from '../predicates/index.mjs';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('converse timing', () => {
  it('measures a line in ms of 48 kHz mono s16le audio', () => {
    expect(audioMsOf(Buffer.alloc(96000))).toBe(1000); // 1 s
    expect(audioMsOf(Buffer.alloc(96 * 705 + 40))).toBe(705);
    expect(audioMsOf(Buffer.alloc(96 * 705 + 50))).toBe(706);
  });
  it("records a line's loudest sample, so a [[slnc N]] line reads as silence", () => {
    const pcm = Buffer.alloc(96 * 10);
    expect(peakOf(pcm)).toBe(0);
    pcm.writeInt16LE(18, 2); // what `say` renders for [[slnc 1500]]
    pcm.writeInt16LE(-25649, 40); // speech
    expect(peakOf(pcm)).toBe(25649);
    expect(peakOf(pcm.subarray(0, 20))).toBe(18);
    expect(callerSilent(callerLine(0, 10, pcm.subarray(0, 20)))).toBe(true);
    expect(callerSilent(callerLine(0, 10, pcm))).toBe(false);
    expect(callerSilent([0, 10, 10, SILENT_PEAK])).toBe(false);
    expect(callerSilent([0, 10, 10])).toBe(false); // an older run: no peak, still a turn
  });
  it('records [start, end, audioMs, peak], which callerStalled reads', () => {
    const fits = callerLine(100, 2100, Buffer.alloc(96 * 1900));
    expect(fits).toEqual([100, 2100, 1900, 0]);
    expect(callerStalled(fits)).toBe(false);
    expect(callerStalled(callerLine(100, 2100, Buffer.alloc(96 * 500)))).toBe(true);
  });
  it("waits for the greeting as long as the agent's own startup limit", () => {
    const m = src('../../../src/agents/gce/job-runner.ts').match(/READY_TIMEOUT_MS = ([\d_]+);/);
    expect(GREETING_WAIT_MS).toBe(Number(m[1].replace(/_/g, '')));
    expect(GREETING_WAIT_MS).toBe(90000);
  });
  it('is what converse.mjs uses', () => {
    const c = src('../converse.mjs');
    expect(c).toContain('await waitAgentDone(GREETING_WAIT_MS)');
    expect(c).toContain('userSpeech.push(callerLine(start, now(), buf))');
  });
});
