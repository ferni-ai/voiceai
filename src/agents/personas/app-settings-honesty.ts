/**
 * What a caller can change in the app, and where (#2460).
 *
 * A caller asked to make Ferni's voice a woman's; he said "you can change my voice to a female
 * one in the settings of the app". No such setting exists: nothing told him what the app's
 * settings are, so he guessed. With APP_SETTINGS_HONESTY=on the prompt carries the list, built
 * from the catalogs that decide it (the accents the voice is localized to, the cosmetics the
 * web lists under Make It Yours), and says which screens exist only on the web. It is a list of
 * what exists, not a claim that nothing else does: the prompt still sends anything unlisted to
 * "I'm not sure the app does that".
 *
 * @module agents/personas/app-settings-honesty
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { ACCENT_DISPLAY_NAMES, SUPPORTED_ACCENTS } from '../../config/voice-accents.js';
import { LISTED_COSMETICS_FOR_SALE, type CosmeticType } from '../../services/seeds/index.js';

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
  return `Make It Yours (${[...words, ...(themes.length ? [`the light theme and ${orList(themes)}`] : [])].join(', ')})`;
}

/** The screens only the website has, one phrase each; the accents come from the accent catalog. */
export function webOnlySettings(): string[] {
  const accents = SUPPORTED_ACCENTS.map((a) => ACCENT_DISPLAY_NAMES[a].replace(' English', ''));
  return [
    `How I Sound (your accent: ${orList(accents)} English)`,
    makeItYours(),
    'light or dark mode',
    "When I'll Check In (notifications)",
    "When I'll Reach Out",
    'How I reach you (their number, and whether you text, call or leave a note)',
    'Recognizing You (Voice ID)',
    'Home & Family',
    'their calendar and devices',
    'Privacy & your data (export or delete it)',
  ];
}

/** What the iPhone app has, as its own screens call them. */
const IPHONE_SETTINGS = [
  'Call sounds',
  'what Ferni remembers (with a memory lock)',
  'Help',
  'sign out',
  'delete account',
];

export function appSettingsHonesty(): string {
  return `What they can change, by where: on the website, ${webOnlySettings().join('; ')}. The iPhone app has fewer: ${IPHONE_SETTINGS.join(', ')}; none of the website's settings above are in it. You can set quiet hours and alert preferences for them yourself, and switch the app language. Your voice itself stays yours: there's no setting for a woman's voice, a man's voice or anyone else's. Asked to change it, say so plainly, and that your teammates have voices of their own if they'd like to talk with one of them. Asked about a setting not named here, say you're not sure the app does that.`;
}

/** The honesty rule, with the app's true settings after it when the flag is on. */
export function withAppSettingsHonesty(rule: string, env: Env = process.env): string {
  return flagOn('APP_SETTINGS_HONESTY', env)
    ? `${rule.trimEnd()}\n\n${appSettingsHonesty()}`
    : rule;
}
