/**
 * Voice re-enroll card: it is a role="dialog", so Escape closes it the way the
 * close button does, focus moves into it and comes back afterwards, and it
 * clears the home indicator on notched phones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VOICE_REENROLL_ANSWERED_KEY,
  hideVoiceReenrollCard,
  showVoiceReenrollCard,
} from '../src/ui/voice-reenroll-card.ui';

const card = (): HTMLElement | null => document.querySelector('.voice-reenroll-card');
const press = (key: string): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

let opener: HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<button id="opener">Open</button>';
  opener = document.getElementById('opener') as HTMLButtonElement;
  opener.focus();
});

afterEach(() => {
  hideVoiceReenrollCard();
  document.body.innerHTML = '';
});

describe('voice re-enroll card', () => {
  it('moves focus into the card when it opens', () => {
    expect(document.activeElement).toBe(opener);
    showVoiceReenrollCard(() => undefined);
    expect(card()?.contains(document.activeElement)).toBe(true);
  });

  it('Escape dismisses it, remembers the answer and returns focus', () => {
    const start = vi.fn();
    showVoiceReenrollCard(start);
    expect(card()).not.toBeNull();

    press('Escape');

    expect(card()).toBeNull();
    expect(localStorage.getItem(VOICE_REENROLL_ANSWERED_KEY)).toBe('dismissed');
    expect(document.activeElement).toBe(opener);
    expect(start).not.toHaveBeenCalled();
  });

  it('other keys leave it open', () => {
    showVoiceReenrollCard(() => undefined);
    press('Enter');
    press('a');
    expect(card()).not.toBeNull();
    expect(localStorage.getItem(VOICE_REENROLL_ANSWERED_KEY)).toBeNull();
  });

  it('returns focus after "Sure" too, before enrollment starts', () => {
    let focusedAtStart: Element | null = null;
    showVoiceReenrollCard(() => {
      focusedAtStart = document.activeElement;
    });
    card()!.querySelector<HTMLElement>('[data-action="accept"]')!.click();
    expect(card()).toBeNull();
    expect(focusedAtStart).toBe(opener);
  });

  it('stops listening for Escape once closed', () => {
    showVoiceReenrollCard(() => undefined);
    card()!.querySelector<HTMLElement>('[data-action="dismiss"]')!.click();
    localStorage.clear();
    press('Escape');
    // A stale listener would write the answer again.
    expect(localStorage.getItem(VOICE_REENROLL_ANSWERED_KEY)).toBeNull();
  });

  it('sits above the bottom safe-area inset', () => {
    showVoiceReenrollCard(() => undefined);
    const css = document.getElementById('voice-reenroll-card-styles')!.textContent ?? '';
    const rule = css.match(/\.voice-reenroll-card \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/bottom:\s*calc\(var\(--ma-silence\) \+ var\(--safe-bottom\)\);/);
  });
});
