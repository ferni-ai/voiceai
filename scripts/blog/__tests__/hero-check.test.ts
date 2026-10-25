import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { frontMatterValue, heroProblems, missingHeroes } from '../hero-check.js';

const root = path.resolve(__dirname, '../../..');
const post = (front: string) => `---\ntitle: "A post"\n${front}---\n\nBody text.\n`;
const has = (...files: string[]) => (f: string) => files.includes(f);

describe('every ferni.ai blog post has a hero image', () => {
  it('the real posts all have an image, alt text and the file', () => {
    expect(missingHeroes(root)).toEqual({});
  });
});

describe('heroProblems', () => {
  it('passes a complete post', () => {
    const md = post('image: "a.png"\nimageAlt: "Sage lines on cream"\n');
    expect(heroProblems(md, has('a.png'))).toEqual([]);
  });

  it('flags a post with no image line', () => {
    expect(heroProblems(post('readTime: 3\n'), has())).toEqual(['no image: line']);
  });

  it('flags an empty image value', () => {
    expect(heroProblems(post('image: ""\n'), has())).toEqual(['no image: line']);
  });

  it('flags missing alt text', () => {
    expect(heroProblems(post("image: 'a.png'\n"), has('a.png'))).toEqual(['no imageAlt: line']);
  });

  it('flags an image file that does not exist', () => {
    const md = post('image: a.png\nimageAlt: x y\n');
    expect(heroProblems(md, has())).toEqual([
      'image file missing: apps/website/ferni-website/images/blog/a.png',
    ]);
  });

  it('refuses paths, so the check cannot be pointed outside images/blog', () => {
    const md = post('image: ../a.png\nimageAlt: x\n');
    expect(heroProblems(md, () => true)).toEqual(['image must be a file name: ../a.png']);
  });

  it('only reads the front matter, not an image: line in the body', () => {
    expect(frontMatterValue('---\ntitle: x\n---\nimage: a.png\n', 'image')).toBeUndefined();
  });
});
