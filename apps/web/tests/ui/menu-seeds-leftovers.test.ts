/**
 * Seed leftovers after the menu cut (Seth, 2026-10-17: "cut seeds"; #1695).
 *
 * The 2026-10-18 menu re-audit found two screens still selling seeds:
 * - Make It Yours priced skins, themes and sounds at "500 Seeds" with a
 *   disabled "Need more Seeds" button, while nothing earns seeds any more.
 * - Bring a Friend promised "You'll both get 25 seeds" and a seeds garden.
 *
 * Everything in Make It Yours is now free to pick; Bring a Friend keeps the
 * invite and says nothing about seeds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() })) as never;

await (await import('../../src/i18n/index.js')).initI18n();
const cosmetics = await import('../../src/services/cosmetics.service.js');
const { listedCosmetics } = await import('../../src/services/cosmetics-listed.js');
const personalize = await import('../../src/ui/personalize.ui.js');
const { openReferral, closeReferral } = await import('../../src/ui/referral.ui.js');

const SEEDS = /seed/i;

describe('Make It Yours', () => {
  beforeEach(() => {
    localStorage.clear();
    personalize.open();
  });
  afterEach(() => {
    personalize.close();
    document.body.innerHTML = '';
  });

  it('shows no price, balance or "Need more Seeds"', () => {
    const modal = document.body.textContent ?? '';
    expect(modal).not.toMatch(SEEDS);
    expect(document.querySelector('[data-action="buy"]')).toBeNull();
    expect(document.querySelector('.personalize-item-action[disabled]')).toBeNull();
  });

  it('offers every style it lists, priced ones included, with "Use this"', () => {
    const items = [...document.querySelectorAll<HTMLElement>('.personalize-item')];
    const priced = cosmetics.COSMETICS_CATALOG.filter((c) => c.priceInSeeds !== null);
    expect(priced.length).toBeGreaterThan(0); // the catalog still carries old prices
    expect(items.map((item) => item.dataset.itemId)).toEqual(listedCosmetics().map((c) => c.id));
    for (const item of items) {
      const usable = item.querySelector('[data-action="equip"]');
      const active = item.querySelector('.personalize-item-status.equipped');
      expect(usable ?? active, item.dataset.itemId).not.toBeNull();
    }
  });

  it('picks a style that used to cost seeds, with no seeds', () => {
    const skin = cosmetics.COSMETICS_CATALOG.find(
      (c) => c.type === 'avatar-skin' && c.priceInSeeds !== null
    )!;
    expect(cosmetics.ownsCosmetic(skin.id)).toBe(false); // never bought
    expect(cosmetics.getEquippedCosmetics()['avatar-skin']).not.toBe(skin.id);

    document
      .querySelector<HTMLElement>(`[data-action="equip"][data-item-id="${skin.id}"]`)!
      .click();

    expect(cosmetics.getEquippedCosmetics()['avatar-skin']).toBe(skin.id);
  });
});

/**
 * Review of #1954: several newly free items changed nothing (sound packs play
 * silent files, Deep Forest / Cozy Cabin only set a hue nothing reads, voice
 * packs have no caller). Only items that change something are listed.
 */
describe('Make It Yours lists nothing that does nothing', () => {
  /** What a pick can change: Ferni's colours (--skin-*), the skin effect, light/dark. */
  const look = (): string =>
    JSON.stringify([
      document.documentElement.style.getPropertyValue('--skin-primary'),
      document.documentElement.style.getPropertyValue('--skin-glow'),
      document.documentElement.style.getPropertyValue('--skin-secondary'),
      document.documentElement.getAttribute('data-skin-effect'),
      document.documentElement.getAttribute('data-theme'),
    ]);

  afterEach(() => vi.unstubAllEnvs());

  it('every listed item changes how Ferni or the page looks when picked', () => {
    const listed = listedCosmetics();
    expect(listed.map((c) => c.type)).toEqual(expect.arrayContaining(['avatar-skin', 'ui-theme']));
    for (const item of listed) {
      // start from a different item of the same kind
      const other = listed.find((c) => c.type === item.type && c.id !== item.id)!;
      cosmetics.equipCosmetic(other.id);
      const before = look();
      cosmetics.equipCosmetic(item.id);
      expect(look(), `${item.id} after ${other.id}`).not.toBe(before);
    }
  });

  it('hides silent sound packs, accent-only themes and voice packs while the flag is off', () => {
    const ids = listedCosmetics().map((c) => c.id);
    expect(listedCosmetics().some((c) => c.type === 'sound-pack' || c.type === 'voice-pack')).toBe(false);
    expect(ids).not.toContain('theme-forest');
    expect(ids).not.toContain('theme-cozy');

    vi.stubEnv('VITE_PERSONALIZE_EXTRAS', 'true');
    expect(listedCosmetics().map((c) => c.id)).toEqual(expect.arrayContaining(['theme-forest', 'sounds-rain']));
  });
});

describe('Bring a Friend', () => {
  const garden = (totalReferrals: number) => ({
    title: 'gardener',
    totalReferrals,
    totalEarnedFromReferrals: 75,
    referralCode: 'k3j9x2-meadow',
    referralUrl: 'https://app.ferni.ai/grow/k3j9x2-meadow',
  });

  afterEach(async () => {
    closeReferral();
    await vi.waitFor(() => expect(document.querySelector('.referral-modal')).toBeNull());
  });

  it('keeps the invite and promises no seeds', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: garden(0) });
    await openReferral();

    const modal = document.querySelector('.referral-modal');
    expect(modal?.querySelector('[data-action="share"]')).not.toBeNull();
    expect(modal?.querySelector('.referral-link-url')?.textContent).toContain('k3j9x2-meadow');
    expect(modal?.textContent).not.toMatch(SEEDS);
    expect(modal?.querySelector('.referral-bonus')).toBeNull();
  });

  it('counts friends who joined, without the seeds they earned', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: garden(3) });
    await openReferral();

    const modal = document.querySelector('.referral-modal');
    expect(modal?.querySelector('.referral-joined')?.textContent).toContain('3 friends');
    expect(modal?.textContent).not.toMatch(SEEDS);
    expect(modal?.textContent).not.toContain('75');
  });
});

describe('English copy', () => {
  for (const locale of ['en-US', 'en-GB']) {
    const json = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'src', 'i18n', 'locales', `${locale}.json`), 'utf8')
    ) as Record<string, Record<string, unknown>>;

    it(`${locale}: Make It Yours and Bring a Friend say nothing about seeds`, () => {
      expect(JSON.stringify(json.personalize)).not.toMatch(SEEDS);
      expect(JSON.stringify(json.referral)).not.toMatch(SEEDS);
      expect(json.accessibility?.needMoreSeeds).toBeUndefined();
    });

    it(`${locale}: the share sheet carries no "AI" label`, () => {
      expect(JSON.stringify(json.referral)).not.toMatch(/\bAI\b/);
    });
  }
});
