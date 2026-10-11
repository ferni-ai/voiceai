/**
 * The thinking indicator speaks as Ferni: whatever persona id the app passes,
 * its rotating phrases never name a retired persona's style ("Running the
 * numbers") or say machine words like "Processing".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { thinkingUI } from '../../src/ui/thinking.ui.js';

const RETIRED_PHRASES = /processing|numbers|analyzing|brainstorming|wisely|creative|perspective/i;

function shownPhrases(personaId: string): Set<string> {
  document.body.innerHTML = `
    <div id="coach">
      <div id="thinkingFloat"><span class="thinking-text"></span></div>
    </div>`;
  thinkingUI.init();
  thinkingUI.setPersona(personaId);
  thinkingUI.show();
  const text = document.querySelector('.thinking-text');
  const seen = new Set<string>([text?.textContent ?? '']);
  for (let i = 0; i < 12; i++) {
    vi.advanceTimersByTime(2600);
    seen.add(text?.textContent ?? '');
  }
  thinkingUI.hide();
  thinkingUI.dispose();
  return seen;
}

describe('thinking phrases', () => {
  afterEach(() => vi.useRealTimers());

  it.each(['ferni', 'peter-john', 'maya-santos', 'nayan-patel', 'alex-chen', 'jordan-taylor'])(
    'are Ferni phrases for %s',
    (personaId) => {
      vi.useFakeTimers();
      const phrases = shownPhrases(personaId);
      expect(phrases.size).toBeGreaterThan(1);
      for (const phrase of phrases) {
        expect(phrase).not.toMatch(RETIRED_PHRASES);
        expect(phrase).not.toMatch(/\.\.\.|…|—/);
      }
    }
  );
});
