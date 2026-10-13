/**
 * In-call feedback pills share one bottom-centre slot.
 *
 * Both pills used to sit on the round call buttons (daily practice,
 * predictions, insights) at 390 and 1440 wide, and when both were up the
 * memory pill (z 3000) covered the contextual one (z 20). Now both sit in one
 * slot just above the bottom safe area, one at a time, and "Tap to hear
 * Ferni" outranks them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: { getRoom: () => null },
}));
vi.mock('../../src/utils/api.js', () => ({
  apiPost: vi.fn(() => Promise.resolve({ ok: true, status: 200 })),
}));

import * as contextual from '../../src/ui/contextual-feedback.ui.js';
import {
  showMemoryFeedback,
  dismissMemoryFeedback,
  resetMemoryFeedbackManager,
} from '../../src/ui/memory-feedback.ui.js';
import {
  bottomSlotHolder,
  resetBottomSlot,
  SLOT_BOTTOM,
  SLOT_BOTTOM_PHONE,
} from '../../src/ui/bottom-feedback-slot.js';
import { DURATION } from '../../src/config/animation-constants.js';

const MEMORY = { memoryId: 'm1', memoryContent: 'You prefer morning check-ins', userId: 'u1' };

const contextualShowing = (): boolean =>
  document.querySelector('.contextual-feedback--visible') !== null;
/** The memory pill is in the page (it fades in on the next frame). */
const memoryShowing = (): boolean => document.querySelector('.memory-feedback') !== null;

/** Let the outgoing pill finish fading before the next one is granted. */
const afterFade = (): void => {
  vi.advanceTimersByTime(DURATION.NORMAL + 1);
};

describe('bottom feedback slot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    resetBottomSlot();
    resetMemoryFeedbackManager();
    contextual.dispose();
    contextual.initContextualFeedbackUI();
  });

  afterEach(() => {
    contextual.dispose();
    resetMemoryFeedbackManager();
    resetBottomSlot();
    vi.useRealTimers();
  });

  it('shows one pill at a time: the memory pill waits until the contextual one leaves', () => {
    contextual.show();
    showMemoryFeedback(MEMORY);

    expect(contextualShowing()).toBe(true);
    expect(memoryShowing()).toBe(false);

    contextual.hide();
    expect(memoryShowing()).toBe(false); // still fading the contextual pill out
    afterFade();

    expect(contextualShowing()).toBe(false);
    expect(memoryShowing()).toBe(true);
    expect(bottomSlotHolder()).toBe('memory-feedback');
  });

  it('shows the contextual pill after the memory pill is dismissed, never both', () => {
    showMemoryFeedback(MEMORY);
    contextual.show();

    expect(memoryShowing()).toBe(true);
    expect(contextualShowing()).toBe(false);

    dismissMemoryFeedback();
    afterFade();

    expect(contextualShowing()).toBe(true);
  });

  it('drops a memory prompt that waited its whole lifetime for the slot', () => {
    contextual.show();
    showMemoryFeedback(MEMORY);

    vi.advanceTimersByTime(10_000 + 1);
    contextual.hide();
    afterFade();

    expect(memoryShowing()).toBe(false);
    expect(bottomSlotHolder()).toBeNull();
  });

  it('waits while "Tap to hear Ferni" is showing, then shows', async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="tap-to-hear" role="status"><button>Tap to hear Ferni</button></div>'
    );

    contextual.show();
    expect(contextualShowing()).toBe(false);

    (document.querySelector('.tap-to-hear') as HTMLElement).hidden = true;
    await vi.waitFor(() => expect(contextualShowing()).toBe(true));
  });

  it('puts both pills in the bottom slot, not over the call buttons', () => {
    contextual.show();
    showMemoryFeedback(MEMORY);
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');

    for (const pill of ['.contextual-feedback', '.memory-feedback']) {
      const rules = [...css.matchAll(new RegExp(`\\${pill}\\s*\\{([^}]*)\\}`, 'g'))].map(
        (m) => m[1]
      );
      const bottoms = rules.flatMap((r) => [...r.matchAll(/bottom:\s*([^;]+);/g)].map((m) => m[1]));
      expect(bottoms, pill).toEqual([SLOT_BOTTOM, SLOT_BOTTOM_PHONE]);
    }
  });
});
