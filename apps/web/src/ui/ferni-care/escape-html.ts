/**
 * Escape text from templates or saved routines before it goes into innerHTML.
 * Safe in element text and in quoted attributes (unlike the textContent ->
 * innerHTML trick, which leaves quotes alone).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
