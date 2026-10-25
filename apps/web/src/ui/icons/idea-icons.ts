/**
 * Idea & routine icons - the brand icons for "What I Do For You".
 *
 * Templates and saved routines carry an icon NAME ('sunrise', 'moon', ...),
 * never a glyph. getIdeaIcon() is the only way a name becomes markup, so a
 * stored string is never written into the DOM as HTML.
 *
 * BRAND COMPLIANCE: Lucide-style, 24 viewBox, 2px stroke, round caps and
 * joins, currentColor, no fills, no emoji.
 *
 * @module ui/icons/idea-icons
 */

import { TRACKED_ICONS } from './hub-icons.js';
import { JOURNEY_ICONS } from './journey-icons.js';

const svg = (body: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const IDEA_ICONS = {
  sunrise: svg(
    '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>'
  ),
  lotus: svg(
    '<path d="M12 21c-3-2-4.5-5-4.5-8.5S9 6 12 3.5c3 2.5 4.5 5.5 4.5 9S15 19 12 21Z"/><path d="M12 21c-5 0-9-3-10-8 2.5-.8 5-.5 6.8.7"/><path d="M12 21c5 0 9-3 10-8-2.5-.8-5-.5-6.8.7"/>'
  ),
  thought: svg(
    '<path d="M17.5 16H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><circle cx="6.5" cy="19" r="1.5"/><circle cx="3.5" cy="21" r="1"/>'
  ),
  target: TRACKED_ICONS.target,
  droplet: svg(
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'
  ),
  leaf: JOURNEY_ICONS.leaf,
  home: svg(
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  ),
  moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  car: svg(
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'
  ),
  wallet: svg(
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'
  ),
  sparkles: JOURNEY_ICONS.sparkles,
  notebook: svg(
    '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>'
  ),
  wind: svg(
    '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>'
  ),
  heart: JOURNEY_ICONS.heart,
  message: JOURNEY_ICONS.messageCircle,
  eye: svg(
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
  ),
  trophy: JOURNEY_ICONS.trophy,
  flame: JOURNEY_ICONS.flame,
  check: JOURNEY_ICONS.check,
  calendar: JOURNEY_ICONS.calendar,
  briefcase: svg(
    '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'
  ),
  chart: svg(
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'
  ),
  cart: svg(
    '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>'
  ),
} as const;

export type IdeaIconName = keyof typeof IDEA_ICONS;

/** Shown for an unknown name, a missing icon, or anything that is not a string. */
export const IDEA_ICON_FALLBACK: IdeaIconName = 'sparkles';

/**
 * Routines saved before icons became names still hold the old emoji in
 * Firestore. These keys are only matched, never rendered.
 */
const LEGACY_GLYPHS: ReadonlyMap<string, IdeaIconName> = new Map<string, IdeaIconName>(
  Object.entries({
    '🌅': 'sunrise',
    '🧘': 'lotus',
    '💭': 'thought',
    '🎯': 'target',
    '💧': 'droplet',
    '🌿': 'leaf',
    '🏠': 'home',
    '🌙': 'moon',
    '🚗': 'car',
    '💰': 'wallet',
    '✨': 'sparkles',
    '📝': 'notebook',
    '🌬': 'wind',
    '💪': 'heart',
    '💬': 'message',
    '👀': 'eye',
    '🎉': 'trophy',
    '🔥': 'flame',
    '✅': 'check',
    '📅': 'calendar',
    '💼': 'briefcase',
    '📊': 'chart',
    '🛒': 'cart',
  } satisfies Record<string, IdeaIconName>)
);

export function isIdeaIconName(name: unknown): name is IdeaIconName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(IDEA_ICONS, name);
}

/** Resolve a stored icon name (or a legacy emoji) to a known icon name. */
export function resolveIdeaIconName(name: unknown): IdeaIconName {
  if (typeof name !== 'string') return IDEA_ICON_FALLBACK;
  const key = name.trim();
  if (isIdeaIconName(key)) return key;
  return LEGACY_GLYPHS.get(key.replace(/\uFE0F/g, '')) ?? IDEA_ICON_FALLBACK;
}

/**
 * The SVG for an idea or routine icon. Always returns brand markup: the
 * input string itself never reaches the output.
 */
export function getIdeaIcon(name: unknown, size?: number): string {
  const icon = IDEA_ICONS[resolveIdeaIconName(name)];
  if (!size) return icon;
  return icon.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
}
