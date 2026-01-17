/**
 * Tests for Advanced Tool Systems
 *
 * Tests:
 * - Dynamic tool loading based on conversation context
 * - A/B testing framework
 * - Semantic routing
 * - Deprecation management
 * - Version tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// DYNAMIC TOOL LOADER TESTS
// ============================================================================

describe('DynamicToolLoader', () => {
  // We'll import dynamically to avoid initialization issues
  let DynamicToolLoader: typeof import('../tools/dynamic-loader.js').DynamicToolLoader;

  beforeEach(async () => {
    const module = await import('../tools/dynamic-loader.js');
    DynamicToolLoader = module.DynamicToolLoader;
  });

  describe('Topic Detection', () => {
    it('detects financial topics from user messages', () => {
      const loader = new DynamicToolLoader();
      const result = loader.detectTopics('I need help with my budget and savings');

      expect(result.detectedTopics).toContain('budget');
      expect(result.detectedTopics).toContain('savings');
      expect(result.suggestedDomains).toContain('finance');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects wellness topics', () => {
      const loader = new DynamicToolLoader();
      const result = loader.detectTopics(
        'I have been feeling stressed lately and it affects my health'
      );

      expect(result.detectedTopics).toContain('stress');
      expect(result.suggestedDomains).toContain('wellness');
    });

    it('detects entertainment topics', () => {
      const loader = new DynamicToolLoader();
      const result = loader.detectTopics('Can you play some music for me?');

      expect(result.detectedTopics).toContain('music');
      expect(result.suggestedDomains).toContain('entertainment');
    });

    it('detects relationship topics', () => {
      const loader = new DynamicToolLoader();
      const result = loader.detectTopics('I had a conflict with my partner');

      expect(result.detectedTopics).toContain('conflict');
      expect(result.detectedTopics).toContain('partner');
      expect(result.suggestedDomains).toContain('relationships');
    });

    it('returns empty results for unrelated messages', () => {
      const loader = new DynamicToolLoader();
      // Use a message without any topic keywords
      // Avoid: today, wonder, time, happy, love, play, etc.
      const result = loader.detectTopics('Greetings! Nice to chat.');

      expect(result.detectedTopics.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('calculates confidence based on topic matches', () => {
      const loader = new DynamicToolLoader();

      // Single topic = low confidence
      const single = loader.detectTopics('I need help with my budget');
      expect(single.confidence).toBeLessThan(1);

      // Multiple topics = higher confidence
      const multiple = loader.detectTopics('I need help with budget, savings, and investments');
      expect(multiple.confidence).toBeGreaterThanOrEqual(single.confidence);
    });
  });

  describe('Domain Loading', () => {
    it('respects essential domains configuration', () => {
      const loader = new DynamicToolLoader({
        essentialDomains: ['memory', 'handoff', 'awareness'],
      });

      expect(loader['config'].essentialDomains).toContain('memory');
      expect(loader['config'].essentialDomains).toContain('handoff');
    });

    it('respects max loaded domains limit', () => {
      const loader = new DynamicToolLoader({
        maxLoadedDomains: 5,
      });

      expect(loader['config'].maxLoadedDomains).toBe(5);
    });
  });

  describe('Status', () => {
    it('reports correct status', () => {
      const loader = new DynamicToolLoader();
      const status = loader.getStatus();

      expect(status).toHaveProperty('loadedDomains');
      expect(status).toHaveProperty('totalTools');
      expect(status).toHaveProperty('config');
    });
  });
});

// ============================================================================
// A/B TESTING TESTS
// ============================================================================

describe('ABTestingService', () => {
  let ABTestingService: typeof import('../tools/ab-testing.js').ABTestingService;

  beforeEach(async () => {
    const module = await import('../tools/ab-testing.js');
    ABTestingService = module.ABTestingService;
  });

  describe('Experiment Management', () => {
    it('loads predefined experiments', () => {
      const service = new ABTestingService();
      const experiments = service.getExperiments();

      expect(experiments.length).toBeGreaterThan(0);
      expect(experiments.some((e) => e.id === 'consolidated-vs-granular')).toBe(true);
    });

    it('activates and deactivates experiments', () => {
      const service = new ABTestingService();

      // Activate
      const activated = service.activateExperiment('consolidated-vs-granular');
      expect(activated).toBe(true);

      let experiment = service.getExperiments().find((e) => e.id === 'consolidated-vs-granular');
      expect(experiment?.active).toBe(true);

      // Deactivate
      const deactivated = service.deactivateExperiment('consolidated-vs-granular');
      expect(deactivated).toBe(true);

      experiment = service.getExperiments().find((e) => e.id === 'consolidated-vs-granular');
      expect(experiment?.active).toBe(false);
    });

    it('returns active experiments only', () => {
      const service = new ABTestingService();

      // Initially none active
      let active = service.getActiveExperiments();
      expect(active.length).toBe(0);

      // Activate one
      service.activateExperiment('awareness-tools');
      active = service.getActiveExperiments();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('awareness-tools');
    });
  });

  describe('User Assignment', () => {
    it('assigns users to experiments consistently', () => {
      const service = new ABTestingService();
      service.activateExperiment('consolidated-vs-granular');

      const assignment1 = service.assignUser('user-123', 'consolidated-vs-granular');
      const assignment2 = service.assignUser('user-123', 'consolidated-vs-granular');

      // Same user should get same variant
      expect(assignment1?.variantId).toBe(assignment2?.variantId);
    });

    it('distributes users across variants', () => {
      const service = new ABTestingService();
      service.activateExperiment('consolidated-vs-granular');

      const variants = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const assignment = service.assignUser(`user-${i}`, 'consolidated-vs-granular');
        if (assignment) {
          variants.add(assignment.variantId);
        }
      }

      // Should have multiple variants used
      expect(variants.size).toBeGreaterThan(1);
    });

    it('returns null for non-existent experiments', () => {
      const service = new ABTestingService();

      const assignment = service.assignUser('user-123', 'non-existent-experiment');
      expect(assignment).toBeNull();
    });
  });

  describe('Metrics Recording', () => {
    it('records metrics for assigned users', () => {
      const service = new ABTestingService();
      service.activateExperiment('consolidated-vs-granular');
      service.assignUser('user-123', 'consolidated-vs-granular');

      // Record metric - should not throw
      expect(() => {
        service.recordMetric('user-123', 'consolidated-vs-granular', 'tool_success_rate', 1);
      }).not.toThrow();
    });

    it('generates results with recommendations', () => {
      const service = new ABTestingService();
      service.activateExperiment('consolidated-vs-granular');

      // Assign some users and record metrics
      for (let i = 0; i < 10; i++) {
        const assignment = service.assignUser(`user-${i}`, 'consolidated-vs-granular');
        if (assignment) {
          service.recordMetric(`user-${i}`, 'consolidated-vs-granular', 'tool_success_rate', i % 2);
        }
      }

      const results = service.getResults('consolidated-vs-granular');
      expect(results).not.toBeNull();
      expect(results?.totalParticipants).toBeGreaterThan(0);
      expect(results?.recommendations).toBeDefined();
    });
  });
});

// ============================================================================
// SEMANTIC ROUTER TESTS
// Note: SemanticToolRouter class was replaced with a different architecture
// in src/tools/semantic-router/. See router.ts and integration/ for current impl.
// ============================================================================

describe.skip('SemanticToolRouter (DEPRECATED - class no longer exists)', () => {
  // These tests are skipped because SemanticToolRouter was replaced
  // with a function-based architecture in src/tools/semantic-router/

  it.skip('uses default config', () => {
    // Test skipped - class does not exist
  });

  it.skip('accepts custom config', () => {
    // Test skipped - class does not exist
  });

  it.skip('clears cache', () => {
    // Test skipped - class does not exist
  });

  it.skip('reports cache stats', () => {
    // Test skipped - class does not exist
  });
});

// ============================================================================
// DEPRECATION SERVICE TESTS
// ============================================================================

describe('ToolDeprecationService', () => {
  let ToolDeprecationService: typeof import('../tools/deprecation.js').ToolDeprecationService;

  beforeEach(async () => {
    const module = await import('../tools/deprecation.js');
    ToolDeprecationService = module.ToolDeprecationService;
  });

  describe('Configuration', () => {
    it('uses default config', () => {
      const service = new ToolDeprecationService();

      expect(service['config'].unusedThresholdDays).toBe(30);
      expect(service['config'].lowUsageThreshold).toBe(5);
      expect(service['config'].highErrorRateThreshold).toBe(0.3);
    });

    it('accepts custom config', () => {
      const service = new ToolDeprecationService({
        unusedThresholdDays: 14,
        lowUsageThreshold: 10,
      });

      expect(service['config'].unusedThresholdDays).toBe(14);
      expect(service['config'].lowUsageThreshold).toBe(10);
    });
  });

  describe('Usage Tracking', () => {
    it('records tool usage', () => {
      const service = new ToolDeprecationService();

      service.recordUsage('myTool', true, 100);

      const stats = service.getUsageStats('myTool');
      expect(stats).not.toBeNull();
      expect(stats?.totalCalls).toBe(1);
      expect(stats?.successfulCalls).toBe(1);
    });

    it('tracks failures separately', () => {
      const service = new ToolDeprecationService();

      service.recordUsage('myTool', true, 100);
      service.recordUsage('myTool', false, 200);

      const stats = service.getUsageStats('myTool');
      expect(stats?.successfulCalls).toBe(1);
      expect(stats?.failedCalls).toBe(1);
      expect(stats?.totalCalls).toBe(2);
    });

    it('calculates average latency', () => {
      const service = new ToolDeprecationService();

      service.recordUsage('myTool', true, 100);
      service.recordUsage('myTool', true, 200);
      service.recordUsage('myTool', true, 300);

      const stats = service.getUsageStats('myTool');
      expect(stats?.averageLatencyMs).toBe(200);
    });
  });

  describe('Deprecation Management', () => {
    it('flags tools for deprecation', () => {
      const service = new ToolDeprecationService();

      const record = service.flagForDeprecation('oldTool', 'memory', 'unused');

      expect(record.status).toBe('flagged');
      expect(record.reason).toBe('unused');
      expect(service.getFlagged().length).toBe(1);
    });

    it('deprecates flagged tools', () => {
      const service = new ToolDeprecationService();

      service.flagForDeprecation('oldTool', 'memory', 'unused');
      const record = service.deprecate('oldTool');

      expect(record?.status).toBe('deprecated');
      expect(record?.sunsetsAt).not.toBeNull();
    });

    it('sunsets deprecated tools', () => {
      const service = new ToolDeprecationService();

      service.flagForDeprecation('oldTool', 'memory', 'unused');
      service.deprecate('oldTool');
      const record = service.sunset('oldTool');

      expect(record?.status).toBe('sunset');
    });

    it('supports undeprecation', () => {
      const service = new ToolDeprecationService();

      service.flagForDeprecation('oldTool', 'memory', 'unused');
      service.deprecate('oldTool');
      const result = service.undeprecate('oldTool');

      expect(result).toBe(true);
      expect(service.isDeprecated('oldTool')).toBe(false);
    });
  });

  describe('Reporting', () => {
    it('generates deprecation report', () => {
      const service = new ToolDeprecationService();

      service.flagForDeprecation('tool1', 'memory', 'unused');
      service.flagForDeprecation('tool2', 'calendar', 'low_usage');

      const report = service.generateReport();

      expect(report).toContain('DEPRECATION REPORT');
      expect(report).toContain('tool1');
      expect(report).toContain('tool2');
    });
  });
});

// ============================================================================
// VERSIONING SERVICE TESTS
// ============================================================================

describe('ToolVersioningService', () => {
  let ToolVersioningService: typeof import('../tools/versioning.js').ToolVersioningService;

  beforeEach(async () => {
    const module = await import('../tools/versioning.js');
    ToolVersioningService = module.ToolVersioningService;
  });

  describe('Version Registration', () => {
    it('registers tools with initial version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      const version = service.registerTool(mockToolDef);

      expect(version.version).toBe('1.0.0');
      expect(version.toolId).toBe('myTool');
      expect(service.getActiveVersion('myTool')).toBe('1.0.0');
    });

    it('supports custom initial version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      const version = service.registerTool(mockToolDef, '2.0.0');

      expect(version.version).toBe('2.0.0');
    });
  });

  describe('Version Bumping', () => {
    it('bumps patch version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      const newVersion = service.bumpVersion(mockToolDef, 'Bug fix', 'patch');

      expect(newVersion?.version).toBe('1.0.1');
    });

    it('bumps minor version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      const newVersion = service.bumpVersion(mockToolDef, 'New feature', 'minor');

      expect(newVersion?.version).toBe('1.1.0');
    });

    it('bumps major version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      const newVersion = service.bumpVersion(mockToolDef, 'Breaking change', 'major');

      expect(newVersion?.version).toBe('2.0.0');
      expect(newVersion?.breaking).toBe(true);
    });
  });

  describe('Version History', () => {
    it('tracks version history', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      service.bumpVersion(mockToolDef, 'Change 1', 'patch');

      const history = service.getVersionHistory('myTool');

      // Initial + 1 bump = 2 versions
      expect(history.length).toBe(2);
      expect(history[0].version).toBe('1.0.0');
      expect(history[1].version).toBe('1.0.1');
    });
  });

  describe('Rollback', () => {
    it('rolls back to previous version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      service.bumpVersion(mockToolDef, 'Change 1', 'minor');
      service.setActiveVersion('myTool', '1.1.0');

      const success = service.rollback('myTool');

      expect(success).toBe(true);
      expect(service.getActiveVersion('myTool')).toBe('1.0.0');
    });

    it('rolls back to specific version', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      service.bumpVersion(mockToolDef, 'Change 1', 'minor');
      service.bumpVersion(mockToolDef, 'Change 2', 'minor');
      service.setActiveVersion('myTool', '1.2.0');

      const success = service.rollback('myTool', '1.0.0');

      expect(success).toBe(true);
      expect(service.getActiveVersion('myTool')).toBe('1.0.0');
    });
  });

  describe('Changelog', () => {
    it('generates changelog', () => {
      const service = new ToolVersioningService();

      const mockToolDef = {
        id: 'myTool',
        name: 'My Tool',
        description: 'A test tool',
        domain: 'memory' as const,
        create: () => ({}) as any,
      };

      service.registerTool(mockToolDef);
      service.bumpVersion(mockToolDef, 'Added feature X', 'minor');

      const changelog = service.generateChangelog('myTool');

      expect(changelog).toContain('myTool');
      expect(changelog).toContain('v1.0.0');
      expect(changelog).toContain('v1.1.0');
      expect(changelog).toContain('Added feature X');
    });
  });
});
