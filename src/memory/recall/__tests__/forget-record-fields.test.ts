/**
 * FORGET_EVERY_READER and where a stored record says what it is about
 * (#2662): a memory whose only mention of a forgotten topic is its summary,
 * a free-form metadata field, or the related entities a surfacing
 * opportunity carries is left out like any other. The real filter
 * (keepRemembered, as UnifiedStore.recall and proactive surfacing call it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => ['Mindy'],
}));

const { keepRemembered } = await import('../forget-every-reader.js');
const { resetForgetTopicsSource } = await import('../forget-topics-source.js');

const USER = 'member-record-fields';
const scored = (memory: Record<string, unknown>) => ({ score: 1, memory: { id: 'm', ...memory } });

beforeEach(() => {
  resetForgetTopicsSource();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('a forgotten topic anywhere a record names it', () => {
  it('UnifiedStore.recall: a memory about it only in its summary is left out', async () => {
    const items = [
      scored({ content: 'a long talk', summary: 'Mindy relapsed' }),
      scored({ content: 'the garden' }),
    ];
    expect(await keepRemembered(USER, items)).toEqual([items[1]]);
  });

  it('a free-form metadata field naming it', async () => {
    const items = [
      scored({ content: 'a call', metadata: { note: 'about Mindy' } }),
      scored({ content: 'x' }),
    ];
    expect(await keepRemembered(USER, items)).toEqual([items[1]]);
  });

  it('a surfacing opportunity whose related entities name it', async () => {
    const item = {
      type: 'entity_context',
      entity: { canonicalName: 'Grandma' },
      naturalPhrasing: 'How is your grandma doing?',
      relatedInfo: [{ canonicalName: 'Mindy', type: 'person' }],
    };
    expect(await keepRemembered(USER, [item])).toEqual([]);
  });

  it('off: nothing is filtered', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const items = [scored({ content: 'a long talk', summary: 'Mindy relapsed' })];
    expect(await keepRemembered(USER, items)).toEqual(items);
  });
});
