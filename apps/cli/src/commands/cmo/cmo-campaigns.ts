#!/usr/bin/env npx tsx
/**
 * CMO Campaigns - Campaign performance, optimization
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: 'active' | 'paused' | 'completed';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
  roas: number;
}

async function fetchCampaigns(): Promise<Campaign[]> {
  return [
    { id: 'C-001', name: 'Product Hunt Launch', channel: 'Organic', status: 'completed', spend: 0, impressions: 45000, clicks: 2800, conversions: 320, cpa: 0, roas: 999 },
    { id: 'C-002', name: 'Google Ads - Brand', channel: 'Paid Search', status: 'active', spend: 2500, impressions: 18000, clicks: 450, conversions: 28, cpa: 89, roas: 2.8 },
    { id: 'C-003', name: 'LinkedIn Enterprise', channel: 'Paid Social', status: 'active', spend: 3200, impressions: 12000, clicks: 180, conversions: 8, cpa: 400, roas: 1.2 },
    { id: 'C-004', name: 'Reddit AMA', channel: 'Organic', status: 'completed', spend: 0, impressions: 8500, clicks: 620, conversions: 45, cpa: 0, roas: 999 },
  ];
}

export async function cmoCampaigns(options: { active?: boolean; analyze?: string; optimize?: boolean }): Promise<void> {
  let campaigns = await fetchCampaigns();
  if (options.active) campaigns = campaigns.filter(c => c.status === 'active');

  console.log(`
${colors.bold}${colors.red}╔═══════════════════════════════════════════════════════════╗
║           CMO CAMPAIGNS - PERFORMANCE                      ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

  console.log(`${colors.bold}Summary:${colors.reset} $${totalSpend.toLocaleString()} spend | ${totalConversions} conversions | $${(totalSpend / totalConversions).toFixed(0)} avg CPA
`);

  for (const c of campaigns) {
    const ctr = ((c.clicks / c.impressions) * 100).toFixed(1);
    const cvr = ((c.conversions / c.clicks) * 100).toFixed(1);
    const roasColor = c.roas >= 3 ? colors.green : c.roas >= 1.5 ? colors.yellow : colors.red;

    console.log(`${colors.bold}${c.id}${colors.reset} ${c.name}
  ${c.channel} | ${c.status} | Spend: $${c.spend.toLocaleString()}
  ${c.impressions.toLocaleString()} imp → ${c.clicks} clicks (${ctr}% CTR) → ${c.conversions} conv (${cvr}% CVR)
  CPA: $${c.cpa} | ROAS: ${roasColor}${c.roas}x${colors.reset}
`);
  }

  if (options.optimize) {
    console.log(`${colors.bold}${colors.green}AI Optimization Suggestions${colors.reset}
  1. Pause LinkedIn Enterprise - CPA too high ($400)
  2. Increase Google Ads budget - 2.8x ROAS is profitable
  3. Run more Reddit AMAs - best organic conversion rate
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cmoCampaigns({ active: args.includes('--active'), analyze: args.find((_, i, a) => a[i - 1] === '--analyze'), optimize: args.includes('--optimize') }).catch(console.error);
}
