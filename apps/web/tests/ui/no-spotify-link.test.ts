/**
 * The web offers no way to link a person's own Spotify account.
 *
 * Seth, 2026-10-30: per-user Spotify won't be built. Spotify Developer Policy
 * III.3 bars voice assistants that control Spotify, and Development Mode caps
 * an app at 5 users. Before this, the settings menu had a "Connect Spotify"
 * row, the Music panel a Spotify "Connect" button, and Set the Mood said "Link
 * Spotify in Settings for full songs". Music is Sonos favourites, Apple
 * MusicKit on device, and links; the house account behind ambient playback is
 * separate and untouched.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
}));

const LINK_COPY = /link spotify|connect spotify|link your spotify/i;

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('no Link Spotify anywhere on the web', () => {
  it('the settings menu, with everything unlocked, has no Spotify row', () => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    localStorage.setItem('ferni_menu_pinned', JSON.stringify(['spotify']));
    initSettingsMenuUI({});
    getSettingsMenuUI().show();

    expect(document.querySelectorAll('.settings-menu__item[data-action]').length).toBeGreaterThan(
      10
    );
    expect(document.querySelector('[data-action="spotify"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(LINK_COPY);

    getSettingsMenuUI().destroy();
    localStorage.clear();
  });

  it('the Music panel lists no Spotify source and no Spotify connect button', async () => {
    const { musicDashboard } = await import('../../src/ui/music-dashboard.ui.js');
    const ui = musicDashboard as unknown as {
      profileData: unknown;
      renderMusicSources(): string;
      renderMusicSourcesCompact(): string;
    };
    for (const spotify of [{ connected: false }, { connected: true, trackCount: 3 }]) {
      ui.profileData = { musicSources: { games: { gamesPlayed: 1 }, spotify } };
      for (const html of [ui.renderMusicSources(), ui.renderMusicSourcesCompact()]) {
        expect(html).not.toContain('connect-spotify');
        expect(html).not.toMatch(/spotify/i);
        expect(html).toContain('connect-apple-music'); // the other sources still render
      }
    }
  });

  it('Set the Mood never asks for a Spotify link, and never checks for one', async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 404 });
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();
    await vi.waitFor(() => expect(document.querySelector('.vibe-music__artist')).not.toBeNull());

    expect(document.querySelector('.vibe-music__artist')?.textContent).toBe(
      'Or ask Ferni to play something'
    );
    expect(document.body.textContent).not.toMatch(LINK_COPY);
    expect(mockApiGet.mock.calls.map(([path]) => String(path))).not.toContainEqual(
      expect.stringContaining('/spotify/')
    );
    vibe.hide();
  });
});
