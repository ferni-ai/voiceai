#!/usr/bin/env npx tsx
/**
 * Disconnect Diagnostics CLI
 *
 * Quick command to diagnose disconnect patterns and identify root causes.
 *
 * Usage:
 *   pnpm ops:diagnose            # production agent
 *   pnpm ops:diagnose --dev      # ferni-dev agent
 *   AGENT_OBS_URL=http://localhost:8080 pnpm ops:diagnose --dev
 */

import { execSync } from 'node:child_process';
import { findProjectRoot } from '../../utils/project-root.js';
import {
  LIVEKIT_AGENTS,
  parseAgentStatus,
  resolveAgentEnv,
  runLkAgent,
} from '../../utils/livekit-agent.js';

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

interface ObservabilityData {
  callQuality?: {
    qualityScore: number;
    connectionSuccessRate: number;
    disconnectRate: number;
    avgFirstResponseTimeMs: number;
    totalCalls: number;
    activeCalls: number;
    disconnectCount: number;
    naturalEndCount: number;
    errorCount: number;
  };
  llm?: {
    avgLatencyMs: number;
    successRate: number;
  };
  errors?: {
    totalErrors: number;
    errorsByType?: Record<string, number>;
  };
}

interface CrashSummary {
  totalCrashes: number;
  lastCrashTime: string | null;
  activeSessions: number;
  recentCrashes: Array<{
    type: string;
    error: { message: string };
    timestamp: string;
    severity: string;
  }>;
}

// LiveKit Cloud agents expose no public HTTP port, so the agent's
// observability endpoints are only reachable from a worker you can address
// (a local `pnpm dev` worker on http://localhost:8080, say).
const OBS_URL = process.env.AGENT_OBS_URL;
const TARGET = LIVEKIT_AGENTS[resolveAgentEnv(process.argv.slice(2), 'prod')];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function printHeader(text: string): void {
  console.log(
    `\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`
  );
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(
    `${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`
  );
}

function printSection(title: string): void {
  console.log(`\n${BOLD}${BLUE}▸ ${title}${RESET}`);
  console.log(`${BLUE}${'─'.repeat(50)}${RESET}`);
}

function statusColor(good: boolean): string {
  return good ? GREEN : RED;
}

function scoreColor(score: number, warnThreshold: number, criticalThreshold: number): string {
  if (score >= warnThreshold) return GREEN;
  if (score >= criticalThreshold) return YELLOW;
  return RED;
}

/** A voice agent on Cloud Run registers as a LiveKit worker and steals jobs it can't serve. */
async function checkCompetingWorkers(): Promise<string[]> {
  const issues: string[] = [];
  try {
    const names = execSync(
      'gcloud run services list --project=johnb-2025 --format="value(metadata.name)" 2>/dev/null',
      { encoding: 'utf8', timeout: 20000 }
    )
      .split('\n')
      .filter((name) => /voiceai-agent|voice-agent/i.test(name));
    for (const name of names) {
      issues.push(`Cloud Run service "${name}" may be a LiveKit worker stealing jobs - delete it`);
    }
  } catch {
    issues.push('Could not list Cloud Run services (gcloud auth required)');
  }
  return issues;
}

async function main(): Promise<void> {
  printHeader('🔌 DISCONNECT DIAGNOSTICS');

  // ===== AGENT STATUS =====
  printSection(`LIVEKIT CLOUD AGENT (${TARGET.project} ${TARGET.agentId})`);

  const statusOutput = runLkAgent(findProjectRoot(), 'status', TARGET, { capture: true }).output;
  const agentStatus = parseAgentStatus(statusOutput, TARGET.agentId);
  const isRunning = agentStatus === 'Running';
  if (!agentStatus) {
    console.log(`${RED}✗ Could not read agent status (is lk installed and logged in?)${RESET}`);
  } else {
    console.log(`Status: ${statusColor(isRunning)}${agentStatus}${RESET}`);
  }

  const [observability, crashes] = OBS_URL
    ? await Promise.all([
        fetchJson<ObservabilityData>(`${OBS_URL}/api/observability`),
        fetchJson<CrashSummary>(`${OBS_URL}/api/crash-analytics`),
      ])
    : [null, null];
  if (!OBS_URL) {
    console.log(
      `\n${YELLOW}Call quality and crash data need AGENT_OBS_URL (a reachable worker health server).${RESET}`
    );
  }

  // ===== CALL QUALITY =====
  printSection('CALL QUALITY METRICS');

  if (!observability?.callQuality) {
    console.log(`${YELLOW}No call quality data available${RESET}`);
  } else {
    const cq = observability.callQuality;

    const qualityColor = scoreColor(cq.qualityScore, 85, 70);
    console.log(`Quality Score: ${qualityColor}${cq.qualityScore}/100${RESET}`);

    const connColor = scoreColor(cq.connectionSuccessRate * 100, 98, 95);
    console.log(
      `Connection Success Rate: ${connColor}${(cq.connectionSuccessRate * 100).toFixed(1)}%${RESET}`
    );

    const discColor = scoreColor(100 - cq.disconnectRate * 100, 95, 90);
    console.log(`Disconnect Rate: ${discColor}${(cq.disconnectRate * 100).toFixed(1)}%${RESET}`);

    const latencyColor = scoreColor(3000 - cq.avgFirstResponseTimeMs, 1000, 0);
    console.log(
      `Avg First Response: ${latencyColor}${cq.avgFirstResponseTimeMs.toFixed(0)}ms${RESET}`
    );

    console.log(`\nCall Outcomes (last hour):`);
    console.log(`  Total Calls: ${cq.totalCalls}`);
    console.log(`  Active Calls: ${cq.activeCalls}`);
    console.log(`  ${GREEN}Natural Ends: ${cq.naturalEndCount}${RESET}`);
    console.log(`  ${YELLOW}Disconnects: ${cq.disconnectCount}${RESET}`);
    console.log(`  ${RED}Errors: ${cq.errorCount}${RESET}`);
  }

  // ===== LLM HEALTH =====
  printSection('LLM HEALTH');

  if (!observability?.llm) {
    console.log(`${YELLOW}No LLM data available${RESET}`);
  } else {
    const llm = observability.llm;
    const latencyColor = scoreColor(1000 - llm.avgLatencyMs, 500, 0);
    console.log(`Avg Latency: ${latencyColor}${llm.avgLatencyMs.toFixed(0)}ms${RESET}`);

    const successColor = scoreColor(llm.successRate * 100, 98, 95);
    console.log(`Success Rate: ${successColor}${(llm.successRate * 100).toFixed(1)}%${RESET}`);
  }

  // ===== CRASH ANALYTICS =====
  printSection('CRASH ANALYTICS');

  if (!crashes) {
    console.log(`${YELLOW}No crash data available${RESET}`);
  } else {
    const crashColor = crashes.totalCrashes === 0 ? GREEN : RED;
    console.log(`Total Crashes: ${crashColor}${crashes.totalCrashes}${RESET}`);
    console.log(`Active Sessions: ${crashes.activeSessions}`);

    if (crashes.lastCrashTime) {
      const lastCrash = new Date(crashes.lastCrashTime);
      const minsAgo = Math.round((Date.now() - lastCrash.getTime()) / 1000 / 60);
      console.log(`Last Crash: ${minsAgo} minutes ago`);
    }

    if (crashes.recentCrashes && crashes.recentCrashes.length > 0) {
      console.log(`\n${YELLOW}Recent Crashes:${RESET}`);
      for (const crash of crashes.recentCrashes.slice(0, 5)) {
        const time = new Date(crash.timestamp).toLocaleTimeString();
        const severityColor = crash.severity === 'critical' ? RED : YELLOW;
        console.log(
          `  ${severityColor}[${crash.severity}]${RESET} ${time} - ${crash.type}: ${crash.error.message.slice(0, 60)}`
        );
      }
    }
  }

  // ===== ERROR BREAKDOWN =====
  if (observability?.errors?.errorsByType) {
    printSection('ERROR BREAKDOWN');
    const errors = observability.errors.errorsByType;
    const sorted = Object.entries(errors).sort((a, b) => b[1] - a[1]);

    for (const [type, count] of sorted.slice(0, 10)) {
      console.log(`  ${RED}${count}x${RESET} ${type}`);
    }
  }

  // ===== COMPETING WORKERS =====
  printSection('COMPETING WORKER CHECK');
  const workerIssues = await checkCompetingWorkers();
  if (workerIssues.length === 0) {
    console.log(`${GREEN}✓ No voice agent on Cloud Run${RESET}`);
  } else {
    for (const issue of workerIssues) {
      console.log(`${YELLOW}⚠ ${issue}${RESET}`);
    }
  }

  // ===== RECOMMENDATIONS =====
  printSection('RECOMMENDATIONS');

  const recommendations: string[] = [];

  if (!isRunning) {
    recommendations.push(
      `Agent not running - check: ferni logs agent${TARGET.env === 'dev' ? ' --dev' : ''}`
    );
  }
  if (workerIssues.some((issue) => issue.includes('stealing'))) {
    recommendations.push(
      'Delete the Cloud Run voice agent service (see CLAUDE.md Zombie Prevention)'
    );
  }

  if (observability?.callQuality) {
    const cq = observability.callQuality;
    if (cq.disconnectRate > 0.1) {
      recommendations.push(
        'High disconnect rate (>10%) - check for competing workers and agent logs'
      );
    }
    if (cq.connectionSuccessRate < 0.95) {
      recommendations.push('Low connection success - check LiveKit status and agent logs');
    }
    if (cq.avgFirstResponseTimeMs > 3000) {
      recommendations.push('High response latency - check LLM/TTS quotas');
    }
  }

  if (crashes && crashes.totalCrashes > 0) {
    const lastCrash = crashes.lastCrashTime ? new Date(crashes.lastCrashTime) : null;
    if (lastCrash && Date.now() - lastCrash.getTime() < 30 * 60 * 1000) {
      recommendations.push('Recent crashes detected - review crash analytics for patterns');
    }
  }

  if (recommendations.length === 0) {
    console.log(`${GREEN}✓ No critical issues detected${RESET}`);
  } else {
    for (const rec of recommendations) {
      console.log(`${YELLOW}→ ${rec}${RESET}`);
    }
  }

  // ===== QUICK COMMANDS =====
  printSection('QUICK COMMANDS');
  console.log(
    `  ${CYAN}ferni logs agent${RESET}          - Stream agent logs (--dev for ferni-dev)`
  );
  console.log(`  ${CYAN}ferni logs agent --errors${RESET} - Stream agent errors only`);
  console.log(`  ${CYAN}ferni status agent${RESET}        - Agent status, prod and dev`);
  console.log(`  ${CYAN}ferni rollback agent --prod${RESET} - Roll back the production agent`);

  console.log(`\n${CYAN}Full debugging guide: docs/runbooks/DISCONNECT-DEBUGGING.md${RESET}\n`);
}

main().catch(console.error);
