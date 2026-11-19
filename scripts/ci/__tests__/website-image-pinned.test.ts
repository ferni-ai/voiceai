/**
 * The website screenshots only match one exact Chromium build. Microsoft rebuilds a Playwright
 * image tag in place: mcr.microsoft.com/playwright:v1.64.1-noble went from Chromium 156.0.8078.4
 * to .80, and every Website checks run failed from then on (#3708). So website-checks.yml must
 * name each Playwright image by digest, and the local docker command in the visual spec must
 * name the same image, so a local approval uses the image CI compares against.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const WORKFLOW = join(ROOT, '.github/workflows/website-checks.yml');
const SPEC = join(ROOT, 'e2e/website-visual.spec.ts');

const IMAGE = /mcr\.microsoft\.com\/playwright:[^\s"'\\]+/g;
const PINNED = /^mcr\.microsoft\.com\/playwright:v[\d.]+-[a-z]+@sha256:[0-9a-f]{64}$/;

/** Every Playwright image reference in the text, as written. */
export function playwrightImages(text: string): string[] {
  return text.match(IMAGE) ?? [];
}

/** The Playwright image references in the text that are not pinned by digest. */
export function unpinnedImages(text: string): string[] {
  return playwrightImages(text).filter((ref) => !PINNED.test(ref));
}

describe('website-checks Playwright image', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  it('names every Playwright image by digest', () => {
    expect(playwrightImages(workflow).length).toBeGreaterThanOrEqual(2);
    expect(unpinnedImages(workflow)).toEqual([]);
  });

  it('uses one image for every job', () => {
    expect(new Set(playwrightImages(workflow)).size).toBe(1);
  });

  it("has the visual spec's local docker command use the workflow's image", () => {
    const [image] = playwrightImages(workflow);
    const command = readFileSync(SPEC, 'utf8')
      .split('\n')
      .find((line) => line.includes('mcr.microsoft.com/playwright:') && line.trim().endsWith('\\'));
    expect(command, 'the spec header must keep its docker run command').toBeDefined();
    expect(playwrightImages(command ?? '')).toEqual([image]);
  });

  it('flags a tag-only image and a short digest', () => {
    const tagOnly = '      image: mcr.microsoft.com/playwright:v1.64.1-noble\n';
    const shortDigest = '      image: mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b5\n';
    expect(unpinnedImages(tagOnly)).toEqual(['mcr.microsoft.com/playwright:v1.64.1-noble']);
    expect(unpinnedImages(shortDigest)).toHaveLength(1);
  });
});
