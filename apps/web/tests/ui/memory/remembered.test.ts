import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/i18n/index.js', () => ({ t: (key: string) => key }));
vi.mock('../../../src/ui/whisper.ui.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
}));
vi.mock('../../../src/ui/memory/ferni-knows.ui.js', () => ({
  openFerniKnowsPanel: vi.fn(),
  closeFerniKnowsPanel: vi.fn(),
}));
vi.mock('../../../src/ui/memory/memory-correction.ui.js', () => ({ openCorrectionModal: vi.fn() }));

import {
  correctionRequest,
  doneToast,
  toKnowledgeItem,
} from '../../../src/ui/memory/remembered.js';

const at = '2026-10-05T18:00:00Z';

describe('toKnowledgeItem', () => {
  it("shows the caller's own facts plainly and others with who they are about", () => {
    expect(
      toKnowledgeItem({
        id: 'a',
        subject: 'you',
        detail: 'current employer: Northwind',
        learnedAt: at,
      })
    ).toMatchObject({
      id: 'a',
      category: 'about_you',
      content: 'current employer: Northwind',
      source: 'explicit',
    });
    const dog = toKnowledgeItem({
      id: 'b',
      subject: 'Biscuit',
      detail: 'breed: golden retriever',
      learnedAt: at,
    });
    expect(dog).toMatchObject({
      category: 'relationships',
      content: 'Biscuit: breed: golden retriever',
      relatedEntity: 'Biscuit',
    });
    expect(dog.learnedAt.toISOString()).toBe('2026-10-05T18:00:00.000Z');
  });

  it('marks a replaced fact as how things were, and files likes and plans where they belong', () => {
    expect(
      toKnowledgeItem({ id: 'c', subject: 'you', detail: 'current job: baker', earlier: true })
        .content
    ).toBe('current job: baker (ferniKnows.earlier)');
    expect(
      toKnowledgeItem({ id: 'd', subject: 'you', detail: 'favorite food: ramen' }).category
    ).toBe('preferences');
    expect(
      toKnowledgeItem({ id: 'e', subject: 'you', detail: 'training for the Denver half marathon' })
        .category
    ).toBe('goals');
  });
});

describe('correctionRequest', () => {
  const s = (
    correctionType: 'wrong' | 'outdated' | 'partial' | 'misattributed' | 'delete',
    correctedContent?: string
  ) => ({
    memoryId: 'a',
    correctionType,
    correctedContent,
    submittedAt: new Date(),
  });

  it('forgets on "please forget this", and on "outdated" with nothing new to say', () => {
    expect(correctionRequest(s('delete'), 'breed: golden retriever')).toEqual({ method: 'DELETE' });
    expect(
      correctionRequest(s('outdated', 'breed: golden retriever'), 'breed: golden retriever')
    ).toEqual({ method: 'DELETE' });
  });

  it('corrects with the new words, and does nothing when nothing changed', () => {
    expect(
      correctionRequest(s('wrong', '  breed: labradoodle '), 'breed: golden retriever')
    ).toEqual({ method: 'PATCH', value: 'breed: labradoodle' });
    expect(
      correctionRequest(s('partial', 'breed: golden retriever'), 'breed: golden retriever')
    ).toBeNull();
    expect(correctionRequest(s('misattributed', ''), 'breed: golden retriever')).toBeNull();
  });
});

describe('doneToast', () => {
  it('says a code or password was not kept, and otherwise what was done', () => {
    expect(doneToast('PATCH', { status: 'not-kept' })).toBe('app.credentialNotKept');
    expect(doneToast('PATCH', {})).toBe('app.memoryCorrected');
    expect(doneToast('DELETE')).toBe('app.memoryRemoved');
  });
});
