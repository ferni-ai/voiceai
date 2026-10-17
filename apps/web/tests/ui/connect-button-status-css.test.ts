/**
 * Connect button status layout
 *
 * The connecting label used to be drawn over the button by
 * `.btn.btn-connecting::after { content: attr(data-status); position: absolute }`
 * with a fixed 28px gap for an absolutely placed spinner. At 200% zoom the
 * label wrapped under the spinner and was clipped by the pill.
 *
 * Now the label is a real flex item (`.btn-status`) beside a static spinner.
 * jsdom has no layout (Playwright measured the geometry, see the PR), so this
 * guards the mechanism in the stylesheet.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const STYLESHEET = join(__dirname, '..', '..', 'src', 'styles', 'inline-styles.css');

function styleRules(css: string): CSSStyleRule[] {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const out: CSSStyleRule[] = [];
  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) out.push(rule);
      else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  visit((style.sheet as CSSStyleSheet).cssRules);
  style.remove();
  return out;
}

describe('connect button status', () => {
  const rules = styleRules(readFileSync(STYLESHEET, 'utf8'));
  const connecting = rules.filter((r) => r.selectorText.includes('btn-connecting'));

  it('does not paint the label over the button', () => {
    for (const r of connecting) {
      expect(r.style.getPropertyValue('content'), r.selectorText).not.toContain('attr(');
    }
  });

  it('keeps the spinner in the flow beside the label', () => {
    const spinner = connecting.filter((r) => /btn-connecting::before/.test(r.selectorText));
    expect(spinner.length).toBeGreaterThan(0);
    for (const r of spinner) {
      expect(r.style.getPropertyValue('position'), r.selectorText).not.toBe('absolute');
    }
  });

  it('gives the two lines room inside the 52px pill over the global !important padding', () => {
    const prop = (r: CSSStyleRule) =>
      ['padding-block', 'padding-top'].find((p) => r.style.getPropertyValue(p));
    const pad = connecting.find((r) => prop(r));
    expect(pad, 'a padding rule for the connecting state').toBeDefined();
    expect(pad!.style.getPropertyPriority(prop(pad!)!)).toBe('important');
    // Must out-rank `.btn:not(.btn-mute)` (two classes): three or more.
    expect((pad!.selectorText.match(/\.[\w-]+/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
