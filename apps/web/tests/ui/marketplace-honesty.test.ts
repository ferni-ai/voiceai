/**
 * Meet More Friends shows no invented ratings and no friends who can't come.
 *
 * The registry rated all 15 agents 5.0 with 0 downloads, so every card showed
 * five stars nobody gave. None of the 15 has a persona bundle (an unknown id
 * resolves to Ferni), so the server now lists none of them, and the panel says
 * plainly that there's nobody new yet instead of "No matches yet" or
 * "0 coaches waiting".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registry = vi.hoisted(() => ({ agents: [] as Array<Record<string, unknown>> }));
const team = vi.hoisted(() => ({ full: true }));

vi.mock('../../src/services/marketplace.service.js', () => {
  const service = {
    syncInstalledAgents: vi.fn(async () => undefined),
    getInstalledAgentIds: vi.fn(() => new Set<string>()),
    getInstalledAgents: vi.fn(() => []),
    getAvailableAgents: vi.fn(async () => registry.agents),
    searchAgents: vi.fn(async () => registry.agents),
    getAgentsByCategory: vi.fn(async () => registry.agents),
    fetchRegistry: vi.fn(async () => ({ agents: registry.agents, categories: [] })),
  };
  return { marketplaceService: service, default: service };
});

vi.mock('../../src/services/team-unlock.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/team-unlock.service.js')>()),
  isFullTeamUnlocked: () => team.full,
}));

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openMarketplace, closeMarketplace } = await import('../../src/ui/marketplace.ui.js');

function agent(id: string): Record<string, unknown> {
  return {
    id,
    name: 'Moxie',
    display_name: 'Moxie',
    description: 'Accountability partner',
    short_description: 'Accountability partner',
    category: 'productivity',
    tags: ['habits'],
    icon: '',
    version: '1.0.0',
    author: 'Ferni',
    license: 'free',
    colors: { primary: '', secondary: '' },
    path: `agents/${id}`,
    rating: 5,
    reviewCount: 0,
  };
}

function emptyText(): string {
  const empty = document.querySelector<HTMLElement>('.marketplace-empty');
  return empty && empty.style.display !== 'none' ? (empty.textContent ?? '') : '';
}

describe('Meet More Friends', () => {
  beforeEach(() => {
    registry.agents = [];
    team.full = true;
  });

  afterEach(() => {
    closeMarketplace();
    document.body.replaceChildren();
  });

  it('says plainly that nobody new can join yet', async () => {
    await openMarketplace();
    expect(emptyText()).toContain('Nobody new to meet yet.');
    expect(emptyText()).toContain('For now, talk with your team.'); // always a path
    expect(emptyText()).not.toContain('No matches yet');
  });

  it('shows no "coaches waiting" preview for nobody while the team is still locked', async () => {
    team.full = false;
    await openMarketplace();
    expect(document.body.textContent).not.toMatch(/coaches? waiting/i);
    expect(emptyText()).toContain('Nobody new to meet yet.');
  });

  it('shows no star rating on a card', async () => {
    registry.agents = [agent('moxie-accountability')];
    await openMarketplace();
    expect(document.querySelector('.marketplace-agent')).not.toBeNull();
    expect(document.querySelector('.agent-rating')).toBeNull();
    expect(document.querySelector('.rating-stars')).toBeNull();
  });
});
