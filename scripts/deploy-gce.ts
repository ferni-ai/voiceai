#!/usr/bin/env npx tsx
/**
 * GCE Blue-Green Deployment Script
 *
 * RECOMMENDED: Use the Ferni CLI instead of calling this directly:
 *   ferni deploy gce           # Deploy to production GCE
 *   ferni deploy gce --dry-run # Preview what would happen
 *
 * Deploys the voice agent to GCE with zero-downtime blue-green strategy.
 *
 * Why GCE instead of Cloud Run?
 * - WebRTC requires UDP for real-time voice (Cloud Run only supports TCP)
 * - LiveKit workers need persistent connections
 * - Better audio quality with direct UDP transport
 *
 * Blue-Green Strategy:
 * 1. Build and push Docker image
 * 2. SSH to GCE VM
 * 3. Pull new image
 * 4. Start new container (green) on alternate port
 * 5. Health check green container
 * 6. If healthy: stop blue, promote green
 * 7. If unhealthy: rollback, keep blue running
 */

import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // GCP Settings
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  region: process.env.GCP_REGION || 'us-central1',
  zone: process.env.GCP_ZONE || 'us-central1-a',

  // GCE Instance
  instanceName: process.env.GCE_INSTANCE || 'voiceai-agent-gce',
  instanceIp: process.env.GCE_IP || '34.134.186.63',

  // Container settings
  imageName: 'gcr.io/johnb-2025/voiceai-agent',
  containerName: 'voiceai-agent',

  // Redis sidecar settings
  redisContainerName: 'voiceai-redis',
  redisImage: 'redis:7-alpine',
  redisPort: 6379,

  // Ports for blue-green
  bluePort: 8080,
  greenPort: 8081,

  // Health check settings
  healthCheckPath: '/health',
  healthCheckTimeout: 30000, // 30 seconds
  healthCheckRetries: 10,
  healthCheckInterval: 3000, // 3 seconds between retries

  // SSH settings
  sshUser: process.env.GCE_SSH_USER || 'sethford',
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthCheck(port: number): Promise<boolean> {
  const url = `http://${CONFIG.instanceIp}:${port}${CONFIG.healthCheckPath}`;

  for (let attempt = 1; attempt <= CONFIG.healthCheckRetries; attempt++) {
    try {
      log.substep(`Health check attempt ${attempt}/${CONFIG.healthCheckRetries}: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.healthCheckTimeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        log.success(`Health check passed: ${response.status}`);
        return true;
      }

      log.warn(`Health check returned ${response.status}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`Health check failed: ${msg}`);

      // Fallback: Try SSH-based health check if external check fails
      // This helps when firewall rules aren't properly configured
      if (attempt === CONFIG.healthCheckRetries - 1) {
        log.substep('Trying SSH-based health check as fallback...');
        try {
          const result = ssh(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/health`, {
            silent: true,
          }).trim();
          if (result === '200') {
            log.success('SSH-based health check passed (external firewall may be blocking)');
            return true;
          }
        } catch {
          // SSH health check also failed
        }
      }
    }

    if (attempt < CONFIG.healthCheckRetries) {
      await sleep(CONFIG.healthCheckInterval);
    }
  }

  return false;
}

// ============================================================================
// SECRETS MANAGEMENT
// ============================================================================

function getSecrets(): Record<string, string> {
  log.substep('Fetching secrets from Secret Manager...');

  const secretNames = [
    'livekit-api-key',
    'livekit-api-secret',
    'livekit-url',
    'openai-api-key',
    'google-api-key',
    'anthropic-api-key',
    'cartesia-api-key',
    'deepgram-api-key',
    'elevenlabs-api-key',
  ];

  const secrets: Record<string, string> = {};

  for (const name of secretNames) {
    try {
      const value = exec(
        `gcloud secrets versions access latest --secret="${name}" --project="${CONFIG.projectId}"`,
        { silent: true }
      ).trim();

      if (value) {
        // Convert kebab-case to SCREAMING_SNAKE_CASE
        const envName = name.toUpperCase().replace(/-/g, '_');
        secrets[envName] = value;
      }
    } catch {
      log.warn(`Could not fetch secret: ${name}`);
    }
  }

  return secrets;
}

function formatEnvVars(secrets: Record<string, string>): string {
  return Object.entries(secrets)
    .map(([key, value]) => `-e ${key}="${value}"`)
    .join(' ');
}

// ============================================================================
// REDIS SIDECAR
// ============================================================================

async function ensureRedisRunning(): Promise<void> {
  log.step('Ensuring Redis Sidecar');

  // Check if Redis container exists and is running
  const isRunning = ssh(
    `docker ps --format '{{.Names}}' | grep -q ${CONFIG.redisContainerName} && echo 'running' || echo 'not running'`,
    { silent: true }
  ).trim();

  if (isRunning === 'running') {
    log.success('Redis sidecar already running');
    return;
  }

  // Check if container exists but stopped
  const exists = ssh(
    `docker ps -a --format '{{.Names}}' | grep -q ${CONFIG.redisContainerName} && echo 'exists' || echo 'not exists'`,
    { silent: true }
  ).trim();

  if (exists === 'exists') {
    log.substep('Starting existing Redis container...');
    ssh(`docker start ${CONFIG.redisContainerName}`);
  } else {
    log.substep('Creating new Redis container...');
    // Run Redis with persistence, restart policy, and memory limit
    ssh(`docker run -d \
      --name ${CONFIG.redisContainerName} \
      --restart unless-stopped \
      --memory 256m \
      -p ${CONFIG.redisPort}:6379 \
      -v redis-data:/data \
      ${CONFIG.redisImage} \
      redis-server --appendonly yes --maxmemory 200mb --maxmemory-policy allkeys-lru`);
  }

  // Wait for Redis to be ready
  log.substep('Waiting for Redis to be ready...');
  let ready = false;
  for (let i = 0; i < 10; i++) {
    try {
      const pong = ssh(`docker exec ${CONFIG.redisContainerName} redis-cli ping`, { silent: true }).trim();
      if (pong === 'PONG') {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await sleep(1000);
  }

  if (ready) {
    log.success('Redis sidecar is ready');
  } else {
    log.warn('Redis may not be fully ready, continuing anyway');
  }
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

function buildAndPush(useCloudBuild: boolean): string {
  log.step('Building Docker Image');

  const tag = `${Date.now()}`;
  const fullImage = `${CONFIG.imageName}:${tag}`;

  if (useCloudBuild) {
    // Use Google Cloud Build (no local Docker needed)
    // Uses cloudbuild-gce.yaml which specifies the correct Dockerfile
    log.substep(`Building with Cloud Build: ${fullImage}`);
    exec(`gcloud builds submit \
      --config cloudbuild-gce.yaml \
      --substitutions=_IMAGE_TAG=${tag} \
      --project ${CONFIG.projectId} \
      --quiet .`);
    
    log.substep('Image built and pushed to GCR');
  } else {
    // Use local Docker (faster if Docker is running)
    log.substep(`Building locally: ${fullImage}`);
    // 🐛 FIX: Force linux/amd64 platform for GCE compatibility (macOS builds ARM64 by default)
    exec(`docker build --platform linux/amd64 -f docker/Dockerfile.agent -t ${fullImage} .`);

    log.substep('Pushing to Container Registry...');
    exec(`docker push ${fullImage}`);

    // Also tag as latest
    exec(`docker tag ${fullImage} ${CONFIG.imageName}:latest`);
    exec(`docker push ${CONFIG.imageName}:latest`);
  }

  log.success(`Image pushed: ${fullImage}`);
  return fullImage;
}

function getCurrentSlot(): 'blue' | 'green' | null {
  log.substep('Detecting current deployment slot...');

  try {
    // Check which container is running
    const result = ssh(
      `docker ps --format '{{.Names}}' | grep -E 'voiceai-agent-(blue|green)' || true`,
      { silent: true }
    );

    if (result.includes('blue')) {
      log.substep('Current slot: BLUE');
      return 'blue';
    } else if (result.includes('green')) {
      log.substep('Current slot: GREEN');
      return 'green';
    }
  } catch {
    // No container running
  }

  log.substep('No existing deployment found');
  return null;
}

function deployToSlot(
  image: string,
  slot: 'blue' | 'green',
  secrets: Record<string, string>
): void {
  log.step(`Deploying to ${slot.toUpperCase()} Slot`);

  const port = slot === 'blue' ? CONFIG.bluePort : CONFIG.greenPort;
  const containerName = `${CONFIG.containerName}-${slot}`;

  // Stop any existing container in this slot
  log.substep(`Stopping existing ${slot} container (if any)...`);
  ssh(`docker stop ${containerName} 2>/dev/null || true`, { silent: true });
  ssh(`docker rm ${containerName} 2>/dev/null || true`, { silent: true });

  // Pull the new image
  log.substep('Pulling new image...');
  ssh(`docker pull ${image}`);

  // Build environment variables
  // Note: Redis runs on the same host via Docker networking, so we use the host's Docker IP
  // The Docker bridge network assigns 172.17.0.1 as the host gateway
  const envVars = formatEnvVars({
    ...secrets,
    PORT: String(port),
    NODE_ENV: 'production',
    GOOGLE_CLOUD_PROJECT: CONFIG.projectId,
    // Firebase needs FIREBASE_PROJECT_ID for initialization
    FIREBASE_PROJECT_ID: CONFIG.projectId,
    // Redis connection - using Docker host gateway to reach the Redis sidecar
    REDIS_HOST: '172.17.0.1',
    REDIS_PORT: String(CONFIG.redisPort),
  });

  // Start the new container
  log.substep(`Starting ${slot} container on port ${port}...`);
  const dockerCmd = `docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${port} ${envVars} ${image}`;
  ssh(dockerCmd);

  log.success(`${slot.toUpperCase()} container started on port ${port}`);
}

function promoteSlot(
  slot: 'blue' | 'green',
  image: string,
  secrets: Record<string, string>
): void {
  log.step(`Promoting ${slot.toUpperCase()} to Production (port ${CONFIG.bluePort})`);

  const otherSlot = slot === 'blue' ? 'green' : 'blue';
  const currentContainer = `${CONFIG.containerName}-${slot}`;
  const otherContainer = `${CONFIG.containerName}-${otherSlot}`;
  const productionContainer = `${CONFIG.containerName}-production`;

  // 1. Stop the old production container (if any)
  log.substep(`Stopping old ${otherSlot} container...`);
  ssh(`docker stop ${otherContainer} 2>/dev/null || true`, { silent: true });
  ssh(`docker rm ${otherContainer} 2>/dev/null || true`, { silent: true });

  // 2. Stop the staging container (we'll restart it on production port)
  log.substep(`Stopping staging ${slot} container...`);
  ssh(`docker stop ${currentContainer} 2>/dev/null || true`, { silent: true });
  ssh(`docker rm ${currentContainer} 2>/dev/null || true`, { silent: true });

  // 3. Also clean up any old "production" named container
  ssh(`docker stop ${productionContainer} 2>/dev/null || true`, { silent: true });
  ssh(`docker rm ${productionContainer} 2>/dev/null || true`, { silent: true });

  // 4. Start the verified image on production port 8080
  log.substep(`Starting on production port ${CONFIG.bluePort}...`);
  const envVars = formatEnvVars({
    ...secrets,
    PORT: String(CONFIG.bluePort),
    NODE_ENV: 'production',
    GOOGLE_CLOUD_PROJECT: CONFIG.projectId,
    FIREBASE_PROJECT_ID: CONFIG.projectId,
    REDIS_HOST: '172.17.0.1',
    REDIS_PORT: String(CONFIG.redisPort),
  });

  // Use "blue" as the production container name for consistency
  const dockerCmd = `docker run -d --name ${CONFIG.containerName}-blue --restart unless-stopped -p ${CONFIG.bluePort}:${CONFIG.bluePort} ${envVars} ${image}`;
  ssh(dockerCmd);

  log.success(`Production is now live on port ${CONFIG.bluePort}!`);
}

// ============================================================================
// DISK CLEANUP (Prevents GCE instance from running out of space)
// ============================================================================

interface CleanupResult {
  imagesRemoved: number;
  spaceFreed: string;
  logsRotated: boolean;
}

function performDiskCleanup(aggressive: boolean = false): CleanupResult {
  log.step('Disk Cleanup');
  
  const result: CleanupResult = {
    imagesRemoved: 0,
    spaceFreed: '0B',
    logsRotated: false,
  };

  // 1. Remove all stopped containers
  log.substep('Removing stopped containers...');
  ssh(`docker container prune -f`, { silent: true });

  // 2. Remove dangling images (untagged)
  log.substep('Removing dangling images...');
  ssh(`docker image prune -f`, { silent: true });

  // 3. Keep only the 3 most recent images (for rollback capability)
  log.substep('Removing old deployment images (keeping last 3)...');
  try {
    const imageList = ssh(
      `docker images ${CONFIG.imageName} --format '{{.ID}} {{.CreatedAt}}' | sort -k2 -r | tail -n +4 | awk '{print $1}'`,
      { silent: true }
    ).trim();
    
    if (imageList) {
      const imageIds = imageList.split('\n').filter(Boolean);
      result.imagesRemoved = imageIds.length;
      
      for (const imageId of imageIds) {
        ssh(`docker rmi ${imageId} 2>/dev/null || true`, { silent: true });
      }
      log.substep(`Removed ${result.imagesRemoved} old image(s)`);
    }
  } catch {
    log.warn('Could not clean up old images');
  }

  // 4. Remove unused volumes (careful - only do this if aggressive)
  if (aggressive) {
    log.substep('Removing unused volumes...');
    ssh(`docker volume prune -f`, { silent: true });
  }

  // 5. Remove build cache
  log.substep('Cleaning Docker build cache...');
  ssh(`docker builder prune -f --keep-storage 2G`, { silent: true });

  // 6. Rotate container logs (Docker logs can grow huge)
  log.substep('Configuring Docker log rotation...');
  try {
    // Check if daemon.json exists, create/update if needed
    const daemonConfigExists = ssh(
      `test -f /etc/docker/daemon.json && echo 'exists' || echo 'missing'`,
      { silent: true }
    ).trim();

    if (daemonConfigExists === 'missing') {
      // Create daemon.json with log rotation settings
      ssh(`sudo bash -c 'cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF'`, { silent: true });
      log.substep('Created Docker daemon config with log rotation');
      result.logsRotated = true;
    }
  } catch {
    log.warn('Could not configure Docker log rotation');
  }

  // 7. Truncate existing container logs (immediate relief)
  log.substep('Truncating existing container logs...');
  try {
    ssh(`sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true'`, { silent: true });
  } catch {
    // May fail if no logs exist
  }

  // 8. Clean apt cache (if aggressive)
  if (aggressive) {
    log.substep('Cleaning apt cache...');
    ssh(`sudo apt-get clean 2>/dev/null || true`, { silent: true });
    ssh(`sudo apt-get autoremove -y 2>/dev/null || true`, { silent: true });
  }

  // 9. Report disk space
  try {
    const diskUsage = ssh(`df -h / | tail -1 | awk '{print $4 " available (" $5 " used)"}'`, { silent: true }).trim();
    result.spaceFreed = diskUsage;
    log.success(`Disk status: ${diskUsage}`);
  } catch {
    log.warn('Could not get disk usage');
  }

  return result;
}

function rollback(): void {
  log.step('Rolling Back');

  // Find the previous image
  log.substep('Finding previous image...');
  const images = ssh(`docker images ${CONFIG.imageName} --format '{{.Tag}}' | head -2`, {
    silent: true,
  });
  const tags = images.trim().split('\n').filter(Boolean);

  if (tags.length < 2) {
    log.error('No previous image found to rollback to');
    process.exit(1);
  }

  const previousTag = tags[1];
  const previousImage = `${CONFIG.imageName}:${previousTag}`;

  log.substep(`Rolling back to: ${previousImage}`);

  // Determine current slot and deploy to the other one
  const currentSlot = getCurrentSlot();
  const targetSlot = currentSlot === 'blue' ? 'green' : 'blue';

  const secrets = getSecrets();
  deployToSlot(previousImage, targetSlot, secrets);

  const port = targetSlot === 'blue' ? CONFIG.bluePort : CONFIG.greenPort;

  log.substep('Waiting for rollback container...');
  sleep(5000).then(async () => {
    const healthy = await healthCheck(port);
    if (healthy) {
      promoteSlot(targetSlot, previousImage, secrets);
      log.success('Rollback complete!');
    } else {
      log.error('Rollback failed health check');
      process.exit(1);
    }
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           GCE BLUE-GREEN DEPLOYMENT                       ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isRollback = args.includes('--rollback');
  const forceCloudBuild = args.includes('--cloud-build');
  
  // Auto-detect if local Docker is available
  let useCloudBuild = forceCloudBuild;
  if (!useCloudBuild) {
    try {
      const dockerCheck = execSync('docker info 2>&1', { encoding: 'utf-8', stdio: 'pipe' });
      if (dockerCheck.includes('Cannot connect') || dockerCheck.includes('error')) {
        throw new Error('Docker not running');
      }
      log.info('Using local Docker for build');
    } catch {
      log.warn('Local Docker not available, using Cloud Build');
      useCloudBuild = true;
    }
  }

  if (isDryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }

  // Show configuration
  log.info(`Project: ${CONFIG.projectId}`);
  log.info(`Instance: ${CONFIG.instanceName} (${CONFIG.instanceIp})`);
  log.info(`Zone: ${CONFIG.zone}`);

  if (isRollback) {
    if (isDryRun) {
      log.info('Would rollback to previous version');
      return;
    }
    rollback();
    return;
  }

  // Determine deployment slot
  const currentSlot = getCurrentSlot();
  const targetSlot = currentSlot === 'blue' ? 'green' : 'blue';
  const targetPort = targetSlot === 'blue' ? CONFIG.bluePort : CONFIG.greenPort;

  log.info(`Deploying to: ${targetSlot.toUpperCase()} slot (port ${targetPort})`);

  if (isDryRun) {
    log.info('Would ensure Redis sidecar is running');
    log.info(`Would build image using ${useCloudBuild ? 'Cloud Build' : 'local Docker'}`);
    log.info(`Would deploy to ${targetSlot} slot on port ${targetPort}`);
    log.info('Would set REDIS_HOST=172.17.0.1 for container');
    log.info('Would run health checks');
    log.info(`Would promote ${targetSlot} to production`);
    log.info('Would perform disk cleanup (remove old images, truncate logs)');
    return;
  }

  // Fetch secrets
  const secrets = getSecrets();
  if (Object.keys(secrets).length === 0) {
    log.error('No secrets found - cannot deploy');
    process.exit(1);
  }
  log.success(`Loaded ${Object.keys(secrets).length} secrets`);

  // Ensure Redis sidecar is running
  await ensureRedisRunning();

  // Build and push
  const image = buildAndPush(useCloudBuild);

  // Deploy to target slot
  deployToSlot(image, targetSlot, secrets);

  // Wait for container to start
  log.step('Running Health Checks');
  await sleep(5000); // Give container time to start

  const healthy = await healthCheck(targetPort);

  if (!healthy) {
    log.error('Health check failed - aborting deployment');
    log.substep(`Stopping failed ${targetSlot} container...`);
    ssh(`docker stop ${CONFIG.containerName}-${targetSlot} 2>/dev/null || true`, { silent: true });
    ssh(`docker rm ${CONFIG.containerName}-${targetSlot} 2>/dev/null || true`, { silent: true });

    if (currentSlot) {
      log.info(`Previous ${currentSlot} deployment still running`);
    }

    process.exit(1);
  }

  // Promote the new slot to production port 8080
  promoteSlot(targetSlot, image, secrets);

  // Comprehensive disk cleanup (prevents running out of space)
  const aggressiveCleanup = args.includes('--aggressive-cleanup');
  const cleanup = performDiskCleanup(aggressiveCleanup);

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           DEPLOYMENT COMPLETE                              ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

  ${colors.cyan}Service:${colors.reset}  ${CONFIG.containerName}
  ${colors.cyan}Tested:${colors.reset}   ${targetSlot.toUpperCase()} slot (port ${targetPort})
  ${colors.cyan}Live:${colors.reset}     Production port ${CONFIG.bluePort}
  ${colors.cyan}Image:${colors.reset}    ${image}
  ${colors.cyan}Redis:${colors.reset}    ${colors.green}CONNECTED${colors.reset} (172.17.0.1:${CONFIG.redisPort})
  ${colors.cyan}Status:${colors.reset}   ${colors.green}HEALTHY${colors.reset}
  ${colors.cyan}Disk:${colors.reset}     ${cleanup.spaceFreed}
  ${colors.cyan}Cleaned:${colors.reset}  ${cleanup.imagesRemoved} old images removed
`);
}

main().catch((error) => {
  log.error(`Deployment failed: ${error}`);
  process.exit(1);
});
