/**
 * ID Generator Tests
 *
 * Tests for ID generation utilities with optional prefixes.
 *
 * @module utils/__tests__/id-generator.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateShortId,
  getIdPrefix,
  hasIdPrefix,
  ID_PREFIXES,
} from '../id-generator.js';

describe('ID Generator', () => {
  describe('generateId', () => {
    it('should generate a UUID without prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate a prefixed UUID', () => {
      const id = generateId('ent');
      expect(id).toMatch(/^ent_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should work with standard prefixes', () => {
      const entityId = generateId(ID_PREFIXES.ENTITY);
      const relId = generateId(ID_PREFIXES.RELATIONSHIP);

      expect(entityId.startsWith('ent_')).toBe(true);
      expect(relId.startsWith('rel_')).toBe(true);
    });
  });

  describe('generateShortId', () => {
    it('should generate a short ID (8 chars) without prefix', () => {
      const id = generateShortId();
      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should generate a prefixed short ID', () => {
      const id = generateShortId('sess');
      expect(id).toMatch(/^sess_[a-f0-9]{8}$/);
    });

    it('should generate unique short IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateShortId());
      }
      // Short IDs have higher collision probability, but 1000 should be fine
      expect(ids.size).toBe(1000);
    });
  });

  describe('getIdPrefix', () => {
    it('should extract prefix from ID', () => {
      expect(getIdPrefix('ent_abc123')).toBe('ent');
      expect(getIdPrefix('rel_xyz789')).toBe('rel');
      expect(getIdPrefix('fact_something')).toBe('fact');
    });

    it('should return null for IDs without prefix', () => {
      expect(getIdPrefix('abc123')).toBe(null);
      expect(getIdPrefix('no-underscore')).toBe(null);
    });

    it('should handle empty prefix', () => {
      expect(getIdPrefix('_abc123')).toBe('');
    });
  });

  describe('hasIdPrefix', () => {
    it('should return true for matching prefix', () => {
      expect(hasIdPrefix('ent_abc123', 'ent')).toBe(true);
      expect(hasIdPrefix('rel_xyz789', 'rel')).toBe(true);
    });

    it('should return false for non-matching prefix', () => {
      expect(hasIdPrefix('ent_abc123', 'rel')).toBe(false);
      expect(hasIdPrefix('ent_abc123', 'entity')).toBe(false);
    });

    it('should return false for IDs without underscore', () => {
      expect(hasIdPrefix('abc123', 'abc')).toBe(false);
    });
  });

  describe('ID_PREFIXES', () => {
    it('should have standard prefixes', () => {
      expect(ID_PREFIXES.ENTITY).toBe('ent');
      expect(ID_PREFIXES.RELATIONSHIP).toBe('rel');
      expect(ID_PREFIXES.FACT).toBe('fact');
      expect(ID_PREFIXES.MENTION).toBe('mention');
      expect(ID_PREFIXES.CORRELATION).toBe('corr');
      expect(ID_PREFIXES.OBSERVATION).toBe('obs');
      expect(ID_PREFIXES.SURFACING).toBe('surf');
      expect(ID_PREFIXES.SESSION).toBe('sess');
      expect(ID_PREFIXES.COMMITMENT).toBe('commit');
      expect(ID_PREFIXES.MEMORY).toBe('mem');
    });
  });
});
