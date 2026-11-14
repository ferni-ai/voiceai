import { describe, expect, it } from 'vitest';
import {
  appDesignDebtRegressions,
  loweredAppDesignDebt,
  measureAppSources,
  type AppDesignDebt,
} from '../app-design-debt.js';

const CSS = `
/* #123456 and !important in a comment do not count */
.card { color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); transition: all 200ms ease; }
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); font-size: 14px; }
.chip { box-shadow: var(--shadow-sm); font-size: var(--text-sm); color: var(--color-ink) !important; }
.sheet { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity var(--duration-fast); }
.pop { animation: pop 1s cubic-bezier(0.16,1,0.3,1) infinite; font-size: 1.25rem; }
`;

const TS = `
// #abcdef in a line comment does not count; see https://example.com/#fff either
const css = \`
  .badge { background: #4a6741; transition: opacity \${DURATION.NORMAL}ms \${EASING.STANDARD}; }
  .badge--hot { box-shadow: none; color: rgb(255 0 0) !important; }
\`;
`;

function debt(): AppDesignDebt {
  return measureAppSources([
    { path: 'src/styles/a.css', text: CSS },
    { path: 'src/ui/b.ui.ts', text: TS },
  ]);
}

describe('app design debt', () => {
  it('counts literals, not tokens', () => {
    expect(debt()).toEqual({
      // #fff, rgba twice (shadows), #4a6741, rgb(255 0 0)
      colourLiterals: 5,
      // the two equal rgba shadows are one; var() and none don't count
      distinctShadows: 1,
      // the same curve twice is one
      distinctEasings: 1,
      // 200ms, 0.3s, 1s; var() and \${DURATION.NORMAL}ms don't count
      literalDurations: 3,
      // 14px and 1.25rem; var(--text-sm) doesn't
      literalFontSizes: 2,
      importantTotal: 2,
    });
  });

  it('fails a metric that rose and passes one that fell', () => {
    const base = debt();
    expect(appDesignDebtRegressions(base, { ...base, distinctShadows: 2 })).toEqual([
      'App design debt "distinctShadows" rose 1 → 2: use a design token (see app-design-debt.ts).',
    ]);
    expect(appDesignDebtRegressions(base, { ...base, colourLiterals: 0 })).toEqual([]);
  });

  it('only ever lowers the baseline', () => {
    const base = debt();
    const next = loweredAppDesignDebt(base, { ...base, colourLiterals: 1, importantTotal: 9 });
    expect(next.colourLiterals).toBe(1);
    expect(next.importantTotal).toBe(2);
  });
});
