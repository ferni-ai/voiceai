/**
 * ContextManager.setCurrentPersona validates through isValidPersonaId, which reads
 * the canonical persona table (#3632). Canonical hyphenated ids must be accepted.
 */

import { describe, expect, it } from 'vitest';

import { ALL_CANONICAL_IDS } from '../../personas/index.js';
import { createSessionId } from '../../types/branded.js';
import { ContextManager } from '../context-manager.class.js';

describe('ContextManager.setCurrentPersona', () => {
  it('switches to every canonical persona id and records the handoff', () => {
    for (const id of ALL_CANONICAL_IDS.filter((p) => p !== 'ferni')) {
      const manager = new ContextManager(createSessionId('sess_3632'));
      manager.setCurrentPersona(id);
      expect(manager.getCurrentPersona(), id).toBe(id);
      expect(manager.getPreviousPersona(), id).toBe('ferni');
      expect(manager.getHandoffHistory().map((h) => h.toPersona)).toEqual([id]);
    }
  });

  it('ignores an id the canonical table does not list', () => {
    const manager = new ContextManager(createSessionId('sess_3632'));
    manager.setCurrentPersona('bogle');
    expect(manager.getCurrentPersona()).toBe('ferni');
    expect(manager.getHandoffHistory()).toEqual([]);
  });
});
