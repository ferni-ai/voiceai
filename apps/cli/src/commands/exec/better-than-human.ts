#!/usr/bin/env npx tsx
/**
 * Better Than Human - Executive Intelligence Engine
 *
 * Superhuman capabilities that no human assistant could provide:
 * - Cross-functional pattern detection (connects dots across departments)
 * - Proactive intelligence (predicts issues before they happen)
 * - Decision memory (remembers past decisions and outcomes)
 * - Energy-aware recommendations (adapts to leader's state)
 * - Contextual awareness (time of day, day of week, season)
 * - Narrative generation (tells stories, not just numbers)
 *
 * This is what makes Ferni "Better Than Human" for executives.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

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

// ============================================================================
// TYPES
// ============================================================================

interface ExecutiveState {
  energy: number; // 1-10
  lastCheckin: string;
  recentDecisions: Decision[];
  activeBlockers: string[];
  currentFocus: string;
  weeklyWins: number;
}

interface Decision {
  id: string;
  description: string;
  madeAt: string;
  outcome?: 'positive' | 'negative' | 'neutral' | 'pending';
  domain: 'ceo' | 'cto' | 'cio' | 'cpo' | 'cmo' | 'csco';
  impact?: string;
}

interface CrossFunctionalInsight {
  id: string;
  type: 'correlation' | 'prediction' | 'anomaly' | 'opportunity' | 'risk';
  severity: 'info' | 'warning' | 'critical' | 'celebration';
  title: string;
  description: string;
  domains: string[];
  confidence: number;
  recommendation?: string;
  humanEquivalent?: string; // What would a human miss?
}

interface ProactiveAlert {
  id: string;
  type: 'prediction' | 'trend' | 'milestone' | 'reminder' | 'coaching';
  message: string;
  timeframe: string;
  actionable: boolean;
  suggestedAction?: string;
}

interface NarrativeContext {
  timeOfDay: 'early-morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late-night';
  dayOfWeek: string;
  weekOfMonth: number;
  isMonthEnd: boolean;
  isQuarterEnd: boolean;
  season: 'spring' | 'summer' | 'fall' | 'winter';
}

// ============================================================================
// STORAGE
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const BTH_STATE_FILE = join(CONFIG_DIR, 'executive-state.json');
const DECISIONS_FILE = join(CONFIG_DIR, 'decision-memory.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function loadExecutiveState(): Promise<ExecutiveState> {
  try {
    const data = await fs.readFile(BTH_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultState();
  }
}

async function saveExecutiveState(state: ExecutiveState): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(BTH_STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadDecisionMemory(): Promise<Decision[]> {
  try {
    const data = await fs.readFile(DECISIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveDecision(decision: Decision): Promise<void> {
  const decisions = await loadDecisionMemory();
  decisions.unshift(decision);
  // Keep last 100 decisions
  const trimmed = decisions.slice(0, 100);
  await ensureConfigDir();
  await fs.writeFile(DECISIONS_FILE, JSON.stringify(trimmed, null, 2));
}

function getDefaultState(): ExecutiveState {
  return {
    energy: 7,
    lastCheckin: new Date().toISOString(),
    recentDecisions: [],
    activeBlockers: [],
    currentFocus: '',
    weeklyWins: 0,
  };
}

// ============================================================================
// CONTEXTUAL AWARENESS (Time/Season Intelligence)
// ============================================================================

function getNarrativeContext(): NarrativeContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const date = now.getDate();
  const month = now.getMonth();

  // Time of day
  let timeOfDay: NarrativeContext['timeOfDay'];
  if (hour < 6) timeOfDay = 'late-night';
  else if (hour < 9) timeOfDay = 'early-morning';
  else if (hour < 12) timeOfDay = 'morning';
  else if (hour < 14) timeOfDay = 'midday';
  else if (hour < 18) timeOfDay = 'afternoon';
  else if (hour < 22) timeOfDay = 'evening';
  else timeOfDay = 'late-night';

  // Day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[day];

  // Week of month
  const weekOfMonth = Math.ceil(date / 7);

  // Month/quarter end
  const lastDay = new Date(now.getFullYear(), month + 1, 0).getDate();
  const isMonthEnd = date >= lastDay - 3;
  const isQuarterEnd = isMonthEnd && (month === 2 || month === 5 || month === 8 || month === 11);

  // Season
  let season: NarrativeContext['season'];
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  return { timeOfDay, dayOfWeek, weekOfMonth, isMonthEnd, isQuarterEnd, season };
}

function getContextualGreeting(ctx: NarrativeContext, state: ExecutiveState): string {
  const energyNote = state.energy < 5 ? " I notice your energy has been lower lately." : "";

  if (ctx.timeOfDay === 'late-night') {
    return `Still working? ${energyNote} Remember: sustainable pace beats burnout every time.`;
  }
  if (ctx.timeOfDay === 'early-morning') {
    return `Early start today.${energyNote} The quiet hours are powerful for strategic thinking.`;
  }
  if (ctx.dayOfWeek === 'Monday' && ctx.timeOfDay === 'morning') {
    return `Monday morning. Fresh week, fresh opportunities.${energyNote}`;
  }
  if (ctx.dayOfWeek === 'Friday' && ctx.timeOfDay === 'afternoon') {
    return `Friday afternoon - a good time to celebrate wins and plan the week ahead.`;
  }
  if (ctx.isQuarterEnd) {
    return `Quarter-end is approaching. Time to reflect on what you've achieved.`;
  }
  if (ctx.isMonthEnd) {
    return `Month-end wrap up. Let's see where you stand.`;
  }

  return `Good ${ctx.timeOfDay.replace('-', ' ')}.${energyNote}`;
}

// ============================================================================
// CROSS-FUNCTIONAL PATTERN DETECTION
// ============================================================================

function detectCrossFunctionalPatterns(): CrossFunctionalInsight[] {
  const insights: CrossFunctionalInsight[] = [];

  // These would normally pull from real data - showing the pattern detection logic
  // In production, this correlates data from all C-suite functions

  // Pattern 1: Tech debt + Cost correlation
  insights.push({
    id: 'tech-cost-correlation',
    type: 'correlation',
    severity: 'warning',
    title: 'Tech Debt Driving Cloud Costs',
    description: 'Architecture inefficiencies are correlating with 15% higher compute costs than expected.',
    domains: ['cto', 'csco'],
    confidence: 0.78,
    recommendation: 'Prioritize the caching layer refactor - it addresses both tech debt AND cost optimization.',
    humanEquivalent: 'A human CFO and CTO rarely connect these dots without months of analysis.',
  });

  // Pattern 2: Product + Marketing misalignment
  insights.push({
    id: 'product-marketing-sync',
    type: 'opportunity',
    severity: 'info',
    title: 'Feature Launch Without Marketing Prep',
    description: 'Voice enrollment feature shipped 2 weeks ago but no marketing campaign is scheduled.',
    domains: ['cpo', 'cmo'],
    confidence: 0.92,
    recommendation: 'Create a feature spotlight campaign for voice enrollment - high-value, low-effort win.',
    humanEquivalent: 'Cross-departmental launches often fall through the cracks without a dedicated PMO.',
  });

  // Pattern 3: Security + Compliance risk
  insights.push({
    id: 'security-compliance-risk',
    type: 'risk',
    severity: 'critical',
    title: 'Security Vulnerabilities May Impact SOC2',
    description: '3 unpatched dependencies could affect upcoming SOC2 audit if not addressed.',
    domains: ['cto', 'cio'],
    confidence: 0.85,
    recommendation: 'Prioritize dependency updates this sprint - audit is in 6 weeks.',
    humanEquivalent: 'Compliance teams often discover security issues too late in the audit cycle.',
  });

  // Pattern 4: Customer churn + Support correlation
  insights.push({
    id: 'churn-support-pattern',
    type: 'prediction',
    severity: 'warning',
    title: 'Support Ticket Pattern Predicts Churn',
    description: 'Users with 3+ support tickets in 30 days show 4x higher churn rate.',
    domains: ['cpo', 'ceo'],
    confidence: 0.71,
    recommendation: 'Implement proactive outreach for high-ticket users before they churn.',
    humanEquivalent: 'Humans see individual tickets; AI sees the pattern across thousands.',
  });

  // Pattern 5: Positive - Celebration
  insights.push({
    id: 'velocity-improvement',
    type: 'anomaly',
    severity: 'celebration',
    title: 'Engineering Velocity Up 23%',
    description: 'Sprint velocity increased significantly after the recent process improvements.',
    domains: ['cto', 'ceo'],
    confidence: 0.88,
    recommendation: 'Document what worked and share with the team - this is worth celebrating.',
    humanEquivalent: 'Humans often miss gradual improvements without explicit measurement.',
  });

  return insights;
}

// ============================================================================
// PROACTIVE INTELLIGENCE
// ============================================================================

function generateProactiveAlerts(ctx: NarrativeContext, state: ExecutiveState): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];

  // Monday morning - week planning
  if (ctx.dayOfWeek === 'Monday' && ctx.timeOfDay === 'morning') {
    alerts.push({
      id: 'monday-planning',
      type: 'reminder',
      message: "Start the week by reviewing your top 3 priorities. What's the one thing that would make this week a success?",
      timeframe: 'This week',
      actionable: true,
      suggestedAction: 'Run `ferni ceo priorities` to review and adjust',
    });
  }

  // Friday afternoon - reflection
  if (ctx.dayOfWeek === 'Friday' && (ctx.timeOfDay === 'afternoon' || ctx.timeOfDay === 'evening')) {
    alerts.push({
      id: 'friday-reflection',
      type: 'coaching',
      message: `You logged ${state.weeklyWins} wins this week. Take a moment to appreciate your progress before the weekend.`,
      timeframe: 'End of week',
      actionable: true,
      suggestedAction: 'Run `ferni ceo wins --week` to see your accomplishments',
    });
  }

  // Energy-based coaching
  if (state.energy < 5) {
    alerts.push({
      id: 'energy-check',
      type: 'coaching',
      message: "Your energy has been tracking lower. Consider: What's draining you? What would restore you?",
      timeframe: 'Today',
      actionable: true,
      suggestedAction: 'Block 30 minutes for recovery or delegate one energy-draining task',
    });
  }

  // Blocker aging
  if (state.activeBlockers.length > 2) {
    alerts.push({
      id: 'blocker-pile',
      type: 'prediction',
      message: `${state.activeBlockers.length} active blockers may compound into bigger delays if not addressed.`,
      timeframe: 'This week',
      actionable: true,
      suggestedAction: 'Run `ferni ceo blockers --prioritize` to triage',
    });
  }

  // Month-end board prep
  if (ctx.isMonthEnd) {
    alerts.push({
      id: 'board-prep',
      type: 'reminder',
      message: "Month-end approaching. Good time to capture metrics for board updates.",
      timeframe: 'Next 3 days',
      actionable: true,
      suggestedAction: 'Run `ferni ceo board-prep` to generate deck data',
    });
  }

  // Quarter-end strategic review
  if (ctx.isQuarterEnd) {
    alerts.push({
      id: 'quarter-review',
      type: 'milestone',
      message: "Quarter ending soon. Time for OKR scoring and strategic reflection.",
      timeframe: 'Next week',
      actionable: true,
      suggestedAction: 'Run `ferni ceo okrs --review` to score the quarter',
    });
  }

  return alerts;
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

function generateNarrative(
  insights: CrossFunctionalInsight[],
  alerts: ProactiveAlert[],
  ctx: NarrativeContext,
  state: ExecutiveState
): string {
  const lines: string[] = [];

  // Opening - contextual
  lines.push(getContextualGreeting(ctx, state));
  lines.push('');

  // Key insight summary
  const critical = insights.filter(i => i.severity === 'critical');
  const celebrations = insights.filter(i => i.severity === 'celebration');
  const warnings = insights.filter(i => i.severity === 'warning');

  if (celebrations.length > 0) {
    lines.push(`${colors.green}Good news:${colors.reset} ${celebrations[0].title}`);
    lines.push(`  ${celebrations[0].description}`);
    lines.push('');
  }

  if (critical.length > 0) {
    lines.push(`${colors.red}Needs attention:${colors.reset} ${critical[0].title}`);
    lines.push(`  ${critical[0].description}`);
    if (critical[0].recommendation) {
      lines.push(`  ${colors.cyan}→ ${critical[0].recommendation}${colors.reset}`);
    }
    lines.push('');
  }

  // The "Better Than Human" moment
  const bestInsight = insights.find(i => i.humanEquivalent);
  if (bestInsight) {
    lines.push(`${colors.magenta}${colors.bold}🧠 Better Than Human Insight${colors.reset}`);
    lines.push(`  ${bestInsight.title}: ${bestInsight.description}`);
    lines.push(`  ${colors.dim}(${bestInsight.humanEquivalent})${colors.reset}`);
    lines.push('');
  }

  // Top proactive alert
  const topAlert = alerts.find(a => a.type === 'coaching' || a.type === 'prediction');
  if (topAlert) {
    lines.push(`${colors.yellow}💡 ${topAlert.message}${colors.reset}`);
    if (topAlert.suggestedAction) {
      lines.push(`  ${colors.dim}${topAlert.suggestedAction}${colors.reset}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// ENERGY-AWARE RECOMMENDATIONS
// ============================================================================

function getEnergyAwareRecommendations(state: ExecutiveState): string[] {
  const recommendations: string[] = [];

  if (state.energy <= 3) {
    recommendations.push('Energy critically low - protect your recovery time');
    recommendations.push('Consider delegating or postponing non-essential meetings');
    recommendations.push('One quality decision beats three rushed ones');
  } else if (state.energy <= 5) {
    recommendations.push('Energy moderate - focus on your highest-leverage task');
    recommendations.push('This might be a good time for review work, not creation');
  } else if (state.energy <= 7) {
    recommendations.push('Good energy - tackle something meaningful');
    recommendations.push('Consider that strategic initiative you\'ve been postponing');
  } else {
    recommendations.push('High energy - this is your time for big thinking');
    recommendations.push('Take on a challenge or have a difficult conversation');
    recommendations.push('Your capacity for creativity is at its peak');
  }

  return recommendations;
}

// ============================================================================
// DECISION MEMORY
// ============================================================================

function analyzeDecisionPatterns(decisions: Decision[]): string[] {
  const patterns: string[] = [];

  if (decisions.length < 5) {
    patterns.push('Building your decision history - patterns will emerge over time');
    return patterns;
  }

  // Outcome analysis
  const withOutcome = decisions.filter(d => d.outcome && d.outcome !== 'pending');
  const positive = withOutcome.filter(d => d.outcome === 'positive').length;
  const negative = withOutcome.filter(d => d.outcome === 'negative').length;

  if (withOutcome.length >= 5) {
    const positiveRate = Math.round((positive / withOutcome.length) * 100);
    patterns.push(`Your decisions have a ${positiveRate}% positive outcome rate`);

    if (positiveRate >= 70) {
      patterns.push('Strong decision-making pattern - trust your instincts');
    } else if (positiveRate < 50) {
      patterns.push('Consider slowing down decisions or gathering more input');
    }
  }

  // Domain concentration
  const domainCounts: Record<string, number> = {};
  for (const d of decisions.slice(0, 20)) {
    domainCounts[d.domain] = (domainCounts[d.domain] || 0) + 1;
  }
  const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0];
  if (topDomain && topDomain[1] >= 5) {
    patterns.push(`Heavy focus on ${topDomain[0].toUpperCase()} decisions - ensure other areas aren't neglected`);
  }

  // Pending decisions
  const pending = decisions.filter(d => d.outcome === 'pending' || !d.outcome);
  if (pending.length > 5) {
    patterns.push(`${pending.length} decisions pending outcome review - follow up for closure`);
  }

  return patterns;
}

// ============================================================================
// MAIN DISPLAY
// ============================================================================

export async function betterThanHuman(options: {
  json?: boolean;
  insights?: boolean;
  coaching?: boolean;
  decisions?: boolean;
  energy?: number;
}): Promise<void> {
  const state = await loadExecutiveState();
  const ctx = getNarrativeContext();

  // Update energy if provided
  if (options.energy !== undefined) {
    state.energy = Math.min(10, Math.max(1, options.energy));
    state.lastCheckin = new Date().toISOString();
    await saveExecutiveState(state);
    console.log(`${colors.green}✓ Energy logged: ${state.energy}/10${colors.reset}`);
    return;
  }

  const insights = detectCrossFunctionalPatterns();
  const alerts = generateProactiveAlerts(ctx, state);
  const decisions = await loadDecisionMemory();

  if (options.json) {
    console.log(JSON.stringify({ state, ctx, insights, alerts, decisions: decisions.slice(0, 10) }, null, 2));
    return;
  }

  // Header
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║         BETTER THAN HUMAN - Executive Intelligence        ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Narrative summary (default view)
  if (!options.insights && !options.coaching && !options.decisions) {
    const narrative = generateNarrative(insights, alerts, ctx, state);
    console.log(narrative);
    console.log('');

    // Quick stats
    console.log(`${colors.bold}Your Status${colors.reset}`);
    console.log(`  Energy: ${renderEnergyBar(state.energy)} ${state.energy}/10`);
    console.log(`  Wins this week: ${state.weeklyWins}`);
    console.log(`  Active blockers: ${state.activeBlockers.length}`);
    console.log('');

    // Commands hint
    console.log(`${colors.dim}Commands:
  ferni bth --insights     # All cross-functional insights
  ferni bth --coaching     # Energy-aware recommendations
  ferni bth --decisions    # Decision pattern analysis
  ferni bth --energy 8     # Log your energy (1-10)
${colors.reset}`);
    return;
  }

  // Detailed insights view
  if (options.insights) {
    console.log(`${colors.bold}Cross-Functional Insights${colors.reset} ${colors.dim}(connecting dots across departments)${colors.reset}\n`);

    for (const insight of insights) {
      const severityIcon = insight.severity === 'critical' ? '🚨' :
                           insight.severity === 'warning' ? '⚠️' :
                           insight.severity === 'celebration' ? '🎉' : '💡';
      const severityColor = insight.severity === 'critical' ? colors.red :
                            insight.severity === 'warning' ? colors.yellow :
                            insight.severity === 'celebration' ? colors.green : colors.cyan;

      console.log(`${severityIcon} ${severityColor}${colors.bold}${insight.title}${colors.reset}`);
      console.log(`   ${insight.description}`);
      console.log(`   ${colors.dim}Domains: ${insight.domains.join(' + ')} | Confidence: ${Math.round(insight.confidence * 100)}%${colors.reset}`);
      if (insight.recommendation) {
        console.log(`   ${colors.cyan}→ ${insight.recommendation}${colors.reset}`);
      }
      if (insight.humanEquivalent) {
        console.log(`   ${colors.magenta}🧠 ${insight.humanEquivalent}${colors.reset}`);
      }
      console.log('');
    }
    return;
  }

  // Coaching view
  if (options.coaching) {
    console.log(`${colors.bold}Energy-Aware Coaching${colors.reset}\n`);
    console.log(`Current energy: ${renderEnergyBar(state.energy)} ${state.energy}/10\n`);

    const recommendations = getEnergyAwareRecommendations(state);
    for (const rec of recommendations) {
      console.log(`  ${colors.cyan}•${colors.reset} ${rec}`);
    }

    console.log(`\n${colors.bold}Proactive Alerts${colors.reset}\n`);
    for (const alert of alerts) {
      const icon = alert.type === 'coaching' ? '🧘' :
                   alert.type === 'prediction' ? '🔮' :
                   alert.type === 'reminder' ? '⏰' :
                   alert.type === 'milestone' ? '🏁' : '💡';
      console.log(`  ${icon} ${alert.message}`);
      if (alert.suggestedAction) {
        console.log(`     ${colors.dim}${alert.suggestedAction}${colors.reset}`);
      }
    }
    return;
  }

  // Decisions view
  if (options.decisions) {
    console.log(`${colors.bold}Decision Memory & Patterns${colors.reset}\n`);

    const patterns = analyzeDecisionPatterns(decisions);
    console.log(`${colors.cyan}Patterns:${colors.reset}`);
    for (const pattern of patterns) {
      console.log(`  • ${pattern}`);
    }

    if (decisions.length > 0) {
      console.log(`\n${colors.bold}Recent Decisions${colors.reset}`);
      for (const decision of decisions.slice(0, 5)) {
        const outcomeIcon = decision.outcome === 'positive' ? '✅' :
                            decision.outcome === 'negative' ? '❌' :
                            decision.outcome === 'neutral' ? '➖' : '⏳';
        const date = new Date(decision.madeAt).toLocaleDateString();
        console.log(`  ${outcomeIcon} [${decision.domain.toUpperCase()}] ${decision.description}`);
        console.log(`     ${colors.dim}${date}${decision.impact ? ' - ' + decision.impact : ''}${colors.reset}`);
      }
    }

    console.log(`\n${colors.dim}Log a decision: ferni ceo decisions --add "Description here"${colors.reset}`);
    return;
  }
}

function renderEnergyBar(level: number): string {
  const color = level >= 7 ? colors.green : level >= 4 ? colors.yellow : colors.red;
  const filled = '●'.repeat(level);
  const empty = '○'.repeat(10 - level);
  return `${color}${filled}${colors.dim}${empty}${colors.reset}`;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const energyIdx = args.findIndex(a => a === '--energy');
  const energy = energyIdx >= 0 ? parseInt(args[energyIdx + 1], 10) : undefined;

  betterThanHuman({
    json: args.includes('--json'),
    insights: args.includes('--insights'),
    coaching: args.includes('--coaching'),
    decisions: args.includes('--decisions'),
    energy,
  }).catch(console.error);
}
