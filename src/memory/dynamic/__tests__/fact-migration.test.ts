import { describe, expect, it } from 'vitest';
import { entityIdFor, factIdForExtracted } from '../fact-identity.js';
import { planEntityMigration, planFactMigration, type SourceDoc } from '../fact-migration.js';

const breed = {
  entityName: 'Biscuit',
  key: 'breed',
  value: 'golden retriever',
  factType: 'attribute',
};
const breedId = factIdForExtracted(breed);

function legacy(id: string, extra: Record<string, unknown> = {}): SourceDoc {
  return {
    id,
    data: {
      ...breed,
      confidence: 0.7,
      extractedAt: '2026-09-01T00:00:00.000Z',
      sessionId: `s-${id}`,
      ...extra,
    },
  };
}

/** Apply a plan to an in-memory collection, as the script would. */
function apply(docs: SourceDoc[], plan: ReturnType<typeof planFactMigration>): SourceDoc[] {
  const map = new Map(docs.map((d) => [d.id, d.data]));
  for (const w of plan.writes) map.set(w.id, w.data);
  for (const id of plan.deletes) map.delete(id);
  return [...map.entries()].map(([id, data]) => ({ id, data }));
}

describe('planFactMigration', () => {
  it('collapses duplicates onto the deterministic id, merging provenance and confidence', () => {
    const docs = [
      legacy('a'),
      legacy('b', { confidence: 0.9, extractedAt: '2026-09-10T00:00:00.000Z' }),
      legacy('c', { conversationId: 'conv-9' }),
    ];
    const plan = planFactMigration(docs, new Set());
    expect(plan.merged).toBe(1);
    expect(plan.writes).toHaveLength(1);
    expect(plan.deletes.sort()).toEqual(['a', 'b', 'c']);
    const merged = plan.writes[0];
    expect(merged.id).toBe(breedId);
    expect(merged.data).toMatchObject({
      text: 'Biscuit: breed is golden retriever',
      confidence: 0.9,
      sourceConversationIds: ['conv-9'],
      legacySessionIds: ['s-a', 's-b', 's-c'],
      userEdited: false,
    });
    expect((merged.data.firstSeenAt as Date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect((merged.data.updatedAt as Date).toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('is idempotent: a second run plans nothing', () => {
    const docs = [legacy('a'), legacy('b')];
    const once = apply(docs, planFactMigration(docs, new Set()));
    expect(once).toHaveLength(1);
    const again = planFactMigration(once, new Set());
    expect(again.writes).toHaveLength(0);
    expect(again.deletes).toHaveLength(0);
  });

  it("keeps the user's edit when one duplicate was edited", () => {
    const docs = [
      legacy('a', { confidence: 0.95, extractedAt: '2026-09-20T00:00:00.000Z' }),
      legacy('b', {
        userEdited: true,
        text: 'Biscuit is a goldendoodle',
        category: 'pets',
        confidence: 1,
        editedAt: '2026-09-05T00:00:00.000Z',
      }),
    ];
    const merged = planFactMigration(docs, new Set()).writes[0].data;
    expect(merged).toMatchObject({
      userEdited: true,
      text: 'Biscuit is a goldendoodle',
      category: 'pets',
      confidence: 1,
    });
  });

  it('removes every copy of a fact the user deleted', () => {
    const plan = planFactMigration([legacy('a'), legacy('b')], new Set([breedId]));
    expect(plan.writes).toHaveLength(0);
    expect(plan.deletes.sort()).toEqual(['a', 'b']);
    expect(plan.tombstoned).toBe(2);
  });

  it('upgrades a lone legacy doc and leaves non-extracted docs alone', () => {
    const plan = planFactMigration(
      [legacy('a'), { id: 'manual', data: { note: 'hand written' } }],
      new Set()
    );
    expect(plan.writes.map((w) => w.id)).toEqual([breedId]);
    expect(plan.deletes).toEqual(['a']);
  });
});

describe('planEntityMigration', () => {
  it('merges duplicate people, summing mentions and merging attributes', () => {
    const docs: SourceDoc[] = [
      {
        id: 'x',
        data: {
          name: 'Mom',
          type: 'person',
          attributes: { city: 'Tulsa' },
          confidence: 0.6,
          extractedAt: '2026-09-01T00:00:00Z',
          sessionId: 's1',
        },
      },
      {
        id: 'y',
        data: {
          name: 'mom',
          type: 'person',
          attributes: { job: 'teacher' },
          confidence: 0.8,
          extractedAt: '2026-09-02T00:00:00Z',
          sessionId: 's2',
        },
      },
    ];
    const plan = planEntityMigration(docs, new Set());
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].id).toBe(entityIdFor('Mom', 'person'));
    expect(plan.writes[0].data).toMatchObject({
      attributes: { city: 'Tulsa', job: 'teacher' },
      confidence: 0.8,
      mentionCount: 2,
      legacySessionIds: ['s1', 's2'],
    });
    const again = planEntityMigration(
      [{ id: plan.writes[0].id, data: plan.writes[0].data }],
      new Set()
    );
    expect(again.writes).toHaveLength(0);
  });
});
