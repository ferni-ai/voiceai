/**
 * What Ferni can change for a caller, and that nothing else is promised (#2460).
 *
 * A caller asked to make Ferni's voice a woman's; he said "you can change my voice to a female
 * one in the settings of the app". No such setting exists: nothing told him what he can do, so
 * he guessed. With APP_SETTINGS_HONESTY=on the prompt names only what Ferni can do himself
 * through real tools, plus Make It Yours as the web lists it. It names no other screen: a hand-
 * kept list of screens drifted every time the web hid or added a row (round 2 of #3050). Any
 * other setting gets "I'm not sure the app has that".
 *
 * @module agents/personas/app-settings-honesty
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { LISTED_COSMETICS_FOR_SALE, type CosmeticType } from '../../services/seeds/index.js';

/** The tools that change a setting for the caller; the prompt names each, a test finds each. */
export const SETTING_TOOL_IDS = {
  quietHours: 'setQuietHours',
  alertPreferences: 'setAlertPreferences',
  appLanguage: 'setAppLanguage',
} as const;

/** The cosmetics the web lists, as a caller would say them (the default theme is the light one). */
const COSMETIC_WORDS: Partial<Record<CosmeticType, string>> = {
  'avatar-skin': 'avatar skins',
};

/** "a, b or c". */
const orList = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/** "theme-midnight" -> "Midnight". */
const themeName = (id: string): string => {
  const name = id.replace(/^theme-/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** What Make It Yours lists on the web: the listed skins, the light theme and the listed dark ones. */
function makeItYours(): string {
  const words = [
    ...new Set(LISTED_COSMETICS_FOR_SALE.flatMap((c) => COSMETIC_WORDS[c.type] ?? [])),
  ];
  const themes = LISTED_COSMETICS_FOR_SALE.filter((c) => c.type === 'ui-theme').map((c) =>
    themeName(c.id)
  );
  return [...words, ...(themes.length ? [`the light theme and ${orList(themes)}`] : [])].join(', ');
}

export function appSettingsHonesty(): string {
  const t = SETTING_TOOL_IDS;
  return `What you can do for them: set their quiet hours (${t.quietHours}), their alert preferences (${t.alertPreferences}) and the app's language (${t.appLanguage}). Offer it: "I can set that for you." They can also choose ${makeItYours()} under Make It Yours. Your voice itself stays yours: there's no setting for a woman's voice, a man's voice or anyone else's. Asked to change it, say so plainly, and that your teammates have voices of their own if they'd like to talk with one of them. Asked about any other setting, say "I'm not sure the app has that. You could check the settings menu." Never name a screen or say a setting exists.`;
}

/** The honesty rule, with the app's true settings after it when the flag is on. */
export function withAppSettingsHonesty(rule: string, env: Env = process.env): string {
  return flagOn('APP_SETTINGS_HONESTY', env)
    ? `${rule.trimEnd()}\n\n${appSettingsHonesty()}`
    : rule;
}
