/**
 * APP_SETTINGS_HONESTY=on (app-settings-honesty.ts, #2460): the prompt says what a caller can
 * change in the app and that nothing else is a setting. A caller was told "you can change my
 * voice to a female one in the settings of the app"; no such setting exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENT_DISPLAY_NAMES, SUPPORTED_ACCENTS } from '../../../config/voice-accents.js';
import { COSMETICS_FOR_SALE } from '../../../services/seeds/cosmetics-catalog.js';
import {
  appSettings,
  appSettingsHonesty,
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

  it('lists every accent the voice is localized to, from the accent catalog', () => {
    const accents = appSettings()[0];
    for (const a of SUPPORTED_ACCENTS) {
      expect(accents).toContain(ACCENT_DISPLAY_NAMES[a].replace(' English', ''));
    }
  });

  it('lists the cosmetics on sale and no voice pack while none is sold', () => {
    const types = new Set(COSMETICS_FOR_SALE.map((c) => c.type));
    expect(types.has('voice-pack')).toBe(false);
    const text = appSettingsHonesty();
    expect(text).not.toMatch(/voice (style )?packs?/i);
    if (types.has('sound-pack')) expect(text).toContain('sound packs');
    if (types.has('ui-theme')) expect(text).toContain('colour themes');
  });

  it('live: the model-level instructions carry it with the flag on, not off', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const off = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(off).not.toContain("there's no setting for a woman's voice");
    vi.resetModules();
    process.env['APP_SETTINGS_HONESTY'] = 'on';
    const on = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(on).toContain("there's no setting for a woman's voice");
    expect(on).toContain('under How I Sound');
  });
});
