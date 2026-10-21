#!/usr/bin/env npx tsx
/**
 * Make the hero image for a consumer blog post with Gemini image generation
 * ("Nano Banana"), save it where the website expects it and point the post at it.
 *
 *   pnpm tsx scripts/blog/hero-image.ts <post.md> [--dry-run] [--force]
 *
 * The image goes to apps/website/ferni-website/images/blog/<post-slug>.png at the
 * size the January heroes use (2016x1134). The site build turns that one PNG into
 * AVIF/WebP/JPEG widths and the og:image crop (lib/blog-images.js), so a PNG and
 * an `image:` line are all a post needs. Auth: Vertex AI through
 * GOOGLE_CLOUD_PROJECT and Application Default Credentials when the project is
 * set (location GOOGLE_CLOUD_LOCATION, default global), else GEMINI_API_KEY,
 * which must belong to a billed project for image models.
 * BLOG_IMAGE_MODEL overrides the model. --dry-run prints the prompt only.
 * --force replaces an image the post already has. Exits 1 if no image came back.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { GeminiClientOptions } from './model.js';

/** Nano Banana Pro; the same id works on the Gemini API and on Vertex AI (global). */
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image';
/** What the January heroes in images/blog are; the build's crops assume 16:9. */
export const HERO_SIZE = { width: 2016, height: 1134 } as const;
export const IMAGE_DIR = 'apps/website/ferni-website/images/blog';
export const ATTEMPTS = 2;

export interface ImageModel {
  /** PNG/JPEG bytes of one image, or throws saying why there is none. */
  generate: (prompt: string) => Promise<Buffer>;
  /** One sentence saying what the image shows, for its alt text. */
  describe?: (png: Buffer) => Promise<string>;
}

/** The longest alt text kept; screen readers read all of it. */
export const ALT_MAX = 140;

export interface PostFacts {
  title: string;
  excerpt: string;
  image?: string;
}

/** One line, no quotes or backticks, so a title can't break out of the prompt. */
const clean = (s: string): string =>
  s
    .replace(/[\r\n]+/g, ' ')
    .replace(/["`]/g, "'")
    .trim();

/**
 * The fixed template, from apps/website/ferni-website/docs/ILLUSTRATION-STYLE-GUIDE.md:
 * minimal line art, the brand palette on cream, Japanese zen warmth. Only the
 * title and excerpt change, so every post's hero belongs to the same set.
 */
export function heroPrompt({ title, excerpt }: Pick<PostFacts, 'title' | 'excerpt'>): string {
  return [
    `Minimal line art illustration for a blog post titled "${clean(title)}".`,
    `The post is about: ${clean(excerpt)}`,
    'Pick one simple, concrete visual metaphor for that idea (nature, light, the sky, a quiet room, everyday objects, or abstract organic shapes) and draw only that.',
    'Simple continuous line drawing style: organic, flowing curves, a hand-drawn feel, a centered subject and plenty of negative space.',
    'Use at most three of these colors, as colored lines and soft washes: sage green (#4a6741), warm amber (#C4A265), terracotta (#a67a6a), coral (#c4856a), cedar brown (#9a7b5a). No black outlines. No cool blues, purples or grays.',
    'Clean warm cream background (#F5F1E8) with a faint washi paper texture.',
    'Japanese zen aesthetic, like a woodblock print or a calligraphy brush stroke: contemplative, warm, hopeful and human, never techy, corporate or digital.',
    'Wide 16:9 landscape composition; the subject fills about half the width.',
    'Strict rules: no text of any kind (no letters, words, numbers, labels, captions, signatures or color codes); no logos or brand marks; no screens, apps or user interfaces; no real people and no likeness of any real person.',
    'Draw no faces at all: no eyes, noses or mouths, not on people, the sun, the moon or anything else. If the post is about a person or a face, show the feeling through light, weather, plants or abstract organic shapes instead. Any figure is a simple flowing silhouette seen from a distance.',
  ].join('\n');
}

/** The front matter's lines (without the --- fences) and everything after it. */
function frontMatter(markdown: string): { lines: string[]; rest: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(markdown);
  if (!m) throw new Error('the post has no front matter');
  return { lines: m[1].split(/\r?\n/), rest: markdown.slice(m[0].length) };
}

function scalar(lines: string[], key: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  const raw = line.slice(key.length + 1).trim();
  if (raw.startsWith('"')) return JSON.parse(raw) as string;
  if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

export function postFacts(markdown: string): PostFacts {
  const { lines } = frontMatter(markdown);
  const title = scalar(lines, 'title');
  const excerpt = scalar(lines, 'excerpt');
  if (!title || !excerpt) throw new Error('the post needs a title and an excerpt');
  return { title, excerpt, image: scalar(lines, 'image') };
}

/**
 * Set `image: "<file>"`: replace the line if there is one, otherwise add it after
 * `category:` (where the January posts have it), or last. With `alt`, also set
 * `imageAlt:` right after it (scripts/blog/hero-check.ts requires both). Nothing
 * else changes.
 */
export function setImage(markdown: string, file: string, alt?: string): string {
  const { lines, rest } = frontMatter(markdown);
  const line = `image: ${JSON.stringify(file)}`;
  let at = lines.findIndex((l) => l.startsWith('image:'));
  if (at >= 0) lines[at] = line;
  else {
    const category = lines.findIndex((l) => l.startsWith('category:'));
    at = category >= 0 ? category + 1 : lines.length;
    lines.splice(at, 0, line);
  }
  if (alt !== undefined) {
    const altLine = `imageAlt: ${JSON.stringify(alt)}`;
    const old = lines.findIndex((l) => l.startsWith('imageAlt:'));
    if (old >= 0) lines[old] = altLine;
    else lines.splice(at + 1, 0, altLine);
  }
  return `---\n${lines.join('\n')}\n---\n${rest}`;
}

/**
 * Alt text for the hero: the model's own description of the image it drew, as one
 * clean line of at most ALT_MAX characters. If it can't describe it, a plain line
 * naming the post, so a post never ships without alt text.
 */
export async function heroAlt(model: ImageModel, png: Buffer, title: string): Promise<string> {
  const fallback = clean(`Line drawing in sage and amber on cream for "${title}"`);
  if (!model.describe) return fallback;
  try {
    const said = clean(await model.describe(png)).replace(/\.$/, '');
    if (!said) return fallback;
    return said.length <= ALT_MAX ? said : `${said.slice(0, ALT_MAX - 1).replace(/\s+\S*$/, '')}…`;
  } catch (error) {
    console.error(`Alt text: the model couldn't describe the image (${String(error)})`);
    return fallback;
  }
}

/**
 * Vertex AI first, the reverse of the drafter's order: image models need a billed
 * project, which CI's Vertex credentials have and its Gemini API key may not.
 */
export function imageClientOptions(env: NodeJS.ProcessEnv = process.env): GeminiClientOptions {
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (project) return { vertexai: true, project, location: env.GOOGLE_CLOUD_LOCATION || 'global' };
  if (env.GEMINI_API_KEY) return { apiKey: env.GEMINI_API_KEY };
  throw new Error(
    'Set GOOGLE_CLOUD_PROJECT (Vertex AI with Google credentials), or a billed GEMINI_API_KEY'
  );
}

/** Gemini image generation through @google/genai. */
export async function geminiImageModel(): Promise<ImageModel> {
  const options = imageClientOptions();
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI(options);
  const model = process.env.BLOG_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  return {
    async generate(prompt) {
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
        },
      });
      const candidate = res.candidates?.[0];
      const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
      const why = [
        res.promptFeedback?.blockReason && `blocked: ${res.promptFeedback.blockReason}`,
        candidate?.finishReason && `finish reason: ${candidate.finishReason}`,
        res.text && `said: ${res.text.slice(0, 300)}`,
      ].filter(Boolean);
      throw new Error(`${model} returned no image (${why.join('; ') || 'empty response'})`);
    },
    async describe(png) {
      const res = await client.models.generateContent({
        model: process.env.BLOG_ALT_MODEL || 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
              {
                text: 'Write alt text for this blog illustration: one plain sentence, under 20 words, saying what is drawn and in which colors. No "image of", no quotes.',
              },
            ],
          },
        ],
      });
      return res.text ?? '';
    },
  };
}

/** Center-crop and resize to HERO_SIZE, as PNG. */
export async function toHeroPng(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(bytes)
    .resize(HERO_SIZE.width, HERO_SIZE.height, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Ask twice before giving up; the last error is the one reported. */
export async function generateWithRetry(model: ImageModel, prompt: string): Promise<Buffer> {
  let last: unknown;
  for (let n = 1; n <= ATTEMPTS; n++) {
    try {
      // Sequential on purpose: a retry only happens after a failure.
      // eslint-disable-next-line no-await-in-loop
      return await model.generate(prompt);
    } catch (error) {
      last = error;
      console.error(`Image attempt ${n}/${ATTEMPTS} failed: ${String(error)}`);
    }
  }
  throw new Error(`No hero image after ${ATTEMPTS} attempts: ${String(last)}`);
}

export interface HeroResult {
  status: 'written' | 'kept' | 'dry-run';
  prompt: string;
  imagePath?: string;
  alt?: string;
}

export async function makeHeroImage(
  postPath: string,
  opts: { root: string; model?: ImageModel; dryRun?: boolean; force?: boolean }
): Promise<HeroResult> {
  const markdown = fs.readFileSync(postPath, 'utf-8');
  const facts = postFacts(markdown);
  const prompt = heroPrompt(facts);
  if (opts.dryRun) return { status: 'dry-run', prompt };
  if (facts.image && !opts.force) return { status: 'kept', prompt };
  if (!opts.model) throw new Error('no image model');

  const file = `${path.basename(postPath, '.md')}.png`;
  const imagePath = path.join(opts.root, IMAGE_DIR, file);
  const png = await toHeroPng(await generateWithRetry(opts.model, prompt));
  fs.writeFileSync(imagePath, png);
  const alt = await heroAlt(opts.model, png, facts.title);
  fs.writeFileSync(postPath, setImage(markdown, file, alt));
  return { status: 'written', prompt, imagePath, alt };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const post = positionals[0];
  if (!post) {
    console.error('usage: hero-image.ts <post.md> [--dry-run] [--force]');
    process.exit(2);
  }
  const dryRun = values['dry-run'] ?? false;
  const result = await makeHeroImage(post, {
    root: process.cwd(),
    dryRun,
    force: values.force,
    model: dryRun ? undefined : await geminiImageModel(),
  });
  if (result.status === 'dry-run') console.log(result.prompt);
  else if (result.status === 'kept')
    console.log(`${post} already has an image; --force replaces it.`);
  else console.log(`Wrote ${result.imagePath} and set image: and imageAlt: in ${post}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`Hero image failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
