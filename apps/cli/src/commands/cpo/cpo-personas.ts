#!/usr/bin/env npx tsx
/**
 * CPO Personas - User persona insights
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface Persona {
  name: string;
  segment: string;
  size: number;
  avgRevenue: number;
  retention: number;
  topUseCase: string;
  painPoints: string[];
}

async function fetchPersonas(): Promise<Persona[]> {
  return [
    { name: 'Busy Professional', segment: 'B2C Premium', size: 850, avgRevenue: 29, retention: 82, topUseCase: 'Daily check-ins', painPoints: ['Limited time', 'Wants quick value'] },
    { name: 'Wellness Seeker', segment: 'B2C Free', size: 1200, avgRevenue: 0, retention: 45, topUseCase: 'Stress relief', painPoints: ['Skeptical of AI', 'Privacy concerns'] },
    { name: 'Team Lead', segment: 'B2B Pilot', size: 50, avgRevenue: 99, retention: 90, topUseCase: 'Team wellness', painPoints: ['Needs admin features', 'ROI reporting'] },
  ];
}

export async function cpoPersonas(options: { segment?: string; behavior?: boolean; journey?: boolean }): Promise<void> {
  let personas = await fetchPersonas();
  if (options.segment) personas = personas.filter(p => p.segment.toLowerCase().includes(options.segment!.toLowerCase()));

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO PERSONAS - USER SEGMENTS                     ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const p of personas) {
    console.log(`${colors.bold}${p.name}${colors.reset} (${p.segment})
  Size: ${p.size} users | ARPU: $${p.avgRevenue} | Retention: ${p.retention}%
  Top Use Case: ${p.topUseCase}
  Pain Points: ${p.painPoints.join(', ')}
`);
  }

  if (options.journey) {
    console.log(`${colors.bold}User Journey Map${colors.reset}
  Awareness → Trial → Activation → Engagement → Retention → Expansion
      ↓          ↓         ↓            ↓           ↓           ↓
    Social    Free     Onboarding   Daily use   Features   Referral
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoPersonas({ segment: args.find((_, i, a) => a[i - 1] === '--segment'), behavior: args.includes('--behavior'), journey: args.includes('--journey') }).catch(console.error);
}
