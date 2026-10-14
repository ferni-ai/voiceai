/**
 * The slot under the avatar has one owner: handoff caption > status whisper >
 * thinking indicator. Drives the real whisperStatus (what messageUI.show calls)
 * against the slot's DOM from index.html (minus the animated avatar and ring,
 * which jsdom can't animate), with the slot stylesheet loaded so visibility is
 * the cascade's answer, not a class name check.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispose, initAvatarFeedback, whisperStatus } from '../../src/ui/avatar-feedback.ui.js';
import { HANDOFF_CLASS, STALE_WHISPER_MS } from '../../src/ui/avatar-slot.ui.js';
import { HANDING_OFF_CLASS } from '../../src/ui/handoff-presence.ui.js';

const SLOT_CSS = readFileSync(
  join(__dirname, '..', '..', 'src', 'styles', 'avatar-slot.css'),
  'utf8'
);

function el(selector: string): HTMLElement {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`missing ${selector}`);
  return found;
}

const coach = (): HTMLElement => el('#coach');
const container = (): HTMLElement => el('.avatar-container');
const thinking = (): HTMLElement => el('#thinkingFloat');
const whisper = (): HTMLElement => el('#statusWhisper');
const visibility = (node: HTMLElement): string => getComputedStyle(node).visibility;
const whisperShowing = (): boolean => whisper().style.opacity === '1';

/** MutationObserver callbacks run as microtasks. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = `<style>${SLOT_CSS}</style>`;
  document.body.innerHTML = `
    <div id="coach">
      <div class="avatar-container">
        <div class="thinking-float" id="thinkingFloat"></div>
      </div>
    </div>`;
  initAvatarFeedback();
});

afterEach(() => {
  dispose();
  vi.useRealTimers();
});

describe('status whisper vs thinking indicator', () => {
  it('hides the thinking indicator while a whisper shows and brings it back after', () => {
    coach().classList.add('is-thinking');
    expect(visibility(thinking())).toBe('visible');

    whisperStatus('Your summary is ready', 'success', 1000);
    expect(whisperShowing()).toBe(true);
    expect(visibility(thinking())).toBe('hidden');

    vi.advanceTimersByTime(1000);
    expect(whisperShowing()).toBe(false);
    expect(coach().classList.contains('is-thinking')).toBe(true);
    expect(visibility(thinking())).toBe('visible');
  });
});

describe('status whisper vs handoff caption', () => {
  it('reads the same class the handoff presence sets', () => {
    expect(HANDOFF_CLASS).toBe(HANDING_OFF_CLASS);
  });

  it('waits for the handoff to end, then shows only the latest whisper', async () => {
    container().classList.add(HANDOFF_CLASS);

    whisperStatus('Call complete', 'success', 2000);
    whisperStatus('Found three options', 'info', 2000);
    await flush();
    expect(whisperShowing()).toBe(false);

    vi.advanceTimersByTime(1000);
    container().classList.remove(HANDOFF_CLASS);
    await flush();

    expect(whisperShowing()).toBe(true);
    expect(whisper().textContent).toBe('Found three options');
  });

  it('drops a whisper that went stale while the handoff ran', async () => {
    container().classList.add(HANDOFF_CLASS);
    whisperStatus('Call complete', 'success', 2000);

    vi.advanceTimersByTime(STALE_WHISPER_MS + 1);
    container().classList.remove(HANDOFF_CLASS);
    await flush();

    expect(whisperShowing()).toBe(false);
    expect(whisper().textContent).not.toBe('Call complete');
  });

  it('hides a whisper that was already showing when a handoff starts', () => {
    whisperStatus('Saved', 'success', 3000);
    expect(visibility(whisper())).toBe('visible');

    container().classList.add(HANDOFF_CLASS);
    expect(visibility(whisper())).toBe('hidden');
  });
});

describe('avatar feedback text is translated', () => {
  const dir = join(__dirname, '..', '..', 'src', 'i18n', 'locales');
  const locales = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('covers all 11 locales', () => {
    expect(locales).toHaveLength(11);
  });

  for (const file of locales) {
    it(`${file} has avatarFeedback.nomNom, without emoji`, () => {
      const value: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8')).avatarFeedback
        ?.nomNom;
      expect(typeof value).toBe('string');
      expect(String(value).trim()).not.toBe('');
      expect(String(value)).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  }

  it('avatar-feedback.ui.ts no longer hardcodes the English', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'src', 'ui', 'avatar-feedback.ui.ts'),
      'utf8'
    );
    expect(src).not.toContain("'Nom nom!'");
    expect(src).toContain("t('avatarFeedback.nomNom')");
  });
});
