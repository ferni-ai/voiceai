/**
 * Formatting helpers for the "What Ferni remembers" panel.
 *
 * @module ui/memory-control/format
 */

import { getLocale, t } from '../../i18n/index.js';
import { getPersona } from '../../config/personas.js';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for safe interpolation into HTML (text and attribute values). */
export function esc(value: string | number | undefined | null): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "March 4, 2026" style date in the active locale. */
export function formatDate(iso: string | undefined): string {
  const date = parseDate(iso);
  if (!date) return '';
  return date.toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Date with time, for conversation headers. */
export function formatDateTime(iso: string | undefined): string {
  const date = parseDate(iso);
  if (!date) return '';
  return date.toLocaleString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Time of day only, for transcript turns. */
export function formatTime(iso: string | undefined): string {
  const date = parseDate(iso);
  if (!date) return '';
  return date.toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' });
}

/** Display name for a persona id, falling back to Ferni. */
export function personaName(personaId: string | undefined): string {
  if (!personaId) return 'Ferni';
  return getPersona(personaId).name;
}

/** "Learned March 4, 2026" */
export function learnedLabel(iso: string | undefined): string {
  const date = formatDate(iso);
  return date ? t('memoryControl.learnedOn', 'Learned {date}', { date }) : '';
}

/** "From 3 conversations" (or "From 1 conversation"); empty for none. */
export function sourcesLabel(count: number): string {
  if (count <= 0) return '';
  return count === 1
    ? t('memoryControl.fromOneConversation', 'From 1 conversation')
    : t('memoryControl.fromConversations', 'From {count} conversations', { count });
}

/** Human label for a fact category ("work_life" -> "Work life"). */
export function categoryLabel(category: string): string {
  const key = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const fallback = key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') : '';
  return t(`memoryControl.categories.${key || 'other'}`, fallback || 'Other');
}
