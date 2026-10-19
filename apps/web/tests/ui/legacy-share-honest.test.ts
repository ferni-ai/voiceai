/**
 * Family sharing for a Legacy friend never pretends to invite anyone.
 *
 * Nothing backs it: no endpoint sends an invite and /legacy/invite/<id> has no
 * route. The modal logged the invitee's email and then said "Invite sent to
 * <email>!". Now VITE_LEGACY_SHARING (off by default) hides the Share button
 * and keeps the modal shut, and even with it on, Send says nothing was sent
 * and keeps the address out of the logs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EMAIL = 'aunt.sarah@example.com';

const toasts = vi.hoisted(() => ({ calls: [] as Array<{ kind: string; text: string }> }));
const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('../../src/ui/whisper.ui.js', async (importOriginal) => {
  const record = (kind: string) => (text: string) => {
    toasts.calls.push({ kind, text });
  };
  const toast = {
    info: record('info'),
    success: record('success'),
    warning: record('warning'),
    error: record('error'),
  };
  return { ...(await importOriginal<object>()), toast };
});

vi.mock('../../src/utils/logger.js', async (importOriginal) => {
  const record = (...args: unknown[]) => {
    logged.calls.push(args);
  };
  const logger = { debug: record, info: record, warn: record, error: record };
  return { ...(await importOriginal<object>()), createLogger: () => logger };
});

vi.mock('../../src/services/marketplace.service.js', () => {
  const service = {
    syncInstalledAgents: vi.fn(async () => undefined),
    getInstalledAgentIds: vi.fn(() => new Set<string>()),
    getInstalledAgents: vi.fn(() => []),
    getAvailableAgents: vi.fn(async () => []),
    searchAgents: vi.fn(async () => []),
    getAgentsByCategory: vi.fn(async () => []),
    fetchRegistry: vi.fn(async () => ({ agents: [], categories: [] })),
  };
  return { marketplaceService: service, default: service };
});

vi.mock('../../src/services/team-unlock.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/team-unlock.service.js')>()),
  isFullTeamUnlocked: () => true,
}));

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const legacyAgent = vi.hoisted(() => ({
  id: 'legacy-grandpa',
  userId: 'u1',
  name: 'Grandpa Joe',
  displayName: 'Grandpa Joe',
  description: 'Stories from the farm',
  type: 'legacy',
  status: 'active',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  voice: { type: 'selected', status: 'ready' },
  personality: {},
  memories: { stories: [], wisdom: [], sharedMoments: [] },
  behaviors: {},
  privacy: 'private',
}));

vi.mock('../../src/services/custom-agent.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/custom-agent.service.js')>()),
  listCustomAgents: vi.fn(async () => [legacyAgent]),
  getCustomAgent: vi.fn(async () => legacyAgent),
}));

const { openMarketplace, closeMarketplace } = await import('../../src/ui/marketplace.ui.js');
const { openLegacyShare } = await import('../../src/ui/legacy-share.ui.js');

async function showCreations(): Promise<HTMLElement> {
  await openMarketplace();
  document.querySelector<HTMLElement>('.marketplace-tab[data-tab="creations"]')?.click();
  return vi.waitFor(() => {
    const card = document.querySelector<HTMLElement>('.custom-agent-card');
    if (!card) throw new Error('creations tab not rendered yet');
    return card;
  });
}

function shareModal(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.legacy-share-overlay');
}

describe('Legacy family sharing', () => {
  let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(() => {
    vi.stubEnv('VITE_CUSTOM_AGENTS_UI', 'true'); // My Creations is behind this flag
    toasts.calls = [];
    logged.calls = [];
    consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
  });

  afterEach(() => {
    closeMarketplace();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('draws no Share button on a Legacy card while off', async () => {
    const card = await showCreations();
    expect(card.querySelector('[data-action="talk-to-legacy"]')).not.toBeNull(); // the card rendered
    expect(card.querySelector('[data-action="share-legacy"]')).toBeNull();
  });

  it('opens no invite modal while off, whoever asks', async () => {
    await openLegacyShare(legacyAgent.id);
    expect(shareModal()).toBeNull();
    expect(document.body.textContent).not.toMatch(/invite sent/i);
  });

  it('draws the Share button when VITE_LEGACY_SHARING=true', async () => {
    vi.stubEnv('VITE_LEGACY_SHARING', 'true');
    const card = await showCreations();
    expect(card.querySelector('[data-action="share-legacy"]')).not.toBeNull();
  });

  it('says no invite was sent, and never "Invite sent", when Send is pressed', async () => {
    vi.stubEnv('VITE_LEGACY_SHARING', 'true');
    await openLegacyShare(legacyAgent.id);
    expect(shareModal()).not.toBeNull();

    shareModal()!.querySelector<HTMLInputElement>('#invite-email')!.value = EMAIL;
    shareModal()!.querySelector<HTMLButtonElement>('[data-action="send-invite"]')!.click();

    await vi.waitFor(() => expect(toasts.calls.length).toBeGreaterThan(0));
    expect(toasts.calls.filter((c) => c.kind === 'success')).toEqual([]);
    expect(toasts.calls.map((c) => c.text).join(' ')).not.toMatch(/invite sent/i);
    expect(toasts.calls.map((c) => c.text)).toContain(
      "Family sharing isn't ready yet, so no invite was sent."
    );
  });

  it('never logs the invitee email, to the logger or the console', async () => {
    vi.stubEnv('VITE_LEGACY_SHARING', 'true');
    await openLegacyShare(legacyAgent.id);
    shareModal()!.querySelector<HTMLInputElement>('#invite-email')!.value = EMAIL;
    shareModal()!.querySelector<HTMLButtonElement>('[data-action="send-invite"]')!.click();
    await vi.waitFor(() => expect(toasts.calls.length).toBeGreaterThan(0));

    const mentionsEmail = (args: unknown[]) => args.some((a) => String(a).includes(EMAIL));
    expect(logged.calls.filter(mentionsEmail)).toEqual([]);
    for (const spy of consoleSpies) {
      expect(spy.mock.calls.filter(mentionsEmail)).toEqual([]);
    }
  });
});
