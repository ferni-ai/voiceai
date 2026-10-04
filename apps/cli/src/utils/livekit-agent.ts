/**
 * The voice agent runs on LiveKit Cloud agents, driven by the `lk` CLI.
 *
 * Every lk call names both the project and the config file. Without
 * `--config`, lk falls back to livekit.toml (the dev agent); for prod it then
 * prints "project does not match agent subdomain" and returns nothing, which
 * reads as "no logs" or "no errors".
 *
 * @module cli/utils/livekit-agent
 */
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type AgentEnv = 'prod' | 'dev';

export interface LiveKitAgentTarget {
  readonly env: AgentEnv;
  readonly project: string;
  readonly config: string;
  readonly agentId: string;
}

export const LIVEKIT_AGENTS: Readonly<Record<AgentEnv, LiveKitAgentTarget>> = {
  prod: {
    env: 'prod',
    project: 'ferni-prod',
    config: 'livekit.prod-cloud.toml',
    agentId: 'CA_GeFvEpsNXLSF',
  },
  dev: { env: 'dev', project: 'ferni-dev', config: 'livekit.toml', agentId: 'CA_siTDMHEba4Fg' },
};

/** Reads `--prod`, `--dev` or `--env=prod|dev`; anything else falls back. */
export function resolveAgentEnv(args: readonly string[], fallback: AgentEnv): AgentEnv {
  const envArg = args.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (envArg === 'prod' || envArg === 'dev') return envArg;
  if (args.includes('--prod')) return 'prod';
  if (args.includes('--dev')) return 'dev';
  return fallback;
}

export function lkAgentArgs(
  subcommand: string,
  target: LiveKitAgentTarget,
  extra: readonly string[] = []
): string[] {
  return ['agent', subcommand, '--project', target.project, '--config', target.config, ...extra];
}

export function isLkInstalled(): boolean {
  return spawnSync('lk', ['--version'], { stdio: 'ignore' }).status === 0;
}

export interface LkResult {
  readonly ok: boolean;
  readonly output: string;
}

/** Runs `lk agent <subcommand>` from the repo root, streaming unless `capture` is set. */
export function runLkAgent(
  root: string,
  subcommand: string,
  target: LiveKitAgentTarget,
  options: { extra?: readonly string[]; capture?: boolean } = {}
): LkResult {
  const result = spawnSync('lk', lkAgentArgs(subcommand, target, options.extra), {
    cwd: root,
    encoding: 'utf-8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** The Status cell for `agentId` in `lk agent status` table output, or null. */
export function parseAgentStatus(output: string, agentId: string): string | null {
  const rows = output.split('\n').filter((line) => line.includes('│'));
  const cells = (line: string): string[] =>
    line
      .split('│')
      .slice(1, -1)
      .map((c) => c.trim());
  const header = rows.find((line) => cells(line).includes('Status'));
  const row = rows.find((line) => cells(line)[0] === agentId);
  if (!header || !row) return null;
  return cells(row)[cells(header).indexOf('Status')] ?? null;
}

export type DockerfilePrep =
  | { readonly ok: true; readonly created: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * `lk agent deploy` builds ./Dockerfile. The agent image is defined in
 * docker/Dockerfile.agent, so copy it to the root unless an identical copy is
 * already there. A different root Dockerfile is never overwritten.
 */
export function prepareAgentDockerfile(root: string): DockerfilePrep {
  const source = join(root, 'docker', 'Dockerfile.agent');
  const dest = join(root, 'Dockerfile');
  if (!existsSync(source)) return { ok: false, reason: 'docker/Dockerfile.agent not found' };
  if (existsSync(dest)) {
    return readFileSync(dest, 'utf-8') === readFileSync(source, 'utf-8')
      ? { ok: true, created: false }
      : { ok: false, reason: './Dockerfile exists and differs from docker/Dockerfile.agent' };
  }
  copyFileSync(source, dest);
  return { ok: true, created: true };
}
