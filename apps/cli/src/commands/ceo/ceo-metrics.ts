#!/usr/bin/env npx tsx
/**
 * CEO Metrics - KPIs across all functions
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface MetricsData {
  period: string;
  finance: {
    mrr: number;
    arr: number;
    burn: number;
    cac: number;
    ltv: number;
    ltvCacRatio: number;
  };
  product: {
    dau: number;
    mau: number;
    retention: number;
    sessionLength: number;
    featureAdoption: number;
  };
  engineering: {
    velocity: number;
    deployFrequency: number;
    mttr: number;
    changeFailure: number;
  };
  growth: {
    newUsers: number;
    activationRate: number;
    churnRate: number;
    viralCoefficient: number;
  };
}

async function fetchMetrics(period: string): Promise<MetricsData> {
  // TODO: Pull from real data sources
  return {
    period,
    finance: {
      mrr: 125000,
      arr: 1500000,
      burn: 85000,
      cac: 150,
      ltv: 2400,
      ltvCacRatio: 16,
    },
    product: {
      dau: 850,
      mau: 2450,
      retention: 78,
      sessionLength: 12.5,
      featureAdoption: 65,
    },
    engineering: {
      velocity: 42,
      deployFrequency: 8.5,
      mttr: 45,
      changeFailure: 3.2,
    },
    growth: {
      newUsers: 320,
      activationRate: 68,
      churnRate: 2.1,
      viralCoefficient: 1.3,
    },
  };
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

function renderComparison(current: number, previous: number): string {
  const change = ((current - previous) / previous) * 100;
  if (change > 0) return `${colors.green}↑ ${change.toFixed(1)}%${colors.reset}`;
  if (change < 0) return `${colors.red}↓ ${Math.abs(change).toFixed(1)}%${colors.reset}`;
  return `${colors.dim}→ 0%${colors.reset}`;
}

export async function ceoMetrics(options: { period?: string; compare?: boolean }): Promise<void> {
  const period = options.period || 'month';
  const data = await fetchMetrics(period);

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           CEO METRICS - COMPANY KPIs                       ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Period: ${period}${options.compare ? ' (with comparison)' : ''}${colors.reset}

${colors.bold}${colors.green}💰 Finance${colors.reset}
  MRR:            ${formatCurrency(data.finance.mrr)}${options.compare ? ` ${renderComparison(data.finance.mrr, 115000)}` : ''}
  ARR:            ${formatCurrency(data.finance.arr)}
  Monthly Burn:   ${formatCurrency(data.finance.burn)}
  CAC:            ${formatCurrency(data.finance.cac)}
  LTV:            ${formatCurrency(data.finance.ltv)}
  LTV/CAC Ratio:  ${data.finance.ltvCacRatio}x ${data.finance.ltvCacRatio >= 3 ? colors.green + '✓' : colors.yellow + '⚠'}${colors.reset}

${colors.bold}${colors.yellow}📱 Product${colors.reset}
  DAU:            ${data.product.dau.toLocaleString()}${options.compare ? ` ${renderComparison(data.product.dau, 780)}` : ''}
  MAU:            ${data.product.mau.toLocaleString()}
  DAU/MAU:        ${((data.product.dau / data.product.mau) * 100).toFixed(0)}%
  Retention:      ${data.product.retention}%
  Avg Session:    ${data.product.sessionLength} min
  Feature Adopt:  ${data.product.featureAdoption}%

${colors.bold}${colors.blue}⚙️ Engineering${colors.reset}
  Velocity:       ${data.engineering.velocity} pts/sprint${options.compare ? ` ${renderComparison(data.engineering.velocity, 38)}` : ''}
  Deploy Freq:    ${data.engineering.deployFrequency}/week
  MTTR:           ${data.engineering.mttr} min
  Change Failure: ${data.engineering.changeFailure}% ${data.engineering.changeFailure < 5 ? colors.green + '✓' : colors.yellow + '⚠'}${colors.reset}

${colors.bold}${colors.red}📈 Growth${colors.reset}
  New Users:      ${data.growth.newUsers}/month${options.compare ? ` ${renderComparison(data.growth.newUsers, 280)}` : ''}
  Activation:     ${data.growth.activationRate}%
  Churn:          ${data.growth.churnRate}% ${data.growth.churnRate < 5 ? colors.green + '✓' : colors.yellow + '⚠'}${colors.reset}
  Viral Coef:     ${data.growth.viralCoefficient} ${data.growth.viralCoefficient > 1 ? colors.green + '✓' : ''}${colors.reset}

${colors.dim}Run 'ferni ceo metrics --compare' to see period-over-period changes${colors.reset}
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const periodIdx = args.findIndex((a) => a === '--period');
  ceoMetrics({
    period: periodIdx >= 0 ? args[periodIdx + 1] : undefined,
    compare: args.includes('--compare'),
  }).catch(console.error);
}
