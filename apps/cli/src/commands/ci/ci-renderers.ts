/**
 * CI State Renderers
 *
 * Renders CI state in various formats for agents and humans.
 */

import type {
  CIState,
  WorkflowState,
  JobState,
  WorkflowGraph,
  RecommendedAction,
} from './ci-types.js';
import { buildWorkflowGraph } from './ci-state-collector.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const STATUS_ICONS: Record<string, string> = {
  completed: '✅',
  failed: '❌',
  cancelled: '⏹️',
  queued: '⏳',
  in_progress: '🔄',
  pending: '⏸️',
  skipped: '⏭️',
  online: '🟢',
  offline: '🔴',
  busy: '🟡',
  closed: '🔒',
  'half-open': '🔓',
  open: '🔓',
};

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.green,
  failed: COLORS.red,
  cancelled: COLORS.dim,
  queued: COLORS.yellow,
  in_progress: COLORS.cyan,
  pending: COLORS.dim,
  online: COLORS.green,
  offline: COLORS.red,
  busy: COLORS.yellow,
};

// ============================================================================
// JSON Renderer (Agent View)
// ============================================================================

export function renderJSON(state: CIState): string {
  return JSON.stringify(state, null, 2);
}

// ============================================================================
// Minimal Renderer (Agent View - compact)
// ============================================================================

export function renderMinimal(state: CIState): string {
  const lines: string[] = [];

  // One-line status
  lines.push(`runner=${state.runner.status} circuit=${state.circuitBreaker.state} queue=${state.runner.queueDepth}`);

  // Workflow statuses
  for (const wf of state.workflows.slice(0, 5)) {
    lines.push(`${wf.name}:${wf.status}:${wf.runId}`);
  }

  // Actions count
  const critical = state.actions.filter(a => a.priority === 'critical').length;
  const high = state.actions.filter(a => a.priority === 'high').length;
  lines.push(`actions:critical=${critical},high=${high}`);

  return lines.join('\n');
}

// ============================================================================
// Table Renderer (Human View - simple)
// ============================================================================

export function renderTable(state: CIState): string {
  const lines: string[] = [];

  // Header
  lines.push(`${COLORS.bold}${COLORS.cyan}CI/CD Status - ${state.repository}${COLORS.reset}`);
  lines.push(`${COLORS.dim}Generated: ${new Date(state.timestamp).toLocaleString()}${COLORS.reset}`);
  lines.push('');

  // Runner status
  const runnerColor = STATUS_COLORS[state.runner.status] || COLORS.white;
  lines.push(`${COLORS.bold}Runner:${COLORS.reset} ${STATUS_ICONS[state.runner.status]} ${runnerColor}${state.runner.status.toUpperCase()}${COLORS.reset}`);
  lines.push(`  Queue: ${state.runner.queueDepth} jobs | Circuit: ${STATUS_ICONS[state.circuitBreaker.state]} ${state.circuitBreaker.state}`);
  if (state.runner.lastHeartbeat) {
    lines.push(`  Last seen: ${getTimeSince(state.runner.lastHeartbeat)}`);
  }
  lines.push('');

  // Summary
  lines.push(`${COLORS.bold}Summary:${COLORS.reset}`);
  lines.push(`  ${COLORS.green}✓ ${state.summary.completed}${COLORS.reset} completed | ${COLORS.red}✗ ${state.summary.failed}${COLORS.reset} failed | ${COLORS.yellow}⏳ ${state.summary.queued}${COLORS.reset} queued`);
  lines.push(`  Success rate: ${state.summary.successRate}%`);
  lines.push('');

  // Workflows table
  lines.push(`${COLORS.bold}Recent Workflows:${COLORS.reset}`);
  lines.push(`${'─'.repeat(80)}`);
  lines.push(`  ${'Workflow'.padEnd(30)} ${'Status'.padEnd(12)} ${'Branch'.padEnd(20)} Commit`);
  lines.push(`${'─'.repeat(80)}`);

  for (const wf of state.workflows.slice(0, 10)) {
    const statusColor = STATUS_COLORS[wf.status] || COLORS.white;
    const icon = STATUS_ICONS[wf.status] || '?';
    lines.push(
      `  ${wf.name.substring(0, 28).padEnd(30)} ` +
      `${statusColor}${icon} ${wf.status.padEnd(10)}${COLORS.reset} ` +
      `${wf.branch.substring(0, 18).padEnd(20)} ` +
      `${wf.commit}`
    );
  }
  lines.push('');

  // Actions
  if (state.actions.length > 0) {
    lines.push(`${COLORS.bold}Recommended Actions:${COLORS.reset}`);
    for (const action of state.actions.slice(0, 5)) {
      const priorityColor = action.priority === 'critical' ? COLORS.red :
                           action.priority === 'high' ? COLORS.yellow : COLORS.dim;
      lines.push(`  ${priorityColor}[${action.priority.toUpperCase()}]${COLORS.reset} ${action.action}`);
      lines.push(`    ${COLORS.dim}$ ${action.command}${COLORS.reset}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// ASCII Dashboard (Human View - interactive style)
// ============================================================================

export function renderASCIIDashboard(state: CIState): string {
  const width = 85;
  const lines: string[] = [];

  // Top border
  lines.push(`┌${'─'.repeat(width - 2)}┐`);
  lines.push(`│${centerText('🚀 FERNI CI/CD ORCHESTRATOR', width - 2)}│`);
  lines.push(`├${'─'.repeat(width - 2)}┤`);

  // System health section
  lines.push(`│${COLORS.bold}  SYSTEM HEALTH${COLORS.reset}${' '.repeat(width - 17)}│`);
  lines.push(`│${' '.repeat(width - 2)}│`);

  // Runner status
  const runnerIcon = STATUS_ICONS[state.runner.status];
  const runnerStatus = `${runnerIcon} ${state.runner.status.toUpperCase()}`;
  const timeSince = state.runner.lastHeartbeat ? ` (${getTimeSince(state.runner.lastHeartbeat)})` : '';
  lines.push(`│  Runner:    ${runnerStatus}${timeSince}${' '.repeat(width - 16 - runnerStatus.length - timeSince.length)}│`);

  // Circuit breaker
  const circuitIcon = STATUS_ICONS[state.circuitBreaker.state];
  lines.push(`│  Circuit:   ${circuitIcon} ${state.circuitBreaker.state.toUpperCase()}${' '.repeat(width - 18 - state.circuitBreaker.state.length)}│`);

  // Queue bar
  const queueMax = 30;
  const queueFilled = Math.min(state.runner.queueDepth, queueMax);
  const queueBar = '█'.repeat(queueFilled) + '░'.repeat(queueMax - queueFilled);
  lines.push(`│  Queue:     ${queueBar} ${state.runner.queueDepth}/${queueMax}${' '.repeat(width - 52)}│`);

  // Budget bar (placeholder)
  const budgetPct = state.summary.budgetUsedPercent || 73;
  const budgetFilled = Math.round(budgetPct / 100 * 20);
  const budgetBar = '█'.repeat(budgetFilled) + '░'.repeat(20 - budgetFilled);
  lines.push(`│  Budget:    ${budgetBar} ${budgetPct}%${' '.repeat(width - 42)}│`);

  lines.push(`│${' '.repeat(width - 2)}│`);
  lines.push(`├${'─'.repeat(width - 2)}┤`);

  // Active workflows section
  lines.push(`│${COLORS.bold}  ACTIVE WORKFLOWS${COLORS.reset}${' '.repeat(width - 20)}│`);
  lines.push(`│${' '.repeat(width - 2)}│`);

  // Find CI workflow and render its graph
  const ciWorkflow = state.workflows.find(w => w.name === 'CI');
  if (ciWorkflow && ciWorkflow.jobs.length > 0) {
    const graph = buildWorkflowGraph(ciWorkflow.jobs);
    const graphLines = renderJobGraph(graph, width - 6);
    for (const line of graphLines) {
      lines.push(`│  ${line}${' '.repeat(Math.max(0, width - 4 - stripAnsi(line).length))}│`);
    }
    lines.push(`│  ${COLORS.dim}Status: ${ciWorkflow.status.toUpperCase()} | Branch: ${ciWorkflow.branch}${COLORS.reset}${' '.repeat(Math.max(0, width - 25 - ciWorkflow.status.length - ciWorkflow.branch.length))}│`);
  } else {
    lines.push(`│  ${COLORS.dim}No active CI workflow${COLORS.reset}${' '.repeat(width - 25)}│`);
  }

  lines.push(`│${' '.repeat(width - 2)}│`);
  lines.push(`├${'─'.repeat(width - 2)}┤`);

  // Quick actions section
  lines.push(`│${COLORS.bold}  QUICK ACTIONS${COLORS.reset}${' '.repeat(width - 17)}│`);
  lines.push(`│${' '.repeat(width - 2)}│`);

  if (state.actions.length > 0) {
    for (const action of state.actions.slice(0, 3)) {
      const priorityIcon = action.priority === 'critical' ? '🔴' :
                          action.priority === 'high' ? '🟡' : '🔵';
      const actionText = `${priorityIcon} ${action.action}`;
      lines.push(`│  ${actionText}${' '.repeat(Math.max(0, width - 4 - stripAnsi(actionText).length))}│`);
      lines.push(`│    ${COLORS.dim}$ ${action.command}${COLORS.reset}${' '.repeat(Math.max(0, width - 8 - action.command.length))}│`);
    }
  } else {
    lines.push(`│  ${COLORS.green}✓ No actions required${COLORS.reset}${' '.repeat(width - 25)}│`);
  }

  lines.push(`│${' '.repeat(width - 2)}│`);

  // Bottom border
  lines.push(`└${'─'.repeat(width - 2)}┘`);
  lines.push(`${COLORS.dim}  [R] Restart Runner  [C] Cancel Queued  [F] Force Re-run  [Q] Quit${COLORS.reset}`);

  return lines.join('\n');
}

function renderJobGraph(graph: WorkflowGraph, maxWidth: number): string[] {
  const lines: string[] = [];

  // Group nodes by level
  const levels = new Map<number, typeof graph.nodes>();
  for (const node of graph.nodes) {
    if (!levels.has(node.level)) {
      levels.set(node.level, []);
    }
    levels.get(node.level)!.push(node);
  }

  // Simple horizontal layout
  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return `${COLORS.green}✓${COLORS.reset}`;
      case 'failed': return `${COLORS.red}✗${COLORS.reset}`;
      case 'in_progress': return `${COLORS.cyan}◎${COLORS.reset}`;
      case 'queued': return `${COLORS.yellow}○${COLORS.reset}`;
      default: return `${COLORS.dim}○${COLORS.reset}`;
    }
  };

  // Level 0: setup
  const level0 = levels.get(0) || [];
  if (level0.length > 0) {
    const setup = level0[0];
    lines.push(`┌───────────┐`);
    lines.push(`│ ${statusIcon(setup.status)} setup  │`);
    lines.push(`└─────┬─────┘`);
    lines.push(`      │`);
  }

  // Level 1: parallel jobs
  const level1 = levels.get(1) || [];
  if (level1.length > 0) {
    const jobWidth = 12;
    const jobLine1: string[] = [];
    const jobLine2: string[] = [];
    const jobLine3: string[] = [];

    for (const job of level1.slice(0, 5)) {
      const shortName = job.label.replace('test-', '').substring(0, 8);
      jobLine1.push(`┌${'─'.repeat(jobWidth - 2)}┐`);
      jobLine2.push(`│${statusIcon(job.status)} ${shortName.padEnd(jobWidth - 4)}│`);
      jobLine3.push(`└${'─'.repeat(jobWidth - 2)}┘`);
    }

    lines.push(`┌─────┴─────┬─────┬─────┬─────┐`);
    lines.push(`│     │     │     │     │     │`);
    lines.push(jobLine1.join(' '));
    lines.push(jobLine2.join(' '));
    lines.push(jobLine3.join(' '));
  }

  // Level 2: build
  const level2 = levels.get(2) || [];
  if (level2.length > 0) {
    const build = level2.find(j => j.label.toLowerCase().includes('build'));
    if (build) {
      lines.push(`      │     │     │     │`);
      lines.push(`      └─────┴─────┴─────┘`);
      lines.push(`            │`);
      lines.push(`      ┌─────┴─────┐`);
      lines.push(`      │ ${statusIcon(build.status)} build   │`);
      lines.push(`      └───────────┘`);
    }
  }

  return lines;
}

// ============================================================================
// Mermaid Renderer (Documentation/Web View)
// ============================================================================

export function renderMermaid(state: CIState): string {
  const lines: string[] = [];

  lines.push('```mermaid');
  lines.push('flowchart TB');
  lines.push('  subgraph CI["CI Workflow"]');

  // Find CI workflow
  const ciWorkflow = state.workflows.find(w => w.name === 'CI');
  if (ciWorkflow) {
    const graph = buildWorkflowGraph(ciWorkflow.jobs);

    // Add nodes
    for (const node of graph.nodes) {
      const style = getNodeStyle(node.status);
      lines.push(`    ${node.id}["${node.label}"]${style}`);
    }

    // Add edges
    for (const edge of graph.edges) {
      lines.push(`    ${edge.from} --> ${edge.to}`);
    }
  }

  lines.push('  end');

  // Add runner status
  lines.push('');
  lines.push('  subgraph Runner["Self-Hosted Runner"]');
  lines.push(`    runner_status["${STATUS_ICONS[state.runner.status]} ${state.runner.status}"]`);
  lines.push(`    queue["Queue: ${state.runner.queueDepth} jobs"]`);
  lines.push('  end');

  // Style definitions
  lines.push('');
  lines.push('  classDef completed fill:#10b981,stroke:#059669,color:#fff');
  lines.push('  classDef failed fill:#ef4444,stroke:#dc2626,color:#fff');
  lines.push('  classDef running fill:#3b82f6,stroke:#2563eb,color:#fff');
  lines.push('  classDef queued fill:#f59e0b,stroke:#d97706,color:#fff');
  lines.push('  classDef pending fill:#6b7280,stroke:#4b5563,color:#fff');

  lines.push('```');

  return lines.join('\n');
}

function getNodeStyle(status: string): string {
  switch (status) {
    case 'completed': return ':::completed';
    case 'failed': return ':::failed';
    case 'in_progress': return ':::running';
    case 'queued': return ':::queued';
    default: return ':::pending';
  }
}

// ============================================================================
// Actions Renderer (Agent-focused)
// ============================================================================

export function renderActions(actions: RecommendedAction[], format: 'json' | 'table' = 'table'): string {
  if (format === 'json') {
    return JSON.stringify(actions, null, 2);
  }

  const lines: string[] = [];
  lines.push(`${COLORS.bold}Recommended Actions (${actions.length})${COLORS.reset}`);
  lines.push('');

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const priorityColor = action.priority === 'critical' ? COLORS.red :
                         action.priority === 'high' ? COLORS.yellow :
                         action.priority === 'medium' ? COLORS.blue : COLORS.dim;

    lines.push(`${COLORS.bold}${i + 1}. ${action.action}${COLORS.reset}`);
    lines.push(`   ${priorityColor}Priority: ${action.priority.toUpperCase()}${COLORS.reset}`);
    lines.push(`   ${COLORS.dim}Reason: ${action.reason}${COLORS.reset}`);
    lines.push(`   ${COLORS.cyan}$ ${action.command}${COLORS.reset}`);
    if (action.automated) {
      lines.push(`   ${COLORS.green}[Automated execution available]${COLORS.reset}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text + ' '.repeat(width - padding - text.length);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function getTimeSince(isoDate: string | null): string {
  if (!isoDate) return 'unknown';
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}
