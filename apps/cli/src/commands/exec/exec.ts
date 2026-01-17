#!/usr/bin/env npx tsx
/**
 * Unified Executive Dashboard - Autonomous Company Overview
 *
 * Provides a single view across all C-suite functions:
 * CEO, CTO, CIO, CPO, CMO, CSCO
 *
 * Usage:
 *   ferni exec                    # Full executive dashboard
 *   ferni exec --quick            # Quick status overview
 *   ferni exec --alerts           # Only show alerts/issues
 *   ferni exec --role <role>      # Filter by role (ceo, cto, cio, cpo, cmo, csco)
 */

import { execSync } from 'child_process';
import {
  getUserId,
  getPendingDecisions,
  getPriorities,
  getActiveBlockers,
  getRecentWins,
  getEnergyTrend,
} from '../ceo/storage-client.js';

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
  white: '\x1b[37m',
};

export interface ExecutiveMetrics {
  ceo: CEOMetrics;
  cto: CTOMetrics;
  cio: CIOMetrics;
  cpo: CPOMetrics;
  cmo: CMOMetrics;
  csco: CSCOMetrics;
}

export interface CEOMetrics {
  companyHealth: number;
  okrProgress: number;
  pendingDecisions: number;
  alerts: string[];
}

export interface CTOMetrics {
  systemHealth: number;
  techDebtScore: number;
  openIncidents: number;
  securityScore: number;
  alerts: string[];
}

export interface CIOMetrics {
  complianceScore: number;
  dataRiskScore: number;
  accessReviewsPending: number;
  vendorsExpiringSoon: number;
  alerts: string[];
}

export interface CPOMetrics {
  featureVelocity: number;
  userSatisfaction: number;
  activeExperiments: number;
  churnRisk: number;
  alerts: string[];
}

export interface CMOMetrics {
  campaignROAS: number;
  socialEngagement: number;
  seoHealth: number;
  brandSentiment: number;
  alerts: string[];
}

export interface CSCOMetrics {
  operationalEfficiency: number;
  costOptimization: number;
  vendorHealth: number;
  slaCompliance: number;
  alerts: string[];
}

// ============================================================================
// REAL DATA COLLECTION FUNCTIONS
// ============================================================================

/**
 * Get CTO metrics from actual codebase data
 * Note: Using execSync with hardcoded commands (no user input) - safe from injection
 */
function getCTOMetricsFromCodebase(): CTOMetrics {
  const alerts: string[] = [];
  let systemHealth = 95;
  let techDebtScore = 10;
  let openIncidents = 0;
  let securityScore = 95;

  try {
    // Check for npm audit vulnerabilities (hardcoded command - safe)
    const auditResult = execSync('npm audit --json 2>/dev/null || echo "{}"', { encoding: 'utf-8' });
    const audit = JSON.parse(auditResult);
    if (audit.metadata?.vulnerabilities) {
      const vulns = audit.metadata.vulnerabilities;
      const total = (vulns.high || 0) + (vulns.critical || 0);
      if (total > 0) {
        alerts.push(`${total} high/critical npm vulnerabilities`);
        securityScore -= total * 5;
      }
    }
  } catch {
    // npm audit not available or failed
  }

  try {
    // Check for remote branches (hardcoded command - safe)
    const prCount = execSync('git branch -r 2>/dev/null | grep -v HEAD | wc -l', { encoding: 'utf-8' }).trim();
    const branches = parseInt(prCount, 10) || 0;
    if (branches > 10) {
      alerts.push(`${branches} remote branches (consider cleanup)`);
      techDebtScore += 5;
    }
  } catch {
    // Git not available
  }

  try {
    // Check for uncommitted changes (hardcoded command - safe)
    const status = execSync('git status --porcelain 2>/dev/null | wc -l', { encoding: 'utf-8' }).trim();
    const changes = parseInt(status, 10) || 0;
    if (changes > 50) {
      alerts.push(`${changes} uncommitted changes in working directory`);
      openIncidents = 1;
    }
  } catch {
    // Git not available
  }

  return {
    systemHealth: Math.max(systemHealth, 50),
    techDebtScore: Math.min(techDebtScore, 50),
    openIncidents,
    securityScore: Math.max(securityScore, 50),
    alerts: alerts.length > 0 ? alerts : ['No critical issues detected'],
  };
}

/**
 * Get CEO metrics from coaching data
 */
async function getCEOMetricsFromStorage(): Promise<CEOMetrics> {
  const alerts: string[] = [];

  try {
    const userId = await getUserId();
    if (!userId) {
      return getDefaultCEOMetrics();
    }

    const [decisions, blockers, wins, priorities, energyTrend] = await Promise.all([
      getPendingDecisions().catch(() => []),
      getActiveBlockers().catch(() => []),
      getRecentWins(7).catch(() => []),
      getPriorities().catch(() => []),
      getEnergyTrend().catch(() => null),
    ]);

    // Calculate health score based on real data
    let companyHealth = 80;
    if (blockers.length > 3) {
      companyHealth -= 10;
      alerts.push(`${blockers.length} active blockers`);
    }
    if (decisions.length > 5) {
      companyHealth -= 5;
      alerts.push(`${decisions.length} pending decisions`);
    }
    if (wins.length > 0) {
      companyHealth += 5;
    }
    if (energyTrend?.average && energyTrend.average < 5) {
      companyHealth -= 5;
      alerts.push('Energy trend is low - consider rest');
    }

    // Calculate OKR progress from priorities
    const completedPriorities = priorities.filter((p: { status?: string }) => p.status === 'completed').length;
    const totalPriorities = priorities.length || 1;
    const okrProgress = Math.round((completedPriorities / totalPriorities) * 100);

    return {
      companyHealth: Math.max(companyHealth, 50),
      okrProgress,
      pendingDecisions: decisions.length,
      alerts: alerts.length > 0 ? alerts : ['On track'],
    };
  } catch {
    return getDefaultCEOMetrics();
  }
}

function getDefaultCEOMetrics(): CEOMetrics {
  return {
    companyHealth: 85,
    okrProgress: 70,
    pendingDecisions: 0,
    alerts: ['CEO coaching data not configured'],
  };
}

// Real data integration - connects to actual systems where possible
export function getExecutiveMetrics(): ExecutiveMetrics {
  // Get CTO metrics from real codebase data
  const ctoMetrics = getCTOMetricsFromCodebase();

  return {
    ceo: {
      // Will be populated by async call if needed
      companyHealth: 85,
      okrProgress: 70,
      pendingDecisions: 0,
      alerts: ['Use getExecutiveMetricsAsync() for real CEO data'],
    },
    cto: ctoMetrics,
    cio: {
      // CIO metrics - would connect to compliance tracking
      complianceScore: 96,
      dataRiskScore: 12,
      accessReviewsPending: 7,
      vendorsExpiringSoon: 2,
      alerts: ['Connect to compliance system for real data'],
    },
    cpo: {
      // CPO metrics - would connect to analytics
      featureVelocity: 8.2,
      userSatisfaction: 4.6,
      activeExperiments: 5,
      churnRisk: 3.2,
      alerts: ['Connect to analytics for real data'],
    },
    cmo: {
      // CMO metrics - would connect to marketing APIs
      campaignROAS: 4.2,
      socialEngagement: 12500,
      seoHealth: 88,
      brandSentiment: 0.82,
      alerts: ['Connect to marketing tools for real data'],
    },
    csco: {
      // CSCO metrics - would connect to cloud billing
      operationalEfficiency: 91,
      costOptimization: 18,
      vendorHealth: 94,
      slaCompliance: 99.2,
      alerts: ['Connect to billing APIs for real data'],
    },
  };
}

/**
 * Get executive metrics with async CEO data
 */
export async function getExecutiveMetricsAsync(): Promise<ExecutiveMetrics> {
  const baseMetrics = getExecutiveMetrics();
  const ceoMetrics = await getCEOMetricsFromStorage();
  return {
    ...baseMetrics,
    ceo: ceoMetrics,
  };
}

function getHealthColor(score: number): string {
  if (score >= 90) return colors.green;
  if (score >= 70) return colors.yellow;
  return colors.red;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function formatScore(value: number, max: number = 100): string {
  const color = getHealthColor((value / max) * 100);
  return `${color}${value}${colors.reset}/${max}`;
}

function printHeader(): void {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════╗
║                    FERNI EXECUTIVE DASHBOARD                              ║
║                     Autonomous Company Overview                           ║
╚══════════════════════════════════════════════════════════════════════════╝${colors.reset}
${colors.dim}${dateStr} at ${timeStr}${colors.reset}
`);
}

function printCEOSection(metrics: CEOMetrics): void {
  const healthColor = getHealthColor(metrics.companyHealth);
  console.log(`${colors.bold}${colors.magenta}┌─ CEO - STRATEGIC OPERATIONS ─────────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  Company Health: ${healthColor}${metrics.companyHealth}%${colors.reset}    OKR Progress: ${getHealthColor(metrics.okrProgress)}${metrics.okrProgress}%${colors.reset}    Pending Decisions: ${colors.yellow}${metrics.pendingDecisions}${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.magenta}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printCTOSection(metrics: CTOMetrics): void {
  console.log(`${colors.bold}${colors.blue}┌─ CTO - TECHNICAL LEADERSHIP ────────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  System Health: ${getHealthColor(metrics.systemHealth)}${metrics.systemHealth}%${colors.reset}    Tech Debt: ${getHealthColor(100 - metrics.techDebtScore)}${metrics.techDebtScore}${colors.reset}    Security: ${getHealthColor(metrics.securityScore)}${metrics.securityScore}%${colors.reset}    Incidents: ${metrics.openIncidents > 0 ? colors.red : colors.green}${metrics.openIncidents}${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.blue}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printCIOSection(metrics: CIOMetrics): void {
  console.log(`${colors.bold}${colors.green}┌─ CIO - INFORMATION GOVERNANCE ──────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  Compliance: ${getHealthColor(metrics.complianceScore)}${metrics.complianceScore}%${colors.reset}    Data Risk: ${getHealthColor(100 - metrics.dataRiskScore)}${metrics.dataRiskScore}${colors.reset}    Access Reviews: ${colors.yellow}${metrics.accessReviewsPending}${colors.reset}    Vendors Expiring: ${metrics.vendorsExpiringSoon > 0 ? colors.yellow : colors.green}${metrics.vendorsExpiringSoon}${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.green}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printCPOSection(metrics: CPOMetrics): void {
  console.log(`${colors.bold}${colors.yellow}┌─ CPO - PRODUCT INTELLIGENCE ────────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  Feature Velocity: ${colors.cyan}${metrics.featureVelocity}/sprint${colors.reset}    NPS: ${getHealthColor(metrics.userSatisfaction * 20)}${metrics.userSatisfaction}/5${colors.reset}    Experiments: ${colors.cyan}${metrics.activeExperiments}${colors.reset}    Churn Risk: ${getHealthColor(100 - metrics.churnRisk * 10)}${metrics.churnRisk}%${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.yellow}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printCMOSection(metrics: CMOMetrics): void {
  console.log(`${colors.bold}${colors.red}┌─ CMO - MARKETING INTELLIGENCE ──────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  Campaign ROAS: ${colors.green}${metrics.campaignROAS}x${colors.reset}    Social: ${colors.cyan}${(metrics.socialEngagement / 1000).toFixed(1)}k${colors.reset}    SEO: ${getHealthColor(metrics.seoHealth)}${metrics.seoHealth}%${colors.reset}    Sentiment: ${getHealthColor(metrics.brandSentiment * 100)}${(metrics.brandSentiment * 100).toFixed(0)}%${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.red}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printCSCOSection(metrics: CSCOMetrics): void {
  console.log(`${colors.bold}${colors.white}┌─ CSCO - OPERATIONS INTELLIGENCE ────────────────────────────────────────┐${colors.reset}`);
  console.log(`│  Efficiency: ${getHealthColor(metrics.operationalEfficiency)}${metrics.operationalEfficiency}%${colors.reset}    Cost Savings: ${colors.green}$${metrics.costOptimization}k${colors.reset}    Vendor Health: ${getHealthColor(metrics.vendorHealth)}${metrics.vendorHealth}%${colors.reset}    SLA: ${getHealthColor(metrics.slaCompliance)}${metrics.slaCompliance}%${colors.reset}`);
  if (metrics.alerts.length > 0) {
    console.log(`│  ${colors.yellow}⚠ ${metrics.alerts[0]}${colors.reset}`);
  }
  console.log(`${colors.white}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printAllAlerts(metrics: ExecutiveMetrics): void {
  const allAlerts: Array<{ role: string; alert: string }> = [];

  metrics.ceo.alerts.forEach((a) => allAlerts.push({ role: 'CEO', alert: a }));
  metrics.cto.alerts.forEach((a) => allAlerts.push({ role: 'CTO', alert: a }));
  metrics.cio.alerts.forEach((a) => allAlerts.push({ role: 'CIO', alert: a }));
  metrics.cpo.alerts.forEach((a) => allAlerts.push({ role: 'CPO', alert: a }));
  metrics.cmo.alerts.forEach((a) => allAlerts.push({ role: 'CMO', alert: a }));
  metrics.csco.alerts.forEach((a) => allAlerts.push({ role: 'CSCO', alert: a }));

  if (allAlerts.length > 0) {
    console.log(`
${colors.bold}${colors.yellow}┌─ ALERTS & ACTION ITEMS ──────────────────────────────────────────────────┐${colors.reset}`);
    allAlerts.forEach(({ role, alert }) => {
      console.log(`│  ${colors.bold}[${role}]${colors.reset} ${alert}`);
    });
    console.log(`${colors.yellow}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
  }
}

function printQuickStatus(metrics: ExecutiveMetrics): void {
  console.log(`
${colors.bold}${colors.cyan}┌─ QUICK STATUS ───────────────────────────────────────────────────────────┐${colors.reset}
│  ${colors.magenta}CEO${colors.reset}  Company: ${getHealthColor(metrics.ceo.companyHealth)}${metrics.ceo.companyHealth}%${colors.reset}   ${colors.blue}CTO${colors.reset}  Systems: ${getHealthColor(metrics.cto.systemHealth)}${metrics.cto.systemHealth}%${colors.reset}   ${colors.green}CIO${colors.reset}  Compliance: ${getHealthColor(metrics.cio.complianceScore)}${metrics.cio.complianceScore}%${colors.reset}
│  ${colors.yellow}CPO${colors.reset}  Satisfaction: ${getHealthColor(metrics.cpo.userSatisfaction * 20)}${metrics.cpo.userSatisfaction}/5${colors.reset}   ${colors.red}CMO${colors.reset}  ROAS: ${colors.green}${metrics.cmo.campaignROAS}x${colors.reset}   ${colors.white}CSCO${colors.reset}  SLA: ${getHealthColor(metrics.csco.slaCompliance)}${metrics.csco.slaCompliance}%${colors.reset}
${colors.cyan}└──────────────────────────────────────────────────────────────────────────┘${colors.reset}`);
}

function printFooter(): void {
  console.log(`
${colors.dim}Commands: ferni exec --quick | ferni exec --alerts | ferni exec --role ceo
Deep dive: ferni ceo | ferni cto | ferni cio | ferni cpo | ferni cmo | ferni csco${colors.reset}
`);
}

function printHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║           FERNI EXEC - UNIFIED EXECUTIVE DASHBOARD            ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni exec [options]

${colors.cyan}OPTIONS${colors.reset}
  ${colors.bold}--quick${colors.reset}               Quick status overview (one line per role)
  ${colors.bold}--alerts${colors.reset}              Only show alerts and action items
  ${colors.bold}--role <role>${colors.reset}         Filter by role: ceo, cto, cio, cpo, cmo, csco
  ${colors.bold}--json${colors.reset}                Output as JSON
  ${colors.bold}--export${colors.reset}              Export as markdown report

${colors.cyan}EXAMPLES${colors.reset}
  ferni exec                     # Full dashboard
  ferni exec --quick             # Quick status
  ferni exec --alerts            # Just alerts
  ferni exec --role cto          # CTO section only
  ferni exec --json > report.json

${colors.cyan}INDIVIDUAL DASHBOARDS${colors.reset}
  ferni ceo                      # CEO strategic operations
  ferni cto                      # CTO technical leadership
  ferni cio                      # CIO information governance
  ferni cpo                      # CPO product intelligence
  ferni cmo                      # CMO marketing intelligence
  ferni csco                     # CSCO operations intelligence

${colors.cyan}AUTONOMOUS COMPANY${colors.reset}
  Ferni operates as an autonomous company with six AI executives:
  - CEO: Strategic decisions, OKRs, investor relations
  - CTO: Technical health, debt, security, performance
  - CIO: Compliance, data governance, access control
  - CPO: Product roadmap, feedback, experiments
  - CMO: Campaigns, content, SEO, attribution
  - CSCO: Operations, costs, vendors, SLAs
`);
}

export interface ExecOptions {
  quick?: boolean;
  alerts?: boolean;
  role?: string;
  json?: boolean;
  export?: boolean;
}

export async function exec(options: ExecOptions = {}): Promise<void> {
  const metrics = getExecutiveMetrics();

  if (options.json) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  if (options.quick) {
    printHeader();
    printQuickStatus(metrics);
    printFooter();
    return;
  }

  if (options.alerts) {
    printHeader();
    printAllAlerts(metrics);
    printFooter();
    return;
  }

  printHeader();

  if (options.role) {
    const role = options.role.toLowerCase();
    switch (role) {
      case 'ceo':
        printCEOSection(metrics.ceo);
        break;
      case 'cto':
        printCTOSection(metrics.cto);
        break;
      case 'cio':
        printCIOSection(metrics.cio);
        break;
      case 'cpo':
        printCPOSection(metrics.cpo);
        break;
      case 'cmo':
        printCMOSection(metrics.cmo);
        break;
      case 'csco':
        printCSCOSection(metrics.csco);
        break;
      default:
        console.log(`${colors.red}Unknown role: ${role}. Use: ceo, cto, cio, cpo, cmo, csco${colors.reset}`);
    }
  } else {
    // Full dashboard
    printCEOSection(metrics.ceo);
    console.log();
    printCTOSection(metrics.cto);
    console.log();
    printCIOSection(metrics.cio);
    console.log();
    printCPOSection(metrics.cpo);
    console.log();
    printCMOSection(metrics.cmo);
    console.log();
    printCSCOSection(metrics.csco);
    console.log();
    printAllAlerts(metrics);
  }

  printFooter();
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('help') || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const options: ExecOptions = {};
  if (args.includes('--quick')) options.quick = true;
  if (args.includes('--alerts')) options.alerts = true;
  if (args.includes('--json')) options.json = true;
  if (args.includes('--export')) options.export = true;

  const roleIdx = args.findIndex((a) => a === '--role');
  if (roleIdx >= 0) options.role = args[roleIdx + 1];

  exec(options).catch(console.error);
}
