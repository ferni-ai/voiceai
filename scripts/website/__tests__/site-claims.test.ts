import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClaims, scanSite, SITE_SRC } from '../site-claims.js';

const root = path.resolve(__dirname, '../../..');
const site = (file: string): string => fs.readFileSync(path.join(root, SITE_SRC, file), 'utf8');

describe('site claims check', () => {
  it('finds no banned claim in the marketing site source', () => {
    expect(scanSite(path.join(root, SITE_SRC))).toEqual([]);
  });

  it.each([
    ['<span>End-to-End Encrypted</span>', 'end-to-end encrypted'],
    ['I never forget a single detail', 'never forgets'],
    ['Six specialists, one conversation, infinite memory.', 'infinite memory'],
    ['<h3>Perfect Memory</h3>', 'perfect memory'],
    ['<td>Free forever</td>', 'free forever'],
    ['<h4>Micro-Expressions</h4>', 'micro-expressions'],
    ['<strong>Breath Synchronization</strong>', 'breath sync'],
    ['Decades of clinical experience', 'decades of clinical experience'],
    ['Ferni responds in under 500ms', 'under 500ms'],
    ['146 Tool Domains', 'tool domain count'],
    ['45+ Superhuman Capabilities', 'capability count'],
    ['<span>GDPR Compliant</span>', 'gdpr compliant'],
    ['<span>SSO/SAML</span>', 'sso saml'],
    ['<span>Data Residency Options</span>', 'data residency'],
    ['I was created by mental health professionals', 'created by clinicians'],
    ['Professionals. Technologists. Working together.', 'professionals and technologists'],
    ['what if a lifetime of mental health wisdom could reach anyone', 'mental health wisdom'],
    ['Built by a family of healers.<br>', 'built by healers'],
    ['Detects distress from voice and content patterns.', 'predicts distress'],
    ['Ferni predicts distress from voice and content', 'predicts distress'],
    ['Distress signals from voice patterns trigger care', 'predicts distress'],
    ['Detects burnout signals days before you crash.', 'predicts burnout'],
    ['We warn you before you hit the wall.', 'predicts burnout'],
    ['<span>Burnout Prevention</span>', 'predicts burnout'],
    ['voice characteristics for speaker identification', 'voice identification'],
    ['Voice recognition identifies you', 'voice identification'],
    ['in your words, your voice, your meaning', 'messages in your voice'],
    ['I know your calendar, your energy patterns', 'knows your calendar'],
    ['Alex manages your calendar and email', 'knows your calendar'],
    ['Spots spending patterns and wealth-building', 'spending patterns'],
    ['patterns nobody else sees across your spending', 'spending patterns'],
    ['<td>Perfect recall, forever</td>', 'perfect recall'],
  ])('flags %s', (line, id) => {
    expect(findClaims('index.njk', `<p>\n${line}\n</p>`)).toEqual([
      expect.objectContaining({ file: 'index.njk', line: 2, id }),
    ]);
  });

  it('lets an allowed phrase stay only in its own file', () => {
    const text = 'The Problem With Perfect Memory';
    expect(findClaims('blog/how-ferni-remembers-you.md', text)).toEqual([]);
    expect(findClaims('blog/other.md', text)).toHaveLength(1);
  });

  it('leaves true wording alone', () => {
    const ok =
      'Encrypted in transit and at rest. I remember what matters, and you can forget any of it. Free in early access.';
    expect(findClaims('index.njk', ok)).toEqual([]);
  });
});

/** The page source with folded FAQ answers and scripts removed: what a reader sees without clicking. */
const visible = (html: string): string =>
  html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

/** The source of the first <section> whose opening tag matches. */
function section(html: string, opening: RegExp): string {
  const chunk = html.split('<section').find((part) => opening.test(part.slice(0, part.indexOf('>'))));
  if (!chunk) throw new Error(`no section matching ${opening}`);
  return chunk;
}

describe('claims true today (#1455 #1457 #1446 #1454)', () => {
  it.each([
    ['index.njk', /class="section two-am"/],
    ['index.njk', /class="showcase"/],
    ['index.njk', /class="section memory-demo"/],
    ['index.njk', /class="section assistant"/],
    ['story-brand.njk', /class="section two-am"/],
    ['story-brand.njk', /class="showcase"/],
    ['story-brand.njk', /class="section memory-demo"/],
  ])('%s labels the sample conversation in %s as illustrative', (file, opening) => {
    expect(section(site(file), opening)).toMatch(/class="example-note">[^<]*[Ii]llustrative example/);
  });

  it.each(['index.njk', 'about.njk', 'capabilities.njk'])(
    '%s says, outside any folded FAQ, that Ferni is not a substitute for professional help',
    (file) => {
      expect(visible(site(file))).toMatch(/(?:isn't|I'm not) a substitute for professional help/);
    }
  );

  it('privacy page says voice identification and voice copies are not offered and need consent first', () => {
    const privacy = site('privacy.njk');
    expect(privacy).toMatch(/doesn't identify you by the sound of your voice/);
    expect(privacy).toMatch(/Neither is offered today/);
    expect(privacy).toMatch(/explicit consent/);
  });

  it.each(['index.njk', 'features.njk'])('%s says calendar connection is not available yet', (file) => {
    expect(site(file)).toMatch(/Connecting your calendar isn't available yet/);
  });

  it.each([
    `${SITE_SRC}/index.njk`,
    `${SITE_SRC}/story-brand.njk`,
    `${SITE_SRC}/_includes/layouts/story-brand.njk`,
    'src/i18n/locales/en-US.json',
    'src/i18n/locales/en-GB.json',
  ])('%s does not say a phone call recognises your number', (file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    expect(text).not.toMatch(/\brecogni[sz]e your number\b|\blinked to your phone number\b/i);
  });

  it('no locale calls Ferni a life coach or an AI coach in the team role or hero', () => {
    const dir = path.join(root, SITE_SRC, '_data/i18n');
    const locales = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const t = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      expect([file, t.team.ferni.role]).not.toEqual([file, expect.stringMatching(/coach|コーチ|코치|教练|教練|مدرب|מאמן/i)]);
      expect([file, t.hero.eyebrow]).not.toEqual([file, expect.stringMatching(/\b(AI|IA|KI)\b|coach|コーチ|코치|教练|教練|مدرب|מאמן/i)]);
    }
    const json = JSON.parse(site('_data/site.json'));
    expect(json.team.find((m: { id: string }) => m.id === 'ferni').role).not.toMatch(/coach/i);
    expect(`${json.tagline} ${json.hero.eyebrow}`).not.toMatch(/coach|\bAI\b/i);
    expect(site('index.njk')).not.toMatch(/^title: .*Life Coach/m);
    expect(site('_includes/layouts/base.njk')).not.toMatch(/life coaching/i);
  });

  it('the demo partial does not promise a conversation with no sign-up', () => {
    expect(site('_includes/partials/home/demo.njk')).not.toMatch(/no sign-?up required/i);
  });

  it('the home stylesheet styles the illustrative and care labels', () => {
    const css = site('css/story-brand.css');
    expect(css).toMatch(/^\.example-note \{/m);
    expect(css).toMatch(/^\.care-note \{/m);
  });
});
