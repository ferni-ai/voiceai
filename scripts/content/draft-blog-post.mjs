#!/usr/bin/env node
/**
 * Draft a ferni.ai blog post for human review.
 *
 * Reads the existing posts (to avoid repeating topics) and what shipped
 * recently (git log), asks Gemini for a post in Ferni's voice, and writes
 * apps/website/ferni-website/src/blog/<slug>.md. The blog-autopilot workflow
 * opens a PR with it; merging that PR publishes it (deploy-firebase.yml).
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/content/draft-blog-post.mjs [--topic "..."] [--dry-run]
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-2.5-flash),
 *      BLOG_TOPIC (same as --topic). Writes the new file path to
 *      $GITHUB_OUTPUT as `post` and `title` when running in Actions.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const BLOG_DIR = join(ROOT, 'apps/website/ferni-website/src/blog');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CATEGORIES = ['Announcements', 'Behind the Scenes', 'Product', 'Growth', 'Stories'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const topicIdx = args.indexOf('--topic');
const topic = (topicIdx >= 0 ? args[topicIdx + 1] : process.env.BLOG_TOPIC || '').trim();

/** Front matter fields we care about from existing posts. */
function readExistingPosts() {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const text = readFileSync(join(BLOG_DIR, file), 'utf8');
      const field = (name) => text.match(new RegExp(`^${name}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))?.[1] ?? '';
      return { file, title: field('title'), category: field('category'), date: field('date') };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Conventional-commit subjects from the last few weeks (user-visible work only). */
function recentShippedWork() {
  try {
    const log = execFileSync('git', ['log', '--since=21 days ago', '--pretty=format:%s', '--no-merges'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return log
      .split('\n')
      .filter((s) => /^(feat|fix|perf)(\(|:)/.test(s))
      .slice(0, 40);
  } catch {
    return [];
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function buildPrompt(existing, shipped) {
  return `You write for the Ferni blog (ferni.ai). Ferni is a voice-first AI companion with a
small team of AI specialists (Ferni, Maya for habits, Peter for research, Jordan for
planning, Alex for communication, Nayan for wisdom). Brand belief: "We believe in making AI
human." Voice: warm, plain-spoken, a little playful, short sentences, contractions, no hype,
no corporate filler, no emojis.

HONESTY RULES (non-negotiable):
- Do not invent statistics, user counts, studies, quotes, customers or user anecdotes.
- Do not present hypothetical scenarios as things that happened; label them ("Imagine...").
- Only describe product capabilities that appear in the shipped-work list or existing titles.
- Ferni is not therapy; never imply clinical outcomes.

Existing posts (do not repeat these topics):
${existing.map((p) => `- ${p.title} [${p.category}]`).join('\n')}

Recently shipped (use for Product/Behind the Scenes angles; translate to user benefits):
${shipped.length ? shipped.map((s) => `- ${s}`).join('\n') : '- (nothing notable)'}

${topic ? `Requested topic: ${topic}` : 'Pick the single most useful fresh topic for people who talk to Ferni.'}

Return JSON only:
{
  "title": "under 70 characters",
  "excerpt": "one or two sentences, under 180 characters",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "readTime": integer minutes,
  "body": "Markdown body, 600-1000 words, ## headings, no H1, no front matter"
}`;
}

async function generate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  const post = JSON.parse(text);
  for (const key of ['title', 'excerpt', 'category', 'body']) {
    if (typeof post[key] !== 'string' || !post[key].trim()) throw new Error(`Model response missing "${key}"`);
  }
  if (!CATEGORIES.includes(post.category)) post.category = 'Growth';
  post.readTime = Number.isInteger(post.readTime) ? post.readTime : Math.max(3, Math.round(post.body.split(/\s+/).length / 220));
  return post;
}

/** YAML single-quoted scalar. */
const yamlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

function toMarkdown(post, date) {
  return `---
title: ${yamlString(post.title)}
excerpt: ${yamlString(post.excerpt)}
author: 'The Ferni Team'
authorInitials: 'FE'
authorColor: 'var(--color-ferni)'
date: ${date}
category: ${yamlString(post.category)}
readTime: ${post.readTime}
---

${post.body.trim()}
`;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set; nothing drafted.');
    process.exit(1);
  }

  const existing = readExistingPosts();
  const post = await generate(buildPrompt(existing, recentShippedWork()));
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(post.title);
  const file = join(BLOG_DIR, `${slug}.md`);
  const markdown = toMarkdown(post, date);

  if (dryRun) {
    console.log(markdown);
    return;
  }
  if (existsSync(file)) throw new Error(`A post already exists at ${file}`);

  writeFileSync(file, markdown);
  console.log(`Drafted: ${file}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `post=${file}\ntitle=${post.title.replace(/\n/g, ' ')}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
