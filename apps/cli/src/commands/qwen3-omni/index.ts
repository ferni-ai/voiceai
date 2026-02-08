/**
 * Qwen3-Omni CLI Commands
 *
 * Manage the Qwen3-Omni GPU server for self-hosted speech-to-speech AI.
 *
 * Commands:
 *   ferni qwen3 deploy    - Deploy GPU instance with Thinker + TTS
 *   ferni qwen3 health    - Check both Thinker and TTS health
 *   ferni qwen3 logs      - View server logs (thinker|tts|all)
 *   ferni qwen3 voices    - Clone all persona voices
 *   ferni qwen3 status    - Show instance status
 *   ferni qwen3 ssh       - SSH into instance
 *   ferni qwen3 destroy   - Tear down instance
 *   ferni qwen3 test      - Test inference + TTS pipeline
 */

import { execSync, spawn } from 'child_process';
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
  instanceName: 'qwen3-omni-server',
  deployScript: join(__dirname, '../../../../../infra/qwen3-omni/deploy.sh'),
  thinkerPort: 8000,
  ttsPort: 8001,
  healthPort: 8080,
};

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

// =============================================================================
// HELPERS
// =============================================================================

function log(msg: string): void {
  process.stdout.write(`${BLUE}[Qwen3-Omni]${NC} ${msg}\n`);
}

function success(msg: string): void {
  process.stdout.write(`${GREEN}[OK]${NC} ${msg}\n`);
}

function warn(msg: string): void {
  process.stdout.write(`${YELLOW}[!]${NC} ${msg}\n`);
}

function error(msg: string): void {
  process.stderr.write(`${RED}[X]${NC} ${msg}\n`);
}

function info(msg: string): void {
  process.stdout.write(`${CYAN}[i]${NC} ${msg}\n`);
}

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
  log('Deploying Qwen3-Omni server...');

  if (!process.env.HF_TOKEN) {
    error('HF_TOKEN environment variable required');
    error('Get a token at: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  const child = spawn('bash', [CONFIG.deployScript, '--create'], {
    stdio: 'inherit',
    env: { ...process.env, HF_TOKEN: process.env.HF_TOKEN },
  });

  child.on('exit', (code) => {
    if (code === 0) {
      success('Deployment initiated');
      info('Run "ferni qwen3 health" to check when ready');
    } else {
      error(`Deployment failed with code ${code}`);
    }
  });
}

export async function health(): Promise<void> {
  log('Checking Qwen3-Omni health...');

  if (!instanceExists()) {
    error('No Qwen3-Omni instance found. Run: ferni qwen3 deploy');
    return;
  }

  const ip = getExternalIP();
  if (!ip) {
    error('Could not determine instance IP');
    return;
  }

  process.stdout.write('\n');

  // Combined health
  info('Combined Health:');
  try {
    const healthResult = runCommand(`curl -s http://${ip}:${CONFIG.healthPort}/health`, {
      silent: true,
    });
    if (healthResult) {
      const health = JSON.parse(healthResult);
      const thinkerStatus =
        health.thinker === 'healthy' ? `${GREEN}healthy${NC}` : `${RED}unhealthy${NC}`;
      const ttsStatus = health.tts === 'healthy' ? `${GREEN}healthy${NC}` : `${RED}unhealthy${NC}`;
      process.stdout.write(`  Overall: ${health.status}\n`);
      process.stdout.write(`  Thinker: ${thinkerStatus}\n`);
      process.stdout.write(`  TTS:     ${ttsStatus}\n`);
    } else {
      warn('Health endpoint not responding');
    }
  } catch {
    warn('Health check failed');
  }

  process.stdout.write('\n');

  // Readiness
  info('Readiness:');
  try {
    const readyResult = runCommand(`curl -s http://${ip}:${CONFIG.healthPort}/health/ready`, {
      silent: true,
    });
    if (readyResult) {
      const ready = JSON.parse(readyResult);
      const readyStatus = ready.ready ? `${GREEN}READY${NC}` : `${YELLOW}NOT READY${NC}`;
      process.stdout.write(`  ${readyStatus}\n`);
    }
  } catch {
    warn('Readiness check failed');
  }

  process.stdout.write('\n');
  info(`Server IP: ${ip}`);
  info(`Thinker API: http://${ip}:${CONFIG.thinkerPort}/v1/chat/completions`);
  info(`TTS API:     http://${ip}:${CONFIG.ttsPort}/v1/tts/synthesize`);
  info(`Health:      http://${ip}:${CONFIG.healthPort}/health`);
}

export async function logs(service: string = 'all'): Promise<void> {
  log(`Viewing ${service} logs...`);

  if (!instanceExists()) {
    error('No instance found');
    return;
  }

  const serviceFlag =
    service === 'thinker'
      ? '-u qwen3-thinker'
      : service === 'tts'
        ? '-u qwen3-tts'
        : '-u qwen3-thinker -u qwen3-tts -u qwen3-health';

  const child = spawn(
    'gcloud',
    [
      'compute',
      'ssh',
      CONFIG.instanceName,
      `--zone=${CONFIG.zone}`,
      '--command',
      `journalctl ${serviceFlag} -f --no-pager`,
    ],
    { stdio: 'inherit' }
  );

  child.on('exit', () => {
    log('Log stream ended');
  });
}

export async function voices(): Promise<void> {
  log('Cloning all persona voices...');

  if (!instanceExists()) {
    error('No instance found. Deploy first: ferni qwen3 deploy');
    return;
  }

  const ip = getExternalIP();
  if (!ip) {
    error('Could not determine instance IP');
    return;
  }

  // Voice design descriptions for each persona
  const personas: Record<string, string> = {
    ferni: 'Male, 30 years old, warm baritone, friendly and grounded life coach',
    'maya-santos': 'Female, 28 years old, alto range, encouraging and energetic coach',
    'alex-chen': 'Female, 32 years old, clear mezzo-soprano, professional yet warm',
    'peter-john': 'Male, 45 years old, deep tenor, thoughtful and measured professor',
    'jordan-taylor': 'Female, 26 years old, bright soprano, enthusiastic planner',
    'nayan-patel': 'Male, 60 years old, deep bass-baritone, wise and serene philosopher',
  };

  for (const [personaId, description] of Object.entries(personas)) {
    log(`Designing voice for: ${personaId}`);

    try {
      const result = runCommand(
        `curl -s -X POST http://${ip}:${CONFIG.ttsPort}/v1/voice/design ` +
          `-H "Content-Type: application/json" ` +
          `-d '${JSON.stringify({
            persona_id: personaId,
            description,
            language: 'English',
            sample_text: "Hello, it's wonderful to connect with you today.",
          })}'`,
        { silent: true }
      );

      if (result) {
        const data = JSON.parse(result);
        success(`${personaId}: quality ${data.quality_score || 'N/A'}`);
      } else {
        warn(`${personaId}: No response from TTS server`);
      }
    } catch (err) {
      error(`${personaId}: ${err}`);
    }
  }

  success('All persona voices processed');
}

export async function status(): Promise<void> {
  log('Qwen3-Omni Instance Status');

  if (!instanceExists()) {
    info('No instance running');
    info('Deploy with: ferni qwen3 deploy');
    return;
  }

  const ip = getExternalIP();
  process.stdout.write('\n');
  info(`Instance: ${CONFIG.instanceName}`);
  info(`Zone:     ${CONFIG.zone}`);
  info(`IP:       ${ip || 'N/A'}`);
  process.stdout.write('\n');

  runCommand(
    `gcloud compute instances describe ${CONFIG.instanceName} ` +
      `--zone=${CONFIG.zone} ` +
      `--format="table(name,status,machineType.basename(),zone.basename())"`,
    { silent: false }
  );
}

export async function ssh(): Promise<void> {
  if (!instanceExists()) {
    error('No instance found');
    return;
  }

  log('Connecting via SSH...');
  const child = spawn('gcloud', ['compute', 'ssh', CONFIG.instanceName, `--zone=${CONFIG.zone}`], {
    stdio: 'inherit',
  });

  child.on('exit', () => {
    log('SSH session ended');
  });
}

export async function destroy(): Promise<void> {
  if (!instanceExists()) {
    info('No instance to destroy');
    return;
  }

  warn('This will delete the Qwen3-Omni server and all data!');

  const child = spawn('bash', [CONFIG.deployScript, '--destroy'], {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code === 0) {
      success('Instance destroyed');
    }
  });
}

export async function test(): Promise<void> {
  log('Testing Qwen3-Omni pipeline...');

  const ip = getExternalIP();
  if (!ip) {
    // Try localhost
    info('No GCE instance found, trying localhost...');
  }

  const baseUrl = ip ? `http://${ip}` : 'http://localhost';

  // Test Thinker
  info('Testing Thinker inference...');
  try {
    const startTime = Date.now();
    const result = runCommand(
      `curl -s -X POST ${baseUrl}:${CONFIG.thinkerPort}/v1/chat/completions ` +
        `-H "Content-Type: application/json" ` +
        `-d '${JSON.stringify({
          model: 'Qwen3-Omni',
          messages: [
            {
              role: 'system',
              content: 'You are Ferni, a warm and caring AI life coach.',
            },
            { role: 'user', content: 'Hey, how are you?' },
          ],
          temperature: 0.7,
          max_tokens: 200,
        })}'`,
      { silent: true }
    );

    const latency = Date.now() - startTime;

    if (result) {
      const data = JSON.parse(result);
      const response = data.choices?.[0]?.message?.content || 'No response';
      success(`Thinker response (${latency}ms): "${response.slice(0, 100)}..."`);
    } else {
      error('No response from Thinker');
    }
  } catch (err) {
    error(`Thinker test failed: ${err}`);
  }

  // Test TTS
  info('Testing TTS synthesis...');
  try {
    const startTime = Date.now();
    const result = runCommand(
      `curl -s -o /dev/null -w "%{http_code}" -X POST ${baseUrl}:${CONFIG.ttsPort}/v1/tts/synthesize ` +
        `-H "Content-Type: application/json" ` +
        `-d '${JSON.stringify({
          text: 'Hello, how are you doing today?',
          persona_id: 'ferni',
          language: 'English',
        })}'`,
      { silent: true }
    );

    const latency = Date.now() - startTime;

    if (result?.trim() === '200') {
      success(`TTS synthesis (${latency}ms): OK`);
    } else {
      warn(`TTS returned status: ${result}`);
    }
  } catch (err) {
    error(`TTS test failed: ${err}`);
  }

  process.stdout.write('\n');
  success('Pipeline test complete');
}

// =============================================================================
// MAIN ROUTER
// =============================================================================

export async function main(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';

  switch (subcommand) {
    case 'deploy':
      await deploy();
      break;
    case 'health':
      await health();
      break;
    case 'logs':
      await logs(args[1]);
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
    case 'test':
      await test();
      break;
    case 'help':
    default:
      process.stdout.write(`
${BLUE}Qwen3-Omni${NC} - Self-hosted Speech-to-Speech AI

${CYAN}Commands:${NC}
  deploy    Deploy GPU instance (Thinker + TTS)
  health    Check server health
  logs      View logs (thinker|tts|all)
  voices    Clone all persona voices
  status    Show instance status
  ssh       SSH into instance
  destroy   Tear down instance
  test      Test inference + TTS pipeline

${CYAN}Architecture:${NC}
  Qwen3-Omni Thinker (INT4) - Audio understanding + reasoning
  Qwen3-TTS-1.7B             - Voice cloning + synthesis

${CYAN}Environment:${NC}
  HF_TOKEN           HuggingFace token (required for deploy)
  QWEN3_OMNI_URL     Thinker server URL
  QWEN3_TTS_URL      TTS server URL

${CYAN}Quick Start:${NC}
  ferni qwen3 deploy              # Deploy to GCE
  ferni qwen3 health              # Wait for ready
  ferni qwen3 voices              # Clone persona voices
  ferni qwen3 test                # Test the pipeline
  USE_QWEN3_OMNI=true pnpm dev    # Start voice agent with Qwen3-Omni
`);
      break;
  }
}
