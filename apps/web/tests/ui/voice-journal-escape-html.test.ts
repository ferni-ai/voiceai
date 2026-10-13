/**
 * The voice journal's entry list renders entries and the search query as text.
 * Before: entry.content (and the search-highlighted copy) went into innerHTML
 * as-is, so an entry containing markup ran in the page.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { CustomAgentMemory } from '../../src/services/custom-agent.service.js';
import { renderEntries } from '../../src/ui/voice-journal/entries.js';
import { setEntries, setModal, setSearchQuery } from '../../src/ui/voice-journal/state.js';

const PAYLOAD = '<img src=x onerror=alert(1)>';

function entry(content: string): CustomAgentMemory {
  return {
    id: 'm1',
    type: 'journalEntry',
    content,
    themes: [],
    emotions: [],
    keywords: [],
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };
}

let list: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="vj"><div id="entries-list"></div></div>';
  setModal(document.querySelector<HTMLElement>('#vj'));
  list = document.querySelector<HTMLElement>('#entries-list') as HTMLElement;
  setSearchQuery('');
});

describe('voice journal entries render words, not markup', () => {
  it('shows an entry containing markup as text and creates no img element', () => {
    setEntries([entry(`note ${PAYLOAD}`)]);

    renderEntries();

    expect(list.querySelector('.entry-content')?.textContent).toBe(`note ${PAYLOAD}`);
    expect(list.querySelector('img')).toBeNull();
  });

  it('keeps a quote in an audio url inside the src attribute', () => {
    setEntries([{ ...entry('voice note'), audioUrl: 'https://x/a.mp3" onerror="alert(1)' }]);

    renderEntries();

    const audio = list.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('https://x/a.mp3" onerror="alert(1)');
    expect(audio?.hasAttribute('onerror')).toBe(false);
  });

  it('still highlights a search match, inside the escaped text', () => {
    setEntries([entry(`note ${PAYLOAD}`)]);
    setSearchQuery('onerror');

    renderEntries();

    expect(list.querySelector('.search-highlight')?.textContent).toBe('onerror');
    expect(list.querySelector('.entry-content')?.textContent).toBe(`note ${PAYLOAD}`);
    expect(list.querySelector('img')).toBeNull();
  });

  it('shows a search query with markup as text when nothing matches', () => {
    setEntries([entry('plain words')]);
    setSearchQuery(PAYLOAD);

    renderEntries();

    expect(list.textContent).toContain(PAYLOAD);
    expect(list.querySelector('img')).toBeNull();
  });
});
