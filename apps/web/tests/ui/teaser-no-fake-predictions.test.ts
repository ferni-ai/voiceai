/**
 * Teaser previews show no made-up prediction results.
 *
 * Before: a predictions teaser rendered three invented predictions marked
 * "Accurate" / "Watching" ("You'd feel overwhelmed this week", "You skipped 2
 * sessions this week") over a hard-coded "78% Prediction accuracy". Nothing
 * called it; it is removed rather than left to be wired up.
 */

import { describe, expect, it } from 'vitest';

const { teaserPreview } = await import('../../src/ui/teaser-preview.ui.js');
const { t } = await import('../../src/i18n/index.js');

describe('teaser previews', () => {
  it('render no invented prediction results or accuracy', () => {
    const helpers = Object.entries(teaserPreview).filter(
      (entry): entry is [string, () => HTMLElement] => typeof entry[1] === 'function'
    );
    expect(helpers.length).toBeGreaterThan(5);

    for (const [name, render] of helpers) {
      const text = render().textContent ?? '';
      expect(text, name).not.toContain(t('predictions.accurate'));
      expect(text, name).not.toContain('78%');
      expect(text, name).not.toMatch(/overwhelmed this week|gym habit/);
    }
  });
});
