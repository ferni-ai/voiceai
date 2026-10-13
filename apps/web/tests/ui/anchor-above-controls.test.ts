/**
 * The after-call and cost cards sit above the call controls, not on them,
 * and stay inside the safe area.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  anchorAboveControls,
  anchoredCardCss,
  bottomAboveControls,
} from '../../src/ui/after-call/anchor-above-controls.js';

function controlsAt(top: number, height = 52): HTMLElement {
  const row = document.createElement('div');
  row.className = 'controls-row';
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 390,
    width: 390,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  document.body.appendChild(row);
  return row;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('bottomAboveControls', () => {
  it('puts the card bottom just above the top of the controls', () => {
    controlsAt(506);
    // 844 - 506 = 338 to the controls' top, plus a 16px gap
    expect(bottomAboveControls()).toBe(354);
  });

  it('gives no position when the controls are not on the page', () => {
    expect(bottomAboveControls()).toBeNull();
  });
});

describe('anchorAboveControls', () => {
  it('sets the card position and follows a viewport change', () => {
    controlsAt(506);
    const card = document.createElement('div');

    const stop = anchorAboveControls(card);
    expect(card.style.getPropertyValue('--call-card-bottom')).toBe('354px');

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    window.dispatchEvent(new Event('resize'));
    expect(card.style.getPropertyValue('--call-card-bottom')).toBe('210px');

    stop();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    window.dispatchEvent(new Event('resize'));
    expect(card.style.getPropertyValue('--call-card-bottom')).toBe('210px');
  });
});

describe('anchoredCardCss', () => {
  it('keeps the card inside the safe area and scrolls it when room is short', () => {
    const css = anchoredCardCss('.card');
    expect(css).toContain('var(--call-card-bottom');
    expect(css).toContain('env(safe-area-inset-bottom');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('max-height');
    expect(css).toContain('overflow-y: auto');
  });
});
