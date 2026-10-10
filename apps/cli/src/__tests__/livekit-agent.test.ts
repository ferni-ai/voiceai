import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVEKIT_AGENTS,
  lkAgentArgs,
  parseAgentStatus,
  prepareAgentDockerfile,
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

describe('prepareAgentDockerfile', () => {
  const makeRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'ferni-lk-'));
    mkdirSync(join(root, 'docker'));
    writeFileSync(join(root, 'docker', 'Dockerfile.agent'), 'FROM node:20\n');
    return root;
  };

  it('copies docker/Dockerfile.agent to the root', () => {
    const root = makeRoot();
    expect(prepareAgentDockerfile(root)).toEqual({ ok: true, created: true });
    expect(readFileSync(join(root, 'Dockerfile'), 'utf-8')).toBe('FROM node:20\n');
  });

  it('accepts an identical root Dockerfile without recreating it', () => {
    const root = makeRoot();
    writeFileSync(join(root, 'Dockerfile'), 'FROM node:20\n');
    expect(prepareAgentDockerfile(root)).toEqual({ ok: true, created: false });
  });

  it('refuses to overwrite a different root Dockerfile', () => {
    const root = makeRoot();
    writeFileSync(join(root, 'Dockerfile'), 'FROM python\n');
    expect(prepareAgentDockerfile(root).ok).toBe(false);
    expect(readFileSync(join(root, 'Dockerfile'), 'utf-8')).toBe('FROM python\n');
  });
});
