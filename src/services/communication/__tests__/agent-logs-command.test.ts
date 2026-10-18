/**
 * `/ferni logs` used to ssh into the GCE VM voiceai-agent-gce, which no longer
 * runs. It now reads the LiveKit Cloud agent's logs from Cloud Logging. The
 * command builder is tested directly, and the chatops server is driven over a
 * real socket to prove handleLogs runs that command. Only execSync is stubbed.
 */
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const execSync = vi.fn((_cmd: string, _opts?: unknown) => '2026-10-18T11:00:00Z {"level":30}\n');
vi.mock('child_process', () => ({
  execSync: (cmd: string, opts?: unknown) => execSync(cmd, opts),
}));

import { buildAgentLogsCommand, clampLogLines, MAX_LOG_LINES } from '../agent-logs-command.js';
import { startChatOpsServer, stopChatOpsServer } from '../slack-chatops.js';

describe('buildAgentLogsCommand', () => {
  it('reads the prod LiveKit Cloud agent logs from Cloud Logging, not the GCE VM', () => {
    const cmd = buildAgentLogsCommand(20);
    expect(cmd).toContain(
      `logName="projects/johnb-2025/logs/cloud-agents" AND labels.agent_id="CA_GeFvEpsNXLSF"`
    );
    expect(cmd).toContain('--project=johnb-2025');
    expect(cmd).toContain('--limit=20');
    expect(cmd).not.toMatch(/ssh|voiceai-agent-gce|docker/);
  });

  it('clamps the line count', () => {
    expect(clampLogLines(5)).toBe(5);
    expect(clampLogLines(500)).toBe(MAX_LOG_LINES);
    expect(clampLogLines(-3)).toBe(20);
    expect(clampLogLines(Number.NaN)).toBe(20);
    expect(clampLogLines(7.9)).toBe(7);
    expect(buildAgentLogsCommand(500)).toContain(`--limit=${MAX_LOG_LINES}`);
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

describe('/ferni logs', () => {
  afterEach(() => {
    stopChatOpsServer();
    execSync.mockClear();
  });

  it('runs the Cloud Logging command and returns its output', async () => {
    const port = await freePort();
    startChatOpsServer({ port });
    await new Promise<void>((r) => {
      setTimeout(r, 50);
    });

    const res = await fetch(`http://127.0.0.1:${port}/slack/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'text=logs%2030&user_id=U1&user_name=ops&channel_id=C1&channel_name=ops',
    });
    const body = (await res.json()) as { text: string; blocks: Array<{ text: { text: string } }> };

    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync.mock.calls[0][0]).toBe(buildAgentLogsCommand(30));
    expect(body.text).toContain('30 lines');
    expect(body.blocks[0].text.text).toContain('{"level":30}');
  });
});
