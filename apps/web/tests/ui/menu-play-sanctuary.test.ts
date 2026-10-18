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
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const practice = await import('../../src/ui/practice-experience.ui.js');

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
    expect(message).not.toBe('gamePicker.connectFirst'); // a real string, not the key
    expect(message).not.toContain('Connect to Ferni first');
  });

  it('starts a game with a localized toast and no library fields', async () => {
    mocks.room.isConnected = true;
    showGamePicker();
    document.querySelector<HTMLElement>('[data-game="name-that-tune"]')?.click();

    await vi.waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    const sent = JSON.parse(
      new TextDecoder().decode(mocks.publishData.mock.calls[0]?.[0] as unknown as Uint8Array)
    ) as Record<string, unknown>;
    expect(sent).toMatchObject({ type: 'game_start_request', gameType: 'name-that-tune' });
    expect(sent).not.toHaveProperty('isLibraryMode');
    expect(sent).not.toHaveProperty('libraryMode');
    expect(mocks.toast.success.mock.calls[0]?.[0]).toBe(
      t('gamePicker.starting', { game: t('gamePicker.nameThatTune') })
    );
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
