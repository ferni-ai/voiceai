/**
 * CI State Collector
 *
 * Collects CI state from GitHub API for both agent and human views.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  CIState,
  RunnerState,
  WorkflowState,
  JobState,
  CircuitBreaker,
  RecommendedAction,
  ConcurrencyGroup,
  CISummary,
  WorkflowGraph,
  GraphNode,
  GraphEdge,
} from './ci-types.js';

const REPOSITORY = 'ferni-ai/voiceai';
const RUNNER_NAME = 'github-runner';
const RUNNER_IP = '34.171.8.182';
const RUNNER_ZONE = 'us-central1-a';

// Fallback job dependencies (used when ci.yml cannot be parsed)
const FALLBACK_JOB_DEPENDENCIES: Record<string, string[]> = {
  setup: [],
  lint: ['setup'],
  'test-unit': ['setup'],
  'test-integration': ['setup'],
  'test-agi-features': ['setup'],
  build: ['setup', 'lint', 'test-unit', 'test-integration', 'test-agi-features'],
  security: ['setup'],
  'code-quality': ['setup'],
  'quality-gates': ['setup'],
  validation: ['setup'],
  'e2e-validation': ['setup'],
  'frontend-quality': ['setup'],
  dependencies: ['setup'],
};

// Cache for dynamically discovered dependencies
let cachedDependencies: Record<string, string[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Dynamically discover job dependencies from ci.yml
 * This ensures dependencies stay in sync with the actual workflow file.
 */
function discoverJobDependencies(): Record<string, string[]> {
  const now = Date.now();

  // Return cached if fresh
  if (cachedDependencies && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDependencies;
  }

  try {
    // Find repo root by looking for .github directory
    let currentDir = process.cwd();
    let ciYamlPath = '';

    for (let i = 0; i < 10; i++) {
      const testPath = join(currentDir, '.github', 'workflows', 'ci.yml');
      if (existsSync(testPath)) {
        ciYamlPath = testPath;
        break;
      }
      const parentDir = join(currentDir, '..');
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    if (!ciYamlPath) {
      return FALLBACK_JOB_DEPENDENCIES;
    }

    const yamlContent = readFileSync(ciYamlPath, 'utf-8');
    const dependencies: Record<string, string[]> = {};

    // Simple YAML parsing for job needs (avoids adding yaml dependency)
    // Matches patterns like:
    //   job-name:
    //     needs: [dep1, dep2]
    // or:
    //     needs: single-dep
    const jobPattern = /^\s{2}([a-z][a-z0-9_-]*):\s*$/gm;
    const needsPattern = /^\s{4}needs:\s*(.+)$/gm;

    let currentJob: string | null = null;
    const lines = yamlContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for job definition (2-space indent, ends with :)
      const jobMatch = line.match(/^  ([a-z][a-z0-9_-]*):\s*$/);
      if (jobMatch) {
        currentJob = jobMatch[1];
        dependencies[currentJob] = [];
        continue;
      }

      // Check for needs (4-space indent)
      if (currentJob && line.match(/^    needs:/)) {
        const needsMatch = line.match(/^    needs:\s*(.+)$/);
        if (needsMatch) {
          const needsValue = needsMatch[1].trim();
          // Handle array format: [dep1, dep2]
          if (needsValue.startsWith('[')) {
            const deps = needsValue
              .replace(/[\[\]]/g, '')
              .split(',')
              .map(d => d.trim().replace(/['"]/g, ''))
              .filter(Boolean);
            dependencies[currentJob] = deps;
          } else {
            // Handle single value
            dependencies[currentJob] = [needsValue.replace(/['"]/g, '')];
          }
        }
      }
    }

    cachedDependencies = Object.keys(dependencies).length > 0 ? dependencies : FALLBACK_JOB_DEPENDENCIES;
    cacheTimestamp = now;

    return cachedDependencies;
  } catch (error) {
    // On any error, fall back to static dependencies
    return FALLBACK_JOB_DEPENDENCIES;
  }
}

// Use dynamic discovery
function getJobDependencies(): Record<string, string[]> {
  return discoverJobDependencies();
}

function ghCommand(args: string): string {
  try {
    return execSync(`gh ${args}`, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (error) {
    return '';
  }
}

function parseJsonOutput<T>(output: string): T | null {
  try {
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

export async function collectRunnerState(): Promise<RunnerState> {
  // Try to get runner status via API (may not have permission)
  const runnersJson = ghCommand(
    `api repos/${REPOSITORY}/actions/runners --jq '.runners[] | select(.name == "${RUNNER_NAME}") | {status: .status, busy: .busy}'`
  );

  interface RunnerApiResponse {
    status?: string;
    busy?: boolean;
  }

  const runnerData = parseJsonOutput<RunnerApiResponse>(runnersJson);

  // Check queue depth by counting queued runs
  const queuedRuns = ghCommand(
    `run list --repo ${REPOSITORY} --status queued --json workflowName --jq 'length'`
  );
  const queueDepth = parseInt(queuedRuns, 10) || 0;

  // Determine status
  let status: RunnerState['status'] = 'offline';
  let lastHeartbeat: string | null = null;

  if (runnerData?.status === 'online') {
    status = runnerData.busy ? 'busy' : 'online';
    lastHeartbeat = new Date().toISOString();
  } else {
    // Check if any runs completed recently (indicates runner was online)
    const recentRun = ghCommand(
      `run list --repo ${REPOSITORY} --limit 1 --json updatedAt --jq '.[0].updatedAt'`
    );
    if (recentRun) {
      lastHeartbeat = recentRun;
    }
  }

  return {
    id: 'github-runner-gce',
    name: RUNNER_NAME,
    status,
    lastHeartbeat,
    queueDepth,
    capacity: 1,
    ip: RUNNER_IP,
    zone: RUNNER_ZONE,
  };
}

export async function collectWorkflowStates(branch?: string): Promise<WorkflowState[]> {
  const branchFilter = branch ? `--branch ${branch}` : '';
  const runsJson = ghCommand(
    `run list --repo ${REPOSITORY} ${branchFilter} --limit 20 --json workflowName,databaseId,status,conclusion,headBranch,headSha,createdAt,url`
  );

  interface RunData {
    workflowName: string;
    databaseId: number;
    status: string;
    conclusion: string;
    headBranch: string;
    headSha: string;
    createdAt: string;
    url: string;
  }

  const runs = parseJsonOutput<RunData[]>(runsJson) || [];

  // Group by workflow name, take most recent
  const workflowMap = new Map<string, WorkflowState>();

  for (const run of runs) {
    if (workflowMap.has(run.workflowName)) continue;

    // Get jobs for this run
    const jobsJson = ghCommand(
      `run view ${run.databaseId} --repo ${REPOSITORY} --json jobs --jq '.jobs[] | {name: .name, status: .status, conclusion: .conclusion, startedAt: .startedAt, completedAt: .completedAt}'`
    );

    interface JobData {
      name: string;
      status: string;
      conclusion: string;
      startedAt: string;
      completedAt: string;
    }

    const jobsData = jobsJson
      .split('\n')
      .filter(Boolean)
      .map((line) => parseJsonOutput<JobData>(line))
      .filter((j): j is JobData => j !== null);

    const jobs: JobState[] = jobsData.map((j) => ({
      name: j.name,
      status: mapStatus(j.status, j.conclusion),
      conclusion: j.conclusion,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      durationSeconds: j.startedAt && j.completedAt
        ? (new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 1000
        : undefined,
      dependsOn: getJobDependencies()[j.name.toLowerCase().replace(/\s+/g, '-')] || [],
    }));

    workflowMap.set(run.workflowName, {
      name: run.workflowName,
      id: 0, // Would need separate API call
      runId: run.databaseId,
      status: mapStatus(run.status, run.conclusion),
      conclusion: run.conclusion,
      branch: run.headBranch,
      commit: run.headSha.substring(0, 8),
      triggeredAt: run.createdAt,
      jobs,
      url: run.url,
    });
  }

  return Array.from(workflowMap.values());
}

function mapStatus(status: string, conclusion: string): JobState['status'] {
  if (status === 'queued') return 'queued';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'completed') {
    if (conclusion === 'success') return 'completed';
    if (conclusion === 'failure') return 'failed';
    if (conclusion === 'cancelled') return 'cancelled';
    if (conclusion === 'skipped') return 'skipped';
    return 'completed';
  }
  return 'pending';
}

export function deriveCircuitBreaker(runner: RunnerState, workflows: WorkflowState[]): CircuitBreaker {
  // Count recent failures
  const recentFailures = workflows.filter(
    (w) => w.status === 'failed' && new Date(w.triggeredAt) > new Date(Date.now() - 3600000)
  ).length;

  // Determine state
  let state: CircuitBreaker['state'] = 'closed';

  if (runner.status === 'offline') {
    state = 'open';
  } else if (recentFailures >= 3) {
    state = 'half-open';
  }

  return {
    state,
    failureCount: recentFailures,
    lastFailure: workflows.find((w) => w.status === 'failed')?.triggeredAt,
    lastSuccess: workflows.find((w) => w.status === 'completed')?.triggeredAt,
    nextRetryAt: state === 'open' ? new Date(Date.now() + 300000).toISOString() : undefined,
  };
}

export function deriveActions(runner: RunnerState, circuitBreaker: CircuitBreaker, workflows: WorkflowState[]): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // Runner offline - critical
  if (runner.status === 'offline') {
    actions.push({
      id: 'restart-runner',
      priority: 'critical',
      action: 'Restart GitHub Actions Runner',
      command: 'ferni runner restart',
      reason: `Runner offline for ${getTimeSince(runner.lastHeartbeat)}, ${runner.queueDepth} jobs queued`,
      automated: false,
    });

    actions.push({
      id: 'check-gce-instance',
      priority: 'high',
      action: 'Check GCE Instance Status',
      command: `gcloud compute instances describe ${runner.name} --zone=${runner.zone} --format='value(status)'`,
      reason: 'Verify underlying VM is running',
      automated: true,
    });
  }

  // Queue backlog
  if (runner.queueDepth > 10) {
    actions.push({
      id: 'scale-runners',
      priority: 'medium',
      action: 'Consider Adding Runners',
      command: 'ferni runner scale --count 2',
      reason: `Queue depth (${runner.queueDepth}) exceeds threshold`,
      automated: false,
    });
  }

  // Failed workflows
  const failedWorkflows = workflows.filter((w) => w.status === 'failed');
  for (const wf of failedWorkflows.slice(0, 3)) {
    actions.push({
      id: `rerun-${wf.runId}`,
      priority: 'medium',
      action: `Re-run Failed Workflow: ${wf.name}`,
      command: `gh run rerun ${wf.runId} --failed`,
      reason: `Workflow failed on ${wf.branch} (${wf.commit})`,
      automated: true,
      context: { runId: wf.runId, branch: wf.branch },
    });
  }

  // Circuit breaker warnings
  if (circuitBreaker.state === 'half-open') {
    actions.push({
      id: 'monitor-stability',
      priority: 'low',
      action: 'Monitor CI Stability',
      command: 'ferni ci status --watch --interval 60',
      reason: 'Multiple recent failures detected, monitoring recommended',
      automated: true,
    });
  }

  return actions;
}

function getTimeSince(isoDate: string | null): string {
  if (!isoDate) return 'unknown';
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function deriveSummary(workflows: WorkflowState[]): CISummary {
  const completed = workflows.filter((w) => w.status === 'completed').length;
  const failed = workflows.filter((w) => w.status === 'failed').length;
  const cancelled = workflows.filter((w) => w.status === 'cancelled').length;
  const queued = workflows.filter((w) => w.status === 'queued').length;
  const inProgress = workflows.filter((w) => w.status === 'in_progress').length;
  const total = workflows.length;

  // Success rate should only count finished workflows (not queued/in_progress)
  const finishedWorkflows = completed + failed + cancelled;
  const successRate = finishedWorkflows > 0
    ? Math.round((completed / finishedWorkflows) * 100)
    : 0;

  // Calculate average duration from completed workflows with jobs
  let totalDuration = 0;
  let durationCount = 0;
  for (const wf of workflows) {
    for (const job of wf.jobs) {
      if (job.durationSeconds) {
        totalDuration += job.durationSeconds;
        durationCount++;
      }
    }
  }

  return {
    totalWorkflows: total,
    queued,
    inProgress,
    completed,
    failed,
    successRate,
    avgDurationMinutes: durationCount > 0 ? Math.round(totalDuration / durationCount / 60) : 0,
    budgetUsedPercent: 0, // Would need separate calculation
  };
}

export function buildWorkflowGraph(jobs: JobState[]): WorkflowGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Calculate levels based on dependencies with cycle detection
  const levels = new Map<string, number>();
  const visiting = new Set<string>(); // Track current path for cycle detection

  function getLevel(jobName: string, path: string[] = []): number {
    if (levels.has(jobName)) return levels.get(jobName)!;

    // Cycle detection
    if (visiting.has(jobName)) {
      console.warn(`Circular dependency detected: ${[...path, jobName].join(' -> ')}`);
      return 0; // Break cycle by returning 0
    }

    const job = jobs.find((j) => j.name.toLowerCase().replace(/\s+/g, '-') === jobName);
    if (!job || job.dependsOn.length === 0) {
      levels.set(jobName, 0);
      return 0;
    }

    visiting.add(jobName);
    const maxDepLevel = Math.max(...job.dependsOn.map((d) => getLevel(d, [...path, jobName])));
    visiting.delete(jobName);

    const level = maxDepLevel + 1;
    levels.set(jobName, level);
    return level;
  }

  for (const job of jobs) {
    const jobId = job.name.toLowerCase().replace(/\s+/g, '-');
    const level = getLevel(jobId);

    nodes.push({
      id: jobId,
      label: job.name,
      status: job.status,
      duration: job.durationSeconds,
      level,
    });

    for (const dep of job.dependsOn) {
      edges.push({ from: dep, to: jobId });
    }
  }

  return { nodes, edges };
}

export async function collectCIState(branch?: string): Promise<CIState> {
  const runner = await collectRunnerState();
  const workflows = await collectWorkflowStates(branch);
  const circuitBreaker = deriveCircuitBreaker(runner, workflows);
  const actions = deriveActions(runner, circuitBreaker, workflows);
  const summary = deriveSummary(workflows);

  // Derive concurrency groups (simplified)
  const concurrency: ConcurrencyGroup[] = [
    {
      name: 'ci-CI-refs/pull/*',
      activeRun: workflows.find((w) => w.name === 'CI' && w.status === 'in_progress')?.runId,
      queuedRuns: workflows.filter((w) => w.name === 'CI' && w.status === 'queued').map((w) => w.runId),
      cancelInProgress: true,
    },
  ];

  return {
    timestamp: new Date().toISOString(),
    repository: REPOSITORY,
    runner,
    workflows,
    concurrency,
    circuitBreaker,
    actions,
    summary,
  };
}
