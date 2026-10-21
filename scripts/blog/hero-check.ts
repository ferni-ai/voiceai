/**
 * Every consumer blog post on ferni.ai needs a hero image: an `image:` front
 * matter line, alt text, and the file itself in images/blog. The drafter makes
 * one for the posts it writes (hero-image.ts), but a post can also arrive by a
 * hand-written PR or an edit, and on 2026-10-18 the Oct 16 post had shipped
 * without one, the only bare card on /blog. The unit test runs this over the
 * real posts, so a post with no picture can't merge.
 *
 * Developer posts (apps/website/developers-portal) have no hero images.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export const BLOG_DIR = 'apps/website/ferni-website/src/blog';
export const IMAGE_DIR = 'apps/website/ferni-website/images/blog';

/** The value of one front matter key, unquoted, or undefined when absent or empty. */
export function frontMatterValue(markdown: string, key: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1];
  if (!block) return undefined;
  const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(block)?.[1]?.trim();
  const value = line?.replace(/^(['"])(.*)\1$/, '$2').trim();
  return value ? value : undefined;
}

/** What one post is missing, as short reasons. Empty when the post is complete. */
export function heroProblems(markdown: string, imageExists: (file: string) => boolean): string[] {
  const image = frontMatterValue(markdown, 'image');
  if (!image) return ['no image: line'];
  const problems: string[] = [];
  if (!frontMatterValue(markdown, 'imageAlt')) problems.push('no imageAlt: line');
  if (image.includes('/') || image.includes('..')) problems.push(`image must be a file name: ${image}`);
  else if (!imageExists(image)) problems.push(`image file missing: ${IMAGE_DIR}/${image}`);
  return problems;
}

/** Every post in the blog directory that is missing part of its hero, keyed by file. */
export function missingHeroes(root: string): Record<string, string[]> {
  const blogDir = path.join(root, BLOG_DIR);
  const imageDir = path.join(root, IMAGE_DIR);
  const out: Record<string, string[]> = {};
  for (const file of readdirSync(blogDir).filter((f) => f.endsWith('.md')).sort()) {
    const problems = heroProblems(readFileSync(path.join(blogDir, file), 'utf8'), (img) =>
      existsSync(path.join(imageDir, img))
    );
    if (problems.length) out[file] = problems;
  }
  return out;
}
