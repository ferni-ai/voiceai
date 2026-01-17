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

// Mock data generator - will be replaced with real data integration
export function getExecutiveMetrics(): ExecutiveMetrics {
  return {
    ceo: {
      companyHealth: 87,
      okrProgress: 72,
      pendingDecisions: 3,
      alerts: ['Q1 board meeting in 5 days', 'Series B timeline update needed'],
    },
    cto: {
      systemHealth: 94,
      techDebtScore: 23,
      openIncidents: 1,
      securityScore: 91,
      alerts: ['Dependency update overdue: lodash@4.x'],
    },
    cio: {
      complianceScore: 96,
      dataRiskScore: 12,
      accessReviewsPending: 7,
      vendorsExpiringSoon: 2,
      alerts: ['SOC2 audit scheduled for Feb 15'],
    },
    cpo: {
      featureVelocity: 8.2,
      userSatisfaction: 4.6,
      activeExperiments: 5,
      churnRisk: 3.2,
      alerts: ['Voice quality feedback spike detected'],
    },
    cmo: {
      campaignROAS: 4.2,
      socialEngagement: 12500,
      seoHealth: 88,
      brandSentiment: 0.82,
      alerts: ['Competitor launched similar feature'],
    },
    csco: {
      operationalEfficiency: 91,
      costOptimization: 18,
      vendorHealth: 94,
      slaCompliance: 99.2,
      alerts: ['Cloud costs up 12% this month'],
    },
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
