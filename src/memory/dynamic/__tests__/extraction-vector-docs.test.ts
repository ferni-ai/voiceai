/**
 * Tests for buildExtractionVectorDocuments — the function that turns raw
 * (LLM-sourced, therefore untrustworthy) deep-extraction results into
 * Firestore-safe vector documents.
 *
 * Reproduces three real production errors logged on the dev LiveKit agent
 * (2026-10-03, user voice-eval-sam):
 *
 * 1. "Failed to add document" — a fact doc id built from free text
 *    containing "/" (e.g. a fact key like "likely excited/nervous to
 *    announce") produced an invalid Firestore document path.
 * 2. "TypeError: Cannot read properties of undefined (reading 'toLowerCase')"
 *    — an extracted item was missing a required string field (e.g. an
 *    entity's `name` or a fact's `entityName`/`key`).
 * 3. "TypeError: Cannot convert undefined or null to object" —
 *    `Object.entries(entity.attributes)` threw when `attributes` was
 *    missing from the LLM's JSON output.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildExtractionVectorDocuments } from '../extraction-vector-docs.js';
import type {
  ExtractedEntity,
  ExtractedFact,
  ExtractedRelationship,
} from '../deep-extraction-worker.js';

function createLog() {
  return { debug: vi.fn() };
}

const job = { personaId: 'ferni', sessionId: 'session-1', turnNumber: 3 };
const timestamp = new Date('2026-10-03T00:00:00.000Z');

describe('buildExtractionVectorDocuments', () => {
  it('never throws and produces no "/" in any generated id, even for slash-containing free text', () => {
    // Reproduces the exact production failure:
    // id: `fact-voice-eval-sam-she-likely excited/nervous to announce-...`
    const facts: ExtractedFact[] = [
      {
        entityName: 'she',
        factType: 'state',
        key: 'likely excited/nervous to announce',
        value: 'big news',
        confidence: 0.8,
      },
    ];

    const log = createLog();
    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'voice-eval-sam',
        { entities: [], facts, relationships: [] },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toContain('/');
    // No stray collection-boundary characters either.
    expect(docs[0].id.split('/').length).toBe(1);
  });

  it('sanitizes "/" in an entity name without dropping the entity', () => {
    const entities: ExtractedEntity[] = [
      { name: 'AC/DC', type: 'concept', attributes: {}, confidence: 0.9 },
    ];

    const docs = buildExtractionVectorDocuments(
      'voice-eval-sam',
      { entities, facts: [], relationships: [] },
      job,
      timestamp,
      createLog()
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toContain('/');
  });

  it('sanitizes "/" in a relationship source/target', () => {
    const relationships: ExtractedRelationship[] = [
      { source: 'mom/dad', target: 'she', type: 'family', strength: 0.5, bidirectional: true },
    ];

    const docs = buildExtractionVectorDocuments(
      'voice-eval-sam',
      { entities: [], facts: [], relationships },
      job,
      timestamp,
      createLog()
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toContain('/');
  });

  it('produces deterministic sanitized ids for the same input text', () => {
    const facts: ExtractedFact[] = [
      { entityName: 'she', factType: 'state', key: 'a/b', value: 'x', confidence: 0.5 },
    ];

    const docsA = buildExtractionVectorDocuments(
      'u1',
      { entities: [], facts, relationships: [] },
      job,
      timestamp,
      createLog()
    );
    const docsB = buildExtractionVectorDocuments(
      'u1',
      { entities: [], facts, relationships: [] },
      job,
      timestamp,
      createLog()
    );

    // Strip the trailing `-${Date.now()}` suffix (expected to vary); the
    // sanitized prefix built from the same input text must be identical.
    const prefix = (id: string) => id.replace(/-\d+$/, '');
    expect(prefix(docsA[0].id)).toBe(prefix(docsB[0].id));
  });

  it('drops an entity missing "name" (not a reimplementation of the parse) without throwing', () => {
    const entities = [
      { type: 'person', attributes: {}, confidence: 0.5 },
    ] as unknown as ExtractedEntity[];
    const log = createLog();

    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'u1',
        { entities, facts: [], relationships: [] },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    expect(docs).toHaveLength(0);
    expect(log.debug).toHaveBeenCalled();
  });

  it('drops a fact missing "entityName" without throwing (would otherwise throw on .toLowerCase())', () => {
    const facts = [
      { factType: 'attribute', key: 'job', value: 'teacher', confidence: 0.6 },
    ] as unknown as ExtractedFact[];
    const log = createLog();

    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'u1',
        { entities: [], facts, relationships: [] },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    expect(docs).toHaveLength(0);
    expect(log.debug).toHaveBeenCalled();
  });

  it('drops a relationship missing "target" without throwing', () => {
    const relationships = [
      { source: 'mom', type: 'family', strength: 0.5, bidirectional: false },
    ] as unknown as ExtractedRelationship[];
    const log = createLog();

    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'u1',
        { entities: [], facts: [], relationships },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    expect(docs).toHaveLength(0);
    expect(log.debug).toHaveBeenCalled();
  });

  it('tolerates an entity missing "attributes" instead of throwing on Object.entries(undefined)', () => {
    const entities = [
      { name: 'Mike', type: 'person', confidence: 0.7 },
    ] as unknown as ExtractedEntity[];
    const log = createLog();

    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'u1',
        { entities, facts: [], relationships: [] },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    // Unlike the missing-name case, a missing `attributes` is recoverable —
    // the entity is still valid and should be kept (defaulted to `{}`).
    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain('Mike');
  });

  it('processes a realistic mixed batch — some valid, some malformed — without throwing', () => {
    const entities = [
      { name: 'Mike', type: 'person', attributes: {}, confidence: 0.7 },
      { type: 'person', attributes: {}, confidence: 0.5 }, // missing name
      { name: 'Sue', type: 'person', confidence: 0.6 }, // missing attributes
    ] as unknown as ExtractedEntity[];
    const facts = [
      { entityName: 'Mike', factType: 'attribute', key: 'job', value: 'teacher', confidence: 0.8 },
      { factType: 'state', key: 'x', value: 'y', confidence: 0.4 }, // missing entityName
    ] as unknown as ExtractedFact[];
    const relationships = [
      { source: 'Mike', target: 'Sue', type: 'sibling', strength: 0.5, bidirectional: true },
      { source: 'Mike', type: 'friend', strength: 0.3, bidirectional: false }, // missing target
    ] as unknown as ExtractedRelationship[];
    const log = createLog();

    let docs: ReturnType<typeof buildExtractionVectorDocuments> = [];
    expect(() => {
      docs = buildExtractionVectorDocuments(
        'u1',
        { entities, facts, relationships },
        job,
        timestamp,
        log
      );
    }).not.toThrow();

    // 2 valid entities + 1 valid fact + 1 valid relationship = 4
    expect(docs).toHaveLength(4);
    // 3 malformed items dropped: entity missing name, fact missing
    // entityName, relationship missing target.
    expect(log.debug).toHaveBeenCalledTimes(3);
  });
});
