/**
 * Life Coaching Domains - Integration Tests
 *
 * Tests that all 15 new life coaching domains:
 * 1. Load correctly
 * 2. Return valid tool definitions
 * 3. Have proper safety guards
 * 4. Integrate with the shared foundation
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Domain imports
import { getToolDefinitions as getBoundariesTools } from '../tools/domains/boundaries/index.js';
import { getToolDefinitions as getSocialSkillsTools } from '../tools/domains/social-skills/index.js';
import { getToolDefinitions as getAngerTools } from '../tools/domains/anger/index.js';
import { getToolDefinitions as getProcrastinationTools } from '../tools/domains/procrastination/index.js';
import { getToolDefinitions as getPerfectionismTools } from '../tools/domains/perfectionism/index.js';
import { getToolDefinitions as getDigitalWellnessTools } from '../tools/domains/digital-wellness/index.js';
import { getToolDefinitions as getBurnoutRecoveryTools } from '../tools/domains/burnout-recovery/index.js';
import { getToolDefinitions as getBodyRelationshipTools } from '../tools/domains/body-relationship/index.js';
import { getToolDefinitions as getDatingTools } from '../tools/domains/dating/index.js';
import { getToolDefinitions as getIntimacyTools } from '../tools/domains/intimacy/index.js';
import { getToolDefinitions as getBreakupRecoveryTools } from '../tools/domains/breakup-recovery/index.js';
import { getToolDefinitions as getNeurodiversityTools } from '../tools/domains/neurodiversity/index.js';
import { getToolDefinitions as getTraumaSupportTools } from '../tools/domains/trauma-support/index.js';
import { getToolDefinitions as getChronicConditionsTools } from '../tools/domains/chronic-conditions/index.js';
import { getToolDefinitions as getMidlifeTools } from '../tools/domains/midlife/index.js';

// Shared foundation imports
import { checkSafety } from '../tools/domains/life-coaching-shared/safety-guards.js';
import { getLifeCoachingProfile } from '../tools/domains/life-coaching-shared/user-profile.js';

import type { ToolDefinition } from '../tools/registry/types.js';

describe('Life Coaching Domains', () => {
  // ============================================================================
  // DOMAIN LOADING TESTS
  // ============================================================================

  describe('Domain Loading', () => {
    const domains = [
      { name: 'boundaries', loader: getBoundariesTools, minTools: 5 },
      { name: 'social-skills', loader: getSocialSkillsTools, minTools: 5 },
      { name: 'anger', loader: getAngerTools, minTools: 5 },
      { name: 'procrastination', loader: getProcrastinationTools, minTools: 5 },
      { name: 'perfectionism', loader: getPerfectionismTools, minTools: 5 },
      { name: 'digital-wellness', loader: getDigitalWellnessTools, minTools: 5 },
      { name: 'burnout-recovery', loader: getBurnoutRecoveryTools, minTools: 4 },
      { name: 'body-relationship', loader: getBodyRelationshipTools, minTools: 5 },
      { name: 'dating', loader: getDatingTools, minTools: 5 },
      { name: 'intimacy', loader: getIntimacyTools, minTools: 5 },
      { name: 'breakup-recovery', loader: getBreakupRecoveryTools, minTools: 4 },
      { name: 'neurodiversity', loader: getNeurodiversityTools, minTools: 5 },
      { name: 'trauma-support', loader: getTraumaSupportTools, minTools: 5 },
      { name: 'chronic-conditions', loader: getChronicConditionsTools, minTools: 4 },
      { name: 'midlife', loader: getMidlifeTools, minTools: 4 },
    ];

    for (const domain of domains) {
      describe(`${domain.name} domain`, () => {
        let tools: ToolDefinition[];

        beforeAll(async () => {
          tools = await domain.loader();
        });

        it('should load tools without errors', async () => {
          expect(tools).toBeDefined();
          expect(Array.isArray(tools)).toBe(true);
        });

        it(`should have at least ${domain.minTools} tools`, () => {
          expect(tools.length).toBeGreaterThanOrEqual(domain.minTools);
        });

        it('should have valid tool definitions', () => {
          for (const tool of tools) {
            expect(tool.id).toBeDefined();
            expect(typeof tool.id).toBe('string');
            expect(tool.name).toBeDefined();
            expect(typeof tool.name).toBe('string');
            expect(tool.description).toBeDefined();
            expect(typeof tool.description).toBe('string');
            expect(tool.domain).toBe(domain.name);
            expect(typeof tool.create).toBe('function');
          }
        });

        it('should have tags related to the domain', () => {
          for (const tool of tools) {
            expect(tool.tags).toBeDefined();
            expect(Array.isArray(tool.tags)).toBe(true);
            // Tags should include the domain name or a related keyword
            // (e.g., 'social' for 'social-skills', 'burnout' for 'burnout-recovery')
            const domainKeyword = domain.name.split('-')[0];
            const hasRelatedTag = tool.tags!.some(
              (tag) => tag.includes(domainKeyword) || domain.name.includes(tag)
            );
            expect(hasRelatedTag).toBe(true);
          }
        });
      });
    }
  });

  // ============================================================================
  // SHARED FOUNDATION TESTS
  // ============================================================================

  describe('Shared Foundation', () => {
    describe('Safety Guards', () => {
      it('should detect crisis language', () => {
        const crisisInput = 'I want to end it all';
        const result = checkSafety(crisisInput);
        expect(result.isSafe).toBe(false);
        expect(result.intervention).toBeDefined();
      });

      it('should pass safe input', () => {
        const safeInput = "I'm feeling a bit stressed today";
        const result = checkSafety(safeInput);
        expect(result.isSafe).toBe(true);
      });

      it('should detect self-harm language', () => {
        const selfHarmInput = 'I want to hurt myself';
        const result = checkSafety(selfHarmInput);
        expect(result.isSafe).toBe(false);
      });
    });

    describe('User Profile', () => {
      it('should get or create profile for user', async () => {
        const profile = await getLifeCoachingProfile('test-user-123');
        expect(profile).toBeDefined();
        expect(profile.userId).toBe('test-user-123');
      });

      it('should return default values for new user', async () => {
        const profile = await getLifeCoachingProfile('new-user-456');
        expect(profile.totalLifeCoachingInteractions).toBe(0);
      });
    });
  });

  // ============================================================================
  // TOOL COUNT SUMMARY
  // ============================================================================

  describe('Total Tool Count', () => {
    it('should have ~100 tools total across all life coaching domains', async () => {
      const allTools: ToolDefinition[] = [];

      const loaders = [
        getBoundariesTools,
        getSocialSkillsTools,
        getAngerTools,
        getProcrastinationTools,
        getPerfectionismTools,
        getDigitalWellnessTools,
        getBurnoutRecoveryTools,
        getBodyRelationshipTools,
        getDatingTools,
        getIntimacyTools,
        getBreakupRecoveryTools,
        getNeurodiversityTools,
        getTraumaSupportTools,
        getChronicConditionsTools,
        getMidlifeTools,
      ];

      for (const loader of loaders) {
        const tools = await loader();
        allTools.push(...tools);
      }

      // Expected: ~100 tools across 15 domains (6-8 tools each)
      expect(allTools.length).toBeGreaterThanOrEqual(70);
      expect(allTools.length).toBeLessThanOrEqual(130);

      // Log summary for visibility
      console.log(`\n📊 Life Coaching Domain Summary:`);
      console.log(`   Total tools: ${allTools.length}`);
      console.log(`   Domains: 15`);
      console.log(`   Avg tools/domain: ${(allTools.length / 15).toFixed(1)}\n`);
    });
  });
});
