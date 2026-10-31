/**
 * Let's Play and The Sanctuary, from the 2026-10-18 menu re-audit.
 *
 * - Let's Play had a "Your Library" tab whose games sent isLibraryMode /
 *   libraryMode, which nothing on the agent reads (data-channel-handler.ts
 *   starts plain Name That Tune), so "play from YOUR Spotify library" was not
 *   what happened. Its toasts were hardcoded English.
 * - A self-guided Sanctuary practice had a chat step whose route answers 200
 *   with a random canned line when no LLM key is set. It is now behind
 *   VITE_SANCTUARY_CHAT (off by default).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Locale = { gamePicker: Record<'connectFirst' | 'starting' | 'startFailed', string> };
const LOCALES = join(__dirname, '..', '..', 'src', 'i18n', 'locales');
const EN_US = JSON.parse(readFileSync(join(LOCALES, 'en-US.json'), 'utf8')) as Locale;

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  room: { isConnected: false },
  publishData: vi.fn(async () => {}),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: mocks.toast }));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: {
    getRoomState: () => ({ isConnected: mocks.room.isConnected }),
    getRoom: () =>
      mocks.room.isConnected ? { localParticipant: { publishData: mocks.publishData } } : null,
  },
}));

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  onfinish: null,
  cancel: vi.fn(),
})) as never;

const i18n = await import('../../src/i18n/index.js');
await i18n.initI18n();
await i18n.setLocale('es');
const { t } = i18n;
const { showGamePicker, hideGamePicker } = await import('../../src/ui/game-picker.ui.js');
const { handleAgentAckMessage } = await import('../../src/app/agent-ack-handlers.js');
const practice = await import('../../src/ui/practice-experience.ui.js');
const sheet = await import('../../src/ui/mobile-bottom-sheet.ui.js');

describe("Let's Play", () => {
  afterEach(async () => {
    hideGamePicker();
    await vi.waitFor(() => expect(document.querySelector('.game-picker')).toBeNull());
    vi.clearAllMocks();
  });

  it('has no "Your Library" tab or Spotify library games', () => {
    showGamePicker();
    const tabs = [...document.querySelectorAll<HTMLElement>('.game-picker__tab')].map(
      (tab) => tab.dataset.category
    );
    expect(tabs).toEqual(['music', 'text', 'reflection']);
    expect(document.querySelector('[data-section="library"]')).toBeNull();
    expect(document.querySelector('[data-game^="library-"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/spotify/i);
  });

  it('tells you to start a call first, in your language', async () => {
    mocks.room.isConnected = false;
    showGamePicker();
    document.querySelector<HTMLElement>('[data-game="tic-tac-toe"]')?.click();

    await vi.waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    const message = mocks.toast.error.mock.calls[0]?.[0] as string;
    expect(message).toBe(t('gamePicker.connectFirst'));
    // Spanish, not the en-US text it would fall back to, nor the raw key
    expect(message).not.toBe(EN_US.gamePicker.connectFirst);
    expect(message).not.toBe('gamePicker.connectFirst');
  });

  it('has the three toasts translated in every locale, so none falls back to English', () => {
    for (const file of readdirSync(LOCALES).filter((f) => f.endsWith('.json') && !f.startsWith('en-'))) {
      const game = (JSON.parse(readFileSync(join(LOCALES, file), 'utf8')) as Locale).gamePicker;
      for (const key of ['connectFirst', 'starting', 'startFailed'] as const) {
        expect(game[key], `${file} ${key}`).toBeTruthy();
        expect(game[key], `${file} ${key}`).not.toBe(EN_US.gamePicker[key]);
      }
      expect(game.starting, file).toContain('{game}');
    }
  });

  it('says "starting" in your language only once the agent confirms, with no library fields', async () => {
    mocks.room.isConnected = true;
    showGamePicker();
    document.querySelector<HTMLElement>('[data-game="name-that-tune"]')?.click();

    await vi.waitFor(() => expect(mocks.publishData).toHaveBeenCalled());
    const sent = JSON.parse(
      new TextDecoder().decode(mocks.publishData.mock.calls[0]?.[0] as unknown as Uint8Array)
    ) as Record<string, unknown>;
    expect(sent).toMatchObject({ type: 'game_start_request', gameType: 'name-that-tune' });
    expect(sent).not.toHaveProperty('isLibraryMode');
    expect(sent).not.toHaveProperty('libraryMode');
    expect(mocks.toast.success).not.toHaveBeenCalled(); // the agent hasn't answered yet

    handleAgentAckMessage({ type: 'game_start_ack', gameType: 'name-that-tune', success: true });
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    const toast = mocks.toast.success.mock.calls[0]?.[0] as string;
    expect(toast).toBe(t('gamePicker.starting', { game: t('gamePicker.nameThatTune') }));
    expect(toast).not.toContain('Starting'); // the es string, not the en-US fallback
  });
});

describe('Sanctuary self-guided practice', () => {
  const open = () =>
    practice.startPractice({ id: 'daily-check-in', name: 'Daily check-in', description: '', category: 'test' });
  const walk = (): string[] => {
    const seen: string[] = [];
    for (let i = 0; i < 10 && practice.isOpen(); i++) {
      seen.push(document.querySelector('#chat-input') ? 'chat' : 'step');
      const next = document.querySelector<HTMLElement>('#nav-next');
      if (!next) break;
      next.click();
    }
    return seen;
  };

  afterEach(() => {
    practice.close();
    vi.unstubAllEnvs();
    document.body.innerHTML = '';
  });

  it('skips the chat step while VITE_SANCTUARY_CHAT is off (the default)', () => {
    mocks.room.isConnected = false;
    open();
    const seen = walk();
    expect(seen.length).toBeGreaterThan(1); // the other steps still run
    expect(seen).not.toContain('chat');
  });

  it('keeps the chat step when VITE_SANCTUARY_CHAT=true', () => {
    vi.stubEnv('VITE_SANCTUARY_CHAT', 'true');
    mocks.room.isConnected = false;
    open();
    expect(walk()).toContain('chat');
  });
});

describe('Sound effects in the phone sheet', () => {
  afterEach(() => {
    sheet.disposeMobileBottomSheet();
    localStorage.clear();
  });

  it('shows a mute saved on another screen and undoes it there', async () => {
    await i18n.setLocale('en-US');
    localStorage.setItem('ferni:sound', 'off'); // muted from the desktop menu
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 }); // a phone
    sheet.initMobileBottomSheet();
    sheet.open();
    const action = () =>
      document.querySelector<HTMLElement>('.mobile-bottom-sheet__action[data-action="sound"]');
    expect(action()?.textContent).toContain('Sound effects: off');

    action()?.click();

    expect(localStorage.getItem('ferni:sound')).toBe('on');
    expect(action()?.textContent).toContain('Sound effects: on');
    await i18n.setLocale('es');
  });
});
