#!/usr/bin/env npx tsx
/**
 * GCE Disk Cleanup Script
 *
 * Cleans up Docker resources on the GCE instance to prevent disk space issues.
 * Can be run manually or scheduled via cron.
 *
 * Usage:
 *   npx tsx scripts/cleanup-gce.ts             # Standard cleanup
 *   npx tsx scripts/cleanup-gce.ts --aggressive # Aggressive cleanup (volumes, apt cache)
 *   npx tsx scripts/cleanup-gce.ts --dry-run   # Show what would be cleaned
 *   npx tsx scripts/cleanup-gce.ts --status    # Just show disk status
 *
 * Scheduling (cron on GCE):
 *   # Add to crontab -e on the GCE instance:
 *   0 3 * * * /usr/local/bin/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  zone: process.env.GCP_ZONE || 'us-central1-a',
  instanceName: process.env.GCE_INSTANCE || 'voiceai-agent-gce',
  sshUser: process.env.GCE_SSH_USER || 'sethford',
  imageName: 'gcr.io/johnb-2025/voiceai-agent',
  // Keep at least 3 images for rollback
  keepImages: 3,
  // Alert if disk usage exceeds this percentage
  diskAlertThreshold: 80,
};

// ============================================================================
// COLORS & LOGGING
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
  magenta: '\x1b[35m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) =>
    console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
  substep: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
};

// ============================================================================
// UTILITIES
// ============================================================================

function exec(cmd: string, options: { silent?: boolean; cwd?: string } = {}): string {
  try {
    return execSync(cmd, {
      cwd: options.cwd || PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!options.silent) {
      throw error;
    }
    return '';
  }
}

function ssh(cmd: string, options: { silent?: boolean } = {}): string {
  const sshCmd = `gcloud compute ssh ${CONFIG.sshUser}@${CONFIG.instanceName} --zone=${CONFIG.zone} --command="${cmd.replace(/"/g, '\\"')}"`;
  return exec(sshCmd, options);
}

interface DiskStatus {
  total: string;
  used: string;
  available: string;
  usedPercent: number;
  isHealthy: boolean;
}

function getDiskStatus(): DiskStatus {
  try {
    const output = ssh(`df -h / | tail -1`, { silent: true }).trim();
    const parts = output.split(/\s+/);
    const usedPercent = parseInt(parts[4]?.replace('%', '') || '0', 10);
    
    return {
      total: parts[1] || 'unknown',
      used: parts[2] || 'unknown',
      available: parts[3] || 'unknown',
      usedPercent,
      isHealthy: usedPercent < CONFIG.diskAlertThreshold,
    };
  } catch {
    return {
      total: 'unknown',
      used: 'unknown',
      available: 'unknown',
      usedPercent: 0,
      isHealthy: false,
    };
  }
}

interface DockerStats {
  containers: { running: number; stopped: number };
  images: { total: number; dangling: number };
  volumes: { total: number; dangling: number };
  buildCache: string;
}

function getDockerStats(): DockerStats {
  const stats: DockerStats = {
    containers: { running: 0, stopped: 0 },
    images: { total: 0, dangling: 0 },
    volumes: { total: 0, dangling: 0 },
    buildCache: '0B',
  };

  try {
    // Containers
    const containerOutput = ssh(`docker ps -a --format '{{.Status}}' | wc -l`, { silent: true }).trim();
    const runningOutput = ssh(`docker ps --format '{{.Status}}' | wc -l`, { silent: true }).trim();
    stats.containers.total = parseInt(containerOutput, 10) || 0;
    stats.containers.running = parseInt(runningOutput, 10) || 0;
    stats.containers.stopped = stats.containers.total - stats.containers.running;

    // Images
    const imagesOutput = ssh(`docker images --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    const danglingImagesOutput = ssh(`docker images -f dangling=true --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    stats.images.total = parseInt(imagesOutput, 10) || 0;
    stats.images.dangling = parseInt(danglingImagesOutput, 10) || 0;

    // Volumes
    const volumesOutput = ssh(`docker volume ls --format '{{.Name}}' | wc -l`, { silent: true }).trim();
    const danglingVolumesOutput = ssh(`docker volume ls -f dangling=true --format '{{.Name}}' | wc -l`, { silent: true }).trim();
    stats.volumes.total = parseInt(volumesOutput, 10) || 0;
    stats.volumes.dangling = parseInt(danglingVolumesOutput, 10) || 0;

    // Build cache
    const cacheOutput = ssh(`docker system df --format '{{.Size}}' | tail -1`, { silent: true }).trim();
    stats.buildCache = cacheOutput || '0B';
  } catch {
    // Ignore errors
  }

  return stats;
}

interface CleanupResult {
  stoppedContainersRemoved: number;
  danglingImagesRemoved: number;
  oldImagesRemoved: number;
  danglingVolumesRemoved: number;
  buildCachePruned: boolean;
  logsTruncated: boolean;
  aptCacheCleaned: boolean;
  spaceBeforeBytes: number;
  spaceAfterBytes: number;
  spaceSavedBytes: number;
}

function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B?)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase() || 'B';
  
  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1024,
    'K': 1024,
    'MB': 1024 ** 2,
    'M': 1024 ** 2,
    'GB': 1024 ** 3,
    'G': 1024 ** 3,
    'TB': 1024 ** 4,
    'T': 1024 ** 4,
  };
  
  return value * (multipliers[unit] || 1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

function performCleanup(aggressive: boolean, dryRun: boolean): CleanupResult {
  const result: CleanupResult = {
    stoppedContainersRemoved: 0,
    danglingImagesRemoved: 0,
    oldImagesRemoved: 0,
    danglingVolumesRemoved: 0,
    buildCachePruned: false,
    logsTruncated: false,
    aptCacheCleaned: false,
    spaceBeforeBytes: 0,
    spaceAfterBytes: 0,
    spaceSavedBytes: 0,
  };

  // Get space before
  const beforeStatus = getDiskStatus();
  result.spaceBeforeBytes = parseSize(beforeStatus.available);

  // 1. Remove stopped containers
  log.substep('Removing stopped containers...');
  if (!dryRun) {
    const beforeContainers = ssh(`docker ps -a --filter status=exited --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    result.stoppedContainersRemoved = parseInt(beforeContainers, 10) || 0;
    if (result.stoppedContainersRemoved > 0) {
      ssh(`docker container prune -f`, { silent: true });
    }
  } else {
    const count = ssh(`docker ps -a --filter status=exited --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    result.stoppedContainersRemoved = parseInt(count, 10) || 0;
  }
  log.substep(`  ${result.stoppedContainersRemoved} stopped container(s) ${dryRun ? 'would be' : ''} removed`);

  // 2. Remove dangling images
  log.substep('Removing dangling images...');
  if (!dryRun) {
    const beforeDangling = ssh(`docker images -f dangling=true --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    result.danglingImagesRemoved = parseInt(beforeDangling, 10) || 0;
    if (result.danglingImagesRemoved > 0) {
      ssh(`docker image prune -f`, { silent: true });
    }
  } else {
    const count = ssh(`docker images -f dangling=true --format '{{.ID}}' | wc -l`, { silent: true }).trim();
    result.danglingImagesRemoved = parseInt(count, 10) || 0;
  }
  log.substep(`  ${result.danglingImagesRemoved} dangling image(s) ${dryRun ? 'would be' : ''} removed`);

  // 3. Remove old deployment images (keep last N)
  log.substep(`Removing old deployment images (keeping last ${CONFIG.keepImages})...`);
  try {
    const imageList = ssh(
      `docker images ${CONFIG.imageName} --format '{{.ID}} {{.Tag}}' | tail -n +${CONFIG.keepImages + 1}`,
      { silent: true }
    ).trim();
    
    if (imageList) {
      const lines = imageList.split('\n').filter(Boolean);
      result.oldImagesRemoved = lines.length;
      
      if (!dryRun) {
        for (const line of lines) {
          const imageId = line.split(' ')[0];
          ssh(`docker rmi ${imageId} 2>/dev/null || true`, { silent: true });
        }
      }
    }
  } catch {
    // Ignore
  }
  log.substep(`  ${result.oldImagesRemoved} old image(s) ${dryRun ? 'would be' : ''} removed`);

  // 4. Remove dangling volumes (if aggressive)
  if (aggressive) {
    log.substep('Removing dangling volumes...');
    if (!dryRun) {
      const beforeVolumes = ssh(`docker volume ls -f dangling=true --format '{{.Name}}' | wc -l`, { silent: true }).trim();
      result.danglingVolumesRemoved = parseInt(beforeVolumes, 10) || 0;
      if (result.danglingVolumesRemoved > 0) {
        ssh(`docker volume prune -f`, { silent: true });
      }
    } else {
      const count = ssh(`docker volume ls -f dangling=true --format '{{.Name}}' | wc -l`, { silent: true }).trim();
      result.danglingVolumesRemoved = parseInt(count, 10) || 0;
    }
    log.substep(`  ${result.danglingVolumesRemoved} dangling volume(s) ${dryRun ? 'would be' : ''} removed`);
  }

  // 5. Prune build cache
  log.substep('Pruning Docker build cache...');
  if (!dryRun) {
    ssh(`docker builder prune -f --keep-storage 2G`, { silent: true });
    result.buildCachePruned = true;
  }
  log.substep(`  Build cache ${dryRun ? 'would be' : ''} pruned (keeping 2GB)`);

  // 6. Truncate container logs
  log.substep('Truncating container logs...');
  if (!dryRun) {
    try {
      ssh(`sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true'`, { silent: true });
      result.logsTruncated = true;
    } catch {
      // May fail if no logs
    }
  }
  log.substep(`  Container logs ${dryRun ? 'would be' : ''} truncated`);

  // 7. Clean apt cache (if aggressive)
  if (aggressive) {
    log.substep('Cleaning apt cache...');
    if (!dryRun) {
      ssh(`sudo apt-get clean 2>/dev/null || true`, { silent: true });
      ssh(`sudo apt-get autoremove -y 2>/dev/null || true`, { silent: true });
      result.aptCacheCleaned = true;
    }
    log.substep(`  Apt cache ${dryRun ? 'would be' : ''} cleaned`);
  }

  // Get space after
  if (!dryRun) {
    const afterStatus = getDiskStatus();
    result.spaceAfterBytes = parseSize(afterStatus.available);
    result.spaceSavedBytes = result.spaceAfterBytes - result.spaceBeforeBytes;
  }

  return result;
}

// ============================================================================
// CRON SETUP
// ============================================================================

function setupCron(): void {
  log.step('Setting Up Automatic Cleanup');
  
  // Create cleanup script on GCE
  const cleanupScript = `#!/bin/bash
# Auto-generated Docker cleanup script
# Runs daily at 3 AM to prevent disk space issues

set -e

echo "[\$(date)] Starting Docker cleanup..."

# Remove stopped containers
docker container prune -f

# Remove dangling images
docker image prune -f

# Keep only last 3 deployment images
docker images gcr.io/johnb-2025/voiceai-agent --format '{{.ID}}' | tail -n +4 | xargs -r docker rmi || true

# Prune build cache (keep 2GB)
docker builder prune -f --keep-storage 2G

# Truncate container logs
sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log' 2>/dev/null || true

echo "[\$(date)] Cleanup complete"
df -h /
`;

  log.substep('Creating cleanup script on GCE...');
  ssh(`cat > /tmp/docker-cleanup.sh << 'SCRIPT'
${cleanupScript}
SCRIPT`, { silent: true });
  ssh(`sudo mv /tmp/docker-cleanup.sh /usr/local/bin/docker-cleanup.sh`, { silent: true });
  ssh(`sudo chmod +x /usr/local/bin/docker-cleanup.sh`, { silent: true });

  log.substep('Adding cron job (daily at 3 AM)...');
  // Check if cron job already exists
  const cronExists = ssh(
    `crontab -l 2>/dev/null | grep -q 'docker-cleanup.sh' && echo 'exists' || echo 'missing'`,
    { silent: true }
  ).trim();

  if (cronExists === 'missing') {
    ssh(
      `(crontab -l 2>/dev/null; echo '0 3 * * * /usr/local/bin/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1') | crontab -`,
      { silent: true }
    );
    log.success('Cron job added: 0 3 * * * (daily at 3 AM)');
  } else {
    log.info('Cron job already exists');
  }

  log.success('Automatic cleanup configured!');
  log.info('Logs will be written to: /var/log/docker-cleanup.log');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           GCE DISK CLEANUP                                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isAggressive = args.includes('--aggressive');
  const statusOnly = args.includes('--status');
  const setupCronJob = args.includes('--setup-cron');

  log.info(`Instance: ${CONFIG.instanceName}`);
  log.info(`Zone: ${CONFIG.zone}`);

  // Get current status
  log.step('Current Status');
  
  const diskStatus = getDiskStatus();
  const statusColor = diskStatus.isHealthy ? colors.green : colors.red;
  console.log(`
  ${colors.cyan}Disk Usage:${colors.reset}
    Total:     ${diskStatus.total}
    Used:      ${diskStatus.used} (${statusColor}${diskStatus.usedPercent}%${colors.reset})
    Available: ${diskStatus.available}
    Status:    ${diskStatus.isHealthy ? `${colors.green}HEALTHY${colors.reset}` : `${colors.red}WARNING - Above ${CONFIG.diskAlertThreshold}%${colors.reset}`}
`);

  const dockerStats = getDockerStats();
  console.log(`  ${colors.cyan}Docker Resources:${colors.reset}
    Containers: ${dockerStats.containers.running} running, ${dockerStats.containers.stopped} stopped
    Images:     ${dockerStats.images.total} total, ${dockerStats.images.dangling} dangling
    Volumes:    ${dockerStats.volumes.total} total, ${dockerStats.volumes.dangling} dangling
    Build Cache: ${dockerStats.buildCache}
`);

  if (statusOnly) {
    return;
  }

  if (setupCronJob) {
    setupCron();
    return;
  }

  // Perform cleanup
  if (isDryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }
  
  log.step(`${isAggressive ? 'Aggressive' : 'Standard'} Cleanup`);
  const result = performCleanup(isAggressive, isDryRun);

  // Summary
  log.step('Summary');
  
  if (isDryRun) {
    console.log(`
  ${colors.cyan}Would clean up:${colors.reset}
    Stopped containers: ${result.stoppedContainersRemoved}
    Dangling images:    ${result.danglingImagesRemoved}
    Old images:         ${result.oldImagesRemoved}
    ${isAggressive ? `Dangling volumes:   ${result.danglingVolumesRemoved}` : ''}
    Build cache:        Yes (keeping 2GB)
    Container logs:     Truncated
    ${isAggressive ? 'Apt cache:          Cleaned' : ''}
`);
  } else {
    console.log(`
  ${colors.cyan}Cleaned up:${colors.reset}
    Stopped containers: ${result.stoppedContainersRemoved}
    Dangling images:    ${result.danglingImagesRemoved}
    Old images:         ${result.oldImagesRemoved}
    ${isAggressive ? `Dangling volumes:   ${result.danglingVolumesRemoved}` : ''}
    Build cache:        ${result.buildCachePruned ? 'Pruned' : 'Skipped'}
    Container logs:     ${result.logsTruncated ? 'Truncated' : 'Skipped'}
    ${isAggressive ? `Apt cache:          ${result.aptCacheCleaned ? 'Cleaned' : 'Skipped'}` : ''}
    
  ${colors.cyan}Space:${colors.reset}
    ${result.spaceSavedBytes > 0 
      ? `${colors.green}Saved ${formatBytes(result.spaceSavedBytes)}${colors.reset}`
      : 'No additional space freed (already clean)'}
`);
  }

  // Final disk status
  if (!isDryRun) {
    const finalDisk = getDiskStatus();
    log.success(`Disk now at ${finalDisk.usedPercent}% (${finalDisk.available} available)`);
  }

  console.log(`
${colors.dim}─────────────────────────────────────────────────────────────
Tips:
  • Run with --aggressive for deeper cleanup (volumes, apt cache)
  • Run with --setup-cron to schedule daily automatic cleanup
  • Deployments now auto-clean on each deploy (ferni deploy gce)
─────────────────────────────────────────────────────────────${colors.reset}
`);
}

main().catch((error) => {
  log.error(`Cleanup failed: ${error}`);
  process.exit(1);
});

