import { describe, expect, it } from 'vitest';
import { lineCount, lowered, regressions, type Measurement } from '../ratchet.js';
import { findTerm, visibleCopy } from '../check-brand-compliance.js';

const base: Measurement = {
  oversized: { 'src/big.ts': 900, 'src/huge.ts': 2000 },
  brandCritical: 0,
  brandWarnings: 6,
  lint: { 'no-console-log': 10, 'no-hardcoded-hex-colors': 20 },
};

describe('quality ratchet', () => {
  it('passes a change that makes nothing worse, even with old debt', () => {
    expect(regressions(base, base)).toEqual([]);
    expect(
      regressions(base, { ...base, oversized: { 'src/big.ts': 850 }, lint: { 'no-console-log': 9 } })
    ).toEqual([]);
  });

  it('fails when an oversized file grows or a new one appears', () => {
    const worse = regressions(base, {
      ...base,
      oversized: { ...base.oversized, 'src/big.ts': 901, 'src/new.ts': 501 },
    });
    expect(worse).toHaveLength(2);
    expect(worse.join()).toMatch(/big\.ts: grew 900 → 901/);
    expect(worse.join()).toMatch(/new\.ts: 501 lines/);
  });

  it('fails on any critical brand copy and on more warnings or lint errors', () => {
    const worse = regressions(base, {
      ...base,
      brandCritical: 1,
      brandWarnings: 7,
      lint: { ...base.lint, 'no-console-log': 11, 'no-purple-colors': 1 },
    });
    expect(worse).toHaveLength(4);
  });

  it('only ever lowers the baseline', () => {
    const next = lowered(base, {
      oversized: { 'src/big.ts': 700, 'src/new.ts': 600 }, // huge.ts was split
      brandCritical: 0,
      brandWarnings: 9,
      lint: { 'no-console-log': 4, 'no-hardcoded-hex-colors': 25 },
    });
    expect(next.oversized).toEqual({ 'src/big.ts': 700 }); // new.ts is not adopted
    expect(next.brandWarnings).toBe(6);
    expect(next.lint).toEqual({ 'no-console-log': 4, 'no-hardcoded-hex-colors': 20 });
  });

  it('counts lines the way an editor does', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a\nb')).toBe(2);
  });
});

describe('brand copy check', () => {
  it('reads only what users see: strings in code, text in HTML', () => {
    expect(visibleCopy('if (scrollY <= bottom) return;', 'x.js')).toBe('');
    expect(visibleCopy("label: 'Talk to a bot', id: 2", 'x.ts')).toBe('Talk to a bot');
    expect(visibleCopy('<p class="bottom">A chatbot</p>', 'x.html')).toContain('A chatbot');
  });

  it('matches whole words, plural allowed', () => {
    expect(findTerm('bottom of the page', 'bot')).toBe(-1);
    expect(findTerm('not your average bot.', 'bot')).toBeGreaterThan(-1);
    expect(findTerm('AI chatbots forget', 'chatbot')).toBeGreaterThan(-1);
    expect(findTerm('Unlimited Conversations!', 'Unlimited conversations')).toBe(0);
  });
});
