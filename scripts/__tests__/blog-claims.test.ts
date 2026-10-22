/**
 * ferni.ai blog: claims that were false on the live site until 2026-10-21, and
 * the crisis line every post carries.
 *
 * The 2am and loneliness posts speak to someone awake and carrying something,
 * and the page had no crisis resource at all. Several older posts promised
 * things the product doesn't do today: conversations "not transcribed" (the
 * privacy policy keeps transcripts until account deletion), "we recognize your
 * number" (phone callers without a verified account start fresh;
 * CALLER_RECOGNITION is off by default), "no sign-up required" next to
 * "Ferni remembers", "delete with one click", "everything you can see, correct,
 * delete", a "Therapy Effect" section, unsourced loneliness statistics, and a
 * "life coach" CTA on every post. Review: voiceai-evidence/blog-review-2026-10-21.md.
 *
 * Each test below fails if the matching fix is reverted. A new sentence that
 * matches for a true reason should be reworded, not allowlisted here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SITE_SRC = join(REPO, 'apps/website/ferni-website/src');
const LAYOUTS = join(SITE_SRC, '_includes/layouts');
const BLOG = join(SITE_SRC, 'blog');
const DATA = join(SITE_SRC, '_data');

const read = (path: string): string => readFileSync(path, 'utf8');
const rel = (path: string): string => relative(REPO, path);

function filesUnder(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, ext);
    return entry.name.endsWith(ext) ? [path] : [];
  });
}

/** Lines in `files` matching `pattern`, as "file:line: text". */
function hits(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    read(file)
      .replace(/[‘’]/g, "'")
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${rel(file)}:${i + 1}: ${line.trim()}`] : []))
  );
}

const posts = filesUnder(BLOG, '.md');
const siteData = filesUnder(DATA, '.json');
const postLayouts = ['blog-post.njk', 'building-post.njk'].map((name) => join(LAYOUTS, name));
const crisisPartial = read(join(SITE_SRC, '_includes/partials/crisis-line.njk'));

describe('the crisis line', () => {
  it.each(postLayouts.map((path) => [rel(path), path]))('%s includes it for every post', (_, path) => {
    // Unconditional: not inside an {% if %} a post's front matter could switch off.
    const body = read(path);
    expect(body).toContain('{% include "partials/crisis-line.njk" %}');
    const before = body.slice(0, body.indexOf('partials/crisis-line.njk'));
    const opened = (before.match(/{%-?\s*if\b/g) ?? []).length;
    const closed = (before.match(/{%-?\s*endif\b/g) ?? []).length;
    expect(opened - closed).toBe(0);
  });

  it('gives 988 (call or text) and a line for people outside the US', () => {
    expect(crisisPartial).toMatch(/call or text <a href="tel:988">988<\/a>/);
    expect(crisisPartial).toContain('https://988lifeline.org/');
    expect(crisisPartial).toMatch(/outside the US, <a href="https:\/\/findahelpline\.com\/"/);
    expect(crisisPartial).toMatch(/local emergency number/);
  });

  it.each(['stories-from-the-2am-hour.md', 'the-loneliness-gap.md'])(
    '%s, written for someone awake at 2am, also says it in the post',
    (name) => {
      const post = read(join(BLOG, name));
      expect(post).toContain('call or text [988](tel:988)');
      expect(post).toContain('(https://findahelpline.com/)');
    }
  );
});

describe('the post CTA', () => {
  it.each(postLayouts.map((path) => [rel(path), path]))(
    '%s calls Ferni a friend, not a life coach, with no "AI"',
    (_, path) => {
      const body = read(path);
      expect(body).not.toMatch(/life coach/i);
      const cta = body.slice(body.indexOf('class="blog-post__cta"'));
      expect(cta).toMatch(/Ferni is a friend you can call/);
      expect(cta.slice(0, cta.indexOf('</div>'))).not.toMatch(/\bAI\b/);
    }
  );
});

describe('false claims stay out of the blog and the site data', () => {
  const banned: Array<[string, RegExp, string[]]> = [
    // privacyData.json: transcripts are kept until the account is deleted.
    ['"not transcribed"', /\bnot transcribed\b/i, posts],
    // Phone callers without a verified account run as a fresh anon id.
    [
      'number recognition',
      /recogni[sz]e (?:your|the) (?:phone )?number|remember (?:everything|your previous conversations?) (?:from previous calls|automatically)/i,
      [...posts, ...siteData],
    ],
    // The app needs a sign-in; only the phone line works without an account.
    ['"No sign-up required" in a post', /\bno sign-?up required\b/i, posts],
    ['"AI Life Coach"', /\bAI life coach\b/i, posts],
    ['one-click delete', /\bone[ -]click\b/i, posts],
    // "What I've learned" lists facts only; transcripts can't be browsed or edited.
    ['see / correct / delete everything', /everything ferni remembers, you can (?:see|correct|delete)/i, posts],
    ['"forget that," it does', /"forget that," it does/i, posts],
    ['a therapy claim', /\bthe therapy effect\b|therapists don't hand you a keyboard/i, posts],
    // Unsourced: no number goes back without the source that states it.
    ['unsourced friendship statistics', /declined by nearly 50%|6\+ hours\/week/i, posts],
    // The tip jar is optional; the post must not say nobody is asked to chip in.
    ['"nobody ... chip in" beside a chip-in ask', /nobody should be asked to pay, tip, upgrade, chip in/i, posts],
  ];

  it.each(banned)('no %s', (_, pattern, files) => {
    expect(hits(files, pattern)).toEqual([]);
  });

  it.each([
    ['es', 'Ferni reconocerá tu número'],
    ['fr', 'Ferni reconnaîtra votre numéro'],
    ['de', 'Ferni erkennt Ihre Nummer'],
    ['ja', 'Ferniはあなたの番号を認識し'],
    ['ko', 'Ferni가 번호를 인식하고'],
    ['zh-Hans', 'Ferni会识别您的号码'],
    ['zh-Hant', 'Ferni會識別您的號碼'],
    ['ar', 'Ferni سيتعرف على رقمك'],
    ['he', 'Ferni יזהה את המספר שלך'],
  ])('the %s FAQ does not say Ferni recognizes your number', (locale, phrase) => {
    expect(read(join(DATA, `i18n/${locale}.json`))).not.toContain(phrase);
  });

  it('team letters stay in character: no product status notes', () => {
    const letters = posts.filter((p) => /^series:\s*["']?letters-from-the-team/m.test(read(p)));
    expect(letters.length).toBeGreaterThan(0);
    expect(hits(letters, /development agent|a reply takes around two seconds/i)).toEqual([]);
  });
});
