/**
 * Custom agents can't be called yet, so their entry points stay hidden until
 * VITE_CUSTOM_AGENTS_UI=true: the marketplace's My Creations tab and the
 * journal panel's Create buttons. The panel still lists journals people made.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const agents = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
const twin = { id: 'twin-1', type: 'twin', name: 'Sam', displayName: 'Sam', memories: {} };

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('../../src/services/custom-agent.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/custom-agent.service.js')>()),
  listCustomAgents: vi.fn(async () => agents.list),
}));
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

const { openMarketplace, closeMarketplace } = await import('../../src/ui/marketplace.ui.js');
const { openDigitalTwinUI, closeDigitalTwinUI, isDigitalTwinUIOpen } = await import(
  '../../src/ui/digital-twin.ui.js'
);

const creationsTab = () => document.querySelector('.marketplace-tab[data-tab="creations"]');
// The panel is a module singleton and the body is emptied between tests, so keep
// the element from the first open (as digital-twin-capture-flag.test.ts does).
let panel: Element | null = null;
const twinPanel = () => (panel ??= document.querySelector('.digital-twin-modal'));
const createButtons = () => twinPanel()?.querySelectorAll('[data-action="create"]').length ?? 0;

afterEach(() => {
  closeMarketplace();
  closeDigitalTwinUI();
  vi.unstubAllEnvs();
  document.body.replaceChildren();
});

describe('My Creations tab', () => {
  it('is not drawn while VITE_CUSTOM_AGENTS_UI is off', async () => {
    await openMarketplace();
    expect(document.querySelector('.marketplace-tab[data-tab="browse"]')).not.toBeNull();
    expect(creationsTab()).toBeNull();
  });

  it('is drawn when VITE_CUSTOM_AGENTS_UI=true', async () => {
    vi.stubEnv('VITE_CUSTOM_AGENTS_UI', 'true');
    await openMarketplace();
    expect(creationsTab()).not.toBeNull();
  });
});

describe('journal panel', () => {
  it('lists existing journals but offers no Create while off', async () => {
    agents.list = [twin];
    await openDigitalTwinUI();
    expect(twinPanel()?.querySelector('.digital-twin-card')).not.toBeNull();
    expect(createButtons()).toBe(0);
  });

  it("doesn't stay open empty while off", async () => {
    agents.list = [];
    await openDigitalTwinUI();
    expect(isDigitalTwinUIOpen()).toBe(false);
  });

  it('offers Create, empty or not, when VITE_CUSTOM_AGENTS_UI=true', async () => {
    vi.stubEnv('VITE_CUSTOM_AGENTS_UI', 'true');
    agents.list = [];
    await openDigitalTwinUI();
    expect(isDigitalTwinUIOpen()).toBe(true);
    expect(createButtons()).toBe(1);
    closeDigitalTwinUI();
    agents.list = [twin];
    await openDigitalTwinUI();
    expect(createButtons()).toBe(1);
  });
});
