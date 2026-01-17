#!/usr/bin/env npx tsx
/**
 * CIO Data Catalog - Data lineage, PII inventory
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface DataSource {
  name: string;
  type: 'database' | 'api' | 'file' | 'stream';
  hasPII: boolean;
  piiFields?: string[];
  retention: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
}

async function fetchDataCatalog(): Promise<DataSource[]> {
  return [
    { name: 'users', type: 'database', hasPII: true, piiFields: ['email', 'phone', 'name'], retention: '7 years', classification: 'confidential' },
    { name: 'sessions', type: 'database', hasPII: true, piiFields: ['transcript'], retention: '30 days', classification: 'restricted' },
    { name: 'analytics', type: 'database', hasPII: false, retention: '2 years', classification: 'internal' },
    { name: 'voice_recordings', type: 'file', hasPII: true, piiFields: ['audio'], retention: '24 hours', classification: 'restricted' },
  ];
}

export async function cioDataCatalog(options: { pii?: boolean; lineage?: string; scan?: boolean }): Promise<void> {
  let sources = await fetchDataCatalog();
  if (options.pii) sources = sources.filter(s => s.hasPII);

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           CIO DATA CATALOG                                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Data Sources${colors.reset} ${options.pii ? '(PII only)' : ''}
`);

  for (const src of sources) {
    const piiStatus = src.hasPII ? `${colors.yellow}⚠ PII${colors.reset}` : `${colors.green}✓ No PII${colors.reset}`;
    console.log(`  ${colors.bold}${src.name}${colors.reset} (${src.type})
    Classification: ${src.classification} | Retention: ${src.retention}
    ${piiStatus}${src.piiFields ? `: ${src.piiFields.join(', ')}` : ''}
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cioDataCatalog({ pii: args.includes('--pii'), lineage: args.find((_, i, a) => a[i - 1] === '--lineage'), scan: args.includes('--scan') }).catch(console.error);
}
