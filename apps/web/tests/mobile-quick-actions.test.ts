/**
 * The phone quick-actions sheet: every action has to show something.
 *
 * The signed-in e2e walk on a phone found Team did nothing. The base Modal
 * (Meet Your Team) and the shared engagement styles both style .ferni-modal,
 * and the shared styles keep it at visibility: hidden until it carries
 * .ferni-modal--visible, which the base Modal never added: it opened, logged
 * "opened", and stayed invisible. History opened but announced itself as a
 * sidebar, not the modal dialog it is.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

const { SHARED_STYLES } = await import('../src/ui/engagement-components.js');

// jsdom has no Web Animations API; the modal's fade is decoration here
HTMLElement.prototype.animate ??= vi.fn() as unknown as HTMLElement['animate'];

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('Meet Your Team', () => {
  it('is visible once opened, with the shared modal styles on the page', async () => {
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = SHARED_STYLES;
    const { showTeamIntro, hideTeamIntro } = await import('../src/ui/team-intro.ui.js');

    showTeamIntro();
    const modal = document.querySelector<HTMLElement>('.ferni-modal');
    expect(modal).not.toBeNull();
    expect(getComputedStyle(modal as HTMLElement).visibility).toBe('visible');

    hideTeamIntro();
    expect(modal?.classList.contains('ferni-modal--visible')).toBe(false);
  });
});

describe('Your Journey (history)', () => {
  it('is a modal dialog', async () => {
    const { getConversationHistoryUI } = await import('../src/ui/conversation-history.ui.js');
    getConversationHistoryUI().showLoading();
    const panel = document.querySelector('.history');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
  });
});
