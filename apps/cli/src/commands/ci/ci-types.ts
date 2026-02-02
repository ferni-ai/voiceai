/**
 * CI/CD State Types
 *
 * Shared types for both agent and human views of CI state.
 */

export type RunnerStatus = 'online' | 'offline' | 'busy';
export type CircuitBreakerState = 'closed' | 'half-open' | 'open';
export type WorkflowStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'pending' | 'skipped';
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface RunnerState {
  id: string;
  name: string;
  status: RunnerStatus;
  lastHeartbeat: string | null;
  queueDepth: number;
  capacity: number;
  ip?: string;
  zone?: string;
}

export interface JobState {
  name: string;
  status: JobStatus;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  dependsOn: string[];
}

export interface WorkflowState {
  name: string;
  id: number;
  runId: number;
  status: WorkflowStatus;
  conclusion?: string;
  branch: string;
  commit: string;
  triggeredAt: string;
  jobs: JobState[];
  url: string;
}

export interface ConcurrencyGroup {
  name: string;
  activeRun?: number;
  queuedRuns: number[];
  cancelInProgress: boolean;
}

export interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailure?: string;
  lastSuccess?: string;
  nextRetryAt?: string;
}

export interface RecommendedAction {
  id: string;
  priority: ActionPriority;
  action: string;
  command: string;
  reason: string;
  automated: boolean;
  context?: Record<string, unknown>;
}

export interface CIState {
  timestamp: string;
  repository: string;
  runner: RunnerState;
  workflows: WorkflowState[];
  concurrency: ConcurrencyGroup[];
  circuitBreaker: CircuitBreaker;
  actions: RecommendedAction[];
  summary: CISummary;
}

export interface CISummary {
  totalWorkflows: number;
  queued: number;
  inProgress: number;
  completed: number;
  failed: number;
  successRate: number;
  avgDurationMinutes: number;
  budgetUsedPercent: number;
}

// Workflow dependency graph for visualization
export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  status: JobStatus;
  duration?: number;
  level: number; // For layout
}

export interface GraphEdge {
  from: string;
  to: string;
}

// CLI output formats
export type OutputFormat = 'json' | 'table' | 'mermaid' | 'ascii' | 'minimal';

export interface CICommandOptions {
  format?: OutputFormat;
  branch?: string;
  workflow?: string;
  watch?: boolean;
  interval?: number;
  verbose?: boolean;
}
