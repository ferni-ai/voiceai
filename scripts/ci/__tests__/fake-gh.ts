/**
 * A stand-in `gh` for running CI scripts' main() as a subprocess: serves the JSON fixtures
 * in $FAKE_GH_FIXTURES, keyed by API path (query string dropped).
 * Entry shapes: { pages: [...] }, { error: <status> } or { raw: <text> }. --paginate
 * --slurp returns every page, like gh does.
 */
export const FAKE_GH = [
  '#!/usr/bin/env node',
  "const fs = require('fs');",
  'const args = process.argv.slice(2);',
  "const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURES, 'utf8'));",
  "const path = (args.find((a) => a.startsWith('repos/')) || '').split('?')[0];",
  'const entry = fx[path];',
  "if (args[0] !== 'api' || !entry) { process.stderr.write('HTTP 404: ' + path + '\\n'); process.exit(1); }",
  "if (entry.error) { process.stderr.write('HTTP ' + entry.error + ': ' + path + '\\n'); process.exit(1); }",
  'if (entry.raw !== undefined) { process.stdout.write(entry.raw); process.exit(0); }',
  'const pages = entry.pages;',
  "if (!args.includes('--paginate')) process.stdout.write(JSON.stringify(pages[0]));",
  "else if (args.includes('--slurp')) process.stdout.write(JSON.stringify(pages));",
  "else process.stdout.write(pages.map((p) => JSON.stringify(p)).join(''));",
  '',
].join('\n');
