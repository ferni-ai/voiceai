import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SITES,
  fileSlug,
  frontMatter,
  pageShowsPost,
  postUrl,
  postsFor,
  siteForWorkflow,
} from '../published-urls.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const post = (title, extra = '') =>
  `---\ntitle: ${title}\n${extra}date: 2026-10-17\n---\n\nBody.\n`;

describe('fileSlug', () => {
  it('is the file name without its extension', () => {
    expect(fileSlug('a/b/how-ferni-remembers-you.md')).toBe('how-ferni-remembers-you');
  });

  it('drops a leading date but keeps a trailing one, like Eleventy', () => {
    expect(fileSlug('a/2026-10-17-hello.md')).toBe('hello');
    expect(fileSlug('a/whats-new-2026-10-17.md')).toBe('whats-new-2026-10-17');
  });

  it('uses the folder name for an index file', () => {
    expect(fileSlug('a/blog/my-post/index.md')).toBe('my-post');
  });
});

describe('postUrl', () => {
  it('maps a website post to ferni.ai/blog/<slug> with no trailing slash', () => {
    expect(
      postUrl('apps/website/ferni-website/src/blog/why-voice-first.md', post('"Why Voice"'))
    ).toEqual({
      site: 'ferni',
      url: 'https://ferni.ai/blog/why-voice-first',
      title: 'Why Voice',
    });
  });

  it('maps a developers-portal post to developers.ferni.ai/blog/<slug>', () => {
    const file = 'apps/website/developers-portal/src/blog/whats-new-2026-10-17.md';
    expect(postUrl(file, post(`"What's New: A Faster Site"`))).toEqual({
      site: 'developers',
      url: 'https://developers.ferni.ai/blog/whats-new-2026-10-17',
      title: "What's New: A Faster Site",
    });
  });

  it('ignores files that are not posts', () => {
    expect(postUrl('apps/website/ferni-website/src/blog/blog.json', '{}')).toBeNull();
    expect(postUrl('apps/website/ferni-website/src/blog/index.njk', post('x'))).toBeNull();
    expect(postUrl('apps/website/ferni-website/src/dev-blog/a.md', post('x'))).toBeNull();
    expect(postUrl('apps/website/marketplace-portal/src/blog/a.md', post('x'))).toBeNull();
  });

  it("honours a post's own permalink, and permalink: false", () => {
    const file = 'apps/website/ferni-website/src/blog/a.md';
    expect(postUrl(file, post('x', 'permalink: /stories/a/\n')).url).toBe(
      'https://ferni.ai/stories/a'
    );
    expect(postUrl(file, post('x', 'permalink: false\n'))).toBeNull();
    expect(() => postUrl(file, post('x', 'permalink: "/{{ title }}/"\n'))).toThrow(/permalink/);
  });
});

describe('frontMatter', () => {
  it('reads quoted and plain scalars', () => {
    const fm = frontMatter(
      `---\ntitle: 'It''s here'\nexcerpt: "a \\"b\\""\ncategory: Product # note\nsources:\n  - "x"\n---\n`
    );
    expect(fm).toEqual({ title: "It's here", excerpt: 'a "b"', category: 'Product' });
  });
});

describe('the rules the mapping assumes still hold', () => {
  it.each(Object.entries(SITES))(
    '%s: blog.json permalink is /blog/{{ page.fileSlug }}/',
    (_, s) => {
      expect(JSON.parse(read(`${s.folder}blog.json`)).permalink).toBe('/blog/{{ page.fileSlug }}/');
    }
  );

  it.each([
    ['ferni', 'apps/website/ferni-website/firebase.json'],
    ['developers', 'apps/website/developers-portal/firebase.json'],
  ])('%s: firebase.json serves without a trailing slash', (_, file) => {
    const hosting = [JSON.parse(read(file)).hosting].flat()[0];
    expect(hosting.trailingSlash).toBe(false);
  });

  it.each([
    ['ferni', '.github/workflows/deploy-firebase.yml'],
    ['developers', '.github/workflows/deploy-developers.yml'],
  ])('%s: the deploy workflow name matches', (id, file) => {
    const name = /^name: (.+)$/m.exec(read(file))[1].trim();
    expect(siteForWorkflow(name)).toBe(id);
  });

  it('every existing post maps to a URL with a title', () => {
    for (const [id, s] of Object.entries(SITES)) {
      const files = fs
        .readdirSync(path.join(ROOT, s.folder))
        .filter((f) => f.endsWith('.md'))
        .map((f) => s.folder + f);
      const posts = postsFor(id, files, ROOT);
      expect(posts.length).toBe(files.length);
      for (const p of posts) {
        expect(p.url).toMatch(new RegExp(`^${s.origin}/blog/[a-z0-9-]+$`));
        expect(p.title.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('pageShowsPost', () => {
  const title = "What's New: A Faster, Lighter Ferni Website";

  it('finds the title through HTML entities and curly quotes', () => {
    expect(
      pageShowsPost(200, '<h1>What&#39;s New: A Faster, Lighter Ferni Website</h1>', title)
    ).toBe(true);
    expect(
      pageShowsPost(200, '<title>What’s New: A Faster,\n  Lighter Ferni Website</title>', title)
    ).toBe(true);
  });

  it('rejects a 200 page without the title (the site serves its 404 page with 200)', () => {
    expect(pageShowsPost(200, '<title>Page not found | Ferni</title>', title)).toBe(false);
  });

  it('rejects anything but 200, and a post with no title', () => {
    expect(pageShowsPost(404, `<h1>${title}</h1>`, title)).toBe(false);
    expect(pageShowsPost(200, '<h1></h1>', '')).toBe(false);
  });
});
