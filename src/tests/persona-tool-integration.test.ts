/**
 * Persona Tool Integration Tests
 *
 * Validates that persona configurations match the actual tool registry.
 * This prevents mismatches between:
 * 1. function-calling.md tool names
 * 2. persona.manifest.json required/optional tools
 * 3. runtime-enforcement.ts DOMAIN_OWNERSHIP
 * 4. Actual tool IDs in the registry
 *
 * Run with: pnpm vitest run src/tests/persona-tool-integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBundleById } from '../personas/bundles/loader.js';
import { autoRegisterAllDomains, initializeToolRegistry } from '../tools/registry/loader.js';
import { toolRegistry } from '../tools/registry/index.js';
import { DOMAIN_OWNERSHIP } from '../tools/runtime-enforcement.js';
import type { ToolDomain } from '../tools/registry/types.js';

// All team personas
const TEAM_PERSONAS = [
  'ferni',
  'peter-john',
  'maya-santos',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
];

// Registry should be initialized before all tests
beforeAll(async () => {
  await autoRegisterAllDomains();
  await initializeToolRegistry({ lazyLoading: false });
}, 30000);

afterAll(() => {
  toolRegistry.clear();
});

describe('Persona Tool Integration', () => {
  describe('Manifest Tool Validation', () => {
    it.each(TEAM_PERSONAS)('%s: required tools exist in registry', async (personaId) => {
      const bundle = await loadBundleById(personaId);
      expect(bundle, `Bundle not found for ${personaId}`).toBeDefined();

      const { manifest } = bundle!;
      const requiredTools = manifest.tools?.required || [];
      const registeredTools = toolRegistry.getAll().map((t) => t.id);

      const missingTools = requiredTools.filter(
        (toolId: string) => !registeredTools.includes(toolId)
      );

      expect(
        missingTools,
        `${personaId} requires tools that don't exist in registry: ${missingTools.join(', ')}`
      ).toHaveLength(0);
    });

    it.each(TEAM_PERSONAS)('%s: optional tools exist in registry', async (personaId) => {
      const bundle = await loadBundleById(personaId);
      expect(bundle, `Bundle not found for ${personaId}`).toBeDefined();

      const { manifest } = bundle!;
      const optionalTools = manifest.tools?.optional || [];
      const registeredTools = toolRegistry.getAll().map((t) => t.id);

      const missingTools = optionalTools.filter(
        (toolId: string) => !registeredTools.includes(toolId)
      );

      // Just warn for optional tools (they might be experimental)
      if (missingTools.length > 0) {
        console.warn(`${personaId}: Optional tools not in registry: ${missingTools.join(', ')}`);
      }
    });

    it.each(TEAM_PERSONAS)('%s: domains in manifest are valid', async (personaId) => {
      const bundle = await loadBundleById(personaId);
      expect(bundle, `Bundle not found for ${personaId}`).toBeDefined();

      const { manifest } = bundle!;
      const domains = manifest.tools?.domains || [];

      // Get all valid domains from registry
      const validDomains = new Set(toolRegistry.getAll().map((t) => t.domain));

      const invalidDomains = domains.filter((d: string) => !validDomains.has(d as ToolDomain));

      expect(
        invalidDomains,
        `${personaId} has invalid domains: ${invalidDomains.join(', ')}`
      ).toHaveLength(0);
    });
  });

  describe('Runtime Enforcement Validation', () => {
    it('all DOMAIN_OWNERSHIP tools exist in registry', () => {
      const registeredTools = new Set(toolRegistry.getAll().map((t) => t.id));

      for (const [personaId, tools] of Object.entries(DOMAIN_OWNERSHIP)) {
        const missingTools = tools.filter((toolId) => !registeredTools.has(toolId));

        expect(
          missingTools,
          `DOMAIN_OWNERSHIP for ${personaId} has tools that don't exist in registry: ${missingTools.join(', ')}`
        ).toHaveLength(0);
      }
    });

    it('DOMAIN_OWNERSHIP personas exist', () => {
      const domainOwnershipPersonas = Object.keys(DOMAIN_OWNERSHIP);

      // At minimum, all team personas should be in DOMAIN_OWNERSHIP
      for (const personaId of TEAM_PERSONAS) {
        expect(domainOwnershipPersonas, `${personaId} not found in DOMAIN_OWNERSHIP`).toContain(
          personaId
        );
      }
    });
  });

  describe('Tool Registry Consistency', () => {
    it('all required tools from all personas are in registry', async () => {
      const allRequiredTools = new Set<string>();

      for (const personaId of TEAM_PERSONAS) {
        const bundle = await loadBundleById(personaId);
        if (bundle?.manifest?.tools?.required) {
          for (const tool of bundle.manifest.tools.required) {
            allRequiredTools.add(tool);
          }
        }
      }

      const registeredTools = new Set(toolRegistry.getAll().map((t) => t.id));

      for (const toolId of allRequiredTools) {
        expect(registeredTools.has(toolId), `Required tool ${toolId} not found in registry`).toBe(
          true
        );
      }
    });

    it('research domain has expected tools for Peter', () => {
      const researchTools = toolRegistry.getByDomain('research');
      const toolIds = researchTools.map((t) => t.id);

      // Peter needs these core tools
      const expectedTools = ['analyzeStock', 'findStocks', 'marketData', 'analyzePatterns'];

      for (const expected of expectedTools) {
        expect(toolIds, `Research domain missing expected tool: ${expected}`).toContain(expected);
      }
    });

    it('habits domain has expected tools for Maya', () => {
      const habitsTools = toolRegistry.getByDomain('habits');
      const toolIds = habitsTools.map((t) => t.id);

      const expectedTools = ['createHabit', 'getHabits', 'logHabitCompletion', 'habitCheckIn'];

      for (const expected of expectedTools) {
        expect(toolIds, `Habits domain missing expected tool: ${expected}`).toContain(expected);
      }
    });

    it('communication domain has expected tools for Alex', () => {
      const commTools = toolRegistry.getByDomain('communication');
      const toolIds = commTools.map((t) => t.id);

      const expectedTools = ['sendMessage', 'draftMessage', 'analyzeMessage', 'scheduleReminder'];

      for (const expected of expectedTools) {
        expect(toolIds, `Communication domain missing expected tool: ${expected}`).toContain(
          expected
        );
      }
    });

    it('information domain has expected shared tools', () => {
      const infoTools = toolRegistry.getByDomain('information');
      const toolIds = infoTools.map((t) => t.id);

      // NOTE: searchWeb was removed - now handled by Gemini's built-in Google Search
      const expectedTools = ['getNews', 'getWeather', 'getSports'];

      for (const expected of expectedTools) {
        expect(toolIds, `Information domain missing expected tool: ${expected}`).toContain(
          expected
        );
      }
    });
  });

  describe('Tool Building Integration', () => {
    it('can build tools for Peter with research domain', async () => {
      const bundle = await loadBundleById('peter-john');
      expect(bundle).toBeDefined();

      const domains = bundle!.manifest.tools?.domains || [];
      expect(domains).toContain('research');
      expect(domains).toContain('information');

      // Build tools for Peter's domains
      const allTools: string[] = [];
      for (const domain of domains) {
        const domainTools = toolRegistry.getByDomain(domain as ToolDomain);
        allTools.push(...domainTools.map((t) => t.id));
      }

      // Peter should have access to stock analysis tools
      expect(allTools).toContain('analyzeStock');
      expect(allTools).toContain('marketData');

      // Peter should also have access to information tools (weather, news)
      expect(allTools).toContain('getNews');
      expect(allTools).toContain('getWeather');
    });

    it('can build tools for Maya with habits domain', async () => {
      const bundle = await loadBundleById('maya-santos');
      expect(bundle).toBeDefined();

      const domains = bundle!.manifest.tools?.domains || [];
      expect(domains).toContain('habits');

      const allTools: string[] = [];
      for (const domain of domains) {
        const domainTools = toolRegistry.getByDomain(domain as ToolDomain);
        allTools.push(...domainTools.map((t) => t.id));
      }

      expect(allTools).toContain('createHabit');
      expect(allTools).toContain('habitCoach');
    });

    it('can build tools for Alex with communication domain', async () => {
      const bundle = await loadBundleById('alex-chen');
      expect(bundle).toBeDefined();

      const domains = bundle!.manifest.tools?.domains || [];
      expect(domains).toContain('communication');
      expect(domains).toContain('calendar');

      const allTools: string[] = [];
      for (const domain of domains) {
        const domainTools = toolRegistry.getByDomain(domain as ToolDomain);
        allTools.push(...domainTools.map((t) => t.id));
      }

      expect(allTools).toContain('sendMessage');
      expect(allTools).toContain('draftMessage');
      expect(allTools).toContain('manageAppointment');
    });
  });
});

describe('Cross-Persona Tool Conflicts', () => {
  it('forbidden tools in one persona are owned by others', async () => {
    // Get all forbidden tools and check if they're owned by another persona
    for (const personaId of TEAM_PERSONAS) {
      const bundle = await loadBundleById(personaId);
      const forbidden = bundle?.manifest?.tools?.forbidden || [];

      for (const toolId of forbidden) {
        // Check if any other persona owns this tool
        const owners = Object.entries(DOMAIN_OWNERSHIP)
          .filter(([, tools]) => tools.includes(toolId))
          .map(([owner]) => owner);

        // If the tool exists in DOMAIN_OWNERSHIP, it should be owned by someone else
        if (owners.length > 0) {
          expect(
            owners,
            `${personaId} forbids ${toolId} but it's not assigned to anyone`
          ).not.toContain(personaId);
        }
      }
    }
  });
});
