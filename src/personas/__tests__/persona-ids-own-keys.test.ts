/**
 * Alias lookups in persona-ids.ts must read only the table's own keys. Plain
 * `in` / indexing also finds Object.prototype members, so "constructor" and
 * "__proto__" used to count as known personas and toCanonical returned a function.
 */

import { describe, expect, it } from 'vitest';

import { personaName } from '../../agents/personas/said-by.js';
import {
  ALIAS_TO_CANONICAL,
  isKnownId,
  isSamePersona,
  isTeamMember,
  toCanonical,
} from '../persona-ids.js';

const INHERITED = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

describe('persona-ids lookups ignore inherited object keys', () => {
  it('isKnownId is false for inherited keys', () => {
    for (const key of INHERITED) expect(isKnownId(key), key).toBe(false);
  });

  it('toCanonical falls back to ferni, and strict mode throws, for inherited keys', () => {
    for (const key of INHERITED) {
      expect(toCanonical(key), key).toBe('ferni');
      expect(() => toCanonical(key, true), key).toThrow(/Unknown persona ID/);
    }
  });

  it('isSamePersona and isTeamMember do not match an inherited key to a persona', () => {
    expect(isSamePersona('constructor', 'ferni')).toBe(false);
    expect(isSamePersona('__proto__', 'constructor')).toBe(false);
    for (const key of INHERITED) expect(isTeamMember(key), key).toBe(false);
  });

  it("said-by's personaName returns an unknown id as its own name, never a non-string", () => {
    for (const key of INHERITED) {
      const name = personaName(key);
      expect(typeof name, key).toBe('string');
      expect(name, key).toBe(key);
    }
  });

  it('real ids and aliases resolve exactly as the table says', () => {
    for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
      expect(isKnownId(alias), alias).toBe(true);
      expect(isKnownId(alias.toUpperCase()), alias).toBe(true);
      expect(toCanonical(alias, true), alias).toBe(canonical);
      expect(toCanonical(` ${alias.toUpperCase()} `, true), alias).toBe(canonical);
      expect(isSamePersona(alias, canonical), alias).toBe(true);
      expect(isTeamMember(alias), alias).toBe(canonical !== 'ferni');
    }
  });
});
