/**
 * User-keyed engines are capped
 *
 * The curiosity, temporal context and relationship events engines are keyed by
 * user id and outlive a session, so nothing clears them when a call ends. On
 * the long-lived GCE voice worker an uncapped registry keeps one engine per
 * user until the process restarts.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getCuriosityEngine, resetCuriosityEngine } from '../curiosity-engine.js';
import {
  getRelationshipEventsEngine,
  resetRelationshipEventsEngine,
} from '../relationship-events.js';
import { getTemporalContextEngine, resetTemporalContextEngine } from '../temporal-context/index.js';
import { USER_KEYED_REGISTRY_MAX_INSTANCES } from '../../utils/session-registry.js';

const engines = [
  { name: 'curiosity', get: getCuriosityEngine, reset: resetCuriosityEngine },
  { name: 'temporal context', get: getTemporalContextEngine, reset: resetTemporalContextEngine },
  {
    name: 'relationship events',
    get: getRelationshipEventsEngine,
    reset: resetRelationshipEventsEngine,
  },
];

const userIds = Array.from(
  { length: USER_KEYED_REGISTRY_MAX_INSTANCES + 1 },
  (_, i) => `cap-test-user-${i}`
);

describe('user-keyed engine registries', () => {
  afterEach(() => {
    for (const engine of engines) {
      for (const id of userIds) engine.reset(id);
    }
  });

  for (const engine of engines) {
    it(`evicts the least recently used ${engine.name} engine past the cap`, () => {
      const first = engine.get(userIds[0]);
      expect(engine.get(userIds[0])).toBe(first);

      for (const id of userIds.slice(1)) engine.get(id);

      expect(engine.get(userIds[0])).not.toBe(first);
    });

    it(`keeps a ${engine.name} engine that is still being used`, () => {
      const active = engine.get(userIds[0]);

      for (const id of userIds.slice(1)) {
        engine.get(userIds[0]);
        engine.get(id);
      }

      expect(engine.get(userIds[0])).toBe(active);
    });
  }
});
