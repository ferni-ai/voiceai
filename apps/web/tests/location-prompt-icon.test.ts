/**
 * The location prompt's icon is a decorative SVG in the shared icon style, not
 * an emoji (apps/web/CLAUDE.md: no emoji in UI). Checked for every context.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  hideLocationPrompt,
  showLocationPrompt,
  type LocationPromptContext,
} from '../src/ui/location-prompt.ui';

const EMOJI = /\p{Extended_Pictographic}/u;
const CONTEXTS: LocationPromptContext[] = ['weather', 'events', 'timezone', 'personalization'];

afterEach(() => {
  hideLocationPrompt();
  document.body.innerHTML = '';
});

describe('location prompt icon', () => {
  it.each(CONTEXTS)('%s: markup has no emoji and the icon is an aria-hidden SVG', (context) => {
    void showLocationPrompt(context);
    const overlay = document.querySelector('.ferni-location-prompt-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.innerHTML).not.toMatch(EMOJI);

    const icon = overlay!.querySelector('.ferni-location-prompt-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    const svg = icon?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('stroke')).toBe('currentColor');
    expect(icon!.textContent?.trim()).toBe('');
  });
});
