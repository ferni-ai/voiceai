/**
 * Text from a server or a person, made safe to put inside markup: in element
 * text and in quoted attribute values. Anything that isn't a string becomes ''.
 */
export function escapeHtml(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) : '';
}
