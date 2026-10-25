/**
 * Honesty: the menu's panels show no invented or gamified numbers, and a
 * failed request shows an honest error, never stand-in content.
 *
 * Before:
 * - "N days in a row" and day streaks (seeds card, Chronicle), and a "Streak
 *   Milestones" notification toggle, because VITE_NO_STREAKS defaulted off;
 * - "{n}% sure" on every learned memory; permanent "NEW" badges on Memory
 *   Lane, This Year Together, the Quiz and three games;
 * - Music's "DNA confidence" percentage, computed from how many sources were
 *   connected, not from anything known;
 * - on failure: random canned Sanctuary replies in Ferni's voice, two generic
 *   quiz questions dressed as "how well do you know me", and an empty
 *   Chronicle with stand-in tips.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
  getUserId: vi.fn(() => 'user-1'),
}));
vi.mock('../../src/utils/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/api.js')>()),
  ...api,
}));
vi.mock('../../src/services/firebase-auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/firebase-auth.service.js')>()),
  getAuthState: () => ({ isAuthenticated: true }),
}));

const { t } = await import('../../src/i18n/index.js');

const failed = { ok: false, status: 500, error: 'boom' };

/** Visible text and accessible labels: what a person reads or hears. */
function visibleText(root: ParentNode = document.body): string {
  const labels = [...root.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
  return `${(root as HTMLElement).textContent ?? ''}\n${labels.join('\n')}`;
}

/** The phrases no panel may show. */
function expectHonest(text: string): void {
  expect(text).not.toMatch(/in a row/i);
  expect(text).not.toMatch(/streak/i);
  expect(text).not.toMatch(/% sure/i);
  expect(text).not.toMatch(/\bNEW\b/);
  expect(text).not.toMatch(/\bAI\b/);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getUserId.mockReturnValue('user-1');
  api.apiGet.mockResolvedValue(failed);
  api.apiPost.mockResolvedValue(failed);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllEnvs();
});

describe('no streaks unless a build asks for them', () => {
  it('is on by default and only VITE_NO_STREAKS=false turns it off', async () => {
    const { isNoStreaksOn } = await import('../../src/config/no-streaks.js');
    vi.stubEnv('VITE_NO_STREAKS', undefined as unknown as string);
    expect(isNoStreaksOn()).toBe(true);
    vi.stubEnv('VITE_NO_STREAKS', 'false');
    expect(isNoStreaksOn()).toBe(false);
  });
});

describe('the settings menu', () => {
  it('shows no NEW badge, streak, percentage or "AI" in its labels', async () => {
    const { relationshipStageService } =
      await import('../../src/services/relationship-stage.service.js');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    const { getSettingsMenuUI, initSettingsMenuUI } =
      await import('../../src/ui/settings-menu.ui.js');
    initSettingsMenuUI({});
    getSettingsMenuUI().show();

    expect(document.querySelector('.settings-menu__nav .settings-menu__badge')).toBeNull();
    expectHonest(visibleText(document.querySelector('.settings-menu__nav') as HTMLElement));
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
  });
});

describe('When I\'ll Check In', () => {
  it('has no Streak Milestones toggle', async () => {
    const { showNotificationSettings, hideNotificationSettings } =
      await import('../../src/ui/notification-settings.ui.js');
    showNotificationSettings();

    expect(document.querySelector('[data-pref="streakMilestones"]')).toBeNull();
    expect(document.querySelector('[data-pref="enabled"]')).not.toBeNull();
    expectHonest(visibleText(document.querySelector('.notif-settings') as HTMLElement));
    hideNotificationSettings();
  });
});

describe('What I\'ve learned', () => {
  it('shows a memory without a made-up certainty', async () => {
    const { getCognitiveInsightsUI } = await import('../../src/ui/cognitive-insights.ui.js');
    getCognitiveInsightsUI().show({
      memories: [
        { id: 'm1', type: 'fact', content: 'Has a sister named Ana', confidence: 0.87, source: 'call' },
      ],
      patterns: [],
      totalInteractions: 3,
    });

    expect(document.body.textContent).toContain('Has a sister named Ana');
    expect(document.body.textContent).not.toContain('87');
    expectHonest(visibleText());
  });
});

describe("Let's Play", () => {
  it('marks no game NEW', async () => {
    const { gamePicker } = await import('../../src/ui/game-picker.ui.js');
    gamePicker.show();
    await flush();

    expect(document.querySelectorAll('.game-card').length).toBeGreaterThan(0);
    expect(document.querySelector('.game-card__badge--new')).toBeNull();
    expectHonest(visibleText(document.querySelector('.game-card')?.closest('[role="dialog"], body') ?? document.body));
  });
});

describe('Music sources', () => {
  it('shows what is connected, with no invented "DNA confidence" percentage', async () => {
    const { musicDashboard } = await import('../../src/ui/music-dashboard.ui.js');
    const ui = musicDashboard as unknown as {
      profileData: unknown;
      renderMusicSources(): string;
    };
    ui.profileData = { musicSources: { games: { gamesPlayed: 4 }, spotify: { connected: true, trackCount: 12 } } };
    const html = ui.renderMusicSources();

    expect(html).not.toContain('music-sources__confidence');
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain(t('musicDashboard.sources.dnaConfidence'));
  });
});

describe('a failed request shows an honest error, never stand-in content', () => {
  it('Sanctuary: Ferni says the reply failed instead of a canned answer', async () => {
    vi.stubEnv('VITE_SANCTUARY_CHAT', 'true'); // the chat step is off by default (sanctuary-chat-flag.ts)
    const { startPractice, close } = await import('../../src/ui/practice-experience.ui.js');
    startPractice({ id: 'something-new', name: 'Something new', description: '', category: 'test' });
    document.querySelector<HTMLElement>('#nav-next')?.click(); // intro -> chat
    const input = document.querySelector<HTMLTextAreaElement>('#chat-input');
    expect(input).not.toBeNull();
    (input as HTMLTextAreaElement).value = 'rough day';
    document.querySelector<HTMLElement>('#chat-send')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.practice-chat-message.thinking')).toBeNull()
    );

    const replies = [...document.querySelectorAll('.practice-chat-message.ferni')].map((el) =>
      el.textContent?.trim()
    );
    expect(replies.at(-1)).toContain(t('practiceExperience.errorMessage'));
    for (const n of [1, 2, 3, 4]) {
      expect(document.body.textContent).not.toContain(t(`practiceExperience.fallback.default.option${n}`));
    }
    close();
    vi.unstubAllEnvs();
  });

  it('Knowledge Quiz: no generic questions when the quiz fails to load', async () => {
    const { openKnowledgeQuiz, disposeKnowledgeQuizUI } =
      await import('../../src/ui/knowledge-quiz.ui.js');
    await openKnowledgeQuiz();
    await vi.waitFor(() => expect(document.querySelector('.knowledge-quiz-unavailable')).not.toBeNull());

    expect(document.body.textContent).not.toContain(t('knowledgeQuiz.defaultQuestion1'));
    expect(document.querySelector('.knowledge-quiz-option')).toBeNull();
    const message = document.querySelector('.knowledge-quiz-unavailable');
    expect(message?.getAttribute('data-state')).toBe('error');
    expect(message?.textContent).toBe(t('knowledgeQuiz.loadFailed'));
    disposeKnowledgeQuizUI();
  });

  it('Knowledge Quiz: no questions yet says so, without inventing any', async () => {
    api.apiGet.mockResolvedValue({ ok: true, status: 200, data: { questions: [] } });
    const { openKnowledgeQuiz, disposeKnowledgeQuizUI } =
      await import('../../src/ui/knowledge-quiz.ui.js');
    await openKnowledgeQuiz();
    await vi.waitFor(() => expect(document.querySelector('.knowledge-quiz-unavailable')).not.toBeNull());

    const message = document.querySelector('.knowledge-quiz-unavailable');
    expect(message?.getAttribute('data-state')).toBe('empty');
    expect(document.querySelector('.knowledge-quiz-option')).toBeNull();
    disposeKnowledgeQuizUI();
  });

  it('The Chronicle: a failed load is an error, not an empty journal with tips', async () => {
    const { openChronicle, close } = await import('../../src/ui/chronicle.ui.js');
    openChronicle();
    await vi.waitFor(() => expect(document.querySelector('[data-state="error"]')).not.toBeNull());

    expect(document.body.textContent).toContain(t('chronicle.loadFailed'));
    expect(document.body.textContent).not.toContain(t('chronicle.emptyDescription'));
    expect(document.body.textContent).not.toContain(
      t('chronicle.defaultInsights.startJourney.title')
    );
    close();
  });

  it('The Chronicle: no patterns yet says so, with no stand-in tips', async () => {
    api.apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        recentEntries: [{ id: 'e1', content: 'Walked by the river', type: 'text', createdAt: '2026-10-16T10:00:00Z' }],
        insights: [],
        prompts: [],
        stats: { totalEntries: 1, currentStreak: 0, entriesThisWeek: 1, topThemes: [] },
      },
    });
    const { openChronicle, close } = await import('../../src/ui/chronicle.ui.js');
    openChronicle();
    await vi.waitFor(() => expect(document.querySelector('.chronicle-stats')).not.toBeNull());

    expect(document.querySelector('#chronicle-content [data-state="empty"]')?.textContent).toBe(
      t('chronicle.noPatternsYet')
    );
    expect(document.body.textContent).not.toContain(t('chronicle.defaultInsights.startJourney.title'));
    expect(document.body.textContent).not.toContain(t('chronicle.defaultInsights.twoPaths.title'));
    close();
  });

  it('The Chronicle: entries show no day streak', async () => {
    api.apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        recentEntries: [{ id: 'e1', content: 'Walked by the river', type: 'text', createdAt: '2026-10-16T10:00:00Z' }],
        insights: [],
        prompts: [],
        stats: { totalEntries: 1, currentStreak: 5, entriesThisWeek: 1, topThemes: [] },
      },
    });
    const { openChronicle, close } = await import('../../src/ui/chronicle.ui.js');
    openChronicle();
    await vi.waitFor(() => expect(document.querySelector('.chronicle-stats')).not.toBeNull());

    expect(document.body.textContent).not.toContain(t('chronicle.dayStreak'));
    expectHonest(visibleText(document.querySelector('.chronicle-stats') as HTMLElement));
    close();
  });
});
