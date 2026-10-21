/**
 * Text helpers for the share-card SVG templates.
 *
 * @module services/sharing/svg-text
 */

/**
 * Escape a value for SVG/XML text or a quoted attribute. Card data comes from
 * the request body unchecked, and the SVG is served as a document, so every
 * value that reaches the markup goes through here (after truncation, so an
 * entity is never cut in half).
 */
export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncate(value: unknown, maxLength: number): string {
  const str = String(value ?? '');
  return str.length <= maxLength ? str : `${str.slice(0, maxLength - 3)}...`;
}
