/**
 * Per-persona AI role label ("AI life coach", "AI habits coach", ...).
 *
 * The label is also the app's AI disclosure (companion-chatbot laws such as
 * California SB 243), so every label must say "AI". The key comes from each
 * persona's manifest (identity.role_label) through personas.generated.json.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGENDS, PERSONAS } from '../../src/config/personas.js';
import {
  aiRoleLabel,
  aiRoleLabelKey,
  FALLBACK_ROLE_LABEL_KEY,
  showAiRoleLabel,
} from '../../src/ui/ai-role-label.ui.js';

const INDEX_HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const locale = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../src/i18n/locales/${name}.json`), 'utf8')) as {
    aiLabel: { role: Record<string, string> };
  };

/** The label Seth's team agreed for each speaker, from their manifest role. */
const EXPECTED: Record<string, string> = {
  ferni: 'AI life coach',
  'maya-santos': 'AI habits coach',
  'peter-john': 'AI insights mentor',
  'jordan-taylor': 'AI life planner',
  'alex-chen': 'AI communication coach',
  'nayan-patel': 'AI wisdom guide',
  'john-bogle': 'AI investing mentor', // Henry Caldwell
  'peter-lynch': 'AI stock-picking guide', // Tom Brannigan
  'joel-dickson': 'AI life mentor', // Nate Holloway
};

const ALL_SPEAKERS = [...Object.values(PERSONAS), ...Object.values(LEGENDS)];

function loadMainScreen(): void {
  const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.innerHTML = doc.body.innerHTML;
}

const pill = (): HTMLElement => document.querySelector<HTMLElement>('#coach .ai-companion-label')!;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AI role label per persona', () => {
  it('covers every team member and legend, from their manifest', () => {
    expect(ALL_SPEAKERS.map((p) => p.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const persona of ALL_SPEAKERS) {
      expect(persona.roleLabel, persona.id).toMatch(/^aiLabel\.role\.\w+$/);
      expect(aiRoleLabel(persona), persona.id).toBe(EXPECTED[persona.id]);
    }
  });

  it('always says "AI": every label in en-US and en-GB, and every speaker', () => {
    for (const name of ['en-US', 'en-GB']) {
      const labels = Object.entries(locale(name).aiLabel.role);
      expect(labels.length).toBeGreaterThanOrEqual(ALL_SPEAKERS.length);
      for (const [key, text] of labels) expect(text, `${name} ${key}`).toMatch(/\bAI\b/);
    }
    for (const persona of ALL_SPEAKERS) expect(aiRoleLabel(persona), persona.id).toMatch(/\bAI\b/);
  });

  it('falls back to "AI friend" with no key or an unknown key', () => {
    expect(aiRoleLabel(undefined)).toBe('AI friend');
    expect(aiRoleLabel({ roleLabel: undefined })).toBe('AI friend');
    expect(aiRoleLabelKey({ roleLabel: 'aiLabel.role.noSuchRole' })).toBe(FALLBACK_ROLE_LABEL_KEY);
    expect(aiRoleLabel({ roleLabel: 'aiLabel.role.noSuchRole' })).toBe('AI friend');
  });
});

describe('AI role label on handoff', () => {
  it('follows the active speaker on the main screen, and a locale change keeps it', async () => {
    loadMainScreen();
    const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn(), onfinish: null }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    const { initCoachUI, dispose } = await import('../../src/ui/coach.ui.js');
    const { appState } = await import('../../src/state/app.state.js');
    const { translateStaticDom } = await import('../../src/i18n/static-dom.js');
    initCoachUI();
    appState.set('activePersona', PERSONAS.ferni);
    expect(pill().textContent).toBe('AI life coach');

    appState.set('activePersona', PERSONAS['maya-santos']);
    expect(pill().textContent).toBe('AI habits coach');
    appState.set('activePersona', LEGENDS['peter-lynch']);
    expect(pill().textContent).toBe('AI stock-picking guide');

    // The static-DOM translator re-reads data-i18n on a locale change
    translateStaticDom();
    expect(pill().textContent).toBe('AI stock-picking guide');
    appState.set('activePersona', PERSONAS.ferni);
    expect(pill().textContent).toBe('AI life coach');
    dispose();
  });

  it('crossfades the words and eases the width, but only fades under reduced motion', async () => {
    for (const reduced of [false, true]) {
      loadMainScreen();
      const label = pill();
      const text = label.querySelector<HTMLElement>('[data-i18n]')!;
      let width = 90;
      vi.spyOn(label, 'getBoundingClientRect').mockImplementation(() => ({ width }) as DOMRect);
      const textAnimate = vi.fn(
        (_frames: Keyframe[]) =>
          ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation
      );
      const pillAnimate = vi.fn(
        () => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation
      );
      Object.defineProperty(text, 'animate', { value: textAnimate, configurable: true });
      Object.defineProperty(label, 'animate', { value: pillAnimate, configurable: true });
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduced } as MediaQueryList);

      showAiRoleLabel(label, PERSONAS['alex-chen']);
      expect(text.dataset.i18n).toBe('aiLabel.role.communicationCoach');
      width = 160; // the new words are wider; measured after the swap
      await vi.waitFor(() => expect(text.textContent).toBe('AI communication coach'));

      const opacities = textAnimate.mock.calls.map(([frames]) => frames.map((f) => f.opacity));
      expect(opacities).toEqual([
        [1, 0],
        [0, 1],
      ]);
      if (reduced) expect(pillAnimate).not.toHaveBeenCalled();
      else
        expect(pillAnimate).toHaveBeenCalledWith(
          [{ width: '90px' }, { width: '160px' }],
          expect.anything()
        );
      vi.restoreAllMocks();
    }
  });
});
