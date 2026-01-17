#!/usr/bin/env npx tsx
/**
 * Disconnect Diagnostics CLI
 *
 * Quick command to diagnose disconnect patterns and identify root causes.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/ops/diagnose-disconnects.ts
 *   pnpm ops:diagnose
 */

import { execSync } from 'node:child_process';

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

interface ReadinessState {
  ready: boolean;
  checks: Record<string, boolean>;
  readyWorkerCount: number;
  uptimeMs: number;
}

const GCE_URL = 'http://34.134.186.63:8080';

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
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
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

async function checkZombies(): Promise<string[]> {
  const issues: string[] = [];
  try {
    // Just check if we can detect zombies - full check requires gcloud auth
    const result = execSync(
      'gcloud run revisions list --service=voiceai-agent --region=us-central1 --format="value(metadata.name,status.conditions[0].type)" 2>/dev/null | head -5',
      { encoding: 'utf8', timeout: 10000 }
    );
    const lines = result.trim().split('\n').filter(Boolean);
    if (lines.length > 1) {
      issues.push(`Found ${lines.length} revisions - check for zombies with: pnpm ops:zombies`);
    }
  } catch {
    issues.push('Could not check Cloud Run revisions (gcloud auth required)');
  }
  return issues;
}

async function main(): Promise<void> {
  printHeader('🔌 DISCONNECT DIAGNOSTICS');

  console.log(`${CYAN}Fetching metrics from voice agent...${RESET}\n`);

  // Parallel fetch all endpoints
  const [readiness, observability, crashes] = await Promise.all([
    fetchJson<ReadinessState>(`${GCE_URL}/health/ready`),
    fetchJson<ObservabilityData>(`${GCE_URL}/api/observability`),
    fetchJson<CrashSummary>(`${GCE_URL}/api/crash-analytics`),
  ]);

  // ===== READINESS =====
  printSection('READINESS STATUS');

  if (!readiness) {
    console.log(`${RED}✗ Could not reach voice agent at ${GCE_URL}${RESET}`);
    console.log(`  ${YELLOW}→ Check if agent is running: ssh to GCE and check docker ps${RESET}`);
  } else {
    const readyStatus = readiness.ready ? `${GREEN}✓ READY${RESET}` : `${RED}✗ NOT READY${RESET}`;
    console.log(`Status: ${readyStatus}`);
    console.log(`Workers Ready: ${readiness.readyWorkerCount}`);
    console.log(`Uptime: ${Math.round(readiness.uptimeMs / 1000 / 60)} minutes`);

    if (readiness.checks) {
      console.log(`\nHealth Checks:`);
      for (const [check, passed] of Object.entries(readiness.checks)) {
        const icon = passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        console.log(`  ${icon} ${check}`);
      }
    }
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

  // ===== ZOMBIE CHECK =====
  printSection('ZOMBIE REVISION CHECK');
  const zombieIssues = await checkZombies();
  if (zombieIssues.length === 0) {
    console.log(`${GREEN}✓ No zombie revision warnings${RESET}`);
  } else {
    for (const issue of zombieIssues) {
      console.log(`${YELLOW}⚠ ${issue}${RESET}`);
    }
  }

  // ===== RECOMMENDATIONS =====
  printSection('RECOMMENDATIONS');

  const recommendations: string[] = [];

  if (!readiness?.ready) {
    recommendations.push('Agent not ready - check deployment with: ferni deploy gce');
  }

  if (observability?.callQuality) {
    const cq = observability.callQuality;
    if (cq.disconnectRate > 0.1) {
      recommendations.push('High disconnect rate (>10%) - check zombie revisions: pnpm ops:zombies');
    }
    if (cq.connectionSuccessRate < 0.95) {
      recommendations.push('Low connection success - check LiveKit status and GCE health');
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
  console.log(`  ${CYAN}pnpm ops:logs${RESET}           - View recent logs`);
  console.log(`  ${CYAN}pnpm ops:logs:errors${RESET}    - View error logs`);
  console.log(`  ${CYAN}pnpm ops:zombies${RESET}        - Check zombie revisions`);
  console.log(`  ${CYAN}pnpm ops:zombies:fix${RESET}    - Fix zombie revisions`);
  console.log(`  ${CYAN}ferni deploy gce${RESET}        - Redeploy voice agent`);

  console.log(`\n${CYAN}Full debugging guide: docs/runbooks/DISCONNECT-DEBUGGING.md${RESET}\n`);
}

main().catch(console.error);

