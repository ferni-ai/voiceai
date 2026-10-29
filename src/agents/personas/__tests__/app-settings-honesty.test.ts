/**
 * APP_SETTINGS_HONESTY=on (app-settings-honesty.ts, #2460): the prompt says what a caller can
 * change in the app and that nothing else is a setting. A caller was told "you can change my
 * voice to a female one in the settings of the app"; no such setting exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENT_DISPLAY_NAMES, SUPPORTED_ACCENTS } from '../../../config/voice-accents.js';
import { LISTED_COSMETICS_FOR_SALE } from '../../../services/seeds/cosmetics-catalog.js';
import {
  appSettingsHonesty,
  webOnlySettings,
  withAppSettingsHonesty,
} from '../app-settings-honesty.js';

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
    expect(rule).toContain("say you're not sure the app does that");
  });

  it('does not claim the list is complete or forbid pointing at a setting', () => {
    const text = appSettingsHonesty();
    expect(text).not.toMatch(/that'?s all of it/i);
    expect(text).not.toMatch(/never say it does|send them to look/i);
  });

  it('names the settings the web menu has that the first list left out', () => {
    const text = appSettingsHonesty();
    for (const item of [
      "When I'll Check In",
      "When I'll Reach Out",
      'How I reach you',
      'Voice ID',
      'Home & Family',
      'calendar',
      'devices',
      'Privacy & your data',
    ]) {
      expect(text, item).toContain(item);
    }
    expect(text).toContain('quiet hours and alert preferences');
  });

  it('says which settings are web-only and what the iPhone app has', () => {
    const text = appSettingsHonesty();
    expect(text).toMatch(/on the website, How I Sound/);
    expect(text).toContain('The iPhone app has fewer: Call sounds');
    expect(text).toContain('none of the website');
    const iphone = text.slice(
      text.indexOf('The iPhone app has fewer'),
      text.indexOf('You can set')
    );
    expect(iphone).not.toMatch(/How I Sound|Make It Yours/);
  });

  it('lists every accent the voice is localized to, from the accent catalog', () => {
    const accents = webOnlySettings()[0];
    expect(accents).toContain('How I Sound');
    for (const a of SUPPORTED_ACCENTS) {
      expect(accents).toContain(ACCENT_DISPLAY_NAMES[a].replace(' English', ''));
    }
  });

  it('Make It Yours lists what the web lists: avatar skins and Midnight, nothing hidden', () => {
    // What the web hides while VITE_PERSONALIZE_EXTRAS is unset: silent sound packs, inert themes.
    expect(LISTED_COSMETICS_FOR_SALE.some((c) => c.type === 'sound-pack')).toBe(false);
    expect(LISTED_COSMETICS_FOR_SALE.map((c) => c.id)).not.toEqual(
      expect.arrayContaining(['theme-forest'])
    );
    const makeItYours = webOnlySettings().find((s) => s.startsWith('Make It Yours'));
    expect(makeItYours).toBe('Make It Yours (avatar skins, the light theme and Midnight)');
    const text = appSettingsHonesty();
    expect(text).not.toMatch(
      /sound packs?|voice (style )?packs?|emotes?|colour themes|Forest|Cozy/i
    );
  });

  it('a hidden extra joining the catalog filter is the only way it reaches the prompt', () => {
    for (const c of LISTED_COSMETICS_FOR_SALE) {
      expect(['avatar-skin', 'ui-theme']).toContain(c.type);
      if (c.type === 'ui-theme') expect(c.id).toBe('theme-midnight');
    }
  });

  it('live: the model-level instructions carry it with the flag on, not off', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const off = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(off).not.toContain("there's no setting for a woman's voice");
    vi.resetModules();
    process.env['APP_SETTINGS_HONESTY'] = 'on';
    const on = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(on).toContain("there's no setting for a woman's voice");
    expect(on).toContain('How I Sound (your accent');
  });
});
