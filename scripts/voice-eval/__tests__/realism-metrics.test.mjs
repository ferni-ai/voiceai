// realism-metrics.mjs on synthetic timelines and clips whose right answer is known exactly.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pairedCompare } from '../paired.mjs';
import { loadSweep } from '../predicates/call.mjs';
import { clipPauses, realismOfRun, realismOfTimeline, realismValues } from '../realism-metrics.mjs';

/** 48 kHz PCM: [ms, loud?] runs. A loud run is a 440 Hz tone at about -10 dBFS. */
function pcmOf(runs) {
  const out = [];
  for (const [ms, loud] of runs)
    for (let i = 0; i < ms * 48; i++) out.push(loud ? Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / 48000)) : 0);
  return Int16Array.from(out);
}

describe('clipPauses', () => {
  it('finds the 800 ms silence and not the 200 ms one', () => {
    const pcm = pcmOf([[1000, true], [800, false], [1000, true], [200, false], [500, true]]);
    expect(clipPauses(pcm)).toEqual([[1000, 1800]]);
  });
  it('a clip with no pause has none', () => {
    expect(clipPauses(pcmOf([[1500, true]]))).toEqual([]);
  });
});

describe('realismOfTimeline', () => {
  // u1 pauses 1000-2000; Ferni starts at 1500 (takeover + false end), then answers at 4600 (gap 600).
  // u2 pauses 8500-9500 and 10000-10600; a 400 ms "mm" at 8800 is a backchannel, not a takeover;
  //    Ferni starts at 11200, after the pauses but before the caller's last word: a false end,
  //    no takeover, and he's still talking at 12000 so no gap.
  // u3 no pause; Ferni starts 200 ms after. u4 backchannel line: not a turn.
  // u5 @interrupt at 18000 while Ferni talks (16200-20000): he stops 2000 ms later.
  const utterances = [
    { start: 0, end: 4000, mode: '', pauses: [[1000, 2000]] },
    { start: 8000, end: 12000, mode: '', pauses: [[500, 1500], [2000, 2600]] },
    { start: 14000, end: 16000, mode: '', pauses: [] },
    { start: 17000, end: 17400, mode: 'backchannel', pauses: [] },
    { start: 18000, end: 19000, mode: 'interrupt', pauses: [] },
  ];
  const voice = [[1500, 2300], [4600, 7000], [8800, 9200], [11200, 13000], [16200, 20000]];

  it('gives the exact counts and rates', () => {
    expect(realismOfTimeline(utterances, voice)).toEqual({
      pauses: 3,
      takeovers: 1,
      takeoverRate: 0.333,
      pausedTurns: 2,
      falseEnds: 2,
      falseEndRate: 1,
      gapMs: { p50: 600, p90: 600, n: 2 },
      bargeInStopMs: { p50: 2000, p90: 2000, n: 1 },
      shortInPauses: 1,
    });
  });

  it('a patient Ferni scores zero takeovers and false ends', () => {
    const patient = [[4600, 7000], [12300, 13000], [16200, 20000]];
    const m = realismOfTimeline(utterances, patient);
    expect([m.takeovers, m.falseEnds, m.takeoverRate, m.falseEndRate]).toEqual([0, 0, 0, 0]);
    expect(m.gapMs).toEqual({ p50: 300, p90: 600, n: 3 }); // gaps 600, 300, 200
  });

  it('gap p50/p90 are nearest-rank over answered turns', () => {
    const us = [100, 200, 300, 400, 1000].map((g, k) => ({ start: k * 10000, end: k * 10000 + 2000, mode: '', pauses: [] }));
    // the 300 ms reply start ("Hey, you") still counts: gaps take every onset
    const vs = [100, 200, 300, 400, 1000].map((g, k) => [k * 10000 + 2000 + g, k * 10000 + 2000 + g + (k === 1 ? 300 : 3000)]);
    expect(realismOfTimeline(us, vs).gapMs).toEqual({ p50: 300, p90: 1000, n: 5 });
  });

  it('no pauses and no interrupts give null rates, not zero', () => {
    const m = realismOfTimeline([{ start: 0, end: 1000, mode: '', pauses: [] }], []);
    expect([m.takeoverRate, m.falseEndRate, m.bargeInStopMs.p50]).toEqual([null, null, null]);
  });
});

describe('a run on disk, through to paired.mjs', () => {
  const root = mkdtempSync(join(tmpdir(), 'realism-'));
  const audio = join(root, 'audio');
  const sweep = (name) => join(root, name);

  /** One converse.mjs-shaped run whose caller pauses 1000-1800 ms into turn 1. */
  function writeRun(dir, scenario, label, ferniStartsAt) {
    const run = {
      meta: { scenario, label, uid: `voice-eval-${label}`, room: `${scenario}-${label}`, realism: 'everyday', audio },
      wallT0: 1,
      results: [{ turn: 't1.pcm', userEndedAt: 2800 }],
      events: [{ t: 3000, who: 'agent', from: 'agent', text: 'Sounds good.' }],
      userSpeech: [[0, 2800]],
      tracks: [{ name: 'agent-1:roomio_audio', voice: [[ferniStartsAt, ferniStartsAt + 1500]] }],
    };
    const file = join(dir, `${scenario}-${label}.json`);
    writeFileSync(file, JSON.stringify(run));
    writeFileSync(file.replace(/\.json$/, '.realism.json'), JSON.stringify(realismOfRun(run)));
    return run;
  }

  it('reads the pause from the clip and the voice from the run', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(audio);
    const pcm = pcmOf([[1000, true], [800, false], [1000, true]]);
    writeFileSync(join(audio, 't1.pcm'), Buffer.from(pcm.buffer));
    for (const name of ['A', 'B']) mkdirSync(sweep(name));
    const r = realismOfRun(writeRun(sweep('A'), 'trail', 'a1', 1200));
    expect(r.values).toEqual({
      'rt:takeover-rate': 1,
      'rt:false-end-rate': 1,
      'rt:gap-p50-ms': null,
      'rt:gap-p90-ms': null,
      'rt:barge-in-stop-p50-ms': null,
    });
    expect(realismOfRun(writeRun(sweep('B'), 'trail', 'b1', 3100)).values['rt:gap-p50-ms']).toBe(300);
  });

  it('loadSweep skips the sidecar, and pairedCompare reads it', () => {
    writeRun(sweep('A'), 'walk', 'a2', 1500);
    writeRun(sweep('B'), 'walk', 'b2', 3300);
    expect(loadSweep(sweep('A')).map((c) => c.label)).toEqual(['a1', 'a2']);
    const row = pairedCompare(realismValues(sweep('A')), realismValues(sweep('B')), { B: 200 }).find(
      (x) => x.metric === 'rt:takeover-rate'
    );
    expect(row).toMatchObject({ scenarios: 2, meanA: 1, meanB: 0, diff: -1 });
  });
});
