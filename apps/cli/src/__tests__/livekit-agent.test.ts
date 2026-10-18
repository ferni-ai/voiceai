import { describe, expect, it } from 'vitest';
import {
  LIVEKIT_AGENTS,
  lkAgentArgs,
  parseAgentStatus,
  resolveAgentEnv,
} from '../utils/livekit-agent.js';

describe('resolveAgentEnv', () => {
  it('uses the fallback when no flag is given', () => {
    expect(resolveAgentEnv([], 'dev')).toBe('dev');
    expect(resolveAgentEnv(['--tail'], 'prod')).toBe('prod');
  });

  it('reads --prod, --dev and --env=', () => {
    expect(resolveAgentEnv(['--prod'], 'dev')).toBe('prod');
    expect(resolveAgentEnv(['--dev'], 'prod')).toBe('dev');
    expect(resolveAgentEnv(['--env=prod'], 'dev')).toBe('prod');
    expect(resolveAgentEnv(['--env=staging'], 'dev')).toBe('dev');
  });
});

describe('lkAgentArgs', () => {
  it('always names the project and the config that match it', () => {
    expect(lkAgentArgs('logs', LIVEKIT_AGENTS.prod)).toEqual([
      'agent',
      'logs',
      '--project',
      'ferni-prod',
      '--config',
      'livekit.prod-cloud.toml',
    ]);
    expect(lkAgentArgs('status', LIVEKIT_AGENTS.dev, ['--verbose'])).toEqual([
      'agent',
      'status',
      '--project',
      'ferni-dev',
      '--config',
      'livekit.toml',
      '--verbose',
    ]);
  });
});

describe('parseAgentStatus', () => {
  const table = [
    'Using project [ferni-prod]',
    '┌─────────────────┬──────┬─────────┬─────────┐',
    '│ ID              │ Name │ Region  │ Status  │',
    '├─────────────────┼──────┼─────────┼─────────┤',
    '│ CA_GeFvEpsNXLSF │ --   │ us-east │ Running │',
    '└─────────────────┴──────┴─────────┴─────────┘',
  ].join('\n');

  it('returns the Status cell for the agent', () => {
    expect(parseAgentStatus(table, 'CA_GeFvEpsNXLSF')).toBe('Running');
  });

  it('returns null when the agent is not in the table', () => {
    expect(parseAgentStatus(table, 'CA_other')).toBeNull();
    expect(
      parseAgentStatus('project does not match agent subdomain', 'CA_GeFvEpsNXLSF')
    ).toBeNull();
  });
});
