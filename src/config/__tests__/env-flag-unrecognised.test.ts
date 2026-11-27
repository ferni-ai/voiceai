/**
 * flagValueUnrecognised: true only for a set value that flagOn can't read as on or off, so it
 * fell back to the manifest default. Unset, blank and every known value are not flagged.
 */
import { describe, expect, it } from 'vitest';

import { flagOn, flagValueUnrecognised } from '../env-flag.js';

const NAME = 'API_BACKGROUND_SENDERS';

describe('flagValueUnrecognised', () => {
  it.each(['disabled', 'yes', 'enabled', 'of', ' nope '])(
    '%j is unrecognised, and reads as the default',
    (value) => {
      expect(flagValueUnrecognised(NAME, { [NAME]: value })).toBe(true);
      expect(flagOn(NAME, { [NAME]: value })).toBe(flagOn(NAME, {}));
    }
  );

  it.each([undefined, '', '   ', 'on', 'OFF', ' true ', 'false', '1', '0', 'live'])(
    '%j is unset or known: not flagged',
    (value) => {
      expect(flagValueUnrecognised(NAME, { [NAME]: value })).toBe(false);
    }
  );
});
