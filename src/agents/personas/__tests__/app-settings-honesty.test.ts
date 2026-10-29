/**
 * APP_SETTINGS_HONESTY=on (app-settings-honesty.ts, #2460): the prompt names what Ferni can set
 * for a caller through real tools and sends every other setting to "not sure". A caller was told "you can change my
 * voice to a female one in the settings of the app"; no such setting exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LISTED_COSMETICS_FOR_SALE } from '../../../services/seeds/cosmetics-catalog.js';
import { appSettingsHonesty, withAppSettingsHonesty } from '../app-settings-honesty.js';

const RULE = readFileSync(
  join(__dirname, '../../../personas/bundles/shared/ai-honesty.md'),
  'utf8'
);

describe('app settings honesty', () => {
  afterEach(() => {
    delete process.env['APP_SETTINGS_HONESTY'];
    delete process.env['PROMPT_MODE'];
    vi.resetModules();
  });

  it('off: the rule is unchanged', () => {
    expect(withAppSettingsHonesty(RULE, {})).toBe(RULE);
  });

  it('on: the rule gains the list and says his voice has no setting', () => {
    const rule = withAppSettingsHonesty(RULE, { APP_SETTINGS_HONESTY: 'on' });
    expect(rule.startsWith(RULE.trimEnd())).toBe(true);
    expect(rule).toContain("there's no setting for a woman's voice");
    expect(rule).toContain("I'm not sure the app has that");
  });

  it('claims no completeness and sends other settings to "not sure", never to a named screen', () => {
    const text = appSettingsHonesty();
    expect(text).not.toMatch(/that'?s all of it|none of the website/i);
    expect(text).toContain(
      'say "I\'m not sure the app has that. You could check the settings menu."'
    );
    expect(text).toContain('Never name a screen or say a setting exists.');
  });

  it('offers the three settings Ferni can set himself, by tool name', () => {
    const text = appSettingsHonesty();
    expect(text).toContain('quiet hours (setQuietHours)');
    expect(text).toContain('alert preferences (setAlertPreferences)');
    expect(text).toContain('language (setAppLanguage)');
    expect(text).toContain('"I can set that for you."');
  });

  it('names no app screen: a hand-kept list drifts when the web hides or adds a row', () => {
    const text = appSettingsHonesty();
    for (const screen of [
      'How I Sound',
      'Voice ID',
      'Recognizing You',
      'Home & Family',
      'devices',
      'Wearables',
      'calendar',
      "When I'll",
      'How I reach you',
      'Privacy & your data',
      'iPhone',
      'website',
      'accent',
    ]) {
      expect(text.toLowerCase(), screen).not.toContain(screen.toLowerCase());
    }
  });

  it('Make It Yours lists what the web lists: avatar skins and Midnight, nothing hidden', () => {
    // What the web hides while VITE_PERSONALIZE_EXTRAS is unset: silent sound packs, inert themes.
    expect(LISTED_COSMETICS_FOR_SALE.some((c) => c.type === 'sound-pack')).toBe(false);
    for (const c of LISTED_COSMETICS_FOR_SALE) {
      expect(['avatar-skin', 'ui-theme']).toContain(c.type);
      if (c.type === 'ui-theme') expect(c.id).toBe('theme-midnight');
    }
    const text = appSettingsHonesty();
    expect(text).toContain('choose avatar skins, the light theme and Midnight under Make It Yours');
    expect(text).not.toMatch(
      /sound packs?|voice (style )?packs?|emotes?|colour themes|Forest|Cozy/i
    );
  });

  it('live: the model-level instructions carry it with the flag on, not off', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const off = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(off).not.toContain("there's no setting for a woman's voice");
    vi.resetModules();
    process.env['APP_SETTINGS_HONESTY'] = 'on';
    const on = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(on).toContain("there's no setting for a woman's voice");
    expect(on).toContain('I can set that for you');
  });
});
