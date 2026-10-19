import { afterEach, describe, expect, it } from 'vitest';
import {
  destroyProgressIndicator,
  initProgressIndicator,
  toggleExpanded,
} from '../../src/ui/progress-indicator.ui';

/**
 * The ring SVG turns -90deg so progress starts at 12 o'clock. The rule used to
 * be a descendant selector (`.progress-ring svg`), so it also turned the heart
 * inside the ring on its side, and the inline icon wrapper sat on a text
 * baseline instead of the centre. Both views had it.
 */
function rotatingRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSStyleRule && /rotate\(/.test(rule.style.transform)) rules.push(rule);
    }
  }
  return rules;
}

function rotated(el: Element): boolean {
  return rotatingRules().some((rule) => el.matches(rule.selectorText));
}

function ruleFor(selector: string): CSSStyleRule | undefined {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        rule instanceof CSSStyleRule &&
        rule.style.display &&
        rule.selectorText.split(',').map((s) => s.trim()).includes(selector)
      ) {
        return rule;
      }
    }
  }
  return undefined;
}

describe('journey pill heart icon', () => {
  afterEach(() => destroyProgressIndicator());

  it('turns only the ring, never the heart, when collapsed', () => {
    initProgressIndicator();
    const ring = document.querySelector('.progress-ring > svg');
    const heart = document.querySelector('.progress-ring-icon svg');
    expect(ring).not.toBeNull();
    expect(heart).not.toBeNull();
    expect(rotated(ring!)).toBe(true);
    expect(rotated(heart!)).toBe(false);
  });

  it('turns only the ring, never the heart, when expanded', () => {
    initProgressIndicator();
    toggleExpanded();
    const ring = document.querySelector('.progress-ring-large > svg');
    const heart = document.querySelector('.progress-ring-icon-large svg');
    expect(ring).not.toBeNull();
    expect(heart).not.toBeNull();
    expect(rotated(ring!)).toBe(true);
    expect(rotated(heart!)).toBe(false);
  });

  it('centres the icon box on both axes in both views', () => {
    initProgressIndicator();
    for (const selector of ['.progress-ring-icon', '.progress-ring-icon-large']) {
      const rule = ruleFor(selector);
      expect(rule, selector).toBeDefined();
      expect(rule!.style.display).toBe('flex');
      expect(rule!.style.alignItems).toBe('center');
      expect(rule!.style.justifyContent).toBe('center');
    }
  });
});
