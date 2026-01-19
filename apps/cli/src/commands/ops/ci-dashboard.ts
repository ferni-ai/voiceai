#!/usr/bin/env npx tsx
/**
 * CI/CD Dashboard Command
 *
 * Generates and displays the DevOps dashboard for monitoring CI health.
 *
 * Usage:
 *   ferni ops dashboard           # Generate and open dashboard
 *   ferni ops dashboard --json    # Output metrics as JSON
 *   ferni ops dashboard --open    # Generate and open in browser
 *   ferni ops dashboard --publish # Trigger GitHub Pages publish
 *
 * Environment:
 *   GITHUB_TOKEN - Required for API access
 */

import { config } from 'dotenv';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

config();

interface CommandOptions {
  json?: boolean;
  open?: boolean;
  publish?: boolean;
  output?: string;
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(message: string, color?: keyof typeof COLORS): void {
  const colorCode = color ? COLORS[color] : '';
  console.log(`${colorCode}${message}${COLORS.reset}`);
}

function checkGitHubToken(): boolean {
  if (process.env.GITHUB_TOKEN) {
    return true;
  }

  // Try to get token from gh CLI
  try {
    const token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
    if (token) {
      process.env.GITHUB_TOKEN = token;
      return true;
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  return false;
}

async function generateDashboard(options: CommandOptions): Promise<void> {
  const outputDir = options.output || './dashboard';

  log('\n🚀 Ferni DevOps Dashboard\n', 'bold');

  // Check for GitHub token
  if (!checkGitHubToken()) {
    log('❌ GitHub token required', 'red');
    log('\nSet GITHUB_TOKEN or authenticate with gh CLI:', 'dim');
    log('  export GITHUB_TOKEN=your_token', 'dim');
    log('  # OR', 'dim');
    log('  gh auth login', 'dim');
    process.exit(1);
  }

  log('📊 Collecting CI metrics...', 'cyan');

  // Run the generate_dashboard.ts script
  const scriptPath = path.resolve(process.cwd(), 'scripts/devops/generate_dashboard.ts');

  if (!fs.existsSync(scriptPath)) {
    log(`❌ Dashboard script not found: ${scriptPath}`, 'red');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      env: {
        ...process.env,
        OUTPUT_DIR: outputDir,
      },
      stdio: options.json ? 'pipe' : 'inherit',
    });

    let stdout = '';

    if (options.json) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code !== 0) {
        log(`\n❌ Dashboard generation failed with code ${code}`, 'red');
        reject(new Error(`Exit code ${code}`));
        return;
      }

      if (options.json) {
        // Extract and output just the JSON
        const metricsPath = path.join(outputDir, 'metrics.json');
        if (fs.existsSync(metricsPath)) {
          const metrics = fs.readFileSync(metricsPath, 'utf-8');
          console.log(metrics);
        }
      } else {
        log('\n✅ Dashboard generated successfully!', 'green');

        // Show summary
        const metricsPath = path.join(outputDir, 'metrics.json');
        if (fs.existsSync(metricsPath)) {
          try {
            const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
            log('\n📈 Quick Summary:', 'cyan');
            log(`   Total runs:     ${metrics.total_workflow_runs}`);
            log(`   Minutes used:   ${metrics.total_minutes_used}`);
            log(`   Est. monthly:   ${metrics.estimated_monthly_minutes} / ${metrics.budget_minutes}`);

            const budgetPct = metrics.budget_percentage;
            const budgetColor = budgetPct > 100 ? 'red' : budgetPct > 80 ? 'yellow' : 'green';
            log(`   Budget usage:   ${budgetPct}%`, budgetColor);

            if (metrics.alerts && metrics.alerts.length > 0) {
              log(`\n⚠️  Alerts: ${metrics.alerts.length}`, 'yellow');
              metrics.alerts.forEach((a: { level: string; message: string }) => {
                const alertColor = a.level === 'critical' ? 'red' : a.level === 'warning' ? 'yellow' : 'cyan';
                log(`   [${a.level}] ${a.message}`, alertColor);
              });
            }
          } catch {
            // Ignore JSON parse errors
          }
        }

        // Open in browser if requested
        if (options.open) {
          const htmlPath = path.resolve(outputDir, 'index.html');
          log(`\n🌐 Opening dashboard...`, 'cyan');

          try {
            // macOS
            execSync(`open "${htmlPath}"`, { stdio: 'ignore' });
          } catch {
            try {
              // Linux
              execSync(`xdg-open "${htmlPath}"`, { stdio: 'ignore' });
            } catch {
              log(`   Open manually: file://${htmlPath}`, 'dim');
            }
          }
        } else {
          const htmlPath = path.resolve(outputDir, 'index.html');
          log(`\n📁 Open dashboard: file://${htmlPath}`, 'dim');
        }
      }

      resolve();
    });

    child.on('error', (err) => {
      log(`\n❌ Failed to run dashboard script: ${err.message}`, 'red');
      reject(err);
    });
  });
}

async function publishDashboard(): Promise<void> {
  log('\n🚀 Publishing dashboard to GitHub Pages...', 'cyan');

  try {
    execSync('gh workflow run devops-dashboard.yml --field publish=true', {
      stdio: 'inherit',
    });
    log('\n✅ Workflow triggered! Check GitHub Actions for progress.', 'green');
    log('   gh run list --workflow=devops-dashboard.yml', 'dim');
  } catch (error) {
    log('\n❌ Failed to trigger workflow', 'red');
    log('   Make sure gh CLI is authenticated: gh auth login', 'dim');
    process.exit(1);
  }
}

export async function runDashboardCommand(options: CommandOptions): Promise<void> {
  if (options.publish) {
    await publishDashboard();
    return;
  }

  await generateDashboard(options);
}

// CLI entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: CommandOptions = {
    json: args.includes('--json'),
    open: args.includes('--open'),
    publish: args.includes('--publish'),
    output: args.find((a) => a.startsWith('--output='))?.split('=')[1],
  };

  runDashboardCommand(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
