import { describe, expect, it } from 'vitest';

import { resolveInitialTheme } from '../src/theme/index.js';

describe('resolveInitialTheme', () => {
  it('keeps a stored Night Ink choice', () => {
    expect(resolveInitialTheme('midnight', false)).toEqual({
      theme: 'midnight',
      persist: true,
    });
  });

  it('keeps a stored zen choice even when the system is dark', () => {
    expect(resolveInitialTheme('zen', true)).toEqual({
      theme: 'zen',
      persist: true,
    });
  });

  it('follows the current system dark theme without locking it', () => {
    expect(resolveInitialTheme(null, true)).toEqual({
      theme: 'midnight',
      persist: false,
    });
  });

  it('follows a light system theme when nothing is stored', () => {
    expect(resolveInitialTheme(null, false)).toEqual({
      theme: 'zen',
      persist: false,
    });
  });

  it('ignores an unknown stored value and follows the system', () => {
    expect(resolveInitialTheme('cedar', true)).toEqual({
      theme: 'midnight',
      persist: false,
    });
  });
});
