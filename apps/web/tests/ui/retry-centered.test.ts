/**
 * "Try again" sits centered under the message in the outreach and history error states.
 *
 * 2026-10-18 UI audit: in When I'll Reach Out (both tabs) the button hugged the
 * left edge under centered text: it is display: flex, so it is block-level and
 * text-align can't center it. In When We've Talked it ran on inline after the
 * sentence. jsdom has no layout, so this checks the rules that do the centering.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 500, error: 'boom' })),
}));

const { showLoadProblem } = await import('../../src/ui/outreach-history-view.js');
const outreach = await import('../../src/ui/outreach-schedule.ui.js');
const { getConversationHistoryUI } = await import('../../src/ui/conversation-history.ui.js');

afterEach(() => {
  document.body.innerHTML = '';
});

const cssRule = (selector: string): string => {
  const css = [...document.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

describe('When I\'ll Reach Out: load error', () => {
  it('centers Try again under the message and retries on click', () => {
    outreach.initializeOutreachScheduleUI();
    const root = document.createElement('div');
    const content = document.createElement('div');
    root.appendChild(content);
    document.body.appendChild(root);
    const retry = vi.fn();
    showLoadProblem(root, content, 'error', retry);

    const button = content.querySelector<HTMLButtonElement>('[data-load-action]');
    expect(button?.classList.contains('outreach-schedule-empty-action')).toBe(true);
    const rule = cssRule('.outreach-schedule-empty-action');
    expect(rule).toMatch(/margin:\s*16px auto 0/);
    expect(rule).toMatch(/flex:\s*none/);
    button?.click();
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("When We've Talked: load error", () => {
  it('puts Try again on its own centered line, not inline after the sentence', () => {
    const onRetry = vi.fn();
    getConversationHistoryUI().showError(onRetry);
    const error = document.querySelector<HTMLElement>('.history__error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.style.display).toBe('flex');
    expect(error?.style.flexDirection).toBe('column');
    expect(error?.style.alignItems).toBe('center');
    const button = error?.querySelector<HTMLButtonElement>('button');
    expect(button?.previousElementSibling?.tagName).toBe('P');
    button?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
