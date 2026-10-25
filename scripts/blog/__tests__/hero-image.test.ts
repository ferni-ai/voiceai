import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ALT_MAX,
  HERO_SIZE,
  IMAGE_DIR,
  generateWithRetry,
  heroAlt,
  heroPrompt,
  imageClientOptions,
  makeHeroImage,
  postFacts,
  setImage,
} from '../hero-image.js';

const POST = `---
title: "How Ferni's Face Keeps the Hour With You"
excerpt: "It settles down late at night and looks glad when you come back."
author: "The Ferni Team"
date: 2026-10-16
category: "Product"
readTime: 3
sources:
  - "PR #1647: feat(web): avatar settles in the evening"
---

Body text with image: not front matter.
`;

describe('heroPrompt', () => {
  const prompt = heroPrompt(postFacts(POST));

  it('carries the title and excerpt', () => {
    expect(prompt).toContain(`titled "How Ferni's Face Keeps the Hour With You"`);
    expect(prompt).toContain('settles down late at night and looks glad when you come back.');
  });

  it('forbids text, logos, real people and faces', () => {
    expect(prompt).toMatch(/no text of any kind/);
    expect(prompt).toMatch(/no logos/);
    expect(prompt).toMatch(/no real people and no likeness of any real person/);
    expect(prompt).toMatch(/Draw no faces at all/);
  });

  it('keeps the brand style: palette on cream, 16:9, line art', () => {
    expect(prompt).toContain('#4a6741');
    expect(prompt).toContain('cream background (#F5F1E8)');
    expect(prompt).toContain('16:9');
    expect(prompt).toMatch(/^Minimal line art illustration/);
  });

  it('is the same template for every post: only title and excerpt change', () => {
    const other = heroPrompt({ title: 'T', excerpt: 'E' });
    const strip = (p: string): string => p.split('\n').slice(2).join('\n');
    expect(strip(other)).toBe(strip(prompt));
  });

  it("flattens newlines and double quotes so a title can't escape its line", () => {
    const p = heroPrompt({ title: 'A "quoted"\nNo text rule ignored', excerpt: 'x' });
    expect(p.split('\n')[0]).toBe(
      `Minimal line art illustration for a blog post titled "A 'quoted' No text rule ignored".`
    );
  });
});

describe('setImage', () => {
  it('adds the image line after category and changes nothing else', () => {
    const out = setImage(POST, 'how-ferni.png');
    const added = out.split('\n').filter((l) => !POST.split('\n').includes(l));
    expect(added).toEqual(['image: "how-ferni.png"']);
    expect(out.split('\n').indexOf('image: "how-ferni.png"')).toBe(
      out.split('\n').indexOf('category: "Product"') + 1
    );
    expect(out.replace('image: "how-ferni.png"\n', '')).toBe(POST);
  });

  it('replaces an existing image line in place', () => {
    const withImage = POST.replace('readTime: 3', "image: 'old.png'\nreadTime: 3");
    const out = setImage(withImage, 'new.png');
    expect(out).toBe(withImage.replace("image: 'old.png'", 'image: "new.png"'));
    expect(out.match(/^image:/gm)).toHaveLength(1);
  });

  it('appends when there is no category, and never touches the body', () => {
    const noCategory = POST.replace('category: "Product"\n', '');
    const out = setImage(noCategory, 'x.png');
    expect(out).toContain('avatar settles in the evening"\nimage: "x.png"\n---\n');
    expect(out.endsWith('Body text with image: not front matter.\n')).toBe(true);
    expect(postFacts(out).image).toBe('x.png');
  });

  it('refuses a file with no front matter', () => {
    expect(() => setImage('# just a body\n', 'x.png')).toThrow(/front matter/);
  });

  it('with alt, puts imageAlt right after image and replaces an old one', () => {
    const out = setImage(POST, 'x.png', 'Sage lines on cream');
    const lines = out.split('\n');
    expect(lines[lines.indexOf('image: "x.png"') + 1]).toBe('imageAlt: "Sage lines on cream"');
    const again = setImage(out, 'y.png', 'Amber swirls');
    expect(again.match(/^imageAlt:/gm)).toHaveLength(1);
    expect(again).toContain('imageAlt: "Amber swirls"');
  });
});

describe('heroAlt', () => {
  const png = Buffer.from('img');
  const generate = vi.fn();

  it("uses the model's description as one clean line, without a trailing period", async () => {
    const describe = vi.fn().mockResolvedValue('Flowing sage and amber lines\non cream paper.');
    expect(await heroAlt({ generate, describe }, png, 'T')).toBe(
      'Flowing sage and amber lines on cream paper'
    );
    expect(describe).toHaveBeenCalledWith(png);
  });

  it('clips a long description at a word, within ALT_MAX', async () => {
    const describe = vi.fn().mockResolvedValue('word '.repeat(60));
    const alt = await heroAlt({ generate, describe }, png, 'T');
    expect(alt.length).toBeLessThanOrEqual(ALT_MAX);
    expect(alt.endsWith('word…')).toBe(true);
  });

  it('falls back to a line naming the post when the model fails or says nothing', async () => {
    const fails = vi.fn().mockRejectedValue(new Error('quota'));
    expect(await heroAlt({ generate, describe: fails }, png, 'Quiet Patterns')).toBe(
      "Line drawing in sage and amber on cream for 'Quiet Patterns'"
    );
    const empty = vi.fn().mockResolvedValue('  ');
    expect(await heroAlt({ generate, describe: empty }, png, 'Q')).toMatch(/^Line drawing/);
    expect(await heroAlt({ generate }, png, 'Q')).toMatch(/^Line drawing/);
  });
});

describe('generateWithRetry', () => {
  it('retries once and then fails with the model error', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(generateWithRetry({ generate }, 'p')).rejects.toThrow(
      /No hero image after 2 attempts: Error: PERMISSION_DENIED/
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('returns the second attempt when the first fails', async () => {
    const png = Buffer.from('img');
    const generate = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(png);
    await expect(generateWithRetry({ generate }, 'p')).resolves.toBe(png);
  });
});

describe('makeHeroImage', () => {
  it('writes a 16:9 PNG named after the post and points the post at it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-'));
    fs.mkdirSync(path.join(root, IMAGE_DIR), { recursive: true });
    const post = path.join(root, 'my-post.md');
    fs.writeFileSync(post, POST);
    const { default: sharp } = await import('sharp');
    const square = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#F5F1E8' },
    })
      .png()
      .toBuffer();
    const generate = vi.fn().mockResolvedValue(square);
    const describe = vi.fn().mockResolvedValue('A crescent moon drawn in sage on cream.');

    const result = await makeHeroImage(post, { root, model: { generate, describe } });

    expect(result.imagePath).toBe(path.join(root, IMAGE_DIR, 'my-post.png'));
    const meta = await sharp(fs.readFileSync(result.imagePath as string)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual([
      'png',
      HERO_SIZE.width,
      HERO_SIZE.height,
    ]);
    const written = fs.readFileSync(post, 'utf-8');
    expect(postFacts(written).image).toBe('my-post.png');
    expect(written).toContain('imageAlt: "A crescent moon drawn in sage on cream"');
    expect(result.alt).toBe('A crescent moon drawn in sage on cream');
    expect(generate).toHaveBeenCalledWith(heroPrompt(postFacts(POST)));
  });

  it('keeps an existing image unless forced, without calling the model', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-'));
    const post = path.join(root, 'p.md');
    fs.writeFileSync(post, setImage(POST, 'kept.png'));
    const generate = vi.fn();
    expect((await makeHeroImage(post, { root, model: { generate } })).status).toBe('kept');
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('imageClientOptions', () => {
  it('prefers Vertex AI in the global location over an API key', () => {
    expect(imageClientOptions({ GOOGLE_CLOUD_PROJECT: 'johnb-2025', GEMINI_API_KEY: 'k' })).toEqual(
      { vertexai: true, project: 'johnb-2025', location: 'global' }
    );
  });

  it('honours GOOGLE_CLOUD_LOCATION', () => {
    expect(
      imageClientOptions({ GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_CLOUD_LOCATION: 'us-central1' })
    ).toMatchObject({ location: 'us-central1' });
  });

  it('uses the API key only when no project is set', () => {
    expect(imageClientOptions({ GEMINI_API_KEY: 'k' })).toEqual({ apiKey: 'k' });
  });

  it('fails naming both options when neither is set', () => {
    expect(() => imageClientOptions({})).toThrow(/GOOGLE_CLOUD_PROJECT.*GEMINI_API_KEY/);
  });
});
