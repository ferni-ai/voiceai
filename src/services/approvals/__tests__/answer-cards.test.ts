import { describe, expect, it } from 'vitest';
import {
  isApprovalsPageEnabled,
  isCardId,
  newCardId,
  normalizeCardInput,
} from '../answer-cards.js';

describe('card ids', () => {
  it('are 32 random bytes in base64url (256 bits), and never repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newCardId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(isCardId(id)).toBe(true);
      expect(Buffer.from(id, 'base64url')).toHaveLength(32);
    }
  });

  it('reject anything else', () => {
    for (const bad of [
      '',
      'abc',
      `${'a'.repeat(42)}`,
      `${'a'.repeat(44)}`,
      `${'a'.repeat(42)}/`,
      '../../x',
    ]) {
      expect(isCardId(bad)).toBe(false);
    }
  });
});

describe('normalizeCardInput', () => {
  it('keeps only http(s) source links', () => {
    const card = normalizeCardInput({
      kind: 'answer',
      answerText: 'ok',
      sources: [
        { title: 'good', url: 'https://example.org/a' },
        { title: 'plain', url: 'http://example.org/b' },
        { title: 'script', url: 'javascript:alert(1)' },
        { title: 'data', url: 'data:text/html,<b>x</b>' },
        { title: 'relative', url: '/etc/passwd' },
      ],
    });
    expect(card.sources.map((s) => s.title)).toEqual(['good', 'plain']);
  });

  it('drops oversized suggestion HTML whole instead of cutting it', () => {
    const big = `<div>${'x'.repeat(70 * 1024)}</div>`;
    expect(
      normalizeCardInput({
        kind: 'answer',
        answerText: 'a',
        sources: [],
        searchSuggestionsHtml: big,
      }).searchSuggestionsHtml
    ).toBe('');
    expect(
      normalizeCardInput({
        kind: 'answer',
        answerText: 'a',
        sources: [],
        searchSuggestionsHtml: '<b>s</b>',
      }).searchSuggestionsHtml
    ).toBe('<b>s</b>');
  });

  it('refuses a card with nothing to show', () => {
    expect(() => normalizeCardInput({ kind: 'answer', answerText: '  ', sources: [] })).toThrow();
  });
});

describe('APPROVALS_PAGE', () => {
  it('is off unless exactly on', () => {
    expect(isApprovalsPageEnabled({})).toBe(false);
    expect(isApprovalsPageEnabled({ APPROVALS_PAGE: 'true' })).toBe(false);
    expect(isApprovalsPageEnabled({ APPROVALS_PAGE: 'on' })).toBe(true);
  });
});
