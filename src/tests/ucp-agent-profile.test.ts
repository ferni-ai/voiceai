/**
 * Ferni's UCP agent profile (read by Shopify's Global Catalog) ships with
 * ferni.ai and is served at /.well-known/ucp/agent-profile.json. The site's
 * build runs the same check (apps/website/ferni-website/scripts/check-ucp-profile.js);
 * this runs it in the main suite, on the source profile and the hosting config.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = join(process.cwd(), 'apps/website/ferni-website');
const require = createRequire(import.meta.url);
const { checkProfile, checkRewrite } = require(join(SITE, 'scripts/check-ucp-profile.js')) as {
  checkProfile: (file: string) => string[];
  checkRewrite: (firebaseJson: string) => string[];
};

const PROFILE = join(SITE, 'ucp/agent-profile.json');
const FIREBASE = join(SITE, 'firebase.json');

/** A copy of `file` with `edit` applied to its parsed JSON. */
function edited(file: string, edit: (json: Record<string, any>) => void): string {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  edit(json);
  const out = join(mkdtempSync(join(tmpdir(), 'ucp-')), 'copy.json');
  writeFileSync(out, JSON.stringify(json));
  return out;
}

describe('Ferni UCP agent profile', () => {
  it('declares catalog search, lookup and the global catalog at 2026-08-25, nothing else', () => {
    expect(checkProfile(PROFILE)).toEqual([]);
  });

  it('is served at /.well-known/ucp/agent-profile.json before the 404 catch-all', () => {
    expect(checkRewrite(FIREBASE)).toEqual([]);
  });

  it('the check rejects a missing capability, a wrong version, checkout or affiliate fields', () => {
    const missing = edited(PROFILE, (j) => delete j.ucp.capabilities['dev.shopify.catalog.global']);
    expect(checkProfile(missing)).toEqual([
      'capability dev.shopify.catalog.global 2026-08-25 is missing',
    ]);
    const oldVersion = edited(PROFILE, (j) => (j.ucp.version = '2026-01-11'));
    expect(checkProfile(oldVersion)).toContain('ucp.version must be 2026-08-25');
    const checkout = edited(
      PROFILE,
      (j) => (j.ucp.capabilities['dev.ucp.shopping.checkout'] = [{ version: '2026-08-25' }])
    );
    expect(checkProfile(checkout)).toEqual(['unexpected capabilities: dev.ucp.shopping.checkout']);
    const affiliate = edited(PROFILE, (j) => (j.ucp.affiliate_id = 'ferni-20'));
    expect(checkProfile(affiliate)).toEqual(['no affiliate or tracking fields']);
  });

  it('the check rejects a missing rewrite or one after the catch-all', () => {
    const site = (j: Record<string, any>) =>
      j.hosting.find((h: { site: string }) => h.site === 'ferni-landing');
    const none = edited(FIREBASE, (j) => {
      site(j).rewrites = site(j).rewrites.filter(
        (r: { source: string }) => !r.source.includes('.well-known')
      );
    });
    expect(checkRewrite(none)).toEqual([
      'no rewrite /.well-known/ucp/agent-profile.json -> /ucp/agent-profile.json',
    ]);
    const late = edited(FIREBASE, (j) => {
      const rewrites = site(j).rewrites;
      rewrites.unshift({ source: '**', destination: '/index.html' });
    });
    expect(checkRewrite(late)).toEqual(['the rewrite must come before the 404 catch-all']);
  });
});
