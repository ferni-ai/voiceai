/**
 * AI role label ("Life coach" for Ferni) on the main screen and sign-in gate.
 *
 * A small, persistent, honest label on the main screen and the sign-in gate.
 * It lives in its own element so the relationship-stage subtitle ("I am what
 * you make me", ...) can never overwrite it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn(() => () => undefined),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));

const INDEX_HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

/** The real main-screen markup from index.html. */
function loadMainScreen(): void {
  const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.innerHTML = doc.body.innerHTML;
}

const mainLabel = (): HTMLElement | null => document.querySelector('#coach .ai-companion-label');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AI role label on the main screen', () => {
  it('is rendered next to the name, outside the changing subtitle', async () => {
    loadMainScreen();
    const { translateStaticDom } = await import('../../src/i18n/static-dom.js');
    translateStaticDom();

    const label = mainLabel();
    expect(label?.textContent).toBe('Life coach');
    expect(label?.querySelector('[data-i18n]')?.getAttribute('data-i18n')).toBe('aiLabel.role.lifeCoach');
    expect(document.getElementById('personaSubtitle')!.contains(label)).toBe(false);
    // Right under the name and subtitle, before the roster
    const subtitle = document.getElementById('personaSubtitle')!;
    expect(subtitle.compareDocumentPosition(label!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('survives the relationship-stage subtitle overwrite', async () => {
    loadMainScreen();
    const { translateStaticDom } = await import('../../src/i18n/static-dom.js');
    translateStaticDom();
    const subtitle = document.getElementById('personaSubtitle')!;
    const before = subtitle.textContent;

    // jsdom has no Web Animations; the coach UI bounces the avatar on render.
    const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn(), onfinish: null }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    const { initCoachUI, dispose } = await import('../../src/ui/coach.ui.js');
    const { relationshipStageService } =
      await import('../../src/services/relationship-stage.service.js');
    initCoachUI();
    const stageSubtitle = relationshipStageService.getSubtitle();
    await vi.waitFor(() => expect(subtitle.textContent).toBe(stageSubtitle), { timeout: 3000 });

    expect(subtitle.textContent).not.toBe(before);
    expect(mainLabel()?.textContent).toBe('Life coach');
    dispose();
  });
});

describe('AI role label on the sign-in gate', () => {
  it('is rendered between the avatar and the welcome title', async () => {
    const { showSignInGate, hideSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
    void showSignInGate();

    const overlay = document.querySelector('.sign-in-gate-overlay')!;
    const label = overlay.querySelector('.ai-companion-label');
    expect(label?.textContent).toBe('Life coach');
    const title = overlay.querySelector('.sign-in-gate-title')!;
    expect(label!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    hideSignInGate();
  });
});

describe('AI role label copy', () => {
  it('exists in en-US and en-GB, and no screen says "AI companion" any more', () => {
    for (const locale of ['en-US', 'en-GB']) {
      const raw = readFileSync(resolve(__dirname, `../../src/i18n/locales/${locale}.json`), 'utf8');
      const messages = JSON.parse(raw) as { aiLabel?: { role?: Record<string, string> } };
      expect(messages.aiLabel?.role?.lifeCoach).toBe('Life coach');
      expect(messages.aiLabel?.role?.friend).toBe('Friend');
      expect(raw).not.toMatch(/AI companion/i);
    }
  });
});
