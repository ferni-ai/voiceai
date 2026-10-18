/**
 * Chrome autofill (and some IMEs) dispatch keydown/keyup as plain Events with
 * no `key`. The shortcut handler read e.key.toLowerCase() and threw on every
 * one (9 uncaught TypeErrors in one prod session). It must ignore them and
 * keep matching real key presses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeKeyboardShortcuts, initKeyboardShortcuts } from '../src/ui/keyboard-shortcuts.ui';

const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => {
  uncaught.push(e.error);
  e.preventDefault();
};

beforeEach(() => {
  uncaught.length = 0;
  window.addEventListener('error', onError);
});
afterEach(() => {
  disposeKeyboardShortcuts();
  window.removeEventListener('error', onError);
});

describe('keyboard shortcuts with a key-less event', () => {
  it('ignores keydown/keyup that carry no key, and still runs real shortcuts', () => {
    const action = vi.fn();
    initKeyboardShortcuts([{ key: 'j', label: 'J', action }]);

    // What autofill sends: an Event, not a KeyboardEvent, so e.key is undefined.
    document.dispatchEvent(new Event('keydown', { bubbles: true }));
    document.dispatchEvent(new Event('keyup', { bubbles: true }));
    expect(uncaught).toEqual([]);
    expect(action).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(uncaught).toEqual([]);
  });
});
