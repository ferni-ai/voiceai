/**
 * *.ferni.ai subdomains are custom agent sites, except the reserved ones,
 * which are the app. The UI server rewrites custom sites to /sites/<x>/ and
 * never lets them be framed.
 */
import { describe, expect, it } from 'vitest';
import { customSiteSubdomain } from '../custom-site-host.js';

describe('customSiteSubdomain', () => {
  it('names the custom site, in lower case', () => {
    expect(customSiteSubdomain('joel-dickson.ferni.ai')).toBe('joel-dickson');
    expect(customSiteSubdomain('X.FERNI.AI')).toBe('x');
  });

  it.each(['app.ferni.ai', 'www.ferni.ai', 'api.ferni.ai', 'admin.ferni.ai', 'staging.ferni.ai'])(
    'is the app on the reserved subdomain %s',
    (host) => {
      expect(customSiteSubdomain(host)).toBeNull();
    }
  );

  it.each([undefined, '', 'ferni.ai', 'localhost:3002', 'a.b.ferni.ai', 'x.ferni.ai.evil.test'])(
    'is no custom site for %s',
    (host) => {
      expect(customSiteSubdomain(host)).toBeNull();
    }
  );
});
