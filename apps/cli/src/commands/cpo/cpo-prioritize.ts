#!/usr/bin/env npx tsx
/**
 * CPO Prioritize - Feature scoring (impact/effort)
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface Feature {
  id: string;
  title: string;
  impact: number;
  effort: number;
  reach: number;
  confidence: number;
  rice: number;
}

async function fetchFeatures(): Promise<Feature[]> {
  const features = [
    { id: 'F-101', title: 'Team collaboration', impact: 9, effort: 8, reach: 500, confidence: 90 },
    { id: 'F-102', title: 'Voice cloning', impact: 7, effort: 5, reach: 2000, confidence: 80 },
    { id: 'F-103', title: 'Mobile widget', impact: 6, effort: 4, reach: 1500, confidence: 70 },
    { id: 'F-104', title: 'API access', impact: 8, effort: 6, reach: 300, confidence: 85 },
  ];
  return features.map(f => ({ ...f, rice: (f.reach * f.impact * f.confidence / 100) / f.effort }));
}

export async function cpoPrioritize(options: { add?: string; score?: boolean; top?: number }): Promise<void> {
  const features = (await fetchFeatures()).sort((a, b) => b.rice - a.rice);
  const display = options.top ? features.slice(0, options.top) : features;

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO PRIORITIZE - FEATURE SCORING                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Sorted by RICE score (Reach × Impact × Confidence / Effort)${colors.reset}

`);

  console.log(`┌────────┬─────────────────────────┬────────┬────────┬───────┬───────┬────────┐`);
  console.log(`│ Rank   │ Feature                 │ Impact │ Effort │ Reach │ Conf  │ RICE   │`);
  console.log(`├────────┼─────────────────────────┼────────┼────────┼───────┼───────┼────────┤`);

  display.forEach((f, i) => {
    console.log(`│ #${(i + 1).toString().padEnd(5)} │ ${f.title.padEnd(23)} │ ${f.impact.toString().padEnd(6)} │ ${f.effort.toString().padEnd(6)} │ ${f.reach.toString().padEnd(5)} │ ${f.confidence}%   │ ${f.rice.toFixed(0).padStart(6)} │`);
  });

  console.log(`└────────┴─────────────────────────┴────────┴────────┴───────┴───────┴────────┘`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoPrioritize({ add: args.find((_, i, a) => a[i - 1] === '--add'), score: args.includes('--score'), top: parseInt(args.find((_, i, a) => a[i - 1] === '--top') || '0') || undefined }).catch(console.error);
}
