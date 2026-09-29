/**
 * Experiment CLI Commands
 *
 * Manages web experiments through the admin API
 * (`/api/v1/admin/experiments`, see src/api/v1/admin/experiments.ts).
 * Requires `ferni auth login` with an admin account.
 *
 * Commands:
 *   ferni experiments list                 - List all experiments
 *   ferni experiments status               - Show experiment summary
 *   ferni experiments create -n <name> [-v a,b] [-m goal]
 *   ferni experiments show <id>            - Show experiment details + analysis
 *   ferni experiments health <id>          - Show significance / progress
 *   ferni experiments start <id>           - Start an experiment
 *   ferni experiments pause <id>           - Pause an experiment
 *   ferni experiments resume <id>          - Resume a paused experiment
 *   ferni experiments complete <id> <winner> - Complete with a winner
 *   ferni experiments promote <id>         - Complete with the analysed winner if significant
 *
 * `delete` has no backend route yet and prints a clear message.
 *
 * @module cli/commands/experiments/experiments
 */

import { getAuthHeaders } from '../../services/cli-auth.service.js';

const API_BASE_URL = process.env.FERNI_API_URL || 'http://localhost:3002';
const EXPERIMENTS_PATH = '/api/v1/admin/experiments';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

interface Variant {
  id: string;
  name: string;
  weight: number;
}

interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: Variant[];
  primaryGoal: string;
  createdAt: string;
  startedAt?: string;
  winner?: string;
}

interface Analysis {
  variants: Array<{ id: string; name: string; exposures: number; conversionRate: number }>;
  winner: string | null;
  confidence: number;
  isSignificant: boolean;
  recommendation: string;
  sampleSize: number;
  minimumSamples: number;
  progress: number;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let headers: Record<string, string>;
  try {
    headers = await getAuthHeaders();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${EXPERIMENTS_PATH}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    return { ok: false, error: `Couldn't reach ${API_BASE_URL}. Is the UI server running?` };
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'Admin access required. Run `ferni auth login` with an admin account.' };
    }
    return { ok: false, error: body.error || `HTTP ${response.status}` };
  }
  return { ok: true, data: body as T };
}

function statusIcon(status: string): string {
  switch (status) {
    case 'running':
      return `${c.green}●${c.reset}`;
    case 'paused':
      return `${c.yellow}●${c.reset}`;
    case 'completed':
      return `${c.dim}●${c.reset}`;
    default:
      return `${c.dim}○${c.reset}`;
  }
}

function fail(message: string): void {
  console.error(`${c.red}✗ ${message}${c.reset}`);
}

function flag(args: string[], short: string, long: string): string | undefined {
  const i = args.findIndex((a) => a === short || a === long);
  return i >= 0 ? args[i + 1] : undefined;
}

function printAnalysis(analysis: Analysis): void {
  console.log(`\n${c.bold}Analysis:${c.reset}`);
  console.log(`  Progress:    ${analysis.progress}% (${analysis.sampleSize}/${analysis.minimumSamples} samples)`);
  console.log(`  Confidence:  ${analysis.confidence}%${analysis.isSignificant ? ` ${c.green}(significant)${c.reset}` : ''}`);
  if (analysis.winner) console.log(`  Leader:      ${c.green}${analysis.winner}${c.reset}`);
  console.log(`  ${c.dim}${analysis.recommendation}${c.reset}`);
}

async function postAction(id: string, action: string, verb: string, body?: unknown): Promise<void> {
  const result = await api<{ success: boolean }>(`/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!result.ok) return fail(result.error);
  console.log(`${c.green}✓ Experiment ${id} ${verb}${c.reset}`);
}

/**
 * Entry point used by `ferni experiments` (apps/cli/src/index.ts).
 */
export async function runExperiments(args: string[]): Promise<void> {
  const sub = args[0] || 'list';
  const id = args[1];
  const needId = (): boolean => {
    if (!id) fail(`Experiment ID required: ferni experiments ${sub} <id>`);
    return Boolean(id);
  };

  switch (sub) {
    case 'list':
    case 'status':
    case 'summary': {
      const result = await api<{
        experiments: Experiment[];
        summary: { total: number; running: number; paused: number; completed: number; draft: number };
      }>('');
      if (!result.ok) return fail(result.error);
      const { experiments, summary } = result.data;
      if (args.includes('--json')) {
        console.log(JSON.stringify(sub === 'list' ? experiments : summary, null, 2));
        return;
      }
      if (sub !== 'list') {
        console.log(`${c.bold}Experiment Summary:${c.reset}\n`);
        console.log(`  Total:     ${c.cyan}${summary.total}${c.reset}`);
        console.log(`  Running:   ${c.green}${summary.running}${c.reset}`);
        console.log(`  Paused:    ${c.yellow}${summary.paused}${c.reset}`);
        console.log(`  Draft:     ${summary.draft}`);
        console.log(`  Completed: ${c.dim}${summary.completed}${c.reset}`);
        return;
      }
      if (experiments.length === 0) {
        console.log(`${c.yellow}No experiments found.${c.reset}`);
        return;
      }
      for (const exp of experiments) {
        console.log(`  ${statusIcon(exp.status)} ${c.cyan}${exp.id}${c.reset} ${exp.name}`);
        console.log(`    ${c.dim}${exp.variants.length} variants · goal: ${exp.primaryGoal}${c.reset}`);
        if (exp.winner) console.log(`    ${c.green}Winner: ${exp.winner}${c.reset}`);
      }
      console.log(`\n${c.dim}Total: ${experiments.length} experiments${c.reset}`);
      return;
    }

    case 'show':
    case 'results': {
      if (!needId()) return;
      const result = await api<{ experiment: Experiment; analysis: Analysis | null }>(
        `/${encodeURIComponent(id)}`
      );
      if (!result.ok) return fail(result.error);
      if (args.includes('--json')) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      const { experiment: exp, analysis } = result.data;
      console.log(`${c.bold}${exp.name}${c.reset}\n`);
      console.log(`  ID:       ${c.cyan}${exp.id}${c.reset}`);
      console.log(`  Status:   ${statusIcon(exp.status)} ${exp.status}`);
      console.log(`  Goal:     ${exp.primaryGoal}`);
      console.log(`  Created:  ${new Date(exp.createdAt).toLocaleString()}`);
      if (exp.startedAt) console.log(`  Started:  ${new Date(exp.startedAt).toLocaleString()}`);
      if (exp.winner) console.log(`  ${c.green}Winner: ${exp.winner}${c.reset}`);
      console.log(`\n${c.bold}Variants:${c.reset}`);
      for (const v of exp.variants) console.log(`  - ${v.name} (${v.id}, ${v.weight}%)`);
      if (analysis) printAnalysis(analysis);
      return;
    }

    case 'health': {
      if (!needId()) return;
      const result = await api<Analysis>(`/${encodeURIComponent(id)}/analysis`);
      if (!result.ok) return fail(result.error);
      if (args.includes('--json')) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      console.log(`${c.bold}Health: ${id}${c.reset}`);
      printAnalysis(result.data);
      return;
    }

    case 'create': {
      const name = flag(args, '-n', '--name');
      if (!name) {
        fail('Usage: ferni experiments create -n <name> [-v control,treatment] [-m <goal>] [-d <description>]');
        return;
      }
      const names = (flag(args, '-v', '--variants') || 'control,treatment')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      // Weights must sum to exactly 100; give the remainder to the first variant.
      const base = Math.floor(100 / names.length);
      const variants: Variant[] = names.map((n, i) => ({
        id: n.toLowerCase().replace(/\s+/g, '_'),
        name: n,
        weight: i === 0 ? 100 - base * (names.length - 1) : base,
      }));
      const payload = {
        name,
        description: flag(args, '-d', '--description'),
        variants,
        primaryGoal: flag(args, '-m', '--metric') || 'conversion',
      };
      if (args.includes('--dry-run')) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      const result = await api<Experiment>('', { method: 'POST', body: JSON.stringify(payload) });
      if (!result.ok) return fail(result.error);
      console.log(`${c.green}✓ Experiment created: ${result.data.id}${c.reset} (${result.data.status})`);
      return;
    }

    case 'start':
      if (needId()) await postAction(id, 'start', 'started');
      return;

    case 'pause':
    case 'stop':
      if (needId()) await postAction(id, 'pause', 'paused');
      return;

    case 'resume':
      // The admin API restarts paused experiments via /start.
      if (needId()) await postAction(id, 'start', 'resumed');
      return;

    case 'complete':
    case 'winner': {
      if (!needId()) return;
      const winner = args[2];
      if (!winner) {
        fail('Winner variant required: ferni experiments complete <id> <variant-id>');
        return;
      }
      await postAction(id, 'complete', `completed (winner: ${winner})`, { winner });
      return;
    }

    case 'promote': {
      if (!needId()) return;
      const analysis = await api<Analysis>(`/${encodeURIComponent(id)}/analysis`);
      if (!analysis.ok) return fail(analysis.error);
      const { winner, isSignificant, confidence, recommendation } = analysis.data;
      if (!winner || !isSignificant) {
        console.log(`${c.yellow}Not ready to promote${c.reset}`);
        console.log(`  ${c.dim}${recommendation}${c.reset}`);
        return;
      }
      await postAction(id, 'complete', `promoted (winner: ${winner})`, { winner, confidence });
      return;
    }

    case 'delete':
      console.log(
        `${c.yellow}Deleting experiments isn't available yet (no backend endpoint).${c.reset}`
      );
      console.log(`  ${c.dim}Use: ferni experiments pause ${id || '<id>'}${c.reset}`);
      return;

    default:
      fail(`Unknown experiments subcommand: ${sub}`);
      console.log(
        '\n  Available: list, status, show, health, create, start, pause, resume, complete, promote'
      );
  }
}
