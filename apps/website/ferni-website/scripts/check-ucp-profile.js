#!/usr/bin/env node
/**
 * Build check: the built site carries Ferni's UCP agent profile (what Shopify's
 * Global Catalog reads from meta.ucp-agent.profile), and ferni.ai serves it at
 * /.well-known/ucp/agent-profile.json. Hosting's ignore list drops dotfiles,
 * so the file lives at /ucp/agent-profile.json and a rewrite maps the
 * .well-known path to it; that rewrite must come before the 404 catch-all.
 *
 * Usage: node scripts/check-ucp-profile.js   (after eleventy, from ferni-website)
 */
const fs = require('fs');
const path = require('path');

const VERSION = '2026-08-25';
const CAPABILITIES = [
  'dev.ucp.shopping.catalog.search',
  'dev.ucp.shopping.catalog.lookup',
  'dev.shopify.catalog.global',
];
const WELL_KNOWN = '/.well-known/ucp/agent-profile.json';
const SERVED = '/ucp/agent-profile.json';

/** Problems with a profile file; [] when it is valid. */
function checkProfile(file) {
  if (!fs.existsSync(file)) return [`${file} is missing`];
  let ucp;
  try {
    ucp = JSON.parse(fs.readFileSync(file, 'utf8')).ucp;
  } catch (error) {
    return [`${file} is not JSON: ${error.message}`];
  }
  const errors = [];
  if (!ucp || ucp.version !== VERSION) errors.push(`ucp.version must be ${VERSION}`);
  for (const cap of CAPABILITIES) {
    const entries = ucp && ucp.capabilities && ucp.capabilities[cap];
    if (!Array.isArray(entries) || !entries.some((e) => e.version === VERSION)) {
      errors.push(`capability ${cap} ${VERSION} is missing`);
    }
  }
  // Catalog search only: no checkout, payment or affiliate surface.
  const extra = Object.keys((ucp && ucp.capabilities) || {}).filter(
    (c) => !CAPABILITIES.includes(c)
  );
  if (extra.length) errors.push(`unexpected capabilities: ${extra.join(', ')}`);
  if (ucp && ucp.payment_handlers && Object.keys(ucp.payment_handlers).length) {
    errors.push('payment_handlers must be empty');
  }
  if (/affiliate|tag=|utm_/i.test(JSON.stringify(ucp)))
    errors.push('no affiliate or tracking fields');
  return errors;
}

/** Problems with the hosting rewrite for the .well-known path; [] when it is right. */
function checkRewrite(firebaseJson) {
  const hosting = JSON.parse(fs.readFileSync(firebaseJson, 'utf8')).hosting;
  const site = (Array.isArray(hosting) ? hosting : [hosting]).find(
    (h) => h.site === 'ferni-landing'
  );
  const rewrites = (site && site.rewrites) || [];
  const at = rewrites.findIndex((r) => r.source === WELL_KNOWN && r.destination === SERVED);
  if (at < 0) return [`no rewrite ${WELL_KNOWN} -> ${SERVED}`];
  const catchAll = rewrites.findIndex((r) => r.source === '**' || r.source.startsWith('!'));
  if (catchAll >= 0 && catchAll < at) return ['the rewrite must come before the 404 catch-all'];
  return [];
}

module.exports = { checkProfile, checkRewrite, VERSION, CAPABILITIES };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const errors = [
    ...checkProfile(path.join(root, '_site', 'ucp', 'agent-profile.json')),
    ...checkRewrite(path.join(root, 'firebase.json')),
  ];
  if (errors.length) {
    console.error(`UCP agent profile check failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('UCP agent profile OK');
}
