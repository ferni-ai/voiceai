#!/usr/bin/env npx tsx
/**
 * Agent Publish Command
 *
 * One-command deployment of an agent to production.
 * Validates, generates landing page, builds container, and deploys.
 *
 * Usage:
 *   ferni agent publish <agent-id>
 *   ferni agent publish <agent-id> --dry-run
 *   ferni agent publish <agent-id> --subdomain custom-name
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface AgentManifest {
  version: string;
  identity: {
    id: string;
    name: string;
    display_name: string;
    tagline: string;
    description: string;
    icon?: string;
    initials?: string;
    aliases?: string[];
  };
  voice: {
    provider: string;
    voice_id: string;
    default_rate?: string;
  };
  personality: {
    warmth: number;
    humor_level: number;
    directness: number;
    energy: number;
    traits: string[];
  };
  tools?: {
    domains?: string[];
    required?: string[];
    optional?: string[];
    forbidden?: string[];
  };
  capabilities?: {
    can_handoff?: boolean;
    standalone_agent?: boolean;
    music_enabled?: boolean;
  };
  brand?: {
    primary?: string;
    secondary?: string;
    theme?: string;
  };
  deployment?: {
    type?: string;
    subdomain?: string;
    custom_domain?: string | null;
    min_instances?: number;
    max_instances?: number;
    memory?: string;
    cpu?: string;
    region?: string;
  };
  metadata?: {
    author?: string;
    created_at?: string;
    updated_at?: string;
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface PublishOptions {
  dryRun: boolean;
  subdomain?: string;
  skipValidation: boolean;
  skipPage: boolean;
  force: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'ferni-ai',
  region: process.env.GCP_REGION || 'us-central1',
  containerRegistry: 'gcr.io',
  agentsDomain: 'agents.ferni.ai',
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateManifest(manifest: AgentManifest, bundlePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!manifest.identity?.id) errors.push('Missing identity.id');
  if (!manifest.identity?.name) errors.push('Missing identity.name');
  if (!manifest.identity?.tagline) errors.push('Missing identity.tagline');
  if (!manifest.identity?.description) errors.push('Missing identity.description');

  // Voice configuration
  if (!manifest.voice?.voice_id) {
    errors.push('Missing voice.voice_id');
  } else {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Allow env variable references
    if (!manifest.voice.voice_id.startsWith('${env:') && !uuidRegex.test(manifest.voice.voice_id)) {
      warnings.push(`Voice ID doesn't look like a valid UUID: ${manifest.voice.voice_id}`);
    }
  }

  // Personality
  if (!manifest.personality) {
    warnings.push('No personality configuration - defaults will be used');
  } else {
    if (manifest.personality.warmth < 0 || manifest.personality.warmth > 1) {
      errors.push('personality.warmth must be between 0 and 1');
    }
    if (manifest.personality.traits?.length === 0) {
      warnings.push('No personality traits defined');
    }
  }

  // Check required files
  const systemPromptPath = path.join(bundlePath, 'identity', 'system-prompt.md');
  if (!fs.existsSync(systemPromptPath)) {
    errors.push('Missing identity/system-prompt.md');
  } else {
    const content = fs.readFileSync(systemPromptPath, 'utf-8');
    if (content.length < 100) {
      warnings.push('System prompt is very short - consider adding more detail');
    }
    if (content.includes('[Define') || content.includes('[Add') || content.includes('[List')) {
      warnings.push('System prompt contains placeholder text - customize before publishing');
    }
  }

  // Check biography
  const biographyPath = path.join(bundlePath, 'identity', 'biography.md');
  if (!fs.existsSync(biographyPath)) {
    warnings.push('Missing identity/biography.md (recommended)');
  }

  // Check greetings
  const greetingsPath = path.join(bundlePath, 'content', 'behaviors', 'greetings.json');
  if (fs.existsSync(greetingsPath)) {
    try {
      const greetings = JSON.parse(fs.readFileSync(greetingsPath, 'utf-8'));
      if (!greetings.new_user || greetings.new_user.length === 0) {
        warnings.push('No new_user greetings defined');
      }
    } catch {
      errors.push('Invalid JSON in greetings.json');
    }
  } else {
    warnings.push('Missing greetings.json - agent will use default greetings');
  }

  // Standalone agent check
  if (manifest.capabilities?.can_handoff) {
    warnings.push('Agent has can_handoff=true but will be deployed standalone');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// PAGE GENERATOR
// ============================================================================

function generateLandingPage(manifest: AgentManifest): string {
  const primary = manifest.brand?.primary || '#4a6741';
  const secondary = manifest.brand?.secondary || darkenColor(primary, 0.15);
  const initials = manifest.identity.initials ||
    manifest.identity.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manifest.identity.name} - ${manifest.identity.tagline}</title>
  <meta name="description" content="${manifest.identity.description}">

  <!-- Open Graph / Social -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${manifest.identity.name}">
  <meta property="og:description" content="${manifest.identity.description}">
  <meta property="og:image" content="/og-image.png">
  <meta name="twitter:card" content="summary_large_image">

  <!-- Favicon -->
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --primary-light: ${lightenColor(primary, 0.2)};
      --primary-glow: ${primary}40;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f1525 100%);
      color: #f5f5f7;
      line-height: 1.6;
    }

    .hero {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
      pointer-events: none;
    }

    .avatar {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--secondary), var(--primary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 4rem;
      font-weight: 600;
      margin-bottom: 2rem;
      box-shadow: 0 0 80px var(--primary-glow);
      position: relative;
      z-index: 1;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .avatar:hover {
      transform: scale(1.05);
      box-shadow: 0 0 120px var(--primary-glow);
    }

    .avatar.active {
      animation: breathe 3s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .avatar-icon { font-size: 5rem; }

    h1 {
      font-size: clamp(2.5rem, 6vw, 4rem);
      font-weight: 700;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
      position: relative;
      z-index: 1;
    }

    .tagline {
      color: var(--primary-light);
      font-size: 1.25rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .description {
      font-size: 1.1rem;
      opacity: 0.8;
      max-width: 560px;
      margin-bottom: 3rem;
      position: relative;
      z-index: 1;
    }

    .cta-button {
      background: linear-gradient(135deg, var(--secondary), var(--primary));
      color: white;
      border: none;
      padding: 1rem 2.5rem;
      font-size: 1.25rem;
      font-weight: 600;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 24px var(--primary-glow);
      position: relative;
      z-index: 1;
    }

    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 40px var(--primary-glow);
    }

    .cta-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .status {
      margin-top: 1rem;
      font-size: 0.9rem;
      opacity: 0.6;
      position: relative;
      z-index: 1;
    }

    .status.listening { color: #22c55e; opacity: 1; }
    .status.speaking { color: var(--primary-light); opacity: 1; }

    .features {
      display: flex;
      gap: 2rem;
      margin-top: 4rem;
      flex-wrap: wrap;
      justify-content: center;
      position: relative;
      z-index: 1;
    }

    .feature {
      text-align: center;
      opacity: 0.7;
      font-size: 0.9rem;
    }

    .feature-icon {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .footer {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 2rem;
      font-size: 0.8rem;
      opacity: 0.4;
    }

    .footer a { color: inherit; text-decoration: none; }
    .footer a:hover { opacity: 0.8; }

    /* Voice interface overlay */
    .voice-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.95);
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      z-index: 100;
    }

    .voice-overlay.active { display: flex; }

    .voice-orb {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, var(--primary-light), var(--primary));
      box-shadow: 0 0 100px var(--primary-glow);
      animation: float 4s ease-in-out infinite;
      cursor: pointer;
    }

    .voice-orb.speaking {
      animation: speak 0.8s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    @keyframes speak {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .voice-hint {
      margin-top: 2rem;
      opacity: 0.5;
      font-size: 0.9rem;
    }

    .close-button {
      position: absolute;
      top: 2rem;
      right: 2rem;
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .close-button:hover { background: rgba(255,255,255,0.2); }

    @media (max-width: 640px) {
      .avatar { width: 140px; height: 140px; font-size: 3rem; }
      .avatar-icon { font-size: 4rem; }
      .features { gap: 1rem; }
    }
  </style>
</head>
<body>
  <main class="hero">
    <div class="avatar" id="avatar" onclick="startConversation()">
      ${manifest.identity.icon ? `<span class="avatar-icon">${manifest.identity.icon}</span>` : initials}
    </div>

    <h1>${manifest.identity.name}</h1>
    <p class="tagline">${manifest.identity.tagline}</p>
    <p class="description">${manifest.identity.description}</p>

    <button class="cta-button" id="ctaButton" onclick="startConversation()">
      Start Conversation
    </button>

    <p class="status" id="status"></p>

    <div class="features">
      <div class="feature">
        <div class="feature-icon">🎙️</div>
        <div>Voice-First</div>
      </div>
      <div class="feature">
        <div class="feature-icon">🔒</div>
        <div>Private & Secure</div>
      </div>
      <div class="feature">
        <div class="feature-icon">⚡</div>
        <div>Real-Time</div>
      </div>
    </div>
  </main>

  <div class="voice-overlay" id="voiceOverlay">
    <button class="close-button" onclick="endConversation()">×</button>
    <div class="voice-orb" id="voiceOrb"></div>
    <p class="voice-hint" id="voiceHint">Listening...</p>
  </div>

  <footer class="footer">
    <span>Powered by <a href="https://ferni.ai">Ferni</a></span>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </footer>

  <!-- Ferni Widget SDK -->
  <script src="https://app.ferni.ai/api/widget/embed.js" async></script>
  <script>
    window.FERNI_CONFIG = {
      agentId: '${manifest.identity.id}',
      apiUrl: '',  // Same origin
      theme: 'dark',
      autoConnect: false
    };

    const avatar = document.getElementById('avatar');
    const ctaButton = document.getElementById('ctaButton');
    const status = document.getElementById('status');
    const voiceOverlay = document.getElementById('voiceOverlay');
    const voiceOrb = document.getElementById('voiceOrb');
    const voiceHint = document.getElementById('voiceHint');

    let isActive = false;

    function startConversation() {
      if (window.FerniWidget) {
        voiceOverlay.classList.add('active');
        avatar.classList.add('active');
        window.FerniWidget.open();
        isActive = true;
      } else {
        status.textContent = 'Loading...';
        setTimeout(startConversation, 500);
      }
    }

    function endConversation() {
      voiceOverlay.classList.remove('active');
      avatar.classList.remove('active');
      voiceOrb.classList.remove('speaking');
      if (window.FerniWidget) {
        window.FerniWidget.close();
      }
      isActive = false;
    }

    // Listen for widget events
    window.addEventListener('ferni:speaking', () => {
      voiceOrb.classList.add('speaking');
      voiceHint.textContent = 'Speaking...';
    });

    window.addEventListener('ferni:listening', () => {
      voiceOrb.classList.remove('speaking');
      voiceHint.textContent = 'Listening...';
    });

    window.addEventListener('ferni:disconnected', () => {
      endConversation();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && isActive) {
        endConversation();
      }
      if (e.code === 'Space' && !isActive && e.target === document.body) {
        e.preventDefault();
        startConversation();
      }
    });
  </script>
</body>
</html>`;
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.floor((num >> 16) * (1 - percent));
  const g = Math.floor(((num >> 8) & 0x00ff) * (1 - percent));
  const b = Math.floor((num & 0x0000ff) * (1 - percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ============================================================================
// DEPLOYMENT
// ============================================================================

async function buildContainer(agentId: string, bundlePath: string, dryRun: boolean): Promise<string> {
  const imageName = `${CONFIG.containerRegistry}/${CONFIG.projectId}/${agentId}-agent:latest`;

  if (dryRun) {
    return imageName;
  }

  // For now, we use the main voiceai-agent container with PERSONA_ID env var
  // In the future, we could build custom containers per agent
  return `${CONFIG.containerRegistry}/${CONFIG.projectId}/voiceai-agent:latest`;
}

async function deployToCloudRun(
  agentId: string,
  manifest: AgentManifest,
  imageName: string,
  subdomain: string,
  dryRun: boolean
): Promise<string> {
  const serviceName = `${agentId}-agent`;
  const deployment = manifest.deployment || {};

  const envVars = [
    `NODE_ENV=production`,
    `PERSONA_ID=${agentId}`,
    `GOOGLE_CLOUD_PROJECT=${CONFIG.projectId}`,
    `STANDALONE_AGENT=true`,
    `MUSIC_ENABLED=${manifest.capabilities?.music_enabled || false}`,
  ].join(',');

  const secrets = [
    'LIVEKIT_URL=livekit-url:latest',
    'LIVEKIT_API_KEY=livekit-api-key:latest',
    'LIVEKIT_API_SECRET=livekit-api-secret:latest',
    'OPENAI_API_KEY=openai-api-key:latest',
    'CARTESIA_API_KEY=cartesia-api-key:latest',
  ].join(',');

  const cmd = [
    `gcloud run deploy ${serviceName}`,
    `--image ${imageName}`,
    `--region ${deployment.region || CONFIG.region}`,
    '--platform managed',
    '--allow-unauthenticated',
    `--memory ${deployment.memory || '1Gi'}`,
    `--cpu ${deployment.cpu || '0.5'}`,
    '--timeout 3600',
    '--concurrency 10',
    `--min-instances ${deployment.min_instances ?? 0}`,
    `--max-instances ${deployment.max_instances ?? 5}`,
    `--set-env-vars "${envVars}"`,
    `--set-secrets "${secrets}"`,
    '--quiet',
  ].join(' \\\n  ');

  if (dryRun) {
    return `https://${subdomain}.${CONFIG.agentsDomain}`;
  }

  try {
    execSync(cmd, { stdio: 'inherit' });

    // Get service URL
    const urlOutput = execSync(
      `gcloud run services describe ${serviceName} --region ${CONFIG.region} --format 'value(status.url)'`,
      { encoding: 'utf-8' }
    ).trim();

    return urlOutput;
  } catch (error) {
    throw new Error(`Cloud Run deployment failed: ${(error as Error).message}`);
  }
}

async function configureSubdomain(subdomain: string, serviceUrl: string, dryRun: boolean): Promise<string> {
  const fullDomain = `${subdomain}.${CONFIG.agentsDomain}`;

  if (dryRun) {
    return `https://${fullDomain}`;
  }

  // In production, this would configure Cloud DNS or the load balancer
  // For now, we return the Cloud Run URL
  // TODO: Implement domain mapping with gcloud run domain-mappings create

  return serviceUrl;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse agent ID
  const agentId = args.find((a) => !a.startsWith('-'));

  // Parse options
  const dryRun = args.includes('--dry-run');
  const skipValidation = args.includes('--skip-validation');
  const skipPage = args.includes('--skip-page');
  const force = args.includes('--force') || args.includes('-f');
  const subdomainIdx = args.indexOf('--subdomain');
  const customSubdomain = subdomainIdx !== -1 ? args[subdomainIdx + 1] : undefined;

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${color.bold('ferni agent publish')} - Deploy agent to production

${color.bold('Usage:')}
  ferni agent publish <agent-id> [options]

${color.bold('Options:')}
  --dry-run           Preview deployment without making changes
  --subdomain <name>  Custom subdomain (default: agent-id)
  --skip-validation   Skip bundle validation
  --skip-page         Skip landing page generation
  --force, -f         Deploy without confirmation
  --help, -h          Show this help

${color.bold('Examples:')}
  ferni agent publish joel-advisor
  ferni agent publish my-coach --dry-run
  ferni agent publish my-agent --subdomain custom-name
`);
    process.exit(0);
  }

  if (!agentId) {
    console.log(color.red('Error: Agent ID is required'));
    console.log(color.dim('Usage: ferni agent publish <agent-id>'));
    process.exit(1);
  }

  const options: PublishOptions = {
    dryRun,
    subdomain: customSubdomain,
    skipValidation,
    skipPage,
    force,
  };

  // Find bundle
  const bundlePath = path.join(process.cwd(), 'src', 'personas', 'bundles', agentId);
  const manifestPath = path.join(bundlePath, 'persona.manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.log(color.red(`Agent not found: ${agentId}`));
    console.log(color.dim(`Expected: ${manifestPath}`));
    console.log(color.dim('Create one with: ferni agent init ' + agentId));
    process.exit(1);
  }

  // Load manifest
  let manifest: AgentManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    console.log(color.red(`Invalid manifest: ${(err as Error).message}`));
    process.exit(1);
  }

  p.intro(color.bgGreen(color.black(' 🚀 Publish Agent ')));

  if (options.dryRun) {
    p.log.warn('DRY RUN - No changes will be made');
  }

  p.log.info(`Agent: ${color.cyan(manifest.identity.name)}`);
  p.log.info(`Path: ${color.dim(bundlePath)}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Validate
  // ─────────────────────────────────────────────────────────────────────────

  const spinner = p.spinner();

  if (!options.skipValidation) {
    spinner.start('Validating agent bundle...');

    const validation = validateManifest(manifest, bundlePath);

    spinner.stop('Validation complete.');

    // Show errors
    if (validation.errors.length > 0) {
      console.log('');
      p.log.error(color.red('Errors (must fix):'));
      for (const err of validation.errors) {
        console.log(`  ${color.red('✗')} ${err}`);
      }
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.log('');
      p.log.warn(color.yellow('Warnings:'));
      for (const warn of validation.warnings) {
        console.log(`  ${color.yellow('!')} ${warn}`);
      }
    }

    if (!validation.valid) {
      console.log('');
      p.log.error('Agent is not ready for publishing.');
      p.log.info('Fix the errors above and try again.');
      process.exit(1);
    }

    if (validation.warnings.length > 0 && validation.errors.length === 0) {
      console.log('');
      p.log.success(`${color.green('✓')} Valid with warnings`);
    } else {
      console.log('');
      p.log.success(`${color.green('✓')} All checks passed`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Confirm deployment
  // ─────────────────────────────────────────────────────────────────────────

  const subdomain = options.subdomain || manifest.deployment?.subdomain || agentId;
  const targetUrl = `https://${subdomain}.${CONFIG.agentsDomain}`;

  console.log('');
  p.log.step(color.bold('Deployment Plan'));
  p.log.info(`Subdomain: ${color.cyan(subdomain)}`);
  p.log.info(`URL: ${color.cyan(targetUrl)}`);
  p.log.info(`Region: ${color.cyan(manifest.deployment?.region || CONFIG.region)}`);
  p.log.info(`Instances: ${color.cyan(`${manifest.deployment?.min_instances ?? 0}-${manifest.deployment?.max_instances ?? 5}`)}`);

  if (!options.force && !options.dryRun) {
    console.log('');
    const confirm = await p.confirm({
      message: `Deploy ${manifest.identity.name} to production?`,
      initialValue: true,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Deployment cancelled.');
      process.exit(0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Generate landing page
  // ─────────────────────────────────────────────────────────────────────────

  if (!options.skipPage) {
    console.log('');
    spinner.start('Generating landing page...');

    const pageHtml = generateLandingPage(manifest);
    const pageDir = path.join(bundlePath, 'deploy', 'page');
    const pagePath = path.join(pageDir, 'index.html');

    if (!options.dryRun) {
      fs.mkdirSync(pageDir, { recursive: true });
      fs.writeFileSync(pagePath, pageHtml);
    }

    spinner.stop(`Landing page ${options.dryRun ? 'would be' : ''} generated (${Math.round(pageHtml.length / 1024)}KB)`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Build container
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  spinner.start('Building container...');

  const imageName = await buildContainer(agentId, bundlePath, options.dryRun);

  spinner.stop(`Container ${options.dryRun ? 'would use' : 'ready'}: ${color.dim(imageName.split('/').pop())}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Deploy to Cloud Run
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  spinner.start('Deploying to Cloud Run...');

  try {
    const serviceUrl = await deployToCloudRun(agentId, manifest, imageName, subdomain, options.dryRun);
    spinner.stop(`Deployed ${options.dryRun ? '(dry run)' : 'successfully'}!`);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Configure subdomain
    // ─────────────────────────────────────────────────────────────────────────

    console.log('');
    spinner.start('Configuring subdomain...');

    const finalUrl = await configureSubdomain(subdomain, serviceUrl, options.dryRun);

    spinner.stop(`Subdomain ${options.dryRun ? 'would be' : ''} configured!`);

    // ─────────────────────────────────────────────────────────────────────────
    // Success!
    // ─────────────────────────────────────────────────────────────────────────

    console.log('');
    console.log('');
    p.log.success(color.green(color.bold('Agent published!')));
    console.log('');

    console.log(`  ${color.bold('Live URL:')}       ${color.cyan(finalUrl)}`);
    console.log(`  ${color.bold('Dashboard:')}      ${color.dim(`https://ferni.ai/agents/${agentId}`)}`);
    console.log(`  ${color.bold('Health Check:')}   ${color.dim(`${serviceUrl}/health`)}`);

    console.log('');
    p.note(
      [
        `${color.bold('Test your agent:')}`,
        `  curl ${finalUrl}/health`,
        '',
        `${color.bold('View logs:')}`,
        `  ferni logs agent --filter ${agentId}`,
        '',
        `${color.bold('Update:')}`,
        `  ferni agent publish ${agentId}`,
      ].join('\n'),
      'Next Steps'
    );

    p.outro(color.green(`${manifest.identity.name} is live! 🎉`));

    // Update manifest with deployment info
    if (!options.dryRun) {
      manifest.deployment = {
        ...manifest.deployment,
        subdomain,
      };
      manifest.metadata = {
        ...manifest.metadata,
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } catch (error) {
    spinner.stop('Deployment failed.');
    p.log.error(`${(error as Error).message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
