#!/usr/bin/env npx tsx
/**
 * CIO Vendors - Vendor security assessments
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface Vendor {
  name: string;
  category: string;
  securityScore: number;
  lastAssessment: string;
  soc2: boolean;
  gdpr: boolean;
  renewalDate: string;
}

async function fetchVendors(): Promise<Vendor[]> {
  return [
    { name: 'Google Cloud', category: 'Infrastructure', securityScore: 95, lastAssessment: '2024-12-01', soc2: true, gdpr: true, renewalDate: '2025-12-01' },
    { name: 'LiveKit', category: 'Real-time Communication', securityScore: 88, lastAssessment: '2024-11-15', soc2: true, gdpr: true, renewalDate: '2025-06-01' },
    { name: 'Cartesia', category: 'TTS Provider', securityScore: 82, lastAssessment: '2024-10-01', soc2: false, gdpr: true, renewalDate: '2025-03-01' },
    { name: 'OpenAI', category: 'LLM Provider', securityScore: 90, lastAssessment: '2024-12-15', soc2: true, gdpr: true, renewalDate: '2025-09-01' },
  ];
}

export async function cioVendors(options: { pending?: boolean; assess?: string; renew?: boolean }): Promise<void> {
  const vendors = await fetchVendors();

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           CIO VENDOR SECURITY                              ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const v of vendors) {
    const scoreColor = v.securityScore >= 85 ? colors.green : v.securityScore >= 70 ? colors.yellow : colors.red;
    console.log(`${colors.bold}${v.name}${colors.reset} (${v.category})
  Security: ${scoreColor}${v.securityScore}/100${colors.reset} | SOC2: ${v.soc2 ? '✓' : '✗'} | GDPR: ${v.gdpr ? '✓' : '✗'}
  Last Assessment: ${v.lastAssessment} | Renewal: ${v.renewalDate}
`);
  }

  if (options.renew) {
    const upcoming = vendors.filter(v => new Date(v.renewalDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
    console.log(`${colors.yellow}Contracts expiring in 90 days:${colors.reset}`);
    upcoming.forEach(v => console.log(`  • ${v.name} - ${v.renewalDate}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cioVendors({ pending: args.includes('--pending'), assess: args.find((_, i, a) => a[i - 1] === '--assess'), renew: args.includes('--renew') }).catch(console.error);
}
