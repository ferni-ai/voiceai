#!/usr/bin/env node
/**
 * The publish check behind blog-publish-check.yml (plain Node, no install):
 *   urls --site <id> --files <list> --out <posts.json>   changed files -> posts and URLs
 *   verify --posts <posts.json> [--out <results.json>]   200 + title within --timeout, else exit 1
 *   indexnow --site <id> --posts <posts.json>            submit the URLs, else exit 1
 */
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { SITES, pageShowsPost, postsFor } from './published-urls.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    site: { type: 'string' },
    files: { type: 'string' },
    posts: { type: 'string' },
    out: { type: 'string' },
    timeout: { type: 'string', default: '300' },
    interval: { type: 'string', default: '15' },
  },
});
const cmd = positionals[0];
const summary = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
};
const site = () => {
  if (!SITES[values.site])
    throw new Error(`--site must be one of ${Object.keys(SITES).join(', ')}`);
  return values.site;
};
const readPosts = () => JSON.parse(fs.readFileSync(values.posts, 'utf8'));

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    return { status: res.status, html: await res.text() };
  } catch (err) {
    return { status: 0, html: '', error: String(err) };
  }
}

async function verify() {
  const posts = readPosts();
  const deadline = Date.now() + Number(values.timeout) * 1000;
  const pending = new Map(posts.map((p) => [p.url, p]));
  const last = new Map();
  while (pending.size > 0) {
    for (const post of [...pending.values()]) {
      const res = await get(post.url);
      last.set(post.url, res);
      if (pageShowsPost(res.status, res.html, post.title)) pending.delete(post.url);
    }
    if (pending.size === 0 || Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, Number(values.interval) * 1000));
  }
  const results = posts.map((post) => {
    const res = last.get(post.url);
    const ok = !pending.has(post.url);
    const why = ok
      ? 'live'
      : res.status === 200
        ? 'HTTP 200 but the title is not on the page'
        : `HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`;
    summary(`- ${ok ? 'OK' : 'NOT LIVE'} ${post.url} (${post.file}): ${why}`);
    return { ...post, ok, why };
  });
  if (values.out) fs.writeFileSync(values.out, JSON.stringify(results, null, 2));
  if (pending.size > 0) {
    console.error(`::error::${pending.size} blog post(s) not live after ${values.timeout}s`);
    process.exit(1);
  }
}

async function indexnow() {
  const id = site();
  const { origin, indexNowKey } = SITES[id];
  const urls = readPosts().map((p) => p.url);
  if (urls.length === 0) return;
  const key = fs.readFileSync(indexNowKey, 'utf8').trim();
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) throw new Error(`${indexNowKey} is not an IndexNow key`);
  const keyLocation = `${origin}/indexnow-key.txt`;
  const served = await get(keyLocation);
  if (served.status !== 200 || served.html.trim() !== key) {
    throw new Error(`${keyLocation} does not serve the key (HTTP ${served.status})`);
  }
  const body = { host: new URL(origin).host, key, keyLocation, urlList: urls };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  // 200 OK, 202 Accepted (key validation pending); anything else is a failure.
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow answered HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  summary(`IndexNow accepted ${urls.length} URL(s) for ${origin} (HTTP ${res.status})`);
}

function urls() {
  const id = site();
  const files = fs
    .readFileSync(values.files, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const posts = postsFor(id, files);
  fs.writeFileSync(values.out, JSON.stringify(posts, null, 2));
  summary(
    posts.length
      ? `${posts.length} post(s) to check on ${SITES[id].origin}`
      : `No blog posts changed for ${SITES[id].origin}`
  );
}

const commands = { urls, verify, indexnow };
if (!commands[cmd]) {
  console.error('usage: publish-check.mjs urls|verify|indexnow ...');
  process.exit(2);
}
try {
  await commands[cmd]();
} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}
