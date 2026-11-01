/**
 * The vendored IANA root-zone list (iana-tlds.ts) is complete enough to close the
 * fail-open the old partial list had (#3032 review).
 */
import { describe, expect, it } from 'vitest';

import { TLDS } from '../iana-tlds.js';

describe('the IANA root-zone list', () => {
  it('holds the whole root zone', () => {
    expect(TLDS.size).toBeGreaterThanOrEqual(1400);
  });

  it.each(['help', 'ru', 'app', 'ai', 'io', 'map', 'xn--p1ai', 'com', 'dev', 'co', 'me'])(
    'has .%s',
    (tld) => expect(TLDS.has(tld)).toBe(true)
  );

  it('holds lower-case endings only, and no word that is just ordinary text', () => {
    for (const tld of TLDS) expect(tld).toMatch(/^[a-z0-9-]+$/);
    for (const word of ['js', 'great', 'on', 'e', 'g']) expect(TLDS.has(word)).toBe(false);
  });
});
