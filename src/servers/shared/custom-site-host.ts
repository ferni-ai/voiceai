/**
 * Custom agent sites live on *.ferni.ai subdomains (joel-dickson.ferni.ai is
 * served from /sites/joel-dickson). The reserved subdomains are the app itself.
 */
const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'staging',
  'dev',
  'test',
]);

/** The custom site a request's Host header names (lower case), or null for the app and any other host. */
export function customSiteSubdomain(host: string | undefined): string | null {
  const match = (host ?? '').match(/^([a-z0-9-]+)\.ferni\.ai$/i);
  if (!match) return null;
  const subdomain = match[1].toLowerCase();
  return RESERVED_SUBDOMAINS.has(subdomain) ? null : subdomain;
}
