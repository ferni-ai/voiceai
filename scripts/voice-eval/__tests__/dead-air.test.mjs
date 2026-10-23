// Dead-air predicates on the harness's own audio timeline (dead-air audit 2026-10-22, "Gate
// proposals"). fixtures/action-claim-b.json is the dev call of the 8981d4f03 release eval with
// ~12 s of silence after the caller's goodbye; today's `dead-air` passed it.
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateSweep } from '../gate.mjs';
import { sweepValues } from '../paired.mjs';
import * as rc from '../release-check.mjs';
import { loadSweep } from '../predicates/call.mjs';
import { deadGates, runFromLines } from '../predicates/canaries.mjs';
import { PREDICATES } from '../predicates/index.mjs';

const FIXTURE = new URL('../predicates/fixtures/action-claim-b.json', import.meta.url).pathname;
const NEW = ['unfilled-silence', 'unanswered-turn', 'inaudible-reply', 'handoff-gap'];
/** Gate rows for run objects (or fixture paths), loaded through the real loader. */
function gate(...runs) {
  const dir = mkdtempSync(join(tmpdir(), 'dead-air-'));
  runs.forEach((r, i) =>
    typeof r === 'string'
      ? copyFileSync(r, join(dir, `r${i}.json`))
      : writeFileSync(join(dir, `r${i}.json`), JSON.stringify({ ...r, wallT0: i + 1 }))
  );
  return { dir, rows: gateSweep(loadSweep(dir)).rows };
}
const hits = (row, id) => row.hits[id] ?? null;
const run = (lines, edit, opts = {}) => {
  const r = runFromLines(lines, { uid: `voice-eval-${Math.random()}`, ...opts });
  edit?.(r);
  return r;
};
const fine = ['a: Hey Sam.', 'u: Long day at work today.', 'a: Oh no, what happened at work?'];

describe('dead-air predicates on action-claim-b (the first red canary)', () => {
  const [row] = gate(FIXTURE).rows;
  it('is gated by all four new predicates', () => {
    for (const id of NEW) expect(PREDICATES.find((p) => p.id === id)?.gating).toBe(true);
  });
  it('unfilled-silence: 12.3 s to the first agent sound and 21.7 s to voice after the goodbye', () => {
    // Turn 2 (2.9 s, 32.6 -> 35.5 s) is over the 2.5 s bound too.
    expect(hits(row, 'unfilled-silence')).toEqual([
      expect.objectContaining({ why: '2.9 s with no agent sound, 2.9 s to a voiced reply' }),
      expect.objectContaining({
        quote: 'Talk later.',
        why: '12.3 s with no agent sound, 21.7 s to a voiced reply',
      }),
    ]);
  });
  it('inaudible-reply: the 11-word NEVER_SILENT apology had no voice', () => {
    expect(hits(row, 'inaudible-reply')).toEqual([
      expect.objectContaining({
        quote: 'Sorry, I lost my train of thought there. Say that again?',
      }),
    ]);
  });
});

describe('dead-air predicates on synthetic calls', () => {
  it('passes a clean call', () => {
    const [row] = gate(run(fine)).rows;
    for (const id of [...NEW, 'dead-air']) expect(hits(row, id)).toEqual([]);
  });
  it('unanswered-turn: a caller turn the harness saw no reply to, and no voice after it', () => {
    const r = run(['a: Hey Sam.', 'u: Are you there?'], (x) => {
      x.results = [{ turn: 't1', userEndedAt: x.userSpeech[0][1], replyDelayMs: null }];
    });
    expect(hits(gate(r).rows[0], 'unanswered-turn')).toHaveLength(1);
  });
  it('inaudible-reply: a voiced stretch under 300 ms for a five-word caption', () => {
    const r = run(fine, (x) => {
      const v = x.tracks[0].voice.at(-1);
      v[0] = v[1] - 200; // ends just before its caption
    });
    expect(hits(gate(r).rows[0], 'inaudible-reply')).toEqual([
      expect.objectContaining({ why: 'voiced 200 ms' }),
    ]);
  });
  it('inaudible-reply: a caption landing 2.1 s after its voice is still heard (measured lag)', () => {
    const r = run(fine, (x) => {
      const v = x.tracks[0].voice.at(-1);
      v.splice(0, 2, x.events.at(-1).t - 4100, x.events.at(-1).t - 2100);
    });
    expect(hits(gate(r).rows[0], 'inaudible-reply')).toEqual([]);
  });
  it('handoff-gap: 4 s with no agent sound between the old and the new persona', () => {
    const r = run(
      ['a: Hey Sam.', 'u: Can I talk to Maya?', 'a: Sure, let me get Maya.', 'a: Hi, Maya here.'],
      (x) => {
        const old = x.tracks[0].voice[1];
        x.tracks[0].voice[2] = [old[1] + 4000, old[1] + 6000];
        x.data = [
          {
            t: old[1] + 100,
            payload: { type: 'handoff_complete', from: 'ferni', target: 'maya-santos' },
          },
        ];
      }
    );
    expect(hits(gate(r).rows[0], 'handoff-gap')).toEqual([
      expect.objectContaining({ why: 'ferni -> maya-santos: 4.0 s unfilled' }),
    ]);
  });
  it('lead-in-then-silence (dead-air): 5 s after "let me check" now fails; it was 8 s', () => {
    const r = run(
      ['a: Hey Sam.', 'u: Any news today?', 'a: Let me check.', 'a: Here is the news.'],
      (x) => {
        const v = x.tracks[0].voice;
        v[2] = [v[1][1] + 5000, v[1][1] + 7000];
      }
    );
    expect(hits(gate(r).rows[0], 'dead-air')).toEqual([
      expect.objectContaining({ why: '5.0 s silent after the lead-in' }),
    ]);
  });
  it('the self-test covers every new gate through the real loader', () => {
    expect(deadGates()).toEqual([]);
  });
});

describe('sweep silence: per-persona p90 and the long-gap share', () => {
  const turns = (persona, gaps) => gaps.map((gapMs) => ({ persona, gapMs }));
  const callWith = (turnGaps) => ({ call: { turnGaps } });
  it('FAILs a persona over the p90 bound with 10+ turns, INCONCLUSIVE under 10', () => {
    const items = rc.silenceItems([
      callWith(turns('ferni', [...Array(8).fill(1000), 4000, 4000])),
      callWith(turns('maya-santos', [1000, 1200])),
    ]);
    expect(items).toContainEqual(
      expect.objectContaining({ name: 'silence p90 ferni', verdict: 'FAIL' })
    );
    expect(items).toContainEqual(
      expect.objectContaining({ name: 'silence p90 maya-santos', verdict: 'INCONCLUSIVE' })
    );
  });
  it('counts an unanswered turn as over every bound, and FAILs over 5% long gaps', () => {
    const items = rc.silenceItems([
      callWith(turns('ferni', [...Array(18).fill(1000), null, 2600])),
    ]);
    expect(items).toContainEqual(
      expect.objectContaining({
        name: 'silence long-gap share',
        verdict: 'FAIL',
        why: expect.stringMatching(/^2\/20 turns over 2.5 s/),
      })
    );
    const ok = rc.silenceItems([callWith(turns('ferni', Array(20).fill(1000)))]);
    expect(ok.every((i) => i.verdict === 'PASS')).toBe(true);
  });
  it('the p90 bound is configurable', () => {
    const t = [callWith(turns('ferni', Array(10).fill(2500)))];
    expect(rc.silenceItems(t)[0].verdict).toBe('PASS');
    expect(rc.silenceItems(t, { p90Ms: 2000 })[0].verdict).toBe('FAIL');
  });
});

describe("#2450's median reply gap counts unanswered turns", () => {
  it('a null delay is a no-reply turn, not dropped', () => {
    const r = run(fine, (x) => {
      x.results = [{ replyDelayMs: 1000 }, { replyDelayMs: null }, { replyDelayMs: null }];
    });
    const { dir } = gate(r);
    const [v] = sweepValues(dir);
    expect(v.values.replyGapMedMs).toBe(10000);
    expect(v.values.unansweredShare).toBeCloseTo(2 / 3);
  });
});
