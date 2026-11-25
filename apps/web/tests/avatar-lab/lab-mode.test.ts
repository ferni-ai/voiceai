/**
 * The avatar lab is the exact path /avatar-lab (or with a trailing slash):
 * any other page, even one whose path only starts with or contains it, is the app.
 */
import { describe, expect, it } from 'vitest';
import { isAvatarLab } from '../../src/avatar-lab/lab-mode.js';

describe('isAvatarLab', () => {
  it.each(['/avatar-lab', '/avatar-lab/'])('is the lab at %s', (pathname) => {
    expect(isAvatarLab({ pathname })).toBe(true);
  });

  it.each(['/', '/admin', '/avatar-lab-x', '/a/avatar-lab'])('is the app at %s', (pathname) => {
    expect(isAvatarLab({ pathname })).toBe(false);
  });

  it('reads the current location by default', () => {
    window.history.replaceState(null, '', '/avatar-lab');
    expect(isAvatarLab()).toBe(true);
    window.history.replaceState(null, '', '/');
    expect(isAvatarLab()).toBe(false);
  });
});
