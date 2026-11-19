/**
 * What every crisis flag does when nobody sets it.
 *
 * The other crisis tests take their cases from the manifest: crisis-all-flags-never-lower reads
 * each flag's default and checks against it, and rows that pin a flag off for their own cases
 * never look at the default at all. So a default that changed would move those tests with it,
 * and the change would ship green. This file is the one place that states the production
 * default of every crisis-lane flag (crisis-lane-flags.ts): off, unless EXPECTED_NOT_OFF names
 * the flag with its value.
 *
 * The list is exact both ways. A crisis flag whose default leaves off, or a listed flag whose
 * default differs from its listed value, fails here by name; so does a listed flag that is no
 * longer a crisis flag, or one listed as 'off'. Changing a crisis default means changing this
 * list in the same change, where a reviewer sees it.
 */
import { describe, expect, it } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import { CRISIS_FLAGS } from './crisis-lane-flags.js';

/** The crisis flags that are not off when unset, with what they are instead. */
const EXPECTED_NOT_OFF: Readonly<Record<string, string>> = {
  ACTION_CLAIM_GUARD: 'on',
  CALL_STATUS_RECALL: 'on',
  CRISIS_MEANS_IN_HAND: 'shadow',
  GOODBYE_ENDS_CALL: 'on',
  LAUGH_CAP: 'on',
  LIFE_LEDGER: 'on',
  OPENER_GATE: 'on',
  SPEAK_988_DIGITS: 'on',
  TOLD_THIS_CALL: 'on',
  TURN_INTELLIGENCE: 'on',
  USE_TOOL_GATEWAY: 'on',
};

const defaultOf = (name: string): string =>
  FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default;

describe('crisis flag defaults', () => {
  it('every crisis flag defaults off, except the listed ones at their listed value', () => {
    expect(CRISIS_FLAGS.length).toBeGreaterThan(Object.keys(EXPECTED_NOT_OFF).length);
    for (const name of CRISIS_FLAGS) {
      expect.soft(defaultOf(name), name).toBe(EXPECTED_NOT_OFF[name] ?? 'off');
    }
  });

  it('every listed flag is a crisis flag, listed with a value other than off', () => {
    for (const [name, value] of Object.entries(EXPECTED_NOT_OFF)) {
      expect.soft(CRISIS_FLAGS, `${name} is not a crisis flag`).toContain(name);
      expect.soft(value, `${name} is listed as off`).not.toBe('off');
    }
  });
});
