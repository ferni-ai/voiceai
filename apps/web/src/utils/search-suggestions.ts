/**
 * Google Search suggestions, shown the way Google's grounding terms ask:
 * the HTML and CSS Google returns (searchEntryPoint.renderedContent), unedited
 * in look, next to the answer it grounded, each chip opening Google Search.
 *
 * The HTML comes from a third party, so it never touches the page's DOM:
 * 1. DOMPurify strips scripts, handlers, forms, frames and every link that
 *    isn't https to Google;
 * 2. the result is wrapped in a document whose CSP allows no scripts and no
 *    network fetches except Google's own images (inline styles, data: images);
 * 3. that document goes into an iframe sandboxed without allow-scripts or
 *    allow-same-origin, so it gets an opaque origin; links open in a new tab.
 *
 * @module utils/search-suggestions
 */

import DOMPurify from 'dompurify';

/** No scripts, no same-origin access; chips may open Google in a new tab. */
export const SUGGESTIONS_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

const SUGGESTIONS_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com https://www.google.com";

const FORBID_TAGS = [
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'iframe',
  'object',
  'embed',
  'base',
  'meta',
  'link',
];

/** Chips go to Google Search, so every other link is dropped. */
const GOOGLE_HOSTS = new Set(['www.google.com']);

function keepOnlyGoogleLinks(node: Element): void {
  if (!node.hasAttribute('href')) return;
  try {
    const url = new URL(node.getAttribute('href') ?? '');
    if (node.tagName !== 'A' || url.protocol !== 'https:' || !GOOGLE_HOSTS.has(url.hostname))
      node.removeAttribute('href');
  } catch {
    node.removeAttribute('href');
  }
}

/** Google's suggestion HTML with everything active removed. */
export function sanitizeSearchSuggestions(html: string): string {
  if (!html.trim()) return '';
  DOMPurify.addHook('afterSanitizeAttributes', keepOnlyGoogleLinks);
  try {
    // FORCE_BODY keeps the leading <style> Google puts first.
    return DOMPurify.sanitize(html, {
      FORCE_BODY: true,
      FORBID_TAGS,
      FORBID_ATTR: ['target', 'srcset', 'xlink:href'],
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

/** The srcdoc for the sandboxed iframe, or '' when there is nothing to show. */
export function buildSuggestionsDocument(html: string): string {
  const safe = sanitizeSearchSuggestions(html);
  if (!safe) return '';
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${SUGGESTIONS_CSP}">` +
    '<base target="_blank"><style>body{margin:0}</style></head>' +
    `<body>${safe}</body></html>`
  );
}
