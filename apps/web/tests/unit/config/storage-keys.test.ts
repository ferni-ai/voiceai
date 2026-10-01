/**
 * STORAGE_KEYS spreads every key group into one object, so two groups using
 * the same name silently keep only the last one. EXPERIMENT_KEYS.USER_ID once
 * replaced IDENTITY_KEYS.USER_ID: the signed-in uid was saved under the
 * experiment key and data export never saw the user.
 */

import { describe, expect, it } from 'vitest';
import * as storageKeys from '../../../src/config/storage-keys';

const groups = Object.entries(storageKeys).filter(
  ([name, value]) =>
    name.endsWith('_KEYS') && name !== 'STORAGE_KEYS' && value && typeof value === 'object' && !Array.isArray(value)
) as Array<[string, Record<string, string>]>;

describe('STORAGE_KEYS', () => {
  it('has no name defined by two key groups', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [group, keys] of groups) {
      for (const name of Object.keys(keys)) {
        const first = owner.get(name);
        if (first) clashes.push(`${name}: ${first} and ${group}`);
        else owner.set(name, group);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps the primary user ID', () => {
    expect(storageKeys.STORAGE_KEYS.USER_ID).toBe('ferni_user_id');
  });
});
