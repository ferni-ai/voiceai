#!/usr/bin/env npx tsx
/**
 * Unified Setup CLI
 *
 * Single entry point for all setup and configuration tasks.
 * Replaces: setup-local.sh, setup-app-icons.sh, setup-firestore-indexes.sh,
 *           setup-github-deploy.sh, setup-github-secrets.sh,
 *           setup-production-persistence.sh, setup-signing.sh, setup-slack.sh
 *
 * Usage:
 *   npx tsx scripts/setup.ts                 # Show help
 *   npx tsx scripts/setup.ts local           # Set up local development
 *   npx tsx scripts/setup.ts icons           # Generate app icons
 *   npx tsx scripts/setup.ts firestore       # Set up Firestore indexes
 *   npx tsx scripts/setup.ts github          # Configure GitHub CI/CD
 *   npx tsx scripts/setup.ts persistence     # Set up production persistence
 *   npx tsx scripts/setup.ts signing         # Configure code signing
 *   npx tsx scripts/setup.ts slack           # Configure Slack notifications
 *   npx tsx scripts/setup.ts all             # Run all setup steps
 *
 * Or via npm:
 *   npm run setup local
 *   npm run setup icons
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

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
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
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

function checkCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

interface SetupOptions {
  verbose: boolean;
  skipPrompts: boolean;
}

/**
 * Local Development Setup
 * Sets up npm, builds TypeScript, checks .env, optionally starts Docker
 */
async function setupLocal(options: SetupOptions): Promise<boolean> {
  log.step('LOCAL DEVELOPMENT SETUP');

  // Check dependencies
  log.info('Checking dependencies...');
  
  if (!checkCommand('node')) {
    log.error('Node.js is required but not installed');
    return false;
  }
  log.success('Node.js found');

  if (!checkCommand('npm')) {
    log.error('npm is required but not installed');
    return false;
  }
  log.success('npm found');

  const hasDocker = checkCommand('docker');
  if (hasDocker) {
    log.success('Docker found');
  } else {
    log.warn('Docker not found - persistence will use in-memory storage');
  }

  // Install dependencies
  log.info('Installing npm packages...');
  exec('npm install');
  log.success('Dependencies installed');

  // Build TypeScript
  log.info('Building TypeScript...');
  exec('npm run build');
  log.success('Build complete');

  // Check .env file
  const envPath = join(PROJECT_ROOT, '.env');
  if (!existsSync(envPath)) {
    log.warn('No .env file found');
    console.log(`
Create .env with your API keys:

LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
GOOGLE_API_KEY=your-google-ai-key
CARTESIA_API_KEY=your-cartesia-key
PERSONA_ID=ferni

For persistence (optional):
DATABASE_URL=postgresql://voiceai:localdev@localhost:5432/voiceai
REDIS_URL=redis://localhost:6379
`);
  } else {
    log.success('.env file exists');
  }

  // Offer to start Docker services
  if (hasDocker && !options.skipPrompts) {
    const startDocker = await confirm('Start PostgreSQL and Redis for persistent storage?');
    if (startDocker) {
      log.info('Starting Docker services...');
      exec('docker compose -f docker-compose.local.yml up -d');
      log.success('Docker services started');
      console.log(`
Add these to your .env:
DATABASE_URL=postgresql://voiceai:localdev@localhost:5432/voiceai
REDIS_URL=redis://localhost:6379
`);
    }
  }

  log.success('Local setup complete!');
  console.log(`
To run the agent:
  npm run dev

To run with a specific persona:
  PERSONA_ID=peter-john npm run dev
`);

  return true;
}

/**
 * App Icons Setup
 * Generates icons for Electron, iOS, and Android from brand assets
 */
async function setupIcons(options: SetupOptions): Promise<boolean> {
  log.step('APP ICONS SETUP');

  const brandIcons = join(PROJECT_ROOT, 'design-system/assets/logos');
  const hasImageMagick = checkCommand('convert');

  if (!hasImageMagick) {
    log.warn('ImageMagick not found. Install with: brew install imagemagick');
    log.info('Will copy existing PNG files only');
  }

  // First, ensure design system assets are built
  log.info('Building design system assets...');
  exec('npm run build:assets');

  // Electron icons
  log.info('Setting up Electron icons...');
  const electronResources = join(PROJECT_ROOT, 'apps/electron/resources');
  mkdirSync(electronResources, { recursive: true });

  const sourcePng = join(PROJECT_ROOT, 'apps/web/public/design-system/logos/app-icon-1024.png');
  if (existsSync(sourcePng)) {
    copyFileSync(sourcePng, join(electronResources, 'icon.png'));
    log.success('Copied icon.png (1024x1024)');

    if (hasImageMagick && process.platform === 'darwin') {
      log.info('Generating macOS .icns...');
      const iconset = join(electronResources, 'icon.iconset');
      mkdirSync(iconset, { recursive: true });

      const sizes = [
        [16, 'icon_16x16.png'],
        [32, 'icon_16x16@2x.png'],
        [32, 'icon_32x32.png'],
        [64, 'icon_32x32@2x.png'],
        [128, 'icon_128x128.png'],
        [256, 'icon_128x128@2x.png'],
        [256, 'icon_256x256.png'],
        [512, 'icon_256x256@2x.png'],
        [512, 'icon_512x512.png'],
        [1024, 'icon_512x512@2x.png'],
      ];

      for (const [size, name] of sizes) {
        exec(`convert "${sourcePng}" -resize ${size}x${size} "${join(iconset, name as string)}"`, { silent: true });
      }

      exec(`iconutil -c icns "${iconset}" -o "${join(electronResources, 'icon.icns')}"`, { silent: true });
      log.success('Generated icon.icns');

      // Windows ico
      exec(`convert "${sourcePng}" -define icon:auto-resize=256,128,96,64,48,32,16 "${join(electronResources, 'icon.ico')}"`, { silent: true });
      log.success('Generated icon.ico');

      // Tray icons
      exec(`convert "${sourcePng}" -resize 22x22 "${join(electronResources, 'trayTemplate.png')}"`, { silent: true });
      exec(`convert "${sourcePng}" -resize 44x44 "${join(electronResources, 'trayTemplate@2x.png')}"`, { silent: true });
      log.success('Generated tray icons');

      // Cleanup
      exec(`rm -rf "${iconset}"`, { silent: true });
    }
  } else {
    log.warn('Source icon not found. Run npm run build:assets first.');
  }

  log.success('Electron icons ready');

  // iOS - just create reference documentation
  const iosDir = join(PROJECT_ROOT, 'apps/ios');
  mkdirSync(iosDir, { recursive: true });
  
  const iosReadme = `# iOS App Icons

When you run \`npx cap add ios\`, Capacitor creates an Xcode project.
You'll need to add app icons in Xcode's asset catalog.

## Required Icon Sizes

| Size | Scale | Filename |
|------|-------|----------|
| 20pt | @2x | 40x40 |
| 20pt | @3x | 60x60 |
| 29pt | @2x | 58x58 |
| 29pt | @3x | 87x87 |
| 40pt | @2x | 80x80 |
| 40pt | @3x | 120x120 |
| 60pt | @2x | 120x120 |
| 60pt | @3x | 180x180 |
| 1024pt | @1x | 1024x1024 (App Store) |

## Source Icons

Pre-generated icons are available in:
- \`apps/web/public/design-system/logos/\`

## Adding Icons

1. Open \`ios/App/App.xcworkspace\` in Xcode
2. Select Assets.xcassets
3. Select AppIcon
4. Drag icons to the appropriate slots
`;

  writeFileSync(join(iosDir, 'ICONS.md'), iosReadme);
  log.success('Created iOS ICONS.md reference');

  return true;
}

/**
 * Firestore Indexes Setup
 * Creates required indexes for the memory system
 */
async function setupFirestore(options: SetupOptions): Promise<boolean> {
  log.step('FIRESTORE INDEXES SETUP');

  if (!checkCommand('gcloud')) {
    log.error('gcloud CLI is required. Install from: https://cloud.google.com/sdk/docs/install');
    return false;
  }
  log.success('gcloud CLI found');

  // Get project ID
  let projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
  }

  if (!projectId) {
    log.error('No project ID found. Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project YOUR_PROJECT');
    return false;
  }

  log.info(`Project: ${projectId}`);

  // Create indexes
  const indexes = [
    {
      name: 'Vector Store (semantic search)',
      collection: 'vectors',
      cmd: `gcloud firestore indexes composite create --project="${projectId}" --collection-group=vectors --query-scope=COLLECTION --field-config='vector-config={"dimension":"768","flat":{}},field-path=embedding'`,
    },
    {
      name: 'Phone Mappings',
      collection: 'phone_mappings',
      cmd: `gcloud firestore indexes composite create --project="${projectId}" --collection-group=phone_mappings --query-scope=COLLECTION --field-config='field-path=phone,order=ASCENDING' --field-config='field-path=userId,order=ASCENDING'`,
    },
    {
      name: 'Linked Identifiers',
      collection: 'bogle_users',
      cmd: `gcloud firestore indexes composite create --project="${projectId}" --collection-group=bogle_users --query-scope=COLLECTION --field-config='field-path=linkedIdentifiers,array-config=CONTAINS'`,
    },
  ];

  for (const index of indexes) {
    log.info(`Creating ${index.name} index...`);
    try {
      exec(index.cmd, { silent: true });
      log.success(`${index.name} index created`);
    } catch {
      log.warn(`${index.name} index may already exist`);
    }
  }

  // Export index definitions
  const indexDefinitions = {
    indexes: [
      {
        collectionGroup: 'vectors',
        queryScope: 'COLLECTION',
        fields: [{ fieldPath: 'embedding', vectorConfig: { dimension: 768, flat: {} } }],
      },
      {
        collectionGroup: 'phone_mappings',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'phone', order: 'ASCENDING' },
          { fieldPath: 'userId', order: 'ASCENDING' },
        ],
      },
      {
        collectionGroup: 'bogle_users',
        queryScope: 'COLLECTION',
        fields: [{ fieldPath: 'linkedIdentifiers', arrayConfig: 'CONTAINS' }],
      },
    ],
    fieldOverrides: [],
  };

  writeFileSync(
    join(PROJECT_ROOT, 'firestore.indexes.json'),
    JSON.stringify(indexDefinitions, null, 2)
  );
  log.success('Created firestore.indexes.json for CI/CD');

  console.log(`
Indexes created:
  ✓ vectors.embedding (vector search)
  ✓ phone_mappings.phone (phone lookups)
  ✓ bogle_users.linkedIdentifiers (cross-device)

Note: Indexes may take a few minutes to build.
Check status: gcloud firestore indexes composite list --project=${projectId}
`);

  return true;
}

/**
 * GitHub Setup
 * Configures GitHub Actions CI/CD with service accounts and secrets
 */
async function setupGitHub(options: SetupOptions): Promise<boolean> {
  log.step('GITHUB CI/CD SETUP');

  if (!checkCommand('gh')) {
    log.error('GitHub CLI (gh) is required. Install from: https://cli.github.com/');
    return false;
  }
  log.success('GitHub CLI found');

  // Check authentication
  try {
    exec('gh auth status', { silent: true });
    log.success('Authenticated with GitHub');
  } catch {
    log.error('Not authenticated. Run: gh auth login');
    return false;
  }

  // Get repo info
  let repo: string;
  try {
    repo = exec('gh repo view --json nameWithOwner -q .nameWithOwner', { silent: true }).trim();
  } catch {
    log.error('Not in a GitHub repository');
    return false;
  }
  log.info(`Repository: ${repo}`);

  // GCP Service Account setup
  if (checkCommand('gcloud')) {
    const projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
    
    if (projectId) {
      log.info(`GCP Project: ${projectId}`);
      
      const saName = 'github-actions-deploy';
      const saEmail = `${saName}@${projectId}.iam.gserviceaccount.com`;

      // Check if SA exists
      try {
        exec(`gcloud iam service-accounts describe ${saEmail}`, { silent: true });
        log.success(`Service account exists: ${saEmail}`);
      } catch {
        log.info('Creating service account...');
        exec(`gcloud iam service-accounts create ${saName} --display-name="GitHub Actions Deploy" --description="Service account for GitHub Actions CI/CD"`);
        log.success('Service account created');
      }

      // Grant roles
      const roles = [
        'roles/run.admin',
        'roles/storage.admin',
        'roles/iam.serviceAccountUser',
        'roles/secretmanager.secretAccessor',
      ];

      for (const role of roles) {
        exec(`gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="${role}" --quiet 2>/dev/null || true`, { silent: true });
        log.success(`Granted ${role}`);
      }

      // Create key
      const keyFile = '/tmp/gcp-sa-key.json';
      exec(`gcloud iam service-accounts keys create ${keyFile} --iam-account=${saEmail} --quiet`, { silent: true });
      const keyContent = readFileSync(keyFile, 'utf-8');
      const keyBase64 = Buffer.from(keyContent).toString('base64');
      exec(`rm ${keyFile}`, { silent: true });

      // Set GitHub secrets
      log.info('Setting GitHub secrets...');
      exec(`echo "${projectId}" | gh secret set GCP_PROJECT_ID --repo "${repo}"`, { silent: true });
      log.success('Set GCP_PROJECT_ID');
      
      exec(`echo "${keyBase64}" | gh secret set GCP_SA_KEY --repo "${repo}"`, { silent: true });
      log.success('Set GCP_SA_KEY');
    }
  } else {
    log.warn('gcloud not found - skipping GCP setup');
  }

  // Create environments
  log.info('Creating GitHub environments...');
  try {
    exec(`gh api repos/${repo}/environments/production -X PUT --input - <<< '{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}'`, { silent: true });
    log.success('Created production environment');
  } catch {
    log.warn('Could not create production environment');
  }

  try {
    exec(`gh api repos/${repo}/environments/staging -X PUT --input - <<< '{}'`, { silent: true });
    log.success('Created staging environment');
  } catch {
    log.warn('Could not create staging environment');
  }

  log.success('GitHub CI/CD setup complete');

  return true;
}

/**
 * Production Persistence Setup
 * Configures Firestore for production
 */
async function setupPersistence(options: SetupOptions): Promise<boolean> {
  log.step('PRODUCTION PERSISTENCE SETUP');

  if (!checkCommand('gcloud')) {
    log.error('gcloud CLI is required. Install from: https://cloud.google.com/sdk/docs/install');
    return false;
  }
  log.success('gcloud CLI found');

  // Check authentication
  let account: string;
  try {
    account = exec('gcloud auth list --filter=status:ACTIVE --format="value(account)"', { silent: true }).trim();
    if (!account) throw new Error('No active account');
    log.success(`Authenticated as: ${account}`);
  } catch {
    log.error('Not authenticated. Run: gcloud auth login');
    return false;
  }

  // Get project ID
  let projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
  
  if (!projectId && !options.skipPrompts) {
    projectId = await prompt('Enter your GCP project ID: ');
    if (projectId) {
      exec(`gcloud config set project "${projectId}"`, { silent: true });
    }
  }

  if (!projectId) {
    log.error('No project ID configured');
    return false;
  }
  log.info(`Project: ${projectId}`);

  // Enable Firestore API
  log.info('Enabling Firestore API...');
  exec(`gcloud services enable firestore.googleapis.com --project="${projectId}"`, { silent: true });
  log.success('Firestore API enabled');

  // Check if database exists
  const dbExists = exec(`gcloud firestore databases list --project="${projectId}" --format="value(name)"`, { silent: true }).includes('(default)');

  if (!dbExists) {
    log.info('Creating Firestore database...');
    const region = 'us-central1';
    exec(`gcloud firestore databases create --project="${projectId}" --location="${region}" --type=firestore-native`);
    log.success(`Firestore database created in ${region}`);
  } else {
    log.success('Firestore database already exists');
  }

  // Create service account
  const saName = 'ferni-ai-backend';
  const saEmail = `${saName}@${projectId}.iam.gserviceaccount.com`;

  try {
    exec(`gcloud iam service-accounts describe ${saEmail} --project="${projectId}"`, { silent: true });
    log.success('Service account already exists');
  } catch {
    log.info('Creating service account...');
    exec(`gcloud iam service-accounts create "${saName}" --project="${projectId}" --display-name="Ferni AI Backend" --description="Service account for Ferni AI persistence"`);
    log.success('Service account created');
  }

  // Grant permissions
  exec(`gcloud projects add-iam-policy-binding "${projectId}" --member="serviceAccount:${saEmail}" --role="roles/datastore.user" --quiet 2>/dev/null || true`, { silent: true });
  log.success('Firestore permissions granted');

  // Create credentials
  const credsDir = join(process.env.HOME || '~', '.ferni');
  const credsFile = join(credsDir, 'service-account.json');
  
  mkdirSync(credsDir, { recursive: true });

  if (!existsSync(credsFile)) {
    log.info('Creating service account key...');
    exec(`gcloud iam service-accounts keys create "${credsFile}" --project="${projectId}" --iam-account="${saEmail}"`);
    log.success(`Credentials saved to: ${credsFile}`);
  } else {
    log.success(`Credentials already exist: ${credsFile}`);
  }

  console.log(`
Add these environment variables to your .env file:

GOOGLE_CLOUD_PROJECT=${projectId}
GOOGLE_APPLICATION_CREDENTIALS=${credsFile}

For Cloud Run deployment, add:
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${projectId}"
`);

  return true;
}

/**
 * Code Signing Setup
 * Interactive guide for setting up code signing on all platforms
 */
async function setupSigning(options: SetupOptions): Promise<boolean> {
  log.step('CODE SIGNING SETUP');

  console.log(`
This is an interactive guide for setting up code signing.

${colors.bold}Platforms:${colors.reset}
  1. macOS - Requires Apple Developer account ($99/year)
  2. Windows - Requires code signing certificate ($139-475/year)
  3. iOS - Requires Apple Developer account ($99/year)
  4. Android - Free (self-signed keystore)

${colors.bold}Documentation:${colors.reset}
  See apps/CODE_SIGNING.md for detailed instructions.

${colors.bold}Quick Setup for Android:${colors.reset}
`);

  if (options.skipPrompts) {
    log.info('Skipping interactive prompts');
    return true;
  }

  const setupAndroid = await confirm('Generate Android keystore?');
  
  if (setupAndroid) {
    const keystoreDir = join(PROJECT_ROOT, 'apps/android-native');
    const keystoreFile = join(keystoreDir, 'ferni-release.keystore');

    if (existsSync(keystoreFile)) {
      log.warn('Keystore already exists');
      const overwrite = await confirm('Overwrite existing keystore?');
      if (!overwrite) return true;
    }

    mkdirSync(keystoreDir, { recursive: true });

    log.info('Generating Android keystore...');
    console.log('\nYou will be prompted for keystore details:\n');

    try {
      spawnSync('keytool', [
        '-genkey', '-v',
        '-keystore', keystoreFile,
        '-alias', 'voiceai',
        '-keyalg', 'RSA',
        '-keysize', '2048',
        '-validity', '10000',
      ], { stdio: 'inherit' });

      log.success(`Keystore created: ${keystoreFile}`);

      console.log(`
${colors.red}⚠️  IMPORTANT: Back up your keystore file!${colors.reset}
If you lose it, you cannot update your app on Play Store.

Recommended backup locations:
  • Password manager (1Password, Bitwarden)
  • Encrypted cloud storage
  • Secure offline backup

To build signed APK:
  cd apps/android-native
  ./gradlew assembleRelease
`);
    } catch (error) {
      log.error('Failed to generate keystore');
      return false;
    }
  }

  return true;
}

/**
 * Slack Setup
 * Configures Slack webhook notifications
 */
async function setupSlack(options: SetupOptions): Promise<boolean> {
  log.step('SLACK INTEGRATION SETUP');

  console.log(`
This will set up Slack notifications for:
  • Feature rollouts
  • Deployments
  • Incident alerts

Prerequisites:
  1. Go to: https://api.slack.com/apps
  2. Create 'Ferni Notifications' app
  3. Enable Incoming Webhooks
  4. Add webhook to workspace
  5. Copy the Webhook URL
`);

  if (options.skipPrompts) {
    log.info('Skipping interactive prompts');
    return true;
  }

  const webhookUrl = await prompt('Slack Webhook URL: ');
  
  if (!webhookUrl) {
    log.error('Webhook URL is required');
    return false;
  }

  if (!webhookUrl.startsWith('https://hooks.slack.com/services/')) {
    log.warn('URL does not look like a Slack webhook');
    const proceed = await confirm('Continue anyway?');
    if (!proceed) return false;
  }

  // Set GitHub secret
  if (checkCommand('gh')) {
    try {
      const repo = exec('gh repo view --json nameWithOwner -q .nameWithOwner', { silent: true }).trim();
      if (repo) {
        exec(`echo "${webhookUrl}" | gh secret set SLACK_WEBHOOK_URL --repo "${repo}"`, { silent: true });
        log.success('Set SLACK_WEBHOOK_URL in GitHub');
      }
    } catch {
      log.warn('Could not set GitHub secret');
    }
  }

  // Set GCP secret
  if (checkCommand('gcloud')) {
    try {
      const projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
      if (projectId) {
        try {
          exec(`gcloud secrets describe slack-webhook-url --project="${projectId}"`, { silent: true });
          exec(`echo -n "${webhookUrl}" | gcloud secrets versions add slack-webhook-url --data-file=- --project="${projectId}"`, { silent: true });
        } catch {
          exec(`echo -n "${webhookUrl}" | gcloud secrets create slack-webhook-url --data-file=- --project="${projectId}"`, { silent: true });
        }
        log.success('Set slack-webhook-url in GCP Secret Manager');
      }
    } catch {
      log.warn('Could not set GCP secret');
    }
  }

  // Update .env
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    if (envContent.includes('SLACK_WEBHOOK_URL')) {
      log.info('SLACK_WEBHOOK_URL already in .env');
    } else {
      writeFileSync(envPath, envContent + `\n# Slack Integration\nSLACK_WEBHOOK_URL=${webhookUrl}\n`);
      log.success('Added SLACK_WEBHOOK_URL to .env');
    }
  }

  // Test notification
  const sendTest = await confirm('Send a test notification?', true);
  if (sendTest) {
    const testPayload = JSON.stringify({
      text: '🎉 Ferni AI Slack Integration Configured!',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎉 Ferni AI Slack Integration Configured!*\n\nYou will now receive notifications for:\n• Feature rollouts\n• Deployments\n• Incident alerts',
          },
        },
      ],
    });

    try {
      exec(`curl -s -X POST "${webhookUrl}" -H "Content-Type: application/json" -d '${testPayload}'`, { silent: true });
      log.success('Test notification sent!');
    } catch {
      log.error('Failed to send test notification');
    }
  }

  return true;
}

/**
 * Secrets Upload
 * Uploads secrets from .env to GCP Secret Manager
 */
async function setupSecrets(options: SetupOptions): Promise<boolean> {
  log.step('GCP SECRETS UPLOAD');

  if (!checkCommand('gcloud')) {
    log.error('gcloud CLI is required. Install from: https://cloud.google.com/sdk/docs/install');
    return false;
  }
  log.success('gcloud CLI found');

  // Check for .env file
  const envPath = join(PROJECT_ROOT, '.env');
  if (!existsSync(envPath)) {
    log.error('.env file not found');
    return false;
  }

  // Get project ID
  let projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
  if (!projectId && !options.skipPrompts) {
    projectId = await prompt('Enter your GCP project ID: ');
    if (projectId) {
      exec(`gcloud config set project "${projectId}"`, { silent: true });
    }
  }

  if (!projectId) {
    log.error('No project ID configured');
    return false;
  }
  log.info(`Project: ${projectId}`);

  // Enable Secret Manager API
  log.info('Enabling Secret Manager API...');
  exec('gcloud services enable secretmanager.googleapis.com --quiet 2>/dev/null || true', { silent: true });

  // Map of env var names to GCP secret names
  const secretMapping: Record<string, string> = {
    LIVEKIT_URL: 'livekit-url',
    LIVEKIT_API_KEY: 'livekit-api-key',
    LIVEKIT_API_SECRET: 'livekit-api-secret',
    GOOGLE_API_KEY: 'google-api-key',
    CARTESIA_API_KEY: 'cartesia-api-key',
    ALPHA_VANTAGE_API_KEY: 'alpha-vantage-key',
    FINNHUB_API_KEY: 'finnhub-api-key',
    TWILIO_ACCOUNT_SID: 'twilio-account-sid',
    TWILIO_AUTH_TOKEN: 'twilio-auth-token',
    TWILIO_PHONE_NUMBER: 'twilio-phone-number',
    SENDGRID_API_KEY: 'sendgrid-api-key',
    SENDGRID_FROM_EMAIL: 'sendgrid-from-email',
    SPOTIFY_CLIENT_ID: 'spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'spotify-client-secret',
    SPOTIFY_REFRESH_TOKEN: 'spotify-refresh-token',
    SPOTIFY_REDIRECT_URI: 'spotify-redirect-uri',
    PLAID_CLIENT_ID: 'plaid-client-id',
    PLAID_SECRET: 'plaid-secret',
    DATABASE_URL: 'database-url',
    REDIS_URL: 'redis-url',
    STRIPE_SECRET_KEY: 'stripe-secret-key',
    STRIPE_WEBHOOK_SECRET: 'stripe-webhook-secret',
    SLACK_WEBHOOK_URL: 'slack-webhook-url',
  };

  // Read .env file
  const envContent = readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');

  let created = 0;

  log.info('Uploading secrets from .env...');

  for (const line of envLines) {
    // Skip comments and empty lines
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const [key, ...valueParts] = line.split('=');
    let value = valueParts.join('=').trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    const secretName = secretMapping[key.trim()];
    if (!secretName || !value) continue;

    try {
      // Check if secret exists
      try {
        exec(`gcloud secrets describe "${secretName}" --project="${projectId}"`, { silent: true });
        // Update existing
        exec(`echo -n "${value}" | gcloud secrets versions add "${secretName}" --data-file=- --project="${projectId}" --quiet`, { silent: true });
        log.success(`Updated ${secretName}`);
      } catch {
        // Create new
        exec(`echo -n "${value}" | gcloud secrets create "${secretName}" --data-file=- --project="${projectId}" --quiet`, { silent: true });
        log.success(`Created ${secretName}`);
      }
      created++;
    } catch (error) {
      log.warn(`Failed to upload ${secretName}`);
    }
  }

  log.success(`Uploaded ${created} secrets to ${projectId}`);

  // Grant Cloud Run access
  log.info('Granting Cloud Run service account access...');
  try {
    const projectNumber = exec(`gcloud projects describe ${projectId} --format='value(projectNumber)'`, { silent: true }).trim();
    if (projectNumber) {
      const serviceAccount = `${projectNumber}-compute@developer.gserviceaccount.com`;
      
      // Grant access to all secrets
      const secrets = exec(`gcloud secrets list --format='value(name)' --project="${projectId}"`, { silent: true }).trim().split('\n');
      for (const secretName of secrets) {
        if (!secretName) continue;
        exec(`gcloud secrets add-iam-policy-binding "${secretName}" --member="serviceAccount:${serviceAccount}" --role="roles/secretmanager.secretAccessor" --project="${projectId}" --quiet 2>/dev/null || true`, { silent: true });
      }
      log.success('Access granted to Cloud Run service account');
    }
  } catch {
    log.warn('Could not grant Cloud Run access');
  }

  console.log(`
View secrets:  gcloud secrets list --project=${projectId}
Deploy agent:  npm run deploy agent
`);

  return true;
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI SETUP CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/setup.ts <command> [options]
  npm run setup <command> [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}local${colors.reset}        Set up local development environment
  ${colors.green}icons${colors.reset}        Generate app icons for all platforms
  ${colors.green}firestore${colors.reset}    Create Firestore indexes
  ${colors.green}github${colors.reset}       Configure GitHub Actions CI/CD
  ${colors.green}persistence${colors.reset}  Set up production persistence (Firestore)
  ${colors.green}signing${colors.reset}      Configure code signing (interactive)
  ${colors.green}slack${colors.reset}        Configure Slack notifications
  ${colors.green}secrets${colors.reset}      Upload .env secrets to GCP Secret Manager
  ${colors.green}all${colors.reset}          Run all setup steps

${colors.bold}Options:${colors.reset}
  --verbose      Show detailed output
  --yes, -y      Skip confirmation prompts
  --help, -h     Show this help

${colors.bold}Examples:${colors.reset}
  npm run setup local           # Set up for local development
  npm run setup icons           # Generate app icons
  npm run setup secrets         # Upload secrets to GCP
  npm run setup all -- --yes    # Run all setup steps non-interactively
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options: SetupOptions = {
    verbose: args.includes('--verbose'),
    skipPrompts: args.includes('--yes') || args.includes('-y'),
  };

  // Get command
  const commands = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  if (commands.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = commands[0];

  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI SETUP${colors.reset}                                               ${colors.cyan}║${colors.reset}
${colors.cyan}║${colors.reset}  Command: ${colors.green}${command}${colors.reset}                                           ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let success = true;

  switch (command) {
    case 'local':
      success = await setupLocal(options);
      break;

    case 'icons':
      success = await setupIcons(options);
      break;

    case 'firestore':
      success = await setupFirestore(options);
      break;

    case 'github':
      success = await setupGitHub(options);
      break;

    case 'persistence':
      success = await setupPersistence(options);
      break;

    case 'signing':
      success = await setupSigning(options);
      break;

    case 'slack':
      success = await setupSlack(options);
      break;

    case 'secrets':
      success = await setupSecrets(options);
      break;

    case 'all':
      success = await setupLocal(options);
      if (success) success = await setupIcons(options);
      if (success) success = await setupFirestore(options);
      if (success) success = await setupPersistence(options);
      break;

    default:
      log.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }

  if (success) {
    log.success('Setup complete!');
  } else {
    log.error('Setup failed');
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Setup failed: ${error.message}`);
  process.exit(1);
});

