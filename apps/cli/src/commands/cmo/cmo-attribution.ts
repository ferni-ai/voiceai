#!/usr/bin/env npx tsx
/**
 * CMO Attribution - Multi-touch attribution
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface ChannelAttribution {
  channel: string;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  timeDecay: number;
  conversions: number;
  revenue: number;
}

async function fetchAttribution(): Promise<ChannelAttribution[]> {
  return [
    { channel: 'Organic Search', firstTouch: 35, lastTouch: 28, linear: 30, timeDecay: 29, conversions: 120, revenue: 3600 },
    { channel: 'Direct', firstTouch: 15, lastTouch: 32, linear: 25, timeDecay: 28, conversions: 95, revenue: 2850 },
    { channel: 'Social', firstTouch: 25, lastTouch: 18, linear: 20, timeDecay: 19, conversions: 65, revenue: 1950 },
    { channel: 'Referral', firstTouch: 18, lastTouch: 15, linear: 17, timeDecay: 16, conversions: 55, revenue: 1650 },
    { channel: 'Paid', firstTouch: 7, lastTouch: 7, linear: 8, timeDecay: 8, conversions: 28, revenue: 840 },
  ];
}

export async function cmoAttribution(options: { model?: string; channels?: boolean; journey?: boolean }): Promise<void> {
  const data = await fetchAttribution();
  const model = options.model || 'linear';

  console.log(`
${colors.bold}${colors.red}╔═══════════════════════════════════════════════════════════╗
║           CMO ATTRIBUTION - CHANNEL PERFORMANCE            ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Model: ${model}${colors.reset}
`);

  console.log(`${colors.bold}Channel Attribution${colors.reset}`);
  console.log(`┌─────────────────┬─────────┬─────────┬─────────┬─────────┬──────────┐`);
  console.log(`│ Channel         │ 1st Tch │ Last Tch│ Linear  │ Time Dec│ Revenue  │`);
  console.log(`├─────────────────┼─────────┼─────────┼─────────┼─────────┼──────────┤`);

  for (const ch of data) {
    console.log(`│ ${ch.channel.padEnd(15)} │ ${(ch.firstTouch + '%').padStart(7)} │ ${(ch.lastTouch + '%').padStart(7)} │ ${(ch.linear + '%').padStart(7)} │ ${(ch.timeDecay + '%').padStart(7)} │ $${ch.revenue.toLocaleString().padStart(7)} │`);
  }

  console.log(`└─────────────────┴─────────┴─────────┴─────────┴─────────┴──────────┘`);

  if (options.journey) {
    console.log(`
${colors.bold}Typical Customer Journey${colors.reset}
  Social Post → Blog Article → Direct Visit → Trial → Conversion
      (7d)         (3d)           (1d)        (14d)
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cmoAttribution({ model: args.find((_, i, a) => a[i - 1] === '--model'), channels: args.includes('--channels'), journey: args.includes('--journey') }).catch(console.error);
}
