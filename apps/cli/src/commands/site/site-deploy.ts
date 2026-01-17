#!/usr/bin/env npx tsx
/**
 * Site Deploy Command
 *
 * Deploy the generated site to Firebase or Ferni hosting.
 *
 * Usage:
 *   ferni site deploy                     # Deploy to Firebase (self-hosted)
 *   ferni site deploy --ferni             # Deploy to Ferni hosting (free tier)
 *   ferni site deploy --ferni --subdomain my-agent   # Premium subdomain
 *   ferni site deploy --dir ./mysite      # Deploy custom directory
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface FerniDeployResponse {
  success: boolean;
  url: string;
  subdomain?: string;
  expiresAt?: string;
}

interface SubdomainCheckResponse {
  available: boolean;
  subdomain: string;
  suggestedAlternatives?: string[];
}

// ============================================================================
// FIREBASE DEPLOY
// ============================================================================

async function deployToFirebase(siteDir: string): Promise<DeployResult> {
  const fullPath = path.resolve(process.cwd(), siteDir);

  // Check for firebase.json
  const firebaseConfigPath = path.join(fullPath, 'firebase.json');
  let needsInit = !fs.existsSync(firebaseConfigPath);

  if (needsInit) {
    // Create minimal firebase.json
    const firebaseConfig = {
      hosting: {
        public: '.',
        ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      },
    };
    fs.writeFileSync(firebaseConfigPath, JSON.stringify(firebaseConfig, null, 2));
    p.log.info('Created firebase.json configuration.');
  }

  // Run firebase deploy
  const result = spawnSync('firebase', ['deploy', '--only', 'hosting'], {
    cwd: fullPath,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    return {
      success: false,
      error: 'Firebase deploy failed. Make sure you have firebase-tools installed and are logged in.',
    };
  }

  // Try to get the URL from firebase config
  try {
    const firebaserc = path.join(fullPath, '.firebaserc');
    if (fs.existsSync(firebaserc)) {
      const config = JSON.parse(fs.readFileSync(firebaserc, 'utf-8'));
      const projectId = config.projects?.default;
      if (projectId) {
        return {
          success: true,
          url: `https://${projectId}.web.app`,
        };
      }
    }
  } catch {
    // Ignore
  }

  return { success: true };
}

// ============================================================================
// FERNI DEPLOY
// ============================================================================

async function deployToFerni(
  siteDir: string,
  subdomain?: string
): Promise<DeployResult> {
  const fullPath = path.resolve(process.cwd(), siteDir);

  // Check for index.html
  const indexPath = path.join(fullPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return {
      success: false,
      error: 'No index.html found. Make sure to generate the site first.',
    };
  }

  // Read site files
  const files: Record<string, string> = {};
  const siteFiles = fs.readdirSync(fullPath);

  for (const file of siteFiles) {
    const filePath = path.join(fullPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && !file.startsWith('.')) {
      files[file] = fs.readFileSync(filePath, 'utf-8');
    }
  }

  // Deploy to Ferni API
  try {
    const response = await cliAuth.apiRequest<FerniDeployResponse>('/api/sites/deploy', {
      method: 'POST',
      body: JSON.stringify({
        files,
        subdomain,
      }),
    });

    return {
      success: true,
      url: response.url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    };
  }
}

// ============================================================================
// SUBDOMAIN CHECK
// ============================================================================

async function checkSubdomain(subdomain: string): Promise<SubdomainCheckResponse> {
  try {
    const response = await cliAuth.apiRequest<SubdomainCheckResponse>(
      `/api/subdomains/check?subdomain=${encodeURIComponent(subdomain)}`
    );
    return response;
  } catch {
    return {
      available: false,
      subdomain,
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const dirIdx = args.indexOf('--dir');
  const siteDir = dirIdx !== -1 ? args[dirIdx + 1] : './site';

  const useFerni = args.includes('--ferni');

  const subdomainIdx = args.indexOf('--subdomain');
  const subdomain = subdomainIdx !== -1 ? args[subdomainIdx + 1] : undefined;

  const dryRun = args.includes('--dry-run');

  p.intro(color.bgGreen(color.black(' Deploy Site ')));

  // Check if directory exists
  const fullPath = path.resolve(process.cwd(), siteDir);

  if (!fs.existsSync(fullPath)) {
    p.log.error(`Directory not found: ${color.cyan(siteDir)}`);
    p.log.info(`Create a site first: ${color.cyan('ferni site create --agent <id>')}`);
    process.exit(1);
  }

  // Check for index.html
  const indexPath = path.join(fullPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    p.log.error(`No index.html found in ${color.cyan(siteDir)}`);
    p.log.info('Make sure the directory contains a valid site.');
    process.exit(1);
  }

  p.log.info(`Site directory: ${color.cyan(fullPath)}`);
  p.log.info(`Deploy target: ${color.cyan(useFerni ? 'Ferni Hosting' : 'Firebase')}`);
  console.log('');

  // Ferni hosting requires auth
  if (useFerni) {
    if (!isAuthenticated()) {
      p.log.warn("You're not logged in.");
      p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
      process.exit(1);
    }

    // Check subdomain availability if specified
    if (subdomain) {
      const spinner = p.spinner();
      spinner.start(`Checking subdomain ${color.cyan(subdomain)}...`);

      const subdomainCheck = await checkSubdomain(subdomain);
      spinner.stop('Subdomain checked.');

      if (!subdomainCheck.available) {
        p.log.error(`Subdomain ${color.cyan(subdomain)} is not available.`);
        if (subdomainCheck.suggestedAlternatives?.length) {
          p.log.info('Try one of these instead:');
          for (const alt of subdomainCheck.suggestedAlternatives) {
            console.log(`  ${color.cyan(alt)}.ferni.ai`);
          }
        }
        process.exit(1);
      }

      p.log.success(`Subdomain ${color.cyan(subdomain)} is available!`);
    }
  }

  // Dry run
  if (dryRun) {
    p.log.info(color.yellow('Dry run - no changes will be made.'));
    console.log('');
    p.log.info('Would deploy:');

    const files = fs.readdirSync(fullPath).filter((f) => !f.startsWith('.'));
    for (const file of files) {
      console.log(`  ${color.dim('•')} ${file}`);
    }

    console.log('');

    if (useFerni) {
      if (subdomain) {
        p.log.info(`Would deploy to: ${color.cyan(`https://${subdomain}.ferni.ai`)}`);
      } else {
        p.log.info(`Would deploy to: ${color.cyan('https://ferni.ai/sites/<site-id>')}`);
      }
    } else {
      p.log.info('Would deploy to Firebase Hosting');
    }

    p.outro('Dry run complete.');
    return;
  }

  // Confirm deployment
  const confirmTarget = useFerni
    ? subdomain
      ? `${subdomain}.ferni.ai`
      : 'Ferni Hosting (path-based URL)'
    : 'Firebase Hosting';

  const confirm = await p.confirm({
    message: `Deploy to ${color.cyan(confirmTarget)}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Deployment cancelled.');
    process.exit(0);
  }

  // Deploy
  const spinner = p.spinner();
  spinner.start('Deploying...');

  let result: DeployResult;

  if (useFerni) {
    result = await deployToFerni(siteDir, subdomain);
  } else {
    spinner.stop('Starting Firebase deploy...');
    console.log('');
    result = await deployToFirebase(siteDir);
  }

  if (!result.success) {
    if (useFerni) {
      spinner.stop('Deployment failed.');
    }
    p.log.error(result.error || 'Deployment failed.');

    if (!useFerni) {
      console.log('');
      p.log.info('Troubleshooting:');
      console.log(`  1. Install Firebase tools: ${color.cyan('npm i -g firebase-tools')}`);
      console.log(`  2. Login to Firebase: ${color.cyan('firebase login')}`);
      console.log(`  3. Initialize project: ${color.cyan('firebase init hosting')}`);
    }

    process.exit(1);
  }

  if (useFerni) {
    spinner.stop('Deployed!');
  }

  console.log('');
  p.log.success(`${color.green('✓')} Site deployed successfully!`);

  if (result.url) {
    console.log('');
    p.log.info(`Your site is live at:`);
    console.log(`  ${color.cyan(result.url)}`);
  }

  console.log('');

  // Show next steps
  p.note(
    [
      `Check status: ${color.cyan('ferni site status')}`,
      '',
      useFerni
        ? `Your site is live on Ferni hosting.`
        : `Your site is live on Firebase.`,
    ].join('\n'),
    'Next Steps'
  );

  p.outro(color.green('Deployment complete!'));
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
