/**
 * What Make It Yours lists: only cosmetics that change something.
 *
 * Avatar styles recolour Ferni (--skin-* feed --persona-*), and Zen Garden and
 * Midnight switch light and dark. Everything else waits behind
 * VITE_PERSONALIZE_EXTRAS (personalize-extras-flag.ts says why).
 *
 * @module services/cosmetics-listed
 */
import { isPersonalizeExtrasOn } from '../config/personalize-extras-flag.js';
import { COSMETICS_CATALOG, type CosmeticItem } from './cosmetics.service.js';

const WORKING_THEMES = new Set(['theme-default', 'theme-midnight']);

export function listedCosmetics(): CosmeticItem[] {
  if (isPersonalizeExtrasOn()) return COSMETICS_CATALOG;
  return COSMETICS_CATALOG.filter(
    (c) => c.type === 'avatar-skin' || (c.type === 'ui-theme' && WORKING_THEMES.has(c.id))
  );
}
