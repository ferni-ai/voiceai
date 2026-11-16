#!/usr/bin/env node
// Post-deploy smoke check for marketplace.ferni.ai (and its PR preview channels).
//
//   node scripts/smoke-check.mjs <base-url>
//
// Fetches the home page, collects every internal href and src on it, and
// fails when any of them answers with a status other than 200, 301 or 308.
// A redirect must also land on a 200, so a link that redirects into a 404
// still fails. Exit 0 = every link is fine, 1 = broken links, 2 = the home
// page itself did not load.
//
// Run by .github/workflows/deploy-marketplace.yml after every deploy. Node 22+
// (global fetch), no dependencies.

const OK_FIRST_HOP = new Set([200, 301, 308]);
const HOME_ATTEMPTS = 6;
const HOME_RETRY_MS = 10_000;

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/smoke-check.mjs <base-url>');
  process.exit(2);
}
const origin = new URL(base).origin;

async function fetchHome() {
  for (let attempt = 1; attempt <= HOME_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${origin}/`);
      if (res.status === 200) return res.text();
      console.log(`home attempt ${attempt}: HTTP ${res.status}`);
    } catch (err) {
      console.log(`home attempt ${attempt}: ${err.message}`);
    }
    if (attempt < HOME_ATTEMPTS) await new Promise((r) => setTimeout(r, HOME_RETRY_MS));
  }
  return null;
}

/** Root-relative and same-origin absolute links; protocol-relative (//host) is external. */
function internalLinks(html) {
  const links = new Set();
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#]+)/gi)) {
    const raw = m[1].trim();
    if (raw.startsWith('//')) continue;
    let url;
    try {
      url = new URL(raw, `${origin}/`);
    } catch {
      continue;
    }
    if (url.origin === origin) links.add(url.pathname + url.search);
  }
  return [...links].sort();
}

async function check(path) {
  const url = `${origin}${path}`;
  try {
    const first = await fetch(url, { redirect: 'manual' });
    if (!OK_FIRST_HOP.has(first.status)) return `HTTP ${first.status}`;
    if (first.status === 200) return null;
    const final = await fetch(url);
    return final.status === 200
      ? null
      : `HTTP ${first.status} -> ${final.url} HTTP ${final.status}`;
  } catch (err) {
    return err.message;
  }
}

const html = await fetchHome();
if (html === null) {
  console.error(`::error::${origin}/ did not return 200 after ${HOME_ATTEMPTS} attempts`);
  process.exit(2);
}

const links = internalLinks(html);
const results = await Promise.all(links.map(async (path) => [path, await check(path)]));
const broken = results.filter(([, problem]) => problem);

for (const [path, problem] of results)
  console.log(`${problem ? 'FAIL' : 'ok  '} ${path}${problem ? `  (${problem})` : ''}`);
console.log(`${links.length} internal links on ${origin}/, ${broken.length} broken`);

if (links.length === 0) {
  console.error(
    '::error::the home page has no internal links; the page or the link pattern is wrong'
  );
  process.exit(1);
}
if (broken.length > 0) {
  for (const [path, problem] of broken) console.error(`::error::${origin}${path} ${problem}`);
  process.exit(1);
}
