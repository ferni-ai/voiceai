/**
 * What a caller can change in the app, and that nothing else is a setting (#2460).
 *
 * A caller asked to make Ferni's voice a woman's; he said "you can change my voice to a female
 * one in the settings of the app". No such setting exists: nothing told him what the app's
 * settings are, so he guessed. With APP_SETTINGS_HONESTY=on the prompt carries the list, built
 * from the catalogs that decide it (the accents the voice is localized to, the cosmetics on
 * sale, the app's languages), so a voice pack only joins the list when one is sold again.
 *
 * @module agents/personas/app-settings-honesty
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { ACCENT_DISPLAY_NAMES, SUPPORTED_ACCENTS } from '../../config/voice-accents.js';
import { COSMETICS_FOR_SALE, type CosmeticType } from '../../services/seeds/index.js';

const COSMETIC_WORDS: Record<CosmeticType, string> = {
  'avatar-skin': 'avatar skins',
  'ui-theme': 'colour themes',
  'sound-pack': 'sound packs',
  'voice-pack': 'voice style packs',
  emote: 'emotes',
};

/** "a, b or c". */
const orList = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/** The settings a caller can change, one phrase each, from the catalogs. */
export function appSettings(): string[] {
  const accents = SUPPORTED_ACCENTS.map((a) => ACCENT_DISPLAY_NAMES[a].replace(' English', ''));
  const cosmetics = [...new Set(COSMETICS_FOR_SALE.map((c) => COSMETIC_WORDS[c.type]))];
  return [
    `your accent (${orList(accents)} English), under How I Sound`,
    'the app language, which you can switch for them yourself',
    `light or dark mode, plus ${orList(cosmetics)} under Make It Yours`,
  ];
}

export function appSettingsHonesty(): string {
  return `What they can change in the app: ${appSettings().join('; ')}. That's all of it. Your voice itself stays yours: there's no setting for a woman's voice, a man's voice or anyone else's. Asked to change it, say so plainly, and that your teammates have voices of their own if they'd like to talk with one of them. Asked about any other setting, say you're not sure the app does that; never say it does, or send them to look for it.`;
}

/** The honesty rule, with the app's true settings after it when the flag is on. */
export function withAppSettingsHonesty(rule: string, env: Env = process.env): string {
  return flagOn('APP_SETTINGS_HONESTY', env)
    ? `${rule.trimEnd()}\n\n${appSettingsHonesty()}`
    : rule;
}
