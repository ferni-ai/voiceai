#!/usr/bin/env npx tsx
/**
 * CPO Command - Product Intelligence for Autonomous Company
 *
 * Usage:
 *   ferni cpo roadmap           # AI-generated roadmap from signals
 *   ferni cpo feedback          # Aggregate user feedback analysis
 *   ferni cpo experiments       # A/B test results, recommendations
 *   ferni cpo prioritize        # Feature scoring (impact/effort)
 *   ferni cpo personas          # User persona insights
 *   ferni cpo churn             # Churn prediction, intervention
 */

import { cpoRoadmap } from './cpo-roadmap.js';
import { cpoFeedback } from './cpo-feedback.js';
import { cpoExperiments } from './cpo-experiments.js';
import { cpoPrioritize } from './cpo-prioritize.js';
import { cpoPersonas } from './cpo-personas.js';
import { cpoChurn } from './cpo-churn.js';

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
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           FERNI CPO - PRODUCT INTELLIGENCE                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni cpo <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}roadmap${colors.reset}             AI-generated roadmap from signals
    --quarter <Q1-Q4>   Generate for specific quarter
    --themes            Group by product themes
    --export            Export as markdown

  ${colors.bold}feedback${colors.reset}            Aggregate user feedback analysis
    --source <source>   Filter by source (app, support, social)
    --sentiment         Show sentiment analysis
    --trends            Show trending topics

  ${colors.bold}experiments${colors.reset}         A/B test results, recommendations
    --active            Show active experiments
    --completed         Show completed experiments
    --analyze <id>      Deep analysis of experiment

  ${colors.bold}prioritize${colors.reset}          Feature scoring (impact/effort)
    --add <feature>     Add feature to backlog
    --score             Re-score all features
    --top <n>           Show top N features

  ${colors.bold}personas${colors.reset}            User persona insights
    --segment <name>    Filter by segment
    --behavior          Show behavioral patterns
    --journey           Show user journey map

  ${colors.bold}churn${colors.reset}               Churn prediction, intervention
    --risk              Show at-risk users
    --intervene <id>    Trigger intervention
    --analysis          Churn driver analysis

${colors.cyan}EXAMPLES${colors.reset}
  ferni cpo roadmap --quarter Q2 --themes
  ferni cpo feedback --sentiment --trends
  ferni cpo experiments --active
  ferni cpo prioritize --top 10
  ferni cpo personas --behavior
  ferni cpo churn --risk

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CPO module provides product intelligence:
  - Generates roadmaps from user signals
  - Analyzes feedback across all channels
  - Manages and analyzes A/B experiments
  - Scores and prioritizes features
  - Predicts and prevents churn
`);
}

export async function cpo(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'roadmap':
      await cpoRoadmap({
        quarter: options.quarter as string,
        themes: options.themes as boolean,
        export: options.export as boolean,
      });
      break;
    case 'feedback':
      await cpoFeedback({
        source: options.source as string,
        sentiment: options.sentiment as boolean,
        trends: options.trends as boolean,
      });
      break;
    case 'experiments':
      await cpoExperiments({
        active: options.active as boolean,
        completed: options.completed as boolean,
        analyze: options.analyze as string,
      });
      break;
    case 'prioritize':
      await cpoPrioritize({
        add: options.add as string,
        score: options.score as boolean,
        top: options.top as number,
      });
      break;
    case 'personas':
      await cpoPersonas({
        segment: options.segment as string,
        behavior: options.behavior as boolean,
        journey: options.journey as boolean,
      });
      break;
    case 'churn':
      await cpoChurn({
        risk: options.risk as boolean,
        intervene: options.intervene as string,
        analysis: options.analysis as boolean,
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
  if (args.includes('--themes')) options.themes = true;
  if (args.includes('--export')) options.export = true;
  if (args.includes('--sentiment')) options.sentiment = true;
  if (args.includes('--trends')) options.trends = true;
  if (args.includes('--active')) options.active = true;
  if (args.includes('--completed')) options.completed = true;
  if (args.includes('--score')) options.score = true;
  if (args.includes('--behavior')) options.behavior = true;
  if (args.includes('--journey')) options.journey = true;
  if (args.includes('--risk')) options.risk = true;
  if (args.includes('--analysis')) options.analysis = true;

  const quarterIdx = args.findIndex((a) => a === '--quarter');
  if (quarterIdx >= 0) options.quarter = args[quarterIdx + 1];

  const sourceIdx = args.findIndex((a) => a === '--source');
  if (sourceIdx >= 0) options.source = args[sourceIdx + 1];

  const analyzeIdx = args.findIndex((a) => a === '--analyze');
  if (analyzeIdx >= 0) options.analyze = args[analyzeIdx + 1];

  const addIdx = args.findIndex((a) => a === '--add');
  if (addIdx >= 0) options.add = args[addIdx + 1];

  const topIdx = args.findIndex((a) => a === '--top');
  if (topIdx >= 0) options.top = parseInt(args[topIdx + 1], 10);

  const segmentIdx = args.findIndex((a) => a === '--segment');
  if (segmentIdx >= 0) options.segment = args[segmentIdx + 1];

  const interveneIdx = args.findIndex((a) => a === '--intervene');
  if (interveneIdx >= 0) options.intervene = args[interveneIdx + 1];

  cpo(command, options).catch(console.error);
}
