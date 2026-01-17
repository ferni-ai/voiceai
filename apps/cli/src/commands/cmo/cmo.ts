#!/usr/bin/env npx tsx
/**
 * CMO Command - Growth Engine for Autonomous Company
 *
 * Usage:
 *   ferni cmo campaigns         # Campaign performance, optimization
 *   ferni cmo content           # Content calendar, generation
 *   ferni cmo seo               # SEO health, keyword opportunities
 *   ferni cmo social            # Social media scheduling, analytics
 *   ferni cmo attribution       # Multi-touch attribution
 *   ferni cmo competitors       # Competitive intelligence
 */

import { cmoCampaigns } from './cmo-campaigns.js';
import { cmoContent } from './cmo-content.js';
import { cmoSeo } from './cmo-seo.js';
import { cmoSocial } from './cmo-social.js';
import { cmoAttribution } from './cmo-attribution.js';
import { cmoCompetitors } from './cmo-competitors.js';

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

function printHelp(): void {
  console.log(`
${colors.bold}${colors.red}╔═══════════════════════════════════════════════════════════╗
║           FERNI CMO - GROWTH ENGINE                        ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni cmo <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}campaigns${colors.reset}           Campaign performance, optimization
    --active            Show active campaigns
    --analyze <id>      Deep analysis of campaign
    --optimize          AI optimization suggestions

  ${colors.bold}content${colors.reset}             Content calendar, generation
    --calendar          Show content calendar
    --generate <type>   Generate content (blog, social, email)
    --schedule          Schedule content

  ${colors.bold}seo${colors.reset}                 SEO health, keyword opportunities
    --audit             Run SEO audit
    --keywords          Keyword opportunity analysis
    --rankings          Track keyword rankings

  ${colors.bold}social${colors.reset}              Social media scheduling, analytics
    --analytics         Show social analytics
    --schedule <post>   Schedule a post
    --engagement        Engagement analysis

  ${colors.bold}attribution${colors.reset}         Multi-touch attribution
    --model <type>      Attribution model (first, last, linear, time)
    --channels          Channel performance
    --journey           Customer journey analysis

  ${colors.bold}competitors${colors.reset}         Competitive intelligence
    --track <company>   Add competitor to track
    --report            Competitive landscape report
    --alerts            Competitor activity alerts

${colors.cyan}EXAMPLES${colors.reset}
  ferni cmo campaigns --active
  ferni cmo content --calendar
  ferni cmo seo --audit
  ferni cmo social --analytics
  ferni cmo attribution --channels
  ferni cmo competitors --report

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CMO module provides growth automation:
  - Optimizes campaign performance with AI
  - Generates and schedules content
  - Monitors SEO health and opportunities
  - Manages social media presence
  - Tracks competitive landscape
`);
}

export async function cmo(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'campaigns':
      await cmoCampaigns({
        active: options.active as boolean,
        analyze: options.analyze as string,
        optimize: options.optimize as boolean,
      });
      break;
    case 'content':
      await cmoContent({
        calendar: options.calendar as boolean,
        generate: options.generate as string,
        schedule: options.schedule as boolean,
      });
      break;
    case 'seo':
      await cmoSeo({
        audit: options.audit as boolean,
        keywords: options.keywords as boolean,
        rankings: options.rankings as boolean,
      });
      break;
    case 'social':
      await cmoSocial({
        analytics: options.analytics as boolean,
        schedule: options.schedule as string,
        engagement: options.engagement as boolean,
      });
      break;
    case 'attribution':
      await cmoAttribution({
        model: options.model as string,
        channels: options.channels as boolean,
        journey: options.journey as boolean,
      });
      break;
    case 'competitors':
      await cmoCompetitors({
        track: options.track as string,
        report: options.report as boolean,
        alerts: options.alerts as boolean,
      });
      break;
    case 'help':
    default:
      printHelp();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const options: Record<string, unknown> = {};
  if (args.includes('--active')) options.active = true;
  if (args.includes('--optimize')) options.optimize = true;
  if (args.includes('--calendar')) options.calendar = true;
  if (args.includes('--schedule')) options.schedule = true;
  if (args.includes('--audit')) options.audit = true;
  if (args.includes('--keywords')) options.keywords = true;
  if (args.includes('--rankings')) options.rankings = true;
  if (args.includes('--analytics')) options.analytics = true;
  if (args.includes('--engagement')) options.engagement = true;
  if (args.includes('--channels')) options.channels = true;
  if (args.includes('--journey')) options.journey = true;
  if (args.includes('--report')) options.report = true;
  if (args.includes('--alerts')) options.alerts = true;

  const analyzeIdx = args.findIndex((a) => a === '--analyze');
  if (analyzeIdx >= 0) options.analyze = args[analyzeIdx + 1];

  const generateIdx = args.findIndex((a) => a === '--generate');
  if (generateIdx >= 0) options.generate = args[generateIdx + 1];

  const modelIdx = args.findIndex((a) => a === '--model');
  if (modelIdx >= 0) options.model = args[modelIdx + 1];

  const trackIdx = args.findIndex((a) => a === '--track');
  if (trackIdx >= 0) options.track = args[trackIdx + 1];

  cmo(command, options).catch(console.error);
}
