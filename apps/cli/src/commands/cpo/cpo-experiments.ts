#!/usr/bin/env npx tsx
/**
 * CPO Experiments - A/B test results, recommendations
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface Experiment {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'stopped';
  variant: string;
  metric: string;
  control: number;
  treatment: number;
  lift: number;
  significance: number;
  recommendation: 'ship' | 'iterate' | 'kill';
}

async function fetchExperiments(): Promise<Experiment[]> {
  return [
    { id: 'EXP-042', name: 'New onboarding flow', status: 'completed', variant: 'Guided tour', metric: 'Activation rate', control: 62, treatment: 74, lift: 19.4, significance: 98, recommendation: 'ship' },
    { id: 'EXP-043', name: 'Voice speed options', status: 'active', variant: '3 speed choices', metric: 'Session length', control: 8.2, treatment: 9.1, lift: 11.0, significance: 85, recommendation: 'iterate' },
    { id: 'EXP-044', name: 'Premium upsell modal', status: 'stopped', variant: 'Aggressive CTA', metric: 'Conversion', control: 2.1, treatment: 1.8, lift: -14.3, significance: 92, recommendation: 'kill' },
  ];
}

export async function cpoExperiments(options: { active?: boolean; completed?: boolean; analyze?: string }): Promise<void> {
  let experiments = await fetchExperiments();
  if (options.active) experiments = experiments.filter(e => e.status === 'active');
  if (options.completed) experiments = experiments.filter(e => e.status === 'completed');

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO EXPERIMENTS - A/B TESTING                    ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const exp of experiments) {
    const liftColor = exp.lift > 0 ? colors.green : colors.red;
    const recColor = exp.recommendation === 'ship' ? colors.green : exp.recommendation === 'kill' ? colors.red : colors.yellow;
    console.log(`${colors.bold}${exp.id}${colors.reset} ${exp.name}
  Status: ${exp.status} | Variant: ${exp.variant}
  ${exp.metric}: ${exp.control} → ${exp.treatment} (${liftColor}${exp.lift > 0 ? '+' : ''}${exp.lift.toFixed(1)}%${colors.reset})
  Significance: ${exp.significance}% | Recommendation: ${recColor}${exp.recommendation.toUpperCase()}${colors.reset}
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoExperiments({ active: args.includes('--active'), completed: args.includes('--completed'), analyze: args.find((_, i, a) => a[i - 1] === '--analyze') }).catch(console.error);
}
