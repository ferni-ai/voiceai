/**
 * Predictions with none made yet: say what the feature is (a "predict your
 * week" game with Peter on a call) and that results show up here. No made-up
 * predictions and no made-up accuracy.
 *
 * Before: a "Preview" of three predictions marked "Accurate" / "Watching"
 * ("You'd feel overwhelmed this week", "The gym habit would struggle"), a
 * hard-coded 78% prediction accuracy, and copy about anticipating needs.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/better-than-human.ui.js', () => ({ playMicroExpression: vi.fn() }));

const { getPredictionsUI } = await import('../../src/ui/predictions.ui.js');
const { t } = await import('../../src/i18n/index.js');

describe('Predictions, none yet', () => {
  it('describes the predict-your-week game with no sample predictions or accuracy', async () => {
    getPredictionsUI().show();
    await new Promise((r) => setTimeout(r, 0));

    const text = document.getElementById('predictions-content')?.textContent ?? '';
    expect(text).toContain(t('predictions.title'));
    expect(text).toContain(t('predictions.ctaText'));
    expect(text).toContain('Peter');
    expect(text).not.toMatch(/78|%|Accurate|Watching|overwhelmed|gym habit|Sunday evening/);
    expect(document.querySelector('.predictions-empty__sample')).toBeNull();
  });
});
