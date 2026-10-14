/**
 * Build a Ritual, calendar step: the server's time suggestions show up.
 *
 * Before: the client expected "HH:MM" strings and called timeStr.split(':'),
 * but /api/practices/time-suggestions sends objects ({ time, hour, minute,
 * dayOfWeek, reasoning, ... }). The split threw, the catch swallowed it, and
 * no suggestion was ever shown.
 */

import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet }));

const { getRitualBuilderUI } = await import('../../src/ui/ritual-builder.ui.js');

describe('Build a Ritual time suggestions', () => {
  it("shows the server's suggested times", async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        suggestions: [
          {
            time: '2026-10-13T07:30:00.000Z',
            hour: 7,
            minute: 30,
            dayOfWeek: 'Tuesday',
            confidence: 0.9,
            reasoning: 'Free before your first meeting',
            freeMinutes: 45,
          },
        ],
      },
    });
    Element.prototype.animate ??= vi.fn(() => ({}) as Animation);
    const ui = getRitualBuilderUI();
    ui.show();

    await (ui as unknown as { fetchTimeSuggestions(): Promise<void> }).fetchTimeSuggestions();

    expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/api/practices/time-suggestions?'));
    const items = document.querySelectorAll<HTMLElement>('.ritual-builder__suggestion-item');
    expect(items).toHaveLength(1);
    expect(items[0].dataset.hour).toBe('7');
    expect(items[0].dataset.minute).toBe('30');
    expect(items[0].textContent).toContain('7:30');
    expect(items[0].textContent).toContain('Free before your first meeting');
  });
});
