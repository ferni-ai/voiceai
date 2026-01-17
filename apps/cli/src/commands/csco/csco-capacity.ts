#!/usr/bin/env npx tsx
/**
 * CSCO Capacity - Infrastructure capacity planning
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface Resource {
  name: string;
  type: string;
  currentUsage: number;
  maxCapacity: number;
  unit: string;
  growthRate: number; // % per month
}

interface ScalingRecommendation {
  resource: string;
  currentCapacity: string;
  recommendedCapacity: string;
  timeline: string;
  cost: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

async function fetchCapacityData(): Promise<{ resources: Resource[]; recommendations: ScalingRecommendation[] }> {
  return {
    resources: [
      { name: 'GCE Voice Agent', type: 'Compute', currentUsage: 65, maxCapacity: 100, unit: '%', growthRate: 8 },
      { name: 'Cloud Run API', type: 'Compute', currentUsage: 40, maxCapacity: 100, unit: '%', growthRate: 5 },
      { name: 'Firestore', type: 'Database', currentUsage: 2.8, maxCapacity: 10, unit: 'GB', growthRate: 12 },
      { name: 'Redis Cache', type: 'Memory', currentUsage: 1.2, maxCapacity: 2, unit: 'GB', growthRate: 15 },
      { name: 'Cloud Storage', type: 'Storage', currentUsage: 45, maxCapacity: 100, unit: 'GB', growthRate: 10 },
      { name: 'LiveKit Concurrent', type: 'Connections', currentUsage: 35, maxCapacity: 100, unit: 'users', growthRate: 20 },
    ],
    recommendations: [
      { resource: 'Redis Cache', currentCapacity: '2 GB', recommendedCapacity: '4 GB', timeline: '2 weeks', cost: 50, priority: 'high' },
      { resource: 'LiveKit Concurrent', currentCapacity: '100 users', recommendedCapacity: '250 users', timeline: '1 month', cost: 200, priority: 'high' },
      { resource: 'GCE Voice Agent', currentCapacity: '1 instance', recommendedCapacity: '2 instances', timeline: '6 weeks', cost: 150, priority: 'medium' },
    ],
  };
}

export async function cscoCapacity(options: { status?: boolean; forecast?: boolean; plan?: boolean }): Promise<void> {
  const { resources, recommendations } = await fetchCapacityData();

  console.log(`
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║           CSCO CAPACITY - PLANNING                         ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const criticalResources = resources.filter(r => (r.currentUsage / r.maxCapacity) >= 0.8).length;
  const warningResources = resources.filter(r => (r.currentUsage / r.maxCapacity) >= 0.6 && (r.currentUsage / r.maxCapacity) < 0.8).length;

  console.log(`${colors.bold}Capacity Overview${colors.reset}
  Resources Tracked: ${resources.length}
  ${colors.red}Critical (>80%):${colors.reset} ${criticalResources} | ${colors.yellow}Warning (60-80%):${colors.reset} ${warningResources}
`);

  if (options.status !== false) {
    console.log(`${colors.bold}Resource Utilization${colors.reset}
`);
    for (const r of resources.sort((a, b) => (b.currentUsage / b.maxCapacity) - (a.currentUsage / a.maxCapacity))) {
      const utilization = (r.currentUsage / r.maxCapacity) * 100;
      const barLength = 20;
      const filledLength = Math.round((utilization / 100) * barLength);
      const emptyLength = barLength - filledLength;
      const barColor = utilization >= 80 ? colors.red : utilization >= 60 ? colors.yellow : colors.green;
      const bar = barColor + '█'.repeat(filledLength) + colors.dim + '░'.repeat(emptyLength) + colors.reset;

      console.log(`  ${r.name.padEnd(20)} [${bar}] ${utilization.toFixed(0).padStart(3)}%
    ${colors.dim}${r.currentUsage}/${r.maxCapacity} ${r.unit} | Growth: +${r.growthRate}%/mo${colors.reset}
`);
    }
  }

  if (options.forecast) {
    console.log(`${colors.bold}90-Day Forecast${colors.reset}
`);
    for (const r of resources) {
      const currentUtil = (r.currentUsage / r.maxCapacity) * 100;
      const monthlyGrowth = r.growthRate / 100;
      const forecastUtil = Math.min(100, currentUtil * Math.pow(1 + monthlyGrowth, 3));
      const willExceed = forecastUtil >= 90;

      console.log(`  ${colors.bold}${r.name}${colors.reset}
    Now: ${currentUtil.toFixed(0)}% → 90 days: ${forecastUtil.toFixed(0)}%
    ${willExceed ? colors.red + '⚠ Will exceed capacity' : colors.green + '✓ Within limits'}${colors.reset}
`);
    }
  }

  if (options.plan) {
    const totalCost = recommendations.reduce((s, r) => s + r.cost, 0);
    console.log(`${colors.bold}Scaling Plan${colors.reset} (Est. additional cost: $${totalCost}/mo)
`);
    for (const rec of recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })) {
      const priorityColor = rec.priority === 'critical' ? colors.red : rec.priority === 'high' ? colors.yellow : colors.dim;
      console.log(`  ${priorityColor}[${rec.priority.toUpperCase()}]${colors.reset} ${colors.bold}${rec.resource}${colors.reset}
    ${rec.currentCapacity} → ${rec.recommendedCapacity}
    Timeline: ${rec.timeline} | Cost: +$${rec.cost}/mo
`);
    }
  }

  console.log(`${colors.dim}
Commands:
  ferni csco capacity               # Current utilization
  ferni csco capacity --forecast    # 90-day capacity forecast
  ferni csco capacity --plan        # Scaling recommendations
${colors.reset}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cscoCapacity({ status: true, forecast: args.includes('--forecast'), plan: args.includes('--plan') }).catch(console.error);
}
