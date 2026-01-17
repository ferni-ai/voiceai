#!/usr/bin/env npx tsx
/**
 * Site Status Command
 *
 * Check the deployment status of your agent sites.
 *
 * Usage:
 *   ferni site status              # List all deployed sites
 *   ferni site status <site-id>    # Check specific site status
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface DeployedSite {
  id: string;
  agentId: string;
  agentName: string;
  url: string;
  subdomain?: string;
  status: 'active' | 'pending' | 'error';
  createdAt: string;
  updatedAt: string;
  tier: 'free' | 'premium';
}

interface SiteDetails extends DeployedSite {
  analytics?: {
    views: number;
    conversations: number;
    lastVisit?: string;
  };
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'active':
      return color.green('●');
    case 'pending':
      return color.yellow('○');
    case 'error':
      return color.red('●');
    default:
      return color.dim('○');
  }
}

function getTierBadge(tier: string): string {
  if (tier === 'premium') {
    return color.magenta('★ Premium');
  }
  return color.dim('Free');
}

// ============================================================================
// COMMANDS
// ============================================================================

async function listSites(): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Loading your sites...');

  try {
    const sites = await cliAuth.apiRequest<DeployedSite[]>('/api/sites');
    spinner.stop('Sites loaded.');

    if (sites.length === 0) {
      p.log.info('No sites deployed yet.');
      console.log('');
      p.log.info(`Create a site: ${color.cyan('ferni site create --agent <id>')}`);
      p.log.info(`Then deploy: ${color.cyan('ferni site deploy --ferni')}`);
      p.outro('');
      return;
    }

    console.log('');
    console.log(
      color.bold(`  ${'Status'.padEnd(8)} ${'Agent'.padEnd(20)} ${'URL'.padEnd(40)} ${'Tier'}`)
    );
    console.log(color.dim('  ' + '─'.repeat(80)));

    for (const site of sites) {
      const statusIcon = getStatusIcon(site.status);
      const tierBadge = getTierBadge(site.tier);
      const urlDisplay = site.subdomain
        ? `${site.subdomain}.ferni.ai`
        : site.url.replace('https://', '').replace('http://', '');

      console.log(
        `  ${statusIcon} ${site.status.padEnd(6)} ` +
          `${color.cyan(site.agentName.slice(0, 18).padEnd(20))} ` +
          `${color.dim(urlDisplay.slice(0, 38).padEnd(40))} ` +
          `${tierBadge}`
      );
    }

    console.log('');
    p.log.info(`Total: ${color.cyan(sites.length.toString())} site${sites.length !== 1 ? 's' : ''}`);
    p.outro('');
  } catch (error) {
    spinner.stop('Failed to load sites.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function showSiteDetails(siteId: string): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Loading site details...');

  try {
    const site = await cliAuth.apiRequest<SiteDetails>(`/api/sites/${siteId}`);
    spinner.stop('Site loaded.');

    console.log('');

    // Header
    p.log.info(color.bold(site.agentName));
    console.log(`  ${color.dim('Site ID:')} ${site.id}`);
    console.log(`  ${color.dim('Agent:')} ${site.agentId}`);
    console.log('');

    // Status
    console.log(color.bold('Status'));
    console.log(`  ${getStatusIcon(site.status)} ${site.status}`);
    console.log(`  ${color.dim('Tier:')} ${getTierBadge(site.tier)}`);
    console.log('');

    // URLs
    console.log(color.bold('URL'));
    console.log(`  ${color.cyan(site.url)}`);
    if (site.subdomain) {
      console.log(`  ${color.dim('Subdomain:')} ${site.subdomain}.ferni.ai`);
    }
    console.log('');

    // Analytics (if available)
    if (site.analytics) {
      console.log(color.bold('Analytics'));
      console.log(`  ${color.dim('Views:')} ${site.analytics.views}`);
      console.log(`  ${color.dim('Conversations:')} ${site.analytics.conversations}`);
      if (site.analytics.lastVisit) {
        console.log(`  ${color.dim('Last visit:')} ${formatDate(site.analytics.lastVisit)}`);
      }
      console.log('');
    }

    // Dates
    console.log(color.bold('Dates'));
    console.log(`  ${color.dim('Created:')} ${formatDate(site.createdAt)}`);
    console.log(`  ${color.dim('Updated:')} ${formatDate(site.updatedAt)}`);
    console.log('');

    // Actions
    p.note(
      [
        `Update site:`,
        `  ${color.cyan('ferni site deploy --ferni')}`,
        '',
        `View in browser:`,
        `  ${color.cyan(site.url)}`,
      ].join('\n'),
      'Actions'
    );

    p.outro('');
  } catch (error) {
    spinner.stop('Failed to load site.');

    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found') || message.includes('404')) {
      p.log.error(`Site not found: ${siteId}`);
      p.log.info(`List your sites: ${color.cyan('ferni site status')}`);
    } else {
      p.log.error(message);
    }
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const siteId = args.find((a) => !a.startsWith('-'));

  p.intro(color.bgCyan(color.black(' Site Status ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  if (siteId) {
    await showSiteDetails(siteId);
  } else {
    await listSites();
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
