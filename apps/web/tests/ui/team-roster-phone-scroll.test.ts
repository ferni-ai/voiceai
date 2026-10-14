/**
 * Team roster scrolls sideways on phones
 *
 * #981 made the roster one sideways-scrolling row at <= 768px. An older
 * unconditional `#teamRoster { overflow: visible !important }` (room for the
 * drag hint) beat it, so on a 390px phone with six teammates the row was
 * 356px wide with 566px of content, scrollLeft stayed 0, and the last
 * teammates and "More" could not be reached.
 *
 * jsdom has no layout, so this resolves the cascade for #teamRoster's
 * overflow-x from the stylesheet itself: the rules whose media condition
 * holds at a given width, ranked by !important then source order.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const STYLESHEET = join(__dirname, '..', '..', 'src', 'styles', 'inline-styles.css');

/** True when every (min|max-width: Npx) clause holds at `width`; anything else is unknown → false. */
function mediaHolds(condition: string, width: number): boolean {
  const clauses = condition.split(/\s+and\s+/i);
  return clauses.every((clause) => {
    const m = clause.trim().match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/i);
    if (!m) return false;
    const px = Number(m[2]);
    return m[1].toLowerCase() === 'min' ? width >= px : width <= px;
  });
}

interface Declaration {
  value: string;
  important: boolean;
  order: number;
}

/** The overflow-x value that wins for `#teamRoster` at a viewport `width`. */
function winningOverflowX(css: string, width: number): string | undefined {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const sheet = style.sheet as CSSStyleSheet;
  const found: Declaration[] = [];
  let order = 0;

  const visit = (rules: CSSRuleList, applies: boolean): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, applies && mediaHolds(rule.conditionText ?? rule.media.mediaText, width));
        continue;
      }
      if (!(rule instanceof CSSStyleRule) || !applies) continue;
      const selectors = rule.selectorText.split(',').map((s) => s.trim());
      if (!selectors.includes('#teamRoster')) continue;
      for (const prop of ['overflow', 'overflow-x']) {
        const value = rule.style.getPropertyValue(prop).trim();
        if (!value) continue;
        found.push({
          value: prop === 'overflow' ? value.split(/\s+/)[0] : value,
          important: rule.style.getPropertyPriority(prop) === 'important',
          order: order++,
        });
      }
    }
  };
  visit(sheet.cssRules, true);
  style.remove();

  found.sort((a, b) => Number(a.important) - Number(b.important) || a.order - b.order);
  return found.at(-1)?.value;
}

describe('team roster overflow', () => {
  const css = readFileSync(STYLESHEET, 'utf8');

  it('scrolls sideways at phone widths', () => {
    for (const width of [320, 390, 768]) {
      expect(winningOverflowX(css, width), `#teamRoster overflow-x at ${width}px`).toBe('auto');
    }
  });

  it('stays visible on desktop, where the drag hint needs room', () => {
    expect(winningOverflowX(css, 1440)).toBe('visible');
  });

  it('resolves an !important rule over a later phone rule', () => {
    const sample = `#teamRoster { overflow: visible !important; }
      @media (max-width: 768px) { #teamRoster { overflow-x: auto; } }`;
    expect(winningOverflowX(sample, 390)).toBe('visible');
  });
});
