/**
 * Theme inks: every generated, contrast-verified text color derived from the
 * design tokens, in one place so the web build (build.js), the native apps
 * (generate-native-tokens.js) and the promo sites (sync-promo-tokens.js) all
 * ship the same values.
 *
 * All values are pure functions of tokens/colors.json (see text-ink.js), so
 * regeneration is deterministic.
 */

import { textInk, contrastRatio } from './text-ink.js';

/** WCAG AA for body text. */
export const TEXT_INK_TARGET = 4.5;

/**
 * Opaque surfaces text sits on in a theme. Translucent chips/glass on top of
 * these are lighter still; components that put brand-colored text there
 * should use text-primary instead (Midnight's surfaces are mid-tone, so a
 * colored ink readable on them would wash out to near-white).
 */
export function themeTextSurfaces(theme) {
  const { primary, secondary, tertiary, elevated } = theme.background;
  const surfaces = [primary, secondary, tertiary, elevated];
  // Light themes also put text on plain white cards
  return theme.meta?.mode === 'light' ? [...surfaces, '#ffffff'] : surfaces;
}

/**
 * Ink for text on a persona fill: white or the warm dark, whichever reads
 * better. Mid-tone fills (Jack, Maya) fall short with both, so the dark ink is
 * deepened until it reaches AA.
 */
export const ON_FILL_DARK = '#2a2420';
export function onFill(fill) {
  const white = contrastRatio('#ffffff', fill);
  const dark = contrastRatio(ON_FILL_DARK, fill);
  if (Math.max(white, dark) >= TEXT_INK_TARGET) return white >= dark ? '#ffffff' : ON_FILL_DARK;
  return textInk(ON_FILL_DARK, [fill], { target: TEXT_INK_TARGET });
}

/**
 * Persona colors are fill colors; as text they fail contrast on some themes
 * (Ferni green is ~1:1 on Midnight). Inks keep each persona's hue and adjust
 * lightness until they reach WCAG AA on every surface of the theme.
 * Returns { [personaId]: { onFill, [themeName]: ink } }.
 */
export function computePersonaInks(personas, themes) {
  const inks = {};
  for (const [personaId, personaColors] of Object.entries(personas)) {
    if (personaId.startsWith('_')) continue;
    inks[personaId] = { onFill: onFill(personaColors.primary) };
    for (const [themeName, theme] of Object.entries(themes)) {
      inks[personaId][themeName] = textInk(personaColors.primary, themeTextSurfaces(theme));
    }
  }
  return inks;
}

/**
 * Readable text tokens for one theme: the accent as text, text placed on an
 * accent-filled button, and each semantic (status) color as text.
 * Returns { accentText, onAccent, semanticText: { successText, ... } }.
 */
export function themeTextInks(theme) {
  const surfaces = themeTextSurfaces(theme);
  const accentText = textInk(theme.accent.text || theme.accent.primary, surfaces);
  const onAccent =
    theme.meta?.mode === 'light'
      ? textInk('#ffffff', [theme.accent.primary])
      : textInk(theme.text.inverse, [theme.accent.primary]);
  // Status colors as text (errors, warnings, ...) also need to be readable
  const semanticText = {};
  for (const [name, value] of Object.entries(theme.semantic || {})) {
    if (typeof value === 'string' && value.startsWith('#')) {
      semanticText[`${name}Text`] = textInk(value, surfaces);
    }
  }
  return { accentText, onAccent, semanticText };
}

/**
 * Themes with the derived text tokens merged in (accent.text, text.onAccent,
 * semantic.*Text). Returns a new object; the input is not mutated.
 */
export function withReadableThemeText(themes) {
  const out = {};
  for (const [themeName, theme] of Object.entries(themes)) {
    const { accentText, onAccent, semanticText } = themeTextInks(theme);
    out[themeName] = {
      ...theme,
      accent: { ...theme.accent, text: accentText },
      text: { ...theme.text, onAccent },
      semantic: { ...theme.semantic, ...semanticText },
    };
  }
  return out;
}
