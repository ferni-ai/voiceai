import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastInfo, calendar } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  calendar: { setCalendarViewCallbacks: vi.fn(), showCalendarView: vi.fn() },
}));
vi.mock('../src/ui/whisper.ui.js', () => ({ toastInfo }));
vi.mock('../src/ui/calendar-view.ui.js', () => calendar);

// A tab left open across a deploy: its old chunk name is gone.
vi.mock('../src/ui/game-picker.ui.js', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const { openCalendarView, openGamePicker } = await import('../src/ui/lazy-screens');

describe('lazy screens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a screen once its chunk loads, with its callbacks wired', async () => {
    await openCalendarView();
    expect(calendar.setCalendarViewCallbacks).toHaveBeenCalledWith(
      expect.objectContaining({ onConnectCalendar: expect.any(Function) })
    );
    expect(calendar.showCalendarView).toHaveBeenCalledOnce();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('tells the user to refresh when a chunk fails to load, instead of doing nothing', async () => {
    await expect(openGamePicker()).resolves.toBeUndefined();
    expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/refresh.*games/i));
  });
});
