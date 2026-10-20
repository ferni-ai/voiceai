/**
 * Where a blog post file is published (plain Node, for blog-publish-check.yml).
 * Both sites' blog.json set `permalink: /blog/{{ page.fileSlug }}/` and both
 * firebase.json set `trailingSlash: false`, so a post lives at /blog/<fileSlug>
 * unless its own `permalink:` says otherwise (`false`: not written).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const SITES = {
  ferni: {
    folder: 'apps/website/ferni-website/src/blog/',
    origin: 'https://ferni.ai',
    workflow: 'Deploy Firebase Hosting',
    /** Served at <origin>/indexnow-key.txt (IndexNow keys are public). */
    indexNowKey: 'apps/website/ferni-website/indexnow-key.txt',
  },
  developers: {
    folder: 'apps/website/developers-portal/src/blog/',
    origin: 'https://developers.ferni.ai',
    workflow: 'Deploy Developers Portal',
    indexNowKey: 'apps/website/developers-portal/src/indexnow-key.txt',
  },
};

/** The site whose deploy workflow has this name, or undefined. */
export function siteForWorkflow(name) {
  return Object.keys(SITES).find((id) => SITES[id].workflow === name);
}

/**
 * Eleventy's page.fileSlug: the file name without its extension, minus a
 * leading YYYY-MM-DD- date; for an index file, the name of its folder.
 */
export function fileSlug(file) {
  const base = path.posix.basename(file).replace(/\.[^.]+$/, '');
  if (base === 'index') return path.posix.basename(path.posix.dirname(file));
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function unquote(raw) {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v.replace(/\s+#.*$/, '');
}

/**
 * Top-level scalar keys of a post's YAML front matter (title, permalink, ...).
 * Nested values and lists are skipped; that's all the check needs.
 */
export function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]+(\S.*)$/.exec(line);
    if (kv) out[kv[1]] = unquote(kv[2]);
  }
  return out;
}

/**
 * The live URL of a post file (repo-relative path), or null when the file
 * isn't a post or isn't written. Throws on a permalink it can't resolve.
 */
export function postUrl(file, text) {
  const id = Object.keys(SITES).find((s) => file.startsWith(SITES[s].folder));
  if (!id || !file.endsWith('.md')) return null;
  const fm = frontMatter(text);
  let route = `/blog/${fileSlug(file)}/`;
  if (fm.permalink !== undefined) {
    if (fm.permalink === 'false') return null;
    if (!fm.permalink.startsWith('/') || fm.permalink.includes('{')) {
      throw new Error(`${file}: can't resolve permalink "${fm.permalink}"`);
    }
    route = fm.permalink;
  }
  route = route.replace(/\/index\.html$/, '/');
  if (route.length > 1) route = route.replace(/\/+$/, '');
  return { site: id, url: SITES[id].origin + route, title: fm.title ?? '' };
}

/** Posts for the given changed files that belong to one site, read from root. */
export function postsFor(site, files, root = '.') {
  const posts = [];
  for (const file of files) {
    if (!file.startsWith(SITES[site].folder)) continue;
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue; // deleted since
    const post = postUrl(file, fs.readFileSync(abs, 'utf8'));
    if (post) posts.push({ file, ...post });
  }
  return posts;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML text to plain text for matching: entities decoded, quotes and spaces folded. */
export function normalizeText(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (all, n) => ENTITIES[n.toLowerCase()] ?? all)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ');
}

/** Does this page show the post: HTTP 200 and its title in the HTML? */
export function pageShowsPost(status, html, title) {
  if (status !== 200 || !title) return false;
  return normalizeText(html).includes(normalizeText(title));
}
