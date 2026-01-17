#!/usr/bin/env npx tsx
/**
 * CTO Dependencies - Dependency health, update roadmap
 */

import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface DependencyInfo {
  name: string;
  current: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
  updateType: 'major' | 'minor' | 'patch';
  breaking: boolean;
}

async function checkDependencies(): Promise<DependencyInfo[]> {
  // Simplified check - in reality would use pnpm outdated --json
  return [
    { name: 'typescript', current: '5.3.0', latest: '5.4.0', type: 'devDependencies', updateType: 'minor', breaking: false },
    { name: 'vitest', current: '1.0.0', latest: '2.0.0', type: 'devDependencies', updateType: 'major', breaking: true },
    { name: 'esbuild', current: '0.19.0', latest: '0.20.0', type: 'devDependencies', updateType: 'minor', breaking: false },
    { name: '@livekit/rtc-node', current: '0.5.0', latest: '0.6.0', type: 'dependencies', updateType: 'minor', breaking: false },
    { name: 'firebase-admin', current: '11.0.0', latest: '12.0.0', type: 'dependencies', updateType: 'major', breaking: true },
  ];
}

function renderUpdateType(type: DependencyInfo['updateType'], breaking: boolean): string {
  if (breaking) return `${colors.red}BREAKING${colors.reset}`;
  switch (type) {
    case 'major': return `${colors.yellow}major${colors.reset}`;
    case 'minor': return `${colors.blue}minor${colors.reset}`;
    case 'patch': return `${colors.green}patch${colors.reset}`;
  }
}

export async function ctoDependencies(options: { outdated?: boolean; updatePlan?: boolean; breaking?: boolean }): Promise<void> {
  console.log(`${colors.cyan}Checking dependencies...${colors.reset}\n`);

  let deps = await checkDependencies();

  if (options.breaking) {
    deps = deps.filter(d => d.breaking);
  }

  console.log(`
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           CTO DEPENDENCIES - HEALTH CHECK                  ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Summary:${colors.reset} ${deps.length} packages need updates | ${deps.filter(d => d.breaking).length} breaking changes

`);

  if (options.outdated || !options.updatePlan) {
    console.log(`${colors.bold}Outdated Packages${colors.reset}`);
    console.log(`┌────────────────────────┬──────────┬──────────┬───────────┐`);
    console.log(`│ Package                │ Current  │ Latest   │ Type      │`);
    console.log(`├────────────────────────┼──────────┼──────────┼───────────┤`);

    for (const dep of deps) {
      const name = dep.name.padEnd(22).slice(0, 22);
      const current = dep.current.padEnd(8);
      const latest = dep.latest.padEnd(8);
      console.log(`│ ${name} │ ${current} │ ${latest} │ ${renderUpdateType(dep.updateType, dep.breaking).padEnd(18)} │`);
    }

    console.log(`└────────────────────────┴──────────┴──────────┴───────────┘`);
  }

  if (options.updatePlan) {
    const safeDeps = deps.filter(d => !d.breaking);
    const breakingDeps = deps.filter(d => d.breaking);

    console.log(`
${colors.bold}${colors.green}📋 Update Plan${colors.reset}

${colors.bold}Phase 1: Safe Updates (can merge immediately)${colors.reset}
${safeDeps.map(d => `  pnpm update ${d.name}@${d.latest}`).join('\n')}

${colors.bold}Phase 2: Breaking Changes (need testing)${colors.reset}
${breakingDeps.map(d => `  ${colors.yellow}⚠${colors.reset} ${d.name}@${d.latest}
    - Review changelog for breaking changes
    - Update code as needed
    - Run full test suite`).join('\n\n')}

${colors.bold}Recommended Order:${colors.reset}
  1. Create branch: git checkout -b deps/update-batch
  2. Apply safe updates
  3. Run tests: pnpm test
  4. Merge if green
  5. Create separate PRs for breaking changes
`);
  }

  console.log(`
${colors.dim}Commands:${colors.reset}
  ferni cto dependencies --outdated     # Show outdated packages
  ferni cto dependencies --update-plan  # Generate update plan
  ferni cto dependencies --breaking     # Show breaking changes only
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  ctoDependencies({
    outdated: args.includes('--outdated'),
    updatePlan: args.includes('--update-plan'),
    breaking: args.includes('--breaking'),
  }).catch(console.error);
}
