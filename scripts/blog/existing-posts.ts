/** The posts already in a blog folder, so a draft doesn't repeat one. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { citedPrNumbers } from './live-check.js';

export interface ExistingPost {
  slug: string;
  title: string;
  date: string;
  series?: string;
  /** The markdown after the front matter (repetition.ts). */
  body: string;
  /** Every PR the post links to or lists in its sources. */
  cited: number[];
}

export function existingPosts(dir: string): ExistingPost[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
      const { data, content } = matter(raw);
      const date =
        data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? '');
      const series = typeof data.series === 'string' ? data.series : undefined;
      const slug = f.replace(/\.md$/, '');
      const title = String(data.title ?? '');
      return { slug, title, date, series, body: content, cited: citedPrNumbers(raw) };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
}
