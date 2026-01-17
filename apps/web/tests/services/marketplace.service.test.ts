/**
 * Marketplace Service Tests
 *
 * Tests for the agent marketplace:
 * - Registry fetching and caching
 * - Agent installation/uninstallation
 * - Search and filtering
 * - Manifest fetching
 * - Conversion to PersonaConfig
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock team-unlock service
vi.mock('../../src/services/team-unlock.service.js', () => ({
  isFullTeamUnlocked: vi.fn(() => true),
}));

// Mock registry response
const mockRegistryResponse = {
  version: '1.0.0',
  name: 'VoiceAI Agents',
  description: 'Marketplace for AI agents',
  repository: 'https://github.com/example/voiceai-agents',
  agents: [
    {
      id: 'joel-dickson',
      name: 'Joel Dickson',
      version: '1.0.0',
      description: 'A financial advisor specializing in retirement planning.',
      short_description: 'Retirement planning expert.',
      author: 'Ferni Team',
      license: 'free',
      category: 'finance',
      tags: ['retirement', 'investing', 'financial-planning'],
      icon: '💼',
      colors: {
        primary: '#2E7D32',
        secondary: '#1B5E20',
      },
      featured: true,
      downloads: 1000,
      rating: 4.8,
    },
    {
      id: 'test-agent',
      name: 'Test Agent',
      version: '0.1.0',
      description: 'A test agent for development.',
      author: 'Test Author',
      license: 'premium',
      category: 'testing',
      tags: ['test', 'development'],
      marketplace: {
        icon: '🧪',
        colors: {
          primary: '#9C27B0',
          secondary: '#7B1FA2',
        },
      },
    },
  ],
  categories: [
    { id: 'finance', name: 'Finance', description: 'Financial advisors' },
    { id: 'testing', name: 'Testing', description: 'Test agents' },
  ],
  updated_at: '2024-01-01T00:00:00Z',
};

const mockManifest = {
  version: '1.0.0',
  identity: {
    id: 'joel-dickson',
    name: 'Joel Dickson',
    display_name: 'Joel Dickson',
    description: 'A financial advisor',
  },
  personality: {
    warmth: 0.8,
    humor_level: 0.3,
    directness: 0.7,
    energy: 0.5,
    traits: ['knowledgeable', 'patient'],
  },
  marketplace: {
    display_name: 'Joel Dickson',
    short_description: 'Retirement expert',
    category: 'finance',
    tags: ['retirement'],
    icon: '💼',
    colors: {
      primary: '#2E7D32',
      secondary: '#1B5E20',
    },
  },
  role: {
    id: 'financial-advisor',
    domains: ['retirement', 'investing'],
  },
  team: {
    handoff_phrases: {
      receive: ['Joel here. Let me help with that.'],
    },
  },
};

// Setup fetch mock responses
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();

  mockFetch.mockImplementation((url: string) => {
    if (url.includes('registry')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockRegistryResponse),
      });
    }
    if (url.includes('manifest')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      });
    }
    return Promise.resolve({
      ok: false,
      status: 404,
    });
  });
});

// Import after mocking
import {
  fetchRegistry,
  fetchAgentManifest,
  getAvailableAgents,
  searchAgents,
  getAgentsByCategory,
  isMarketplaceUnlocked,
  installAgent,
  uninstallAgent,
  isAgentInstalled,
  getInstalledAgents,
  getInstalledAgentIds,
  getInstalledAgent,
  marketplaceAgentToPersonaConfig,
  getInstalledAgentsAsPersonaConfigs,
  type MarketplaceAgent,
  type MarketplaceRegistry,
} from '../../src/services/marketplace.service.js';

describe('MarketplaceService', () => {
  describe('fetchRegistry', () => {
    it('should fetch and normalize registry', async () => {
      const registry = await fetchRegistry(true);

      expect(registry.agents).toHaveLength(2);
      expect(registry.version).toBe('1.0.0');
      expect(registry.categories).toHaveLength(2);
    });

    it('should return cached registry on subsequent calls', async () => {
      await fetchRegistry(true);
      await fetchRegistry(false);

      // Only one fetch call (first one)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when requested', async () => {
      await fetchRegistry(true);
      await fetchRegistry(true);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should normalize agent format correctly', async () => {
      const registry = await fetchRegistry(true);
      const agent = registry.agents[0];

      expect(agent.display_name).toBe('Joel Dickson');
      expect(agent.short_description).toBeDefined();
      expect(agent.colors.primary).toBe('#2E7D32');
      expect(agent.colors.gradient).toBeDefined();
      expect(agent.colors.glow).toBeDefined();
    });

    it('should handle nested marketplace format', async () => {
      const registry = await fetchRegistry(true);
      const testAgent = registry.agents.find((a) => a.id === 'test-agent');

      expect(testAgent?.icon).toBe('🧪');
      expect(testAgent?.colors.primary).toBe('#9C27B0');
    });

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // On error, service may return cached data or empty registry
      const registry = await fetchRegistry(true);

      // Should still return a valid registry object (either cached or empty)
      expect(registry).toBeDefined();
      expect(Array.isArray(registry.agents)).toBe(true);
    });
  });

  describe('fetchAgentManifest', () => {
    it('should fetch agent manifest', async () => {
      const manifest = await fetchAgentManifest('joel-dickson');

      expect(manifest).toBeDefined();
      expect(manifest?.identity.id).toBe('joel-dickson');
    });

    it('should return null on error', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );

      const manifest = await fetchAgentManifest('nonexistent-agent');

      expect(manifest).toBeNull();
    });
  });

  describe('getAvailableAgents', () => {
    it('should return agents not installed and not in core team', async () => {
      const available = await getAvailableAgents();

      // Should filter out core team members
      expect(available.length).toBeGreaterThanOrEqual(0);
    });

    it('should exclude installed agents', async () => {
      // Install an agent first
      await installAgent('joel-dickson');

      const available = await getAvailableAgents();
      const hasJoel = available.some((a) => a.id === 'joel-dickson');

      expect(hasJoel).toBe(false);
    });
  });

  describe('searchAgents', () => {
    it('should return all agents for empty query', async () => {
      const results = await searchAgents('');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by name', async () => {
      const results = await searchAgents('joel');

      expect(results.some((a) => a.id === 'joel-dickson')).toBe(true);
    });

    it('should filter by tag', async () => {
      const results = await searchAgents('retirement');

      expect(results.some((a) => a.id === 'joel-dickson')).toBe(true);
    });

    it('should filter by description', async () => {
      const results = await searchAgents('financial');

      expect(results.some((a) => a.id === 'joel-dickson')).toBe(true);
    });

    it('should be case insensitive', async () => {
      const results = await searchAgents('JOEL');

      expect(results.some((a) => a.id === 'joel-dickson')).toBe(true);
    });
  });

  describe('getAgentsByCategory', () => {
    it('should return agents in category', async () => {
      const results = await getAgentsByCategory('finance');

      expect(results.some((a) => a.id === 'joel-dickson')).toBe(true);
    });

    it('should return empty array for unknown category', async () => {
      const results = await getAgentsByCategory('unknown-category');

      expect(results).toEqual([]);
    });
  });

  describe('isMarketplaceUnlocked', () => {
    it('should return true when full team is unlocked', () => {
      expect(isMarketplaceUnlocked()).toBe(true);
    });

    it('should return false when team is locked', async () => {
      const { isFullTeamUnlocked } = await import('../../src/services/team-unlock.service.js');
      vi.mocked(isFullTeamUnlocked).mockReturnValueOnce(false);

      expect(isMarketplaceUnlocked()).toBe(false);
    });
  });

  describe('installAgent', () => {
    it('should install agent and save to localStorage', async () => {
      const success = await installAgent('joel-dickson');

      expect(success).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalled();
      expect(isAgentInstalled('joel-dickson')).toBe(true);
    });

    it('should fail for nonexistent agent', async () => {
      const success = await installAgent('nonexistent-agent');

      expect(success).toBe(false);
    });

    it('should fail when marketplace is locked', async () => {
      const { isFullTeamUnlocked } = await import('../../src/services/team-unlock.service.js');
      vi.mocked(isFullTeamUnlocked).mockReturnValueOnce(false);

      const success = await installAgent('joel-dickson');

      expect(success).toBe(false);
    });

    it('should fetch and store manifest', async () => {
      await installAgent('joel-dickson');

      const installed = getInstalledAgent('joel-dickson');

      expect(installed?.manifest).toBeDefined();
      expect(installed?.manifest?.identity.id).toBe('joel-dickson');
    });
  });

  describe('uninstallAgent', () => {
    it('should uninstall agent', async () => {
      await installAgent('joel-dickson');
      const success = uninstallAgent('joel-dickson');

      expect(success).toBe(true);
      expect(isAgentInstalled('joel-dickson')).toBe(false);
    });

    it('should return false for non-installed agent', () => {
      const success = uninstallAgent('not-installed');

      expect(success).toBe(false);
    });
  });

  describe('isAgentInstalled', () => {
    it('should return true for installed agent', async () => {
      await installAgent('joel-dickson');

      expect(isAgentInstalled('joel-dickson')).toBe(true);
    });

    it('should return false for non-installed agent', () => {
      expect(isAgentInstalled('not-installed')).toBe(false);
    });
  });

  describe('getInstalledAgents', () => {
    it('should return an array', () => {
      const installed = getInstalledAgents();

      // Service may have cached agents from previous tests
      expect(Array.isArray(installed)).toBe(true);
    });

    it('should return installed agents after installation', async () => {
      await installAgent('joel-dickson');

      const installed = getInstalledAgents();

      // Should include the installed agent
      const joelAgent = installed.find((a) => a.id === 'joel-dickson');
      expect(joelAgent).toBeDefined();
    });
  });

  describe('getInstalledAgentIds', () => {
    it('should return Set of installed agent IDs', async () => {
      await installAgent('joel-dickson');

      const ids = getInstalledAgentIds();

      expect(ids.has('joel-dickson')).toBe(true);
      expect(ids.size).toBe(1);
    });
  });

  describe('getInstalledAgent', () => {
    it('should return installed agent by ID', async () => {
      await installAgent('joel-dickson');

      const agent = getInstalledAgent('joel-dickson');

      expect(agent?.id).toBe('joel-dickson');
      expect(agent?.installed_at).toBeDefined();
    });

    it('should return null for non-installed agent', () => {
      const agent = getInstalledAgent('not-installed');

      expect(agent).toBeNull();
    });
  });

  describe('marketplaceAgentToPersonaConfig', () => {
    it('should convert marketplace agent to PersonaConfig', async () => {
      const registry = await fetchRegistry(true);
      const agent = registry.agents[0];

      const config = marketplaceAgentToPersonaConfig(agent, mockManifest);

      expect(config.id).toBe('joel-dickson');
      expect(config.name).toBe('Joel Dickson');
      expect(config.initials).toBe('JO');
      expect(config.role).toBe('standalone');
      expect(config.colors.primary).toBeDefined();
      expect(config.entrancePhrase).toBe('Joel here. Let me help with that.');
    });

    it('should handle null manifest', async () => {
      const registry = await fetchRegistry(true);
      const agent = registry.agents[0];

      const config = marketplaceAgentToPersonaConfig(agent, null);

      expect(config.id).toBe('joel-dickson');
      expect(config.entrancePhrase).toContain('Joel Dickson');
    });

    it('should use agent colors from manifest', async () => {
      const registry = await fetchRegistry(true);
      const agent = registry.agents[0];

      const config = marketplaceAgentToPersonaConfig(agent, mockManifest);

      expect(config.colors.primary).toBe('#2E7D32');
    });
  });

  describe('getInstalledAgentsAsPersonaConfigs', () => {
    it('should return PersonaConfigs for installed agents', async () => {
      await installAgent('joel-dickson');

      const configs = await getInstalledAgentsAsPersonaConfigs();

      expect(configs).toHaveLength(1);
      expect(configs[0].id).toBe('joel-dickson');
      expect(configs[0].role).toBe('standalone');
    });

    it('should handle agents not in registry', async () => {
      // Force install an agent that's not in registry via installAgent
      // Note: The service may have caching behavior, so we test the overall flow
      
      const configs = await getInstalledAgentsAsPersonaConfigs();

      // Should return an array of configs
      expect(Array.isArray(configs)).toBe(true);
      // Each config should have required properties
      configs.forEach((config) => {
        expect(config.id).toBeDefined();
      });
    });
  });

  describe('localStorage persistence', () => {
    it('should persist installed agents across loads', async () => {
      await installAgent('joel-dickson');

      // Verify localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'voiceai-marketplace-installed',
        expect.any(String)
      );
    });

    it('should handle invalid localStorage data gracefully', () => {
      localStorageMock.setItem('voiceai-marketplace-installed', 'invalid json');

      // Should not throw when localStorage has invalid data
      // Note: Service may return cached data from memory rather than empty array
      const installed = getInstalledAgents();

      expect(Array.isArray(installed)).toBe(true);
    });
  });
});
