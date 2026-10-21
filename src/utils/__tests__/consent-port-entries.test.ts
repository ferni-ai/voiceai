/**
 * Every process that can send a text or place a call registers the consent
 * check behind utils/consent-port.ts. One that didn't would refuse every
 * third-party text and call once MESSAGING_PIPELINE is on.
 *
 * The UI server and the call processes (voice worker and per-call child, both
 * through startProcessRuntime) are checked by running their installer; the
 * workers and the tool service are checked in their source. Each deployed
 * Dockerfile entry must be one of these, or listed as sending nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/outreach/call-user-adapter.js', () => ({ installCallUserPort: vi.fn() }));
vi.mock('../../services/outreach/forget-follow-ups-adapter.js', () => ({
  installForgetFollowUpsPort: vi.fn(),
}));
vi.mock('../../memory/dynamic/async-events-config.js', () => ({ configureAsyncEvents: vi.fn() }));
vi.mock('../../memory/dynamic/index.js', () => ({
  configureSyncService: vi.fn(),
  startDeepExtractionWorker: vi.fn(),
}));
vi.mock('../../memory/knowledge-graph/index.js', () => ({
  initializeKnowledgeCapture: vi.fn(async () => undefined),
}));
vi.mock('../../services/async-events/index.js', () => ({ memoryAsyncEvents: {} }));
vi.mock('../../agents/session/index.js', () => ({
  startRegistryOrphanCleanup: vi.fn(),
  stopRegistryOrphanCleanup: vi.fn(),
}));
vi.mock('../../agents/shared/crash-analytics.js', () => ({ initCrashAnalytics: vi.fn() }));
vi.mock('../../agents/shared/openai-health-monitor.js', () => ({
  startOrphanCleanup: vi.fn(),
  stopOrphanCleanup: vi.fn(),
}));
vi.mock('../../agents/shared/session-closing-tracker.js', () => ({
  startClosingTrackerCleanup: vi.fn(),
  stopClosingTrackerCleanup: vi.fn(),
}));

import { startProcessRuntime } from '../../agents/gce/process-runtime.js';
import { installUiServerPorts } from '../../services/outreach/ui-server-ports.js';
import { consentBlocks, consentCheckRegistered, registerConsentCheck } from '../consent-port.js';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const ON = { MESSAGING_PIPELINE: 'on' };

/** The real check ran: it refuses a number it can't read; the unregistered port lets the owner through. */
async function realCheckRegistered(): Promise<boolean> {
  return consentCheckRegistered() && (await consentBlocks('', 'sms', async () => true, ON)) !== null;
}

afterEach(() => registerConsentCheck(undefined));

describe('the consent check is registered in every process that sends', () => {
  it('the UI server (installUiServerPorts, at start-up)', async () => {
    expect(await realCheckRegistered()).toBe(false);
    installUiServerPorts();
    expect(await realCheckRegistered()).toBe(true);
  });

  it('the call processes (startProcessRuntime: voice worker and per-call child)', async () => {
    expect(await realCheckRegistered()).toBe(false);
    startProcessRuntime(() => undefined).stop();
    expect(await realCheckRegistered()).toBe(true);
    for (const entry of ['src/agents/gce-voice-worker.ts', 'src/agents/gce/job-child.ts']) {
      expect(read(entry), entry).toMatch(/startProcessRuntime\(log\)/);
    }
  });

  it.each([
    'src/workers/outreach-worker.ts',
    'src/services/pubsub/worker-main.ts',
    'src/services/tool-service/server.ts',
  ])('%s registers it in main()', (entry) => {
    const main = read(entry).split(/async function main\(\)/)[1] ?? '';
    expect(main).toMatch(/\bregisterMessagingConsent\(\)/);
  });

  it('every deployed Dockerfile entry is one of the above, or sends nothing', () => {
    const checked = [
      'dist/agent.js', // imports gce-voice-worker: startProcessRuntime
      'dist/servers/api/index.js', // installUiServerPorts
      'src/workers/outreach-worker.ts',
      'src/services/pubsub/worker-main.ts',
      'dist/services/tool-service/server.js',
    ];
    // Persona and context reads only; the landing token server is plain JS outside src/.
    const sendsNothing = [
      'dist/services/persona-service/server.js',
      'dist/services/context-service/server.js',
      'token-server.js',
    ];
    const dockerfiles = [
      ...readdirSync(join(ROOT, 'docker')).map((f) => `docker/${f}`),
      ...readdirSync(ROOT).filter((f) => f.startsWith('Dockerfile')),
    ].filter((f) => /Dockerfile/.test(f));
    const entries = dockerfiles.flatMap((f) =>
      [...read(f).matchAll(/^CMD \[(.*)\]$/gm)].map((m) => {
        const args = JSON.parse(`[${m[1]}]`) as string[];
        return args.find((a) => /\.(js|ts)$/.test(a)) ?? '';
      })
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect([...checked, ...sendsNothing], entry).toContain(entry);
  });
});
