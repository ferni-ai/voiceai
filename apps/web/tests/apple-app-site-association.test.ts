/**
 * What the iPhone app needs from the web app: an apple-app-site-association
 * file (scripts/apple-app-site-association.ts) that opens only Ferni's shared
 * links in the app, served as JSON by Firebase Hosting.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AASA_PATH,
  type AasaComponent,
  appId,
  appleAppSiteAssociationPlugin,
  buildAppleAppSiteAssociation,
} from '../scripts/apple-app-site-association';

const WEB = resolve(__dirname, '..');
const APP_ID = 'XT8W26YE9U.com.sethdford.ferni';

/** AASA pattern to RegExp: `*` is any run of characters, `?` exactly one. */
function pattern(p: string): RegExp {
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${body}$`);
}

/** Apple's rule: components are tried in order, the first match decides, no match means Safari. */
function opensApp(components: AasaComponent[], href: string): boolean {
  const url = new URL(href, 'https://app.ferni.ai');
  for (const c of components) {
    if (!pattern(c['/']).test(url.pathname)) continue;
    const query = Object.entries(c['?'] ?? {});
    if (
      !query.every(([k, v]) => url.searchParams.has(k) && pattern(v).test(url.searchParams.get(k)!))
    )
      continue;
    return !c.exclude;
  }
  return false;
}

const aasa = buildAppleAppSiteAssociation();
const components = aasa.applinks.details[0]?.components ?? [];

describe('apple-app-site-association', () => {
  it('names the app by team id and bundle id, for links and for passwords', () => {
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0]?.appIDs).toEqual([APP_ID]);
    expect(aasa.webcredentials).toEqual({ apps: [APP_ID] });
  });

  it('rejects a malformed team id or bundle id instead of shipping a file iOS ignores', () => {
    expect(() => appId('xt8w26ye9u')).toThrow(/team id/);
    expect(() => appId('XT8W26YE9', 'com.sethdford.ferni')).toThrow(/team id/);
    expect(() => appId('XT8W26YE9U', 'ferni')).toThrow(/bundle id/);
  });

  it('is an allowlist: no catch-all pattern, every entry a deliberate include', () => {
    for (const c of components) {
      expect(c['/'], c.comment).not.toMatch(/^\/?\*/);
      expect(c.exclude, c.comment).toBe(false);
    }
  });

  it.each([
    '/grow/k3j9x2-meadow',
    '/?ref=k3j9x2-meadow',
    '/?referral=k3j9x2-meadow&utm_source=sms',
  ])('opens the app for the shared link %s', (href) =>
    expect(opensApp(components, href)).toBe(true)
  );

  it.each([
    '/',
    '/?utm_source=newsletter',
    '/?ref=',
    '/grow/',
    '/blog/why-ferni',
    '/privacy',
    '/terms',
    '/legal/privacy',
    '/about',
    '/admin',
    '/settings',
    '/cli-auth',
    '/a/action-1',
    '/p/pending-1',
    '/shared/token-1',
    '/auth/google/callback?code=x&ref=y',
    '/__/auth/handler',
    '/api/waitlist/approve/abc',
    '/.well-known/apple-app-site-association',
  ])('keeps %s in Safari', (href) => expect(opensApp(components, href)).toBe(false));

  it('the Vite plugin emits the file at /.well-known/apple-app-site-association, no extension', () => {
    const emitted: { fileName: string; source: string }[] = [];
    const hook = appleAppSiteAssociationPlugin().generateBundle as unknown as (
      this: unknown
    ) => void;
    hook.call({ emitFile: (f: { fileName: string; source: string }) => emitted.push(f) });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.fileName).toBe('.well-known/apple-app-site-association');
    expect(AASA_PATH).toBe(emitted[0]?.fileName);
    expect(JSON.parse(emitted[0]?.source ?? '')).toEqual(aasa);
  });

  it('is wired into the production build', () => {
    expect(readFileSync(resolve(WEB, 'vite.config.ts'), 'utf8')).toMatch(
      /plugins:\s*\[[^\]]*appleAppSiteAssociationPlugin\(\)/
    );
  });

  it('every Hosting site serves it as application/json, with no redirect in the way', () => {
    const { hosting } = JSON.parse(readFileSync(resolve(WEB, 'firebase.json'), 'utf8')) as {
      hosting: {
        target: string;
        redirects?: { source: string }[];
        cleanUrls?: boolean;
        trailingSlash?: boolean;
        headers: { source: string; headers: { key: string; value: string }[] }[];
      }[];
    };
    expect(hosting.length).toBeGreaterThan(0);
    for (const site of hosting) {
      const rule = site.headers.find((h) => h.source === `/${AASA_PATH}`);
      expect(rule, site.target).toBeDefined();
      expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
      // Hosting serves a deployed file before any rewrite, so the "**" -> /index.html
      // rewrite cannot swallow it; only a redirect or URL rewriting could move it.
      expect(site.redirects ?? [], site.target).toEqual([]);
      expect(site.cleanUrls, site.target).not.toBe(true);
      expect(site.trailingSlash, site.target).toBeUndefined();
    }
  });
});
