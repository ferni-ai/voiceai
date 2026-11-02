/**
 * The family nudge's "Last time you talked:" line comes only from the
 * owner-facing outcome line of a call Ferni placed, never from the stored
 * transcriptSummary (older results hold the other person's words verbatim),
 * and never from a result past its expireAt. Real builder; only Firestore is
 * faked. Fictional people and words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextBuilderInput } from '../../core/types.js';

const store = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock('../../../../services/superhuman/firestore-utils.js', () => {
  const query = (rows: () => Array<Record<string, unknown>>) => {
    const q = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => ({ empty: rows().length === 0, docs: rows().map((r) => ({ data: () => r })) }), // prettier-ignore
    };
    return q;
  };
  const sub: Record<string, () => Array<Record<string, unknown>>> = {
    unified_entities: () => [{ name: 'Aunt Rose', specificRelation: 'aunt' }],
    on_behalf_calls: () => store.calls,
  };
  const db = {
    collection: () => ({
      doc: () => ({ collection: (name: string) => query(sub[name] ?? (() => [])) }),
    }),
  };
  return { getFirestoreDb: () => db };
});

const { familyConnectionNudgeBuilder } = await import('../family-connection-nudge.js');

const DAY = 86_400_000;
const call = (extra: Record<string, unknown>) => ({
  request: { contactName: 'Aunt Rose' },
  capturedAt: new Date(Date.now() - 30 * DAY).toISOString(),
  outcome: {
    outcome: 'I talked with Aunt Rose. She sounded cheerful.',
    transcriptSummary: 'She said: "The marmalade festival moved to the old lighthouse."',
  },
  ...extra,
});

const nudge = async (userId: string): Promise<string> =>
  (
    await familyConnectionNudgeBuilder.build({
      services: { userId },
      userData: { turnCount: 2 },
    } as unknown as ContextBuilderInput)
  )
    .map((i) => i.content)
    .join('\n');

beforeEach(() => {
  store.calls = [];
});

describe('family nudge: what it says about the last call', () => {
  it('uses the outcome line, never a verbatim transcriptSummary', async () => {
    store.calls = [call({})];
    const content = await nudge('u-nudge-words');
    expect(content).toContain(
      'Last time you talked: I talked with Aunt Rose. She sounded cheerful.'
    );
    expect(content).not.toMatch(/marmalade|lighthouse/i);
  });

  it('skips a result past its expireAt', async () => {
    store.calls = [call({ expireAt: new Date(Date.now() - DAY) })];
    const content = await nudge('u-nudge-expired');
    expect(content).toContain('Aunt Rose');
    expect(content).not.toContain('Last time you talked');
  });
});
