/**
 * isValidPersonaId must agree with the canonical table in persona-ids.ts (#3632).
 * It used to keep its own hand list, which accepted "bogle" and rejected every
 * hyphenated canonical id.
 */

import { describe, expect, it } from 'vitest';

import { ALIAS_TO_CANONICAL, ALL_CANONICAL_IDS, isValidPersonaId } from '../index.js';

describe('isValidPersonaId', () => {
  it('accepts every canonical id, in any case', () => {
    expect(ALL_CANONICAL_IDS.length).toBeGreaterThan(0);
    for (const id of ALL_CANONICAL_IDS) {
      expect(isValidPersonaId(id), id).toBe(true);
      expect(isValidPersonaId(id.toUpperCase()), id.toUpperCase()).toBe(true);
    }
  });

  it('accepts every alias in ALIAS_TO_CANONICAL', () => {
    for (const alias of Object.keys(ALIAS_TO_CANONICAL)) {
      expect(isValidPersonaId(alias), alias).toBe(true);
    }
  });

  it('rejects ids the table does not list, including the old hand-listed "bogle"', () => {
    for (const id of ['bogle', 'zz-not-a-persona', 'peter-lynchh', '']) {
      expect(isValidPersonaId(id), id).toBe(false);
    }
  });

  it('rejects inherited object keys', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(isValidPersonaId(id), id).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    for (const value of [null, undefined, 42, {}, ['ferni']]) {
      expect(isValidPersonaId(value)).toBe(false);
    }
  });
});
