#!/usr/bin/env npx tsx
/**
 * Zombie Revision Cleanup Tool
 * 
 * PROBLEM: Old Cloud Run revisions with min-instances>0 keep running even with 0% HTTP traffic.
 * For voice agents using LiveKit, these "zombies" register with LiveKit on startup but have
 * stale WebSocket connections. LiveKit dispatches jobs to ALL registered workers (including zombies),
 * causing failures like "runner initialization timed out" and "assignment for job timed out".
 * 
 * SOLUTION: This tool detects and removes zombie revisions, ensuring only the active revision
 * is running and can receive LiveKit job dispatches.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-zombies.ts              # Check all services
 *   npx tsx scripts/cleanup-zombies.ts --fix        # Fix zombie revisions
 *   npx tsx scripts/cleanup-zombies.ts --service=voiceai-agent  # Check specific service
 *   npx tsx scripts/cleanup-zombies.ts --fix --service=voiceai-agent  # Fix specific service
 */

import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  // Services that use LiveKit and need zombie prevention
  livekitServices: ['voiceai-agent'],
  // Other Cloud Run services
  otherServices: ['john-bogle-ui'],
};

// ============================================================================
// COLORS
// ============================================================================

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

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  zombie: (msg: string) => console.log(`${colors.red}🧟${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// UTILITIES
// ============================================================================

function exec(cmd: string, silent = false): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (silent) return '';
    throw error;
  }
}

interface Revision {
  name: string;
  createdAt: string;
  hasTraffic: boolean;
  trafficPercent: number;
}

interface ServiceStatus {
  serviceName: string;
  isLiveKit: boolean;
  activeRevision: string | null;
  allRevisions: Revision[];
  zombieRevisions: Revision[];
  isHealthy: boolean;
  message: string;
}

function getServiceStatus(serviceName: string): ServiceStatus {
  const isLiveKit = CONFIG.livekitServices.includes(serviceName);
  
  // Get all revisions with their traffic
  const revisionsRaw = exec(
    `gcloud run revisions list --service=${serviceName} --region=${CONFIG.region} --project=${CONFIG.projectId} --format='csv[no-heading](name,metadata.creationTimestamp,status.conditions[0].status)'`,
    true
  ).trim();
  
  if (!revisionsRaw) {
    return {
      serviceName,
      isLiveKit,
      activeRevision: null,
      allRevisions: [],
      zombieRevisions: [],
      isHealthy: true,
      message: 'Service not found or no revisions',
    };
  }
  
  // Get traffic info
  const trafficRaw = exec(
    `gcloud run services describe ${serviceName} --region=${CONFIG.region} --project=${CONFIG.projectId} --format='yaml(status.traffic)'`,
    true
  );
  
  // Parse traffic assignments
  const trafficMap = new Map<string, number>();
  const trafficMatches = trafficRaw.matchAll(/revisionName: ([^\s]+)\s+.*?percent: (\d+)/gs);
  for (const match of trafficMatches) {
    trafficMap.set(match[1], parseInt(match[2], 10));
  }
  
  // Also check for latestRevision: true
  if (trafficRaw.includes('latestRevision: true')) {
    const percentMatch = trafficRaw.match(/latestRevision: true\s+percent: (\d+)/);
    if (percentMatch) {
      // Will need to find the latest revision and mark it
    }
  }
  
  // Parse revisions
  const allRevisions: Revision[] = revisionsRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, createdAt] = line.split(',');
      const trafficPercent = trafficMap.get(name) || 0;
      return {
        name,
        createdAt,
        hasTraffic: trafficPercent > 0,
        trafficPercent,
      };
    });
  
  // Find the active revision (the one with traffic)
  let activeRevision = allRevisions.find((r) => r.hasTraffic)?.name || null;
  
  // If no explicit traffic, check for latestRevision: true in traffic config
  if (!activeRevision && allRevisions.length > 0) {
    // Sort by creation time to find latest
    const sorted = [...allRevisions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Check if this matches the traffic config
    if (trafficRaw.includes('latestRevision: true')) {
      activeRevision = sorted[0]?.name || null;
      if (activeRevision) {
        const rev = allRevisions.find((r) => r.name === activeRevision);
        if (rev) {
          rev.hasTraffic = true;
          rev.trafficPercent = 100;
        }
      }
    }
  }
  
  // Identify zombies: revisions without traffic
  const zombieRevisions = allRevisions.filter((r) => !r.hasTraffic);
  
  // Determine health
  let isHealthy = true;
  let message = '';
  
  if (isLiveKit) {
    // For LiveKit services, ANY extra revision is dangerous
    if (zombieRevisions.length > 0) {
      isHealthy = false;
      message = `${zombieRevisions.length} zombie revision(s) can cause LiveKit job failures`;
    } else if (allRevisions.length === 1) {
      message = 'Single revision running - optimal for LiveKit';
    } else {
      message = `${allRevisions.length} revisions (check traffic distribution)`;
    }
  } else {
    // For non-LiveKit services, multiple revisions are less critical
    if (zombieRevisions.length > 3) {
      isHealthy = false;
      message = `${zombieRevisions.length} zombie revisions (cleanup recommended)`;
    } else {
      message = `${allRevisions.length} revision(s), ${zombieRevisions.length} without traffic`;
    }
  }
  
  return {
    serviceName,
    isLiveKit,
    activeRevision,
    allRevisions,
    zombieRevisions,
    isHealthy,
    message,
  };
}

function cleanupZombies(status: ServiceStatus, dryRun: boolean): number {
  let deletedCount = 0;
  
  if (status.zombieRevisions.length === 0) {
    log.success(`No zombies to clean up for ${status.serviceName}`);
    return 0;
  }
  
  for (const zombie of status.zombieRevisions) {
    if (dryRun) {
      log.zombie(`[DRY RUN] Would delete: ${zombie.name}`);
      deletedCount++;
    } else {
      try {
        exec(
          `gcloud run revisions delete ${zombie.name} --region=${CONFIG.region} --project=${CONFIG.projectId} --quiet`,
          true
        );
        log.success(`Deleted zombie: ${zombie.name}`);
        deletedCount++;
      } catch (error) {
        log.warn(`Could not delete ${zombie.name} (may be marked as 'latest')`);
      }
    }
  }
  
  return deletedCount;
}

// ============================================================================
// MAIN
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}ZOMBIE REVISION CLEANUP TOOL${colors.reset}

${colors.bold}Problem:${colors.reset}
  Old Cloud Run revisions with min-instances>0 keep running even with 0% traffic.
  For voice agents, these "zombies" register with LiveKit but have stale connections.
  LiveKit dispatches jobs to ALL workers, including zombies, causing failures:
  - "runner initialization timed out"
  - "assignment for job timed out"
  - "LiveKit worker connection is dead"

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/cleanup-zombies.ts                    # Check all services
  npx tsx scripts/cleanup-zombies.ts --fix              # Fix zombie revisions  
  npx tsx scripts/cleanup-zombies.ts --service=<name>   # Check specific service
  npx tsx scripts/cleanup-zombies.ts --fix --dry-run    # Preview what would be deleted

${colors.bold}Options:${colors.reset}
  --fix              Delete zombie revisions
  --dry-run          Show what would be deleted without actually deleting
  --service=<name>   Target a specific service (default: all)
  --help, -h         Show this help

${colors.bold}Services monitored:${colors.reset}
  ${colors.red}LiveKit (critical):${colors.reset} ${CONFIG.livekitServices.join(', ')}
  ${colors.dim}Other:${colors.reset} ${CONFIG.otherServices.join(', ')}

${colors.bold}Examples:${colors.reset}
  # Quick health check
  npx tsx scripts/cleanup-zombies.ts

  # Fix Ferni voice agent issues
  npx tsx scripts/cleanup-zombies.ts --fix --service=voiceai-agent

  # Preview cleanup for all services
  npx tsx scripts/cleanup-zombies.ts --fix --dry-run

${colors.bold}Add to npm scripts:${colors.reset}
  npm run zombies          # Check for zombies
  npm run zombies:fix      # Fix zombie revisions
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  
  const shouldFix = args.includes('--fix');
  const dryRun = args.includes('--dry-run');
  const serviceArg = args.find((a) => a.startsWith('--service='));
  const targetService = serviceArg?.split('=')[1];
  
  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}ZOMBIE REVISION DETECTOR${colors.reset}                                   ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Preventing LiveKit job dispatch failures                    ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);
  
  // Determine which services to check
  let services: string[];
  if (targetService) {
    services = [targetService];
  } else {
    services = [...CONFIG.livekitServices, ...CONFIG.otherServices];
  }
  
  log.step('CHECKING SERVICES');
  
  const results: ServiceStatus[] = [];
  let hasZombies = false;
  
  for (const service of services) {
    log.info(`Checking ${service}...`);
    const status = getServiceStatus(service);
    results.push(status);
    
    if (status.zombieRevisions.length > 0) {
      hasZombies = true;
    }
  }
  
  // Print summary
  log.step('STATUS SUMMARY');
  
  for (const status of results) {
    const icon = status.isHealthy ? colors.green + '✓' : colors.red + '✗';
    const lkTag = status.isLiveKit ? ` ${colors.yellow}[LiveKit]${colors.reset}` : '';
    
    console.log(`${icon}${colors.reset} ${colors.bold}${status.serviceName}${colors.reset}${lkTag}`);
    console.log(`  Active: ${status.activeRevision || 'none'}`);
    console.log(`  Total revisions: ${status.allRevisions.length}`);
    
    if (status.zombieRevisions.length > 0) {
      console.log(`  ${colors.red}Zombies: ${status.zombieRevisions.length}${colors.reset}`);
      for (const zombie of status.zombieRevisions) {
        console.log(`    🧟 ${zombie.name} (created: ${zombie.createdAt})`);
      }
    }
    
    console.log(`  Status: ${status.message}`);
    console.log('');
  }
  
  // Fix if requested
  if (shouldFix && hasZombies) {
    log.step(dryRun ? 'DRY RUN CLEANUP' : 'CLEANING UP ZOMBIES');
    
    let totalDeleted = 0;
    
    for (const status of results) {
      if (status.zombieRevisions.length > 0) {
        log.info(`Cleaning ${status.serviceName}...`);
        const deleted = cleanupZombies(status, dryRun);
        totalDeleted += deleted;
      }
    }
    
    if (dryRun) {
      log.warn(`Would delete ${totalDeleted} zombie revision(s)`);
      log.info('Run without --dry-run to actually delete');
    } else {
      log.success(`Deleted ${totalDeleted} zombie revision(s)`);
    }
  } else if (shouldFix && !hasZombies) {
    log.success('No zombies found - nothing to fix!');
  } else if (hasZombies) {
    console.log(`
${colors.yellow}━━━ ACTION REQUIRED ━━━${colors.reset}

Zombie revisions detected! This can cause LiveKit job failures.

${colors.bold}To fix:${colors.reset}
  npx tsx scripts/cleanup-zombies.ts --fix

${colors.bold}To preview what would be deleted:${colors.reset}
  npx tsx scripts/cleanup-zombies.ts --fix --dry-run
`);
    process.exit(1);
  } else {
    log.success('All services healthy - no zombies detected!');
  }
}

main().catch((error) => {
  log.error(`Error: ${error.message}`);
  process.exit(1);
});

