#!/usr/bin/env npx tsx
/**
 * CPO Feedback - Aggregate user feedback analysis
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface FeedbackItem {
  source: 'app' | 'support' | 'social' | 'review';
  sentiment: 'positive' | 'neutral' | 'negative';
  topic: string;
  count: number;
  trend: 'up' | 'down' | 'flat';
}

async function fetchFeedback(): Promise<FeedbackItem[]> {
  return [
    { source: 'app', sentiment: 'positive', topic: 'Voice quality', count: 45, trend: 'up' },
    { source: 'support', sentiment: 'negative', topic: 'Connection issues', count: 12, trend: 'down' },
    { source: 'social', sentiment: 'positive', topic: 'Helpful conversations', count: 28, trend: 'up' },
    { source: 'review', sentiment: 'neutral', topic: 'Pricing', count: 8, trend: 'flat' },
  ];
}

export async function cpoFeedback(options: { source?: string; sentiment?: boolean; trends?: boolean }): Promise<void> {
  let items = await fetchFeedback();
  if (options.source) items = items.filter(i => i.source === options.source);

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO FEEDBACK - USER INSIGHTS                     ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (options.sentiment) {
    const bySentiment = { positive: 0, neutral: 0, negative: 0 };
    items.forEach(i => bySentiment[i.sentiment] += i.count);
    const total = Object.values(bySentiment).reduce((a, b) => a + b, 0);
    console.log(`${colors.bold}Sentiment Overview${colors.reset}
  ${colors.green}Positive: ${Math.round(bySentiment.positive / total * 100)}%${colors.reset}
  ${colors.dim}Neutral: ${Math.round(bySentiment.neutral / total * 100)}%${colors.reset}
  ${colors.red}Negative: ${Math.round(bySentiment.negative / total * 100)}%${colors.reset}
`);
  }

  console.log(`${colors.bold}Top Topics${colors.reset}`);
  for (const item of items.sort((a, b) => b.count - a.count)) {
    const sentColor = item.sentiment === 'positive' ? colors.green : item.sentiment === 'negative' ? colors.red : colors.dim;
    const trendIcon = item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→';
    console.log(`  ${sentColor}●${colors.reset} ${item.topic} (${item.count}) ${trendIcon} [${item.source}]`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoFeedback({ source: args.find((_, i, a) => a[i - 1] === '--source'), sentiment: args.includes('--sentiment'), trends: args.includes('--trends') }).catch(console.error);
}
