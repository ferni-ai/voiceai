// node --test apps/website/developers-portal/__tests__/
// Checks a build of the portal. Run `npx eleventy` in apps/website/developers-portal
// first (only the HTML in _site is tracked; css, js and the spec are copied at build).
// SITE_DIR=<dir> points it at another build (used for the mutation check).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const SITE = process.env.SITE_DIR || path.join(__dirname, '..', '_site');

function files(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}

const pages = files(SITE, '.html').map((file) => ({ file: path.relative(SITE, file), html: fs.readFileSync(file, 'utf8') }));
const scripts = files(SITE, '.js').map((file) => ({ file: path.relative(SITE, file), js: fs.readFileSync(file, 'utf8') }));

/** Firebase (cleanUrls) serves /a/b/ from a/b/index.html and /a/b from a/b.html. */
function builtFile(url) {
  const p = path.join(SITE, decodeURIComponent(url));
  return [p, path.join(p, 'index.html'), `${p.replace(/\/$/, '')}.html`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}

test('the build has the portal pages', () => {
  assert.ok(pages.length >= 20, `only ${pages.length} pages in ${SITE}`);
});

test('every internal link, asset and #anchor resolves', () => {
  const broken = [];
  for (const { file, html } of pages) {
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:#([^"]+))?"/g)) {
      const target = builtFile(m[1]);
      if (!target) broken.push(`${file} -> ${m[1]}`);
      else if (m[2] && target.endsWith('.html') && !fs.readFileSync(target, 'utf8').includes(`id="${m[2]}"`)) {
        broken.push(`${file} -> ${m[1]}#${m[2]}`);
      }
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});

test('the API explorer can load the OpenAPI spec it links to', () => {
  const explorer = pages.find(({ file }) => file === path.join('api', 'explorer', 'index.html'));
  assert.match(explorer.html, /url: '\/api\/openapi\.yaml'/);
  assert.ok(builtFile('/api/openapi.yaml'), '/api/openapi.yaml is not in the build');
});

test('no script imports a Pagefind index the build never makes', () => {
  if (fs.existsSync(path.join(SITE, 'pagefind', 'pagefind.js'))) return;
  assert.deepEqual(scripts.filter(({ js }) => js.includes('/pagefind/pagefind.js')).map(({ file }) => file), []);
});

test('the explorer uses the key prefixes the API accepts (pk_test_ / pk_live_)', () => {
  const explorer = pages.find(({ file }) => file === path.join('api', 'explorer', 'index.html'));
  assert.doesNotMatch(explorer.html, /ferni_(test|live)_/);
  assert.match(explorer.html, /keyPrefix: 'pk_test_'/);
});

test('no link to hosts or repos that do not exist for visitors', () => {
  // status.ferni.ai has no DNS record; discord.gg/ferni is an unknown invite; ferni-ai/voiceai is
  // the only public repo in the org (ferni-sdk, ferni-agents, marketplace-agents 404 logged out).
  const dead = /https:\/\/(status\.ferni\.ai|discord\.gg\/ferni|stackoverflow\.com\/questions\/tagged\/ferni-ai|github\.com\/ferni-ai\/(?!voiceai\b)[\w.-]+)/g;
  const hits = pages.flatMap(({ file, html }) => [...html.matchAll(dead)].map((m) => `${file}: ${m[0]}`));
  assert.deepEqual([...new Set(hits)], []);
});
