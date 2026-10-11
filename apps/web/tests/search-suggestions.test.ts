/**
 * Google's search-suggestion HTML is third-party content: it keeps its look
 * (style, svg, chips that link to Google) and loses anything active.
 */
import { describe, expect, it } from 'vitest';
import {
  SUGGESTIONS_SANDBOX,
  buildSuggestionsDocument,
  sanitizeSearchSuggestions,
} from '../src/utils/search-suggestions';

const CHIP_HREF =
  'https://www.google.com/search?q=shin+splint+stretches&client=app-vertex-grounding&safesearch=active';

/** Trimmed from a real searchEntryPoint.renderedContent. */
const GOOGLE_SAMPLE = `<style>
.container { align-items: center; border-radius: 8px; display: flex; padding: 8px 12px; }
.chip { display: inline-block; border: solid 1px; border-radius: 16px; padding: 5px 16px; }
@media (prefers-color-scheme: dark) { .chip { background-color: #2c2c2c; color: #fff; } }
</style>
<div class="container">
  <div class="headline">
    <svg class="logo-light" width="18" height="18" viewBox="9 9 35 35" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M42.8622 27.0064C42.8622 25.7839 42.7525 24.6084 42.5487 23.4799Z" fill="#4285F4"/>
    </svg>
  </div>
  <div class="carousel"><a class="chip" href="${CHIP_HREF}">shin splint stretches</a></div>
</div>`;

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

describe('sanitizeSearchSuggestions', () => {
  it("keeps Google's markup as Google sent it: style, logo, chip and its link", () => {
    const doc = parse(sanitizeSearchSuggestions(GOOGLE_SAMPLE));
    expect(doc.querySelector('style')?.textContent).toContain('prefers-color-scheme: dark');
    expect(doc.querySelector('svg path')?.getAttribute('fill')).toBe('#4285F4');
    const chip = doc.querySelector('a.chip');
    expect(chip?.getAttribute('href')).toBe(CHIP_HREF);
    expect(chip?.textContent).toBe('shin splint stretches');
  });

  it('removes scripts, event handlers and javascript: links', () => {
    const dirty =
      '<div class="chip" onclick="steal()">a</div><script>steal()</script>' +
      '<img src="x" onerror="steal()"><a class="chip" href="javascript:steal()">b</a>' +
      '<svg><script>steal()</script><a href="javascript:steal()"><text>c</text></a></svg>';
    const out = sanitizeSearchSuggestions(dirty);
    expect(out).not.toMatch(/steal|<script|onerror|onclick|javascript:/i);
    expect(out).toContain('class="chip"');
  });

  it('drops forms, frames, base/meta tags, targets and non-https links', () => {
    const dirty =
      '<form action="https://evil.example"><input name="pw"></form>' +
      '<iframe src="https://evil.example"></iframe><base href="https://evil.example/">' +
      '<meta http-equiv="refresh" content="0;url=https://evil.example">' +
      '<a href="http://plain.example/" target="_top">http</a><a href="data:text/html,x">data</a>';
    const doc = parse(sanitizeSearchSuggestions(dirty));
    expect(doc.querySelectorAll('form, input, iframe, base, meta')).toHaveLength(0);
    for (const a of doc.querySelectorAll('a')) {
      expect(a.hasAttribute('href')).toBe(false);
      expect(a.hasAttribute('target')).toBe(false);
    }
  });

  it('keeps only links to Google Search, in anchors', () => {
    const dirty =
      '<a class="chip" href="https://evil.example/search?q=x">phish</a>' +
      '<svg><a xlink:href="https://evil.example/"><text>svg</text></a><use href="https://evil.example/x.svg#a"></use></svg>' +
      `<a class="chip" href="${CHIP_HREF}">ok</a>`;
    const doc = parse(sanitizeSearchSuggestions(dirty));
    const hrefs = [...doc.querySelectorAll('[href], [*|href]')].map(
      (n) => n.getAttribute('href') ?? n.getAttribute('xlink:href')
    );
    expect(hrefs).toEqual([CHIP_HREF]);
    expect(doc.querySelector('use')).toBeNull();
  });

  it('returns nothing for empty input', () => {
    expect(sanitizeSearchSuggestions('   ')).toBe('');
    expect(buildSuggestionsDocument('')).toBe('');
  });
});

describe('buildSuggestionsDocument', () => {
  it('wraps the sanitized HTML in a no-script CSP with links opening a new tab', () => {
    const doc = new DOMParser().parseFromString(
      buildSuggestionsDocument(`${GOOGLE_SAMPLE}<script>steal()</script>`),
      'text/html'
    );
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('script-src');
    expect(csp).not.toContain('https:'); // no network fetches, so no view-tracking pixels
    expect(doc.querySelector('base')?.getAttribute('target')).toBe('_blank');
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('a.chip')?.getAttribute('href')).toBe(CHIP_HREF);
  });

  it('sandboxes without scripts or same-origin access', () => {
    const tokens = SUGGESTIONS_SANDBOX.split(' ');
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).not.toContain('allow-same-origin');
    expect(tokens).toContain('allow-popups');
  });
});
