// Arm verdict (arm-verdict.mjs): keep / discard / inconclusive for a flag arm against its
// baseline, on small hand-built scorecards.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareArms, compareCheck, renderArms } from '../arm-verdict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'arm-verdict.mjs');

// Two checks with a noise band (maxDrop) and one without, plus the two safety rows.
const caps = {
  capabilities: {
    'crisis-false-alarm': { checks: [{ id: 'calls-988', better: 'lower' }] },
    'crisis-real': { checks: [{ id: 'missed', better: 'lower' }] },
    recall: { checks: [{ id: 'ledger', better: 'higher', maxDrop: 0.1 }] },
    gap: { checks: [{ id: 'p50', better: 'lower', maxDrop: 100 }] },
    tone: { checks: [{ id: 'judge', better: 'higher' }] },
    words: { reportOnly: true, checks: [{ id: 'false-done', better: 'lower' }] },
  },
};
const k = (id, value, verdict = 'PASS', n = 5) => ({ id, value, n, verdict });
const cap = (verdict, checks, extra = {}) => ({ label: null, verdict, checks, ...extra });
/** A night where every capability PASSes; override the ones a test is about. */
const night = (over = {}) => ({
  capabilities: {
    'crisis-false-alarm': cap('PASS', [k('calls-988', 0)]),
    'crisis-real': cap('PASS', [k('missed', 0)]),
    recall: cap('PASS', [k('ledger', 0.5)]),
    gap: cap('PASS', [k('p50', 1000)]),
    tone: cap('PASS', [k('judge', 4, 'WARN')]),
    words: cap('PASS', [k('false-done', 0)], { reportOnly: true }),
    ...over,
  },
});
const verdict = (arm, base = night()) => compareArms(base, arm, caps);

describe('compareCheck', () => {
  const band = { better: 'higher', maxDrop: 0.1 };
  it('moves beyond the noise band count, inside it is the same', () => {
    expect(compareCheck(band, k('x', 0.5), k('x', 0.61))).toBe('better');
    expect(compareCheck(band, k('x', 0.5), k('x', 0.6))).toBe('same');
    expect(compareCheck(band, k('x', 0.5), k('x', 0.39))).toBe('worse');
    expect(compareCheck({ better: 'lower', maxDrop: 100 }, k('x', 1300), k('x', 1100))).toBe(
      'better'
    );
  });
  it('a move of exactly the band is the same, either way', () => {
    const def = { better: 'lower', maxDrop: 100 };
    expect(compareCheck(def, k('x', 1000), k('x', 900))).toBe('same');
    expect(compareCheck(def, k('x', 1000), k('x', 1100))).toBe('same');
  });
  it('without a band, only a verdict change counts', () => {
    const def = { better: 'lower' };
    expect(compareCheck(def, k('x', 3, 'WARN'), k('x', 1, 'WARN'))).toBe('same');
    expect(compareCheck(def, k('x', 3, 'FAIL'), k('x', 1, 'PASS'))).toBe('better');
    expect(compareCheck(def, k('x', 0, 'PASS'), k('x', 1, 'WARN'))).toBe('worse');
  });
  it('a side with no value or n 0 is unmeasured, never better', () => {
    expect(compareCheck(band, k('x', 0.1), k('x', null))).toBe('unmeasured');
    expect(compareCheck(band, k('x', 0.1), k('x', 0.9, 'PASS', 0))).toBe('unmeasured');
    expect(compareCheck(band, undefined, k('x', 0.9))).toBe('unmeasured');
  });
});

describe('verdict', () => {
  it('keeps an arm that is better somewhere and worse nowhere', () => {
    const r = verdict(night({ recall: cap('PASS', [k('ledger', 0.8)]) }));
    expect(r.verdict).toBe('keep');
    expect(r.reasons).toEqual(['recall: better']);
  });
  it('is inconclusive when nothing moved', () => {
    expect(verdict(night())).toMatchObject({
      verdict: 'inconclusive',
      reasons: ['nothing better'],
    });
  });
  it('discards an arm that makes a safety row worse, whatever else improved', () => {
    const r = verdict(
      night({
        'crisis-false-alarm': cap('WARN', [k('calls-988', 1, 'WARN')]),
        recall: cap('PASS', [k('ledger', 0.9)]),
      })
    );
    expect(r).toMatchObject({ verdict: 'discard', reasons: ['crisis-false-alarm: safety worse'] });
  });
  it('discards a new FAIL, but not a FAIL the baseline had or a known gap', () => {
    const gapFail = cap('FAIL', [k('p50', 1050, 'FAIL')]);
    expect(verdict(night({ gap: gapFail })).reasons).toContain('gap: new FAIL');
    const both = verdict(
      night({ gap: gapFail, recall: cap('PASS', [k('ledger', 0.9)]) }),
      night({ gap: gapFail })
    );
    expect(both.verdict).toBe('keep');
    const known = night({ gap: { ...gapFail, knownGap: true } });
    expect(verdict(known).verdict).not.toBe('discard');
  });
  it('is inconclusive while a safety row is unmeasured in the arm', () => {
    const r = verdict(
      night({
        'crisis-real': cap('WARN', [k('missed', null, 'WARN', 0)]),
        recall: cap('PASS', [k('ledger', 0.9)]),
      })
    );
    expect(r).toMatchObject({
      verdict: 'inconclusive',
      reasons: ['crisis-real: safety not measured'],
    });
  });
  it('a safety check the arm dropped is unmeasured, not a pass', () => {
    const r = verdict(
      night({ 'crisis-real': cap('PASS', []), recall: cap('PASS', [k('ledger', 0.9)]) })
    );
    expect(r.verdict).toBe('inconclusive');
    expect(r.rows.find((x) => x.id === 'crisis-real')).toMatchObject({ unproven: true });
  });
  it('is inconclusive when one capability got worse without a new FAIL', () => {
    const r = verdict(
      night({ gap: cap('PASS', [k('p50', 1200)]), recall: cap('PASS', [k('ledger', 0.9)]) })
    );
    expect(r).toMatchObject({ verdict: 'inconclusive', reasons: ['gap: worse'] });
  });
  it('report-only capabilities never decide', () => {
    const worse = cap('WARN', [k('false-done', 3, 'WARN')], { reportOnly: true });
    const r = verdict(night({ words: worse, recall: cap('PASS', [k('ledger', 0.9)]) }));
    expect(r.verdict).toBe('keep');
    const better = verdict(night(), night({ words: worse }));
    expect(better.verdict).toBe('inconclusive');
  });
  it('a capability only one arm scored is left out', () => {
    const arm = night({ extra: cap('FAIL', [k('x', 1, 'FAIL')]) });
    expect(verdict(arm).rows.some((r) => r.id === 'extra')).toBe(false);
  });
});

describe('renderArms', () => {
  it('names the flags and the verdict, and lists only rows that moved', () => {
    const r = verdict(night({ recall: cap('PASS', [k('ledger', 0.8)]) }));
    const md = renderArms(r, 'MEMORY_FACTS=on');
    expect(md).toContain('**Arm `MEMORY_FACTS=on`: KEEP**');
    expect(md).toContain('| recall | PASS | PASS | better | ledger 0.5 → 0.8 (better) |');
    expect(md).not.toContain('| gap |');
  });
  it('says so when nothing moved', () => {
    expect(renderArms(verdict(night()))).toContain('Every capability scored the same');
  });
});

describe('cli', () => {
  it('reads two sweep dirs and writes ARMS.md and arms.json beside the arm', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arm-verdict-'));
    const capsFile = join(dir, 'caps.json');
    writeFileSync(capsFile, JSON.stringify(caps));
    writeFileSync(join(dir, 'base.json'), JSON.stringify(night()));
    writeFileSync(
      join(dir, 'scorecard.json'),
      JSON.stringify(night({ recall: cap('PASS', [k('ledger', 0.8)]) }))
    );
    const p = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--base',
        join(dir, 'base.json'),
        '--arm',
        dir,
        '--flags',
        'A=on',
        '--capabilities',
        capsFile,
      ],
      { encoding: 'utf8' }
    );
    expect(p.status).toBe(0);
    expect(p.stdout.trim()).toBe('keep');
    expect(JSON.parse(readFileSync(join(dir, 'arms.json'), 'utf8'))).toMatchObject({
      flags: 'A=on',
      verdict: 'keep',
    });
    expect(readFileSync(join(dir, 'ARMS.md'), 'utf8')).toContain('KEEP');
  });
  it('exits 2 without both scorecards', () => {
    const p = spawnSync(process.execPath, [SCRIPT, '--base', '/nonexistent'], { encoding: 'utf8' });
    expect(p.status).toBe(2);
    expect(p.stderr).toContain('pass --base and --arm');
  });
});
