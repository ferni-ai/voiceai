// node --test apps/website/marketplace-portal/__tests__/
// Checks the committed build (_site), which is what Firebase serves. Rebuild with
// `npx eleventy` in apps/website/marketplace-portal before running.
// SITE_DIR=<dir> points it at another build (used for the mutation check).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const SITE = process.env.SITE_DIR || path.join(__dirname, '..', '_site');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const pages = htmlFiles(SITE).map((file) => ({ file: path.relative(SITE, file), html: fs.readFileSync(file, 'utf8') }));

/** Firebase (cleanUrls) serves /a/b/ from a/b/index.html and /a/b from a/b.html. */
function resolves(url) {
  const p = path.join(SITE, decodeURIComponent(url));
  return [p, path.join(p, 'index.html'), `${p.replace(/\/$/, '')}.html`].some((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}

test('the build has the home, categories and persona pages', () => {
  assert.ok(pages.length >= 9, `only ${pages.length} pages in ${SITE}`);
});

test('every internal link and asset resolves to a built file', () => {
  const broken = [];
  for (const { file, html } of pages) {
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      if (!resolves(m[1])) broken.push(`${file} -> ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});

test('no page shows a price while ferni is free', () => {
  const priced = pages.filter(({ html }) => /\$\d+(\.\d\d)?\s*\/\s*mo/.test(html)).map(({ file }) => file);
  assert.deepEqual(priced, []);
});

test('no page promises a launch date that has passed', () => {
  const dated = pages.filter(({ html }) => /\bQ[1-4] 20\d\d\b/.test(html)).map(({ file }) => file);
  assert.deepEqual(dated, []);
});

test('the categories page lists personas and pluralises its counts', () => {
  const { html } = pages.find(({ file }) => file === path.join('pages', 'categories', 'index.html'));
  assert.ok((html.match(/class="persona-card/g) || []).length >= 4, 'the "A Few to Start With" grid is empty');
  assert.doesNotMatch(html, /\b1 personas\b/);
});
