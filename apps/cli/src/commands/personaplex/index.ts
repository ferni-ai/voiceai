/**
 * PersonaPlex CLI Commands
 *
 * Manage the PersonaPlex GPU server for full-duplex voice AI.
 *
 * Commands:
 *   ferni personaplex deploy    - Deploy GPU instance
 *   ferni personaplex health    - Check server health
 *   ferni personaplex logs      - View server logs
 *   ferni personaplex voices    - Generate voice embeddings
 *   ferni personaplex status    - Show instance status
 *   ferni personaplex ssh       - SSH into instance
 *   ferni personaplex destroy   - Tear down instance
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'voiceai-426818',
  zone: 'us-central1-a',
  instanceName: 'personaplex-server',
  deployScript: join(__dirname, '../../../../../infra/personaplex/deploy.sh'),
};

// =============================================================================
// HELPERS
// =============================================================================

function runCommand(cmd: string, options?: { silent?: boolean }): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: options?.silent ? 'pipe' : 'inherit',
    });
  } catch {
    return '';
  }
}

function getExternalIP(): string | null {
  try {
    const result = execSync(
      `gcloud compute instances describe ${CONFIG.instanceName} ` +
        `--zone=${CONFIG.zone} ` +
        `--format="get(networkInterfaces[0].accessConfigs[0].natIP)"`,
      { encoding: 'utf-8' }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

function instanceExists(): boolean {
  try {
    execSync(`gcloud compute instances describe ${CONFIG.instanceName} --zone=${CONFIG.zone}`, {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// COMMANDS
// =============================================================================

export async function deploy(): Promise<void> {
  console.log('🚀 Deploying PersonaPlex GPU Server\n');

  // Check HF_TOKEN
  if (!process.env.HF_TOKEN) {
    console.error('❌ HF_TOKEN not set');
    console.log('\nGet a token from: https://huggingface.co/settings/tokens');
    console.log('Then: export HF_TOKEN=hf_xxx');
    process.exit(1);
  }

  // Check if deploy script exists
  if (!existsSync(CONFIG.deployScript)) {
    console.error('❌ Deploy script not found:', CONFIG.deployScript);
    process.exit(1);
  }

  // Run deploy script
  const child = spawn('bash', [CONFIG.deployScript], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log('\n✅ PersonaPlex deployed successfully!');
      const ip = getExternalIP();
      if (ip) {
        console.log(`\n📡 Server URL: wss://${ip}:8998/api/chat`);
        console.log(`\nAdd to .env:`);
        console.log(`  PERSONAPLEX_URL=wss://${ip}:8998/api/chat`);
        console.log(`  USE_PERSONAPLEX=true`);
      }
    } else {
      console.error('\n❌ Deployment failed');
      process.exit(1);
    }
  });
}

export async function health(): Promise<void> {
  console.log('🏥 Checking PersonaPlex Health\n');

  if (!instanceExists()) {
    console.log('❌ Instance not found. Run: ferni personaplex deploy');
    process.exit(1);
  }

  const ip = getExternalIP();
  if (!ip) {
    console.log('❌ Could not get external IP');
    process.exit(1);
  }

  console.log(`Instance: ${CONFIG.instanceName}`);
  console.log(`IP: ${ip}`);
  console.log(`URL: wss://${ip}:8998/api/chat\n`);

  try {
    const result = execSync(`curl -sk https://${ip}:8998/health`, {
      encoding: 'utf-8',
      timeout: 10000,
    });

    if (result.includes('ok')) {
      console.log('✅ PersonaPlex is healthy!');
    } else {
      console.log('⚠️ Unexpected response:', result);
    }
  } catch {
    console.log('❌ Server not responding');
    console.log('\nTry:');
    console.log('  ferni personaplex logs   # View logs');
    console.log('  ferni personaplex ssh    # SSH into instance');
  }
}

export async function logs(): Promise<void> {
  console.log('📜 PersonaPlex Logs\n');

  if (!instanceExists()) {
    console.log('❌ Instance not found');
    process.exit(1);
  }

  const child = spawn(
    'gcloud',
    [
      'compute',
      'ssh',
      CONFIG.instanceName,
      `--zone=${CONFIG.zone}`,
      '--command=journalctl -u personaplex -f --no-pager -n 100',
    ],
    { stdio: 'inherit' }
  );

  child.on('error', (err) => {
    console.error('Failed to connect:', err.message);
  });
}

export async function voices(): Promise<void> {
  console.log('🎤 Generating Voice Embeddings\n');

  if (!instanceExists()) {
    console.log('❌ Instance not found. Run: ferni personaplex deploy');
    process.exit(1);
  }

  // Check for voice samples
  const samplesDir = join(__dirname, '../../../../../voice-embeddings/samples');
  if (!existsSync(samplesDir)) {
    console.log('❌ Voice samples not found');
    console.log('Run: pnpm personaplex:samples');
    process.exit(1);
  }

  // Run voices command
  const child = spawn('bash', [CONFIG.deployScript, '--voices'], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log('\n✅ Voice embeddings generated!');
    }
  });
}

export async function status(): Promise<void> {
  console.log('📊 PersonaPlex Status\n');

  if (!instanceExists()) {
    console.log('Status: ❌ Not deployed');
    console.log('\nRun: ferni personaplex deploy');
    return;
  }

  const ip = getExternalIP();

  // Get instance details
  const details = runCommand(
    `gcloud compute instances describe ${CONFIG.instanceName} ` +
      `--zone=${CONFIG.zone} ` +
      `--format="table(name,status,machineType.basename(),` +
      `guestAccelerators[0].acceleratorType.basename(),` +
      `networkInterfaces[0].accessConfigs[0].natIP)"`,
    { silent: true }
  );

  console.log('Instance Details:');
  console.log(details);

  if (ip) {
    console.log(`WebSocket URL: wss://${ip}:8998/api/chat`);

    // Check health
    try {
      execSync(`curl -sk https://${ip}:8998/health`, { timeout: 5000 });
      console.log('Server Status: ✅ Healthy');
    } catch {
      console.log('Server Status: ⚠️ Not responding');
    }
  }
}

export async function ssh(): Promise<void> {
  console.log('🔌 Connecting to PersonaPlex instance...\n');

  if (!instanceExists()) {
    console.log('❌ Instance not found');
    process.exit(1);
  }

  const child = spawn('gcloud', ['compute', 'ssh', CONFIG.instanceName, `--zone=${CONFIG.zone}`], {
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error('Failed to connect:', err.message);
  });
}

export async function destroy(): Promise<void> {
  console.log('🗑️ Destroying PersonaPlex Instance\n');

  if (!instanceExists()) {
    console.log('Instance not found. Nothing to destroy.');
    return;
  }

  // Run destroy command
  const child = spawn('bash', [CONFIG.deployScript, '--destroy'], {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log('\n✅ Instance destroyed');
    }
  });
}

// =============================================================================
// MAIN
// =============================================================================

export async function main(args: string[]): Promise<void> {
  const command = args[0];

  switch (command) {
    case 'deploy':
      await deploy();
      break;
    case 'health':
      await health();
      break;
    case 'logs':
      await logs();
      break;
    case 'voices':
      await voices();
      break;
    case 'status':
      await status();
      break;
    case 'ssh':
      await ssh();
      break;
    case 'destroy':
      await destroy();
      break;
    default:
      console.log(`
PersonaPlex GPU Server Management

Usage: ferni personaplex <command>

Commands:
  deploy     Deploy GPU instance with PersonaPlex
  health     Check server health
  logs       View server logs (streaming)
  voices     Upload samples & generate embeddings
  status     Show instance status
  ssh        SSH into the instance
  destroy    Tear down instance

Environment:
  HF_TOKEN   HuggingFace token (required for deploy)

Examples:
  ferni personaplex deploy    # Full deployment
  ferni personaplex health    # Quick health check
  ferni personaplex logs      # Stream logs
`);
  }
}

export default main;
