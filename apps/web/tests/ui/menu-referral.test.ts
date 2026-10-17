/**
 * Bring a Friend (menu item 33): the message is the sharer's own draft.
 *
 * The panel used to send text written as them ("it's genuinely changed how I
 * approach my day. Join me!", "You should try Ferni", "an AI companion"). Now a
 * short draft sits in an editable field and what they leave there is sent,
 * with their link added once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() })) as never;

const LINK = 'https://app.ferni.ai/grow/k3j9x2-meadow';
const GARDEN = {
  title: 'seedling',
  totalReferrals: 0,
  totalEarnedFromReferrals: 0,
  referralCode: 'k3j9x2-meadow',
  referralUrl: LINK,
};

await (await import('../../src/i18n/index.js')).initI18n();
const { openReferral, closeReferral } = await import('../../src/ui/referral.ui.js');

const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
const open = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  vi.spyOn(window, 'open').mockImplementation(open);
  apiGet.mockResolvedValue({ ok: true, status: 200, data: GARDEN });
  await openReferral();
});

afterEach(async () => {
  closeReferral();
  await vi.waitFor(() => expect(document.querySelector('.referral-modal')).toBeNull());
});

const draftField = (): HTMLTextAreaElement =>
  document.querySelector<HTMLTextAreaElement>('.referral-modal .referral-draft-text')!;
const click = (action: string): void =>
  document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();

describe('Bring a Friend share text', () => {
  it('starts from a plain draft the person can edit, with no claims made for them', () => {
    const field = draftField();

    expect(field).not.toBeNull();
    expect(field.readOnly).toBe(false);
    expect(field.value).toContain('Ferni');
    const modalText = document.querySelector('.referral-modal')!.textContent ?? '';
    for (const banned of ['remembers everything', 'You should', 'AI', 'Join me']) {
      expect(`${modalText} ${field.value}`).not.toContain(banned);
    }
  });

  it('copies what the person wrote, with their link once', async () => {
    draftField().value = 'Ferni helped me plan the move. Try it?';
    click('copy');

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`Ferni helped me plan the move. Try it?\n\n${LINK}`);
  });

  it('a text message carries the edited draft, and a pasted link is not doubled', () => {
    draftField().value = `here you go ${LINK}`;
    click('sms');

    expect(open).toHaveBeenCalledTimes(1);
    const body = decodeURIComponent(String(open.mock.calls[0]?.[0]).replace('sms:?body=', ''));
    expect(body).toBe(`here you go ${LINK}`);
  });

  it('an email carries the edited draft and a plain subject', () => {
    draftField().value = 'Thought of you.';
    click('email');

    const href = String(open.mock.calls[0]?.[0]);
    const params = new URLSearchParams(href.replace('mailto:?', ''));
    expect(params.get('subject')).toBe('Meet Ferni');
    expect(params.get('body')).toBe(`Thought of you.\n\n${LINK}`);
  });
});
