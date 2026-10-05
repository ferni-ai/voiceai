/**
 * Firestore payload hardening for deep extraction persistence.
 */

import { describe, expect, it, vi } from 'vitest';
import { buildExtractionFirestoreWritePayloads } from '../extraction-firestore-docs.js';
import type { ExtractedEntity, ExtractedFact, ExtractedRelationship } from '../deep-extraction-worker.js';

function createLog() {
  return { debug: vi.fn() };
}

const job = { sessionId: 'session-1', turnNumber: 2 };
const extractedAt = '2026-10-04T00:00:00.000Z';

describe('buildExtractionFirestoreWritePayloads', () => {
  it('drops malformed items and never writes undefined', () => {
    const entities = [
      { name: 'Sarah', type: 'person', attributes: {}, confidence: 0.9 },
      { type: 'person', attributes: undefined, confidence: 0.5 },
    ] as unknown as ExtractedEntity[];

    const facts = [
      {
        entityName: 'Sarah',
        factType: 'attribute',
        key: 'city',
        value: 'Austin',
        confidence: 0.8,
      },
      { entityName: 'Sarah', key: 'bad', value: undefined, confidence: 0.5 },
    ] as unknown as ExtractedFact[];

    const relationships = [
      { source: 'Sarah', target: 'Mike', type: 'friend', strength: 0.7, bidirectional: true },
      { source: '', target: 'Mike', type: 'friend', strength: 0.1, bidirectional: false },
    ] as unknown as ExtractedRelationship[];

    const { entities: entityDocs, facts: factDocs, relationships: relDocs, dropped } =
      buildExtractionFirestoreWritePayloads(
        'user-1',
        { entities, facts, relationships },
        job,
        extractedAt,
        createLog()
      );

    expect(dropped.entities).toBe(1);
    expect(dropped.facts).toBe(1);
    expect(dropped.relationships).toBe(1);
    expect(entityDocs).toHaveLength(1);
    expect(factDocs).toHaveLength(1);
    expect(relDocs).toHaveLength(1);

    for (const doc of [...entityDocs, ...factDocs, ...relDocs]) {
      expect(JSON.stringify(doc)).not.toContain('undefined');
    }
  });

  it('fuzz-style: random malformed payloads never throw', () => {
    const log = createLog();
    for (let i = 0; i < 40; i++) {
      const garbage = {
        entities: [{ foo: i, name: i % 3 === 0 ? `E${i}` : undefined }],
        facts: [{ entityName: i % 2 ? 'x' : null, key: 'k', value: i % 5 ? 'v' : undefined }],
        relationships: [{ source: i % 4 ? 'a' : '', target: 'b' }],
      };
      expect(() =>
        buildExtractionFirestoreWritePayloads(
          'u',
          garbage as never,
          job,
          extractedAt,
          log
        )
      ).not.toThrow();
    }
  });
});
