/**
 * A panel config/menu-visibility.ts hides opens from no path.
 *
 * Before (2026-10-25 menu audit): the `ferni:open-quiz`, music, household,
 * voice-id, patterns and marketplace listeners in app.ts opened their panel
 * for any dispatcher; they were safe only while every dispatcher checked. And
 * the voice re-enroll card opened Recognizing You (hidden in prod) directly.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real predicates, wrapped so a test can say "this panel is visible now".
vi.mock('../../src/config/menu-visibility.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/menu-visibility.js')>();
  return {
    ...actual,
    isPanelVisible: vi.fn(actual.isPanelVisible),
    isPanelEventVisible: vi.fn(actual.isPanelEventVisible),
  };
});

const visibility = await import('../../src/config/menu-visibility.js');
const actual = await vi.importActual<typeof import('../../src/config/menu-visibility.js')>(
  '../../src/config/menu-visibility.js'
);
const { GATED_PANEL_EVENTS, bindPanelOpeners } = await import('../../src/app/panel-openers.js');
const { appState } = await import('../../src/state/app.state.js');
const { VOICE_REENROLL_ANSWERED_KEY, hideVoiceReenrollCard, offerVoiceReenroll } =
  await import('../../src/ui/voice-reenroll-card.ui.js');

type GatedPanelEvent = (typeof GATED_PANEL_EVENTS)[number];

const opened: string[] = [];
const unbind: Array<() => void> = [];

/** What app.ts registers, with each opener recording its event instead of opening a panel. */
function bindLikeApp(): void {
  const openers = Object.fromEntries(
    GATED_PANEL_EVENTS.map((name) => [name, () => opened.push(name)])
  ) as Record<GatedPanelEvent, () => void>;
  bindPanelOpeners((name, listener) => {
    window.addEventListener(name, listener);
    unbind.push(() => window.removeEventListener(name, listener));
  }, openers);
}

const dispatchAll = (): void =>
  GATED_PANEL_EVENTS.forEach((name) => window.dispatchEvent(new CustomEvent(name)));

/** Pretend menu-visibility shows these panels too. */
function showPanels(...panels: string[]): void {
  vi.mocked(visibility.isPanelVisible).mockImplementation(
    (panel) => panels.includes(panel) || actual.isPanelVisible(panel)
  );
  vi.mocked(visibility.isPanelEventVisible).mockImplementation(
    (event) =>
      panels.some((panel) => event === `ferni:open-${panel}`) || actual.isPanelEventVisible(event)
  );
}

beforeEach(() => {
  opened.length = 0;
  bindLikeApp();
});

afterEach(() => {
  unbind.splice(0).forEach((fn) => fn());
  vi.mocked(visibility.isPanelVisible).mockImplementation(actual.isPanelVisible);
  vi.mocked(visibility.isPanelEventVisible).mockImplementation(actual.isPanelEventVisible);
  vi.unstubAllEnvs();
});

describe('hidden-panel listeners', () => {
  it('covers the five audited panels plus Predictions and Meet More Friends', () => {
    expect([...GATED_PANEL_EVENTS].sort()).toEqual(
      [
        'ferni:open-household',
        'ferni:open-marketplace',
        'ferni:open-music',
        'ferni:open-patterns',
        'ferni:open-predictions',
        'ferni:open-quiz',
        'ferni:open-voice-id',
      ].sort()
    );
  });

  it('a dispatched event opens nothing while its panel is hidden', () => {
    // the real config: every one of these is hidden (Your Patterns by its flag)
    GATED_PANEL_EVENTS.forEach((name) => expect(visibility.isPanelEventVisible(name)).toBe(false));
    dispatchAll();
    expect(opened).toEqual([]);
  });

  it('Your Patterns opens once its flag is on, and only it', () => {
    vi.stubEnv('VITE_PATTERN_INSIGHTS', 'true');
    dispatchAll();
    expect(opened).toEqual(['ferni:open-patterns']);
  });

  it.each(GATED_PANEL_EVENTS.map((name) => [name]))(
    '%s opens its own panel once that panel is visible',
    (name) => {
      showPanels(name.slice('ferni:open-'.length));
      dispatchAll();
      expect(opened).toEqual([name]);
    }
  );
});

describe('app.ts wiring', () => {
  const app = readFileSync(resolve(__dirname, '../../src/app.ts'), 'utf8');

  it('registers the gated openers on window, with the real panels', () => {
    expect(app).toMatch(
      /bindPanelOpeners\(\(name, listener\) => this\.addTrackedListener\(window, name, listener\), \{/
    );
    const block = app.slice(
      app.indexOf('bindPanelOpeners('),
      app.indexOf('});', app.indexOf('bindPanelOpeners('))
    );
    expect(block).toContain("'ferni:open-quiz': () => void openKnowledgeQuiz()");
    expect(block).toContain("'ferni:open-voice-id': () => void showVoiceEnrollmentModal()");
    expect(block).toContain("'ferni:open-music': () => void openMusicDashboard()");
    expect(block).toContain("'ferni:open-household': () => void showHouseholdManager()");
    expect(block).toContain('void showPatternInsights(');
  });

  it('opens no hidden panel through a listener that skips the check', () => {
    const direct = [
      ...app.matchAll(/addTrackedListener\(\s*(?:window|document),\s*'ferni:open-([\w-]+)'[^\n]*/g),
    ];
    const ungated = direct
      .filter(([, panel]) => !visibility.isPanelVisible(panel as string))
      .filter(([line]) => !line.includes('isPanelEventVisible('))
      .map(([, panel]) => panel);
    expect(ungated).toEqual([]);
  });

  it('skips the voice re-enrollment check while Recognizing You is hidden', () => {
    const check = app.slice(app.indexOf('private async checkVoiceReEnrollment'));
    expect(check.slice(0, check.indexOf('try {'))).toContain(
      "if (!isPanelVisible('voice-id')) return;"
    );
  });
});

describe('voice re-enroll card', () => {
  const profile = { enrolled: true, needsReenrollment: true };
  const card = (): HTMLElement | null => document.querySelector('.voice-reenroll-card');

  beforeEach(() => {
    localStorage.removeItem(VOICE_REENROLL_ANSWERED_KEY);
    appState.set('connection', 'disconnected');
  });
  afterEach(() => {
    hideVoiceReenrollCard();
    document.body.innerHTML = '';
  });

  it('never shows while Recognizing You is hidden, so nothing can open it', () => {
    const startEnrollment = vi.fn();
    expect(offerVoiceReenroll(profile, startEnrollment)).toBe(false);
    expect(card()).toBeNull();
    expect(startEnrollment).not.toHaveBeenCalled();
  });

  it('shows once Recognizing You is visible, and "Sure" opens enrollment', () => {
    showPanels('voice-id');
    const startEnrollment = vi.fn();
    expect(offerVoiceReenroll(profile, startEnrollment)).toBe(true);
    card()!.querySelector<HTMLElement>('[data-action="accept"]')!.click();
    expect(startEnrollment).toHaveBeenCalledOnce();
  });
});
