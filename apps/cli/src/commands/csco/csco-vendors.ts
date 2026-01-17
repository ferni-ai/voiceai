#!/usr/bin/env npx tsx
/**
 * CSCO Vendors - Vendor performance and contract management
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface Vendor {
  name: string;
  category: string;
  monthlySpend: number;
  contractEnd: string;
  slaScore: number;
  criticalDependency: boolean;
  alternatives: string[];
}

async function fetchVendors(): Promise<Vendor[]> {
  return [
    { name: 'Google Cloud', category: 'Infrastructure', monthlySpend: 7000, contractEnd: '2026-12-31', slaScore: 99.9, criticalDependency: true, alternatives: ['AWS', 'Azure'] },
    { name: 'LiveKit', category: 'Real-time', monthlySpend: 1200, contractEnd: '2026-06-30', slaScore: 99.5, criticalDependency: true, alternatives: ['Agora', 'Vonage'] },
    { name: 'Cartesia', category: 'TTS', monthlySpend: 800, contractEnd: '2026-03-31', slaScore: 98.2, criticalDependency: true, alternatives: ['ElevenLabs', 'PlayHT'] },
    { name: 'OpenAI', category: 'AI/LLM', monthlySpend: 2500, contractEnd: 'Pay-as-go', slaScore: 99.1, criticalDependency: true, alternatives: ['Anthropic', 'Google AI'] },
    { name: 'Spotify', category: 'Music', monthlySpend: 0, contractEnd: '2026-09-30', slaScore: 99.8, criticalDependency: false, alternatives: ['Apple Music', 'Deezer'] },
    { name: 'Sentry', category: 'Observability', monthlySpend: 150, contractEnd: '2026-04-30', slaScore: 99.5, criticalDependency: false, alternatives: ['Datadog', 'New Relic'] },
    { name: 'Linear', category: 'Project Mgmt', monthlySpend: 80, contractEnd: '2026-02-28', slaScore: 99.9, criticalDependency: false, alternatives: ['Jira', 'Asana'] },
  ];
}

export async function cscoVendors(options: { audit?: boolean; renewals?: boolean; risks?: boolean }): Promise<void> {
  const vendors = await fetchVendors();

  console.log(`
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║           CSCO VENDORS - MANAGEMENT                        ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const totalSpend = vendors.reduce((s, v) => s + v.monthlySpend, 0);
  const criticalCount = vendors.filter(v => v.criticalDependency).length;

  console.log(`${colors.bold}Vendor Overview${colors.reset}
  Total Vendors: ${vendors.length} | Critical: ${criticalCount}
  Monthly Spend: $${totalSpend.toLocaleString()}
`);

  if (options.audit) {
    console.log(`${colors.bold}Vendor Audit${colors.reset}
┌──────────────────┬────────────────┬──────────┬────────┬──────────┐
│ Vendor           │ Category       │ Spend/mo │ SLA    │ Critical │
├──────────────────┼────────────────┼──────────┼────────┼──────────┤`);

    for (const v of vendors.sort((a, b) => b.monthlySpend - a.monthlySpend)) {
      const slaColor = v.slaScore >= 99.5 ? colors.green : v.slaScore >= 99 ? colors.yellow : colors.red;
      const criticalMarker = v.criticalDependency ? `${colors.red}●${colors.reset}` : `${colors.dim}○${colors.reset}`;
      console.log(`│ ${v.name.padEnd(16)} │ ${v.category.padEnd(14)} │ $${v.monthlySpend.toLocaleString().padStart(7)} │ ${slaColor}${v.slaScore}%${colors.reset} │ ${criticalMarker.padEnd(17)} │`);
    }
    console.log(`└──────────────────┴────────────────┴──────────┴────────┴──────────┘
`);
  }

  if (options.renewals) {
    const now = new Date();
    const soon = vendors
      .filter(v => v.contractEnd !== 'Pay-as-go')
      .map(v => ({ ...v, daysUntil: Math.ceil((new Date(v.contractEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) }))
      .filter(v => v.daysUntil <= 120)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    console.log(`${colors.bold}Upcoming Renewals (Next 120 days)${colors.reset}
`);
    if (soon.length === 0) {
      console.log(`  ${colors.green}No renewals in the next 120 days${colors.reset}
`);
    } else {
      for (const v of soon) {
        const urgency = v.daysUntil <= 30 ? colors.red + '🚨' : v.daysUntil <= 60 ? colors.yellow + '⚠️' : colors.dim + '📅';
        console.log(`  ${urgency}${colors.reset} ${colors.bold}${v.name}${colors.reset} - ${v.contractEnd} (${v.daysUntil} days)
    Spend: $${v.monthlySpend}/mo | Alternatives: ${v.alternatives.join(', ')}
`);
      }
    }
  }

  if (options.risks) {
    console.log(`${colors.bold}Vendor Risk Assessment${colors.reset}
`);
    for (const v of vendors.filter(v => v.criticalDependency)) {
      const riskLevel = v.alternatives.length === 0 ? 'HIGH' : v.alternatives.length === 1 ? 'MEDIUM' : 'LOW';
      const riskColor = riskLevel === 'HIGH' ? colors.red : riskLevel === 'MEDIUM' ? colors.yellow : colors.green;
      console.log(`  ${colors.bold}${v.name}${colors.reset} (${v.category})
    ${riskColor}Risk: ${riskLevel}${colors.reset} | Alternatives: ${v.alternatives.length > 0 ? v.alternatives.join(', ') : 'None identified'}
`);
    }
  }

  console.log(`${colors.dim}
Commands:
  ferni csco vendors --audit        # Full vendor audit
  ferni csco vendors --renewals     # Upcoming contract renewals
  ferni csco vendors --risks        # Vendor dependency risks
${colors.reset}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cscoVendors({ audit: args.includes('--audit'), renewals: args.includes('--renewals'), risks: args.includes('--risks') }).catch(console.error);
}
