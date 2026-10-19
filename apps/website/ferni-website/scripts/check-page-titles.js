#!/usr/bin/env node
/**
 * Build check: every built page has a real <title>.
 *
 * Two pages shipped broken titles that nobody saw until a new-person walk of
 * ferni.ai (2026-10-18): /team/ferni/ read " -  | Ferni" (team.json's computed
 * "{{ name }} - {{ role }}" replaced its own title, and that page has no name or
 * role) and the 404 page read "{{ 'errorPage.title' | t }} | Ferni" (a template
 * in plain front matter is not rendered). Both are what a visitor sees in the
 * tab, in search results and in shared links.
 *
 * Usage: node scripts/check-page-titles.js   (after eleventy, from ferni-website)
 */
const fs = require('fs');
const path = require('path');

/** Problems with one page's HTML; [] when its title is fine. */
function checkTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return [];
  const title = match[1].replace(/\s+/g, ' ');
  const errors = [];
  const text = title.split('|')[0].trim();
  if (!text) errors.push(`empty title "${title}"`);
  else if (/^[-–—]/.test(text)) errors.push(`title starts with a dash "${title}"`);
  if (/\{\{|\{%|\}\}|%\}/.test(title)) errors.push(`unrendered template in title "${title}"`);
  if (/&amp;(amp|lt|gt|quot|#\d+);/.test(title)) errors.push(`double-escaped title "${title}"`);
  return errors;
}

/** Every .html file under `dir`. */
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

/** Problems across a built site, each prefixed with the page's path. */
function checkSite(siteDir) {
  return htmlFiles(siteDir).flatMap((file) =>
    checkTitle(fs.readFileSync(file, 'utf8')).map(
      (error) => `${path.relative(siteDir, file)}: ${error}`
    )
  );
}

module.exports = { checkTitle, checkSite };

if (require.main === module) {
  const errors = checkSite(path.join(__dirname, '..', '_site'));
  if (errors.length) {
    console.error(`Page title check failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Page titles OK');
}
