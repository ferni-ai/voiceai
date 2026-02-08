/**
 * FTIS Integration Tests
 *
 * Tests the FTIS hierarchical classifier integration:
 * - V7 domain label → ToolDomain mapping
 * - detectModelVersion() (v7 or none)
 * - Hierarchical classifier (when models present)
 */

import { describe, expect, it } from 'vitest';
import {
  getMappedV7Domains,
  isV7DomainMapped,
  mapV7DomainToToolDomains,
  V7_DOMAIN_TO_TOOL_DOMAINS,
} from '../v7-domain-map.js';

// ============================================================================
// V7 Domain Mapping Tests
// ============================================================================

describe('V7 Domain Mapping', () => {
  it('should map all 44 V7 taxonomy domains', () => {
    const domains = getMappedV7Domains();
    expect(domains.length).toBe(44);
  });

  it('should map music_audio to entertainment domain', () => {
    const mapped = mapV7DomainToToolDomains('music_audio');
    expect(mapped).toContain('entertainment');
    expect(mapped).toContain('vibe');
  });

  it('should map calendar to calendar domain', () => {
    const mapped = mapV7DomainToToolDomains('calendar');
    expect(mapped).toEqual(['calendar']);
  });

  it('should map career_work to career domain', () => {
    const mapped = mapV7DomainToToolDomains('career_work');
    expect(mapped).toContain('career');
  });

  it('should map grief_loss to grief domain', () => {
    const mapped = mapV7DomainToToolDomains('grief_loss');
    expect(mapped).toContain('grief');
  });

  it('should map emotional_support to wellness and presence', () => {
    const mapped = mapV7DomainToToolDomains('emotional_support');
    expect(mapped).toContain('wellness');
    expect(mapped).toContain('presence');
  });

  it('should map family_parenting to multiple family domains', () => {
    const mapped = mapV7DomainToToolDomains('family_parenting');
    expect(mapped).toContain('family');
    expect(mapped.length).toBeGreaterThan(1);
  });

  it('should map team_handoff to handoff domain', () => {
    const mapped = mapV7DomainToToolDomains('team_handoff');
    expect(mapped).toContain('handoff');
  });

  it('should return empty array for __no_tool__', () => {
    const mapped = mapV7DomainToToolDomains('__no_tool__');
    expect(mapped).toEqual([]);
  });

  it('should return empty array for unknown domains', () => {
    const mapped = mapV7DomainToToolDomains('nonexistent_domain');
    expect(mapped).toEqual([]);
  });

  it('should correctly report mapped status', () => {
    expect(isV7DomainMapped('calendar')).toBe(true);
    expect(isV7DomainMapped('music_audio')).toBe(true);
    expect(isV7DomainMapped('nonexistent')).toBe(false);
  });

  it('should have no empty mappings except __no_tool__', () => {
    for (const [domain, toolDomains] of Object.entries(V7_DOMAIN_TO_TOOL_DOMAINS)) {
      if (domain === '__no_tool__') {
        expect(toolDomains).toEqual([]);
      } else {
        expect(toolDomains.length).toBeGreaterThan(0);
      }
    }
  });

  it('should only map to valid ToolDomain values', () => {
    // These are all the ToolDomain values that should be valid targets
    const knownDomains = new Set([
      'memory',
      'calendar',
      'communication',
      'habits',
      'finance',
      'research',
      'productivity',
      'life-planning',
      'wellness',
      'entertainment',
      'vibe',
      'information',
      'wisdom',
      'handoff',
      'telephony',
      'voice-enrollment',
      'grief',
      'meaning',
      'relationships',
      'stories',
      'curiosity',
      'vulnerability',
      'dreams',
      'play',
      'self-compassion',
      'presence',
      'proactive',
      'awareness',
      'engagement',
      'simple-utilities',
      'routines',
      'crisis',
      'health',
      'career',
      'decisions',
      'family',
      'home',
      'learning',
      'creativity',
      'community',
      'legal-admin',
      'games',
      'cameo',
      'group-conversation',
      'second-chances',
      'connection',
      'difficult-conversations',
      'life-transitions',
      'reflection-games',
      'quiet-growth',
      'pattern-mastery',
      'timeless-perspective',
      'workflow-mastery',
      'milestone-mastery',
      'developer',
      'behavior',
      'life-thesis',
      'marketing',
      'referral',
      'smart-home',
      'webhooks',
      'books',
      'podcasts',
      'video',
      'boundaries',
      'social-skills',
      'body-relationship',
      'anger',
      'shame',
      'envy',
      'resentment',
      'caregiver',
      'divorce',
      'new-parent',
      'empty-nest',
      'infidelity',
      'health-diagnosis',
      'job-loss',
      'sobriety',
      'sandwich-generation',
      'blended-family',
      'coming-out',
      'faith-transition',
      'dating',
      'neurodiversity',
      'trauma-support',
      'procrastination',
      'digital-wellness',
      'perfectionism',
      'intimacy',
      'burnout-recovery',
      'chronic-conditions',
      'midlife',
      'breakup-recovery',
      'scheduling',
      'concierge',
      'travel',
      'settings',
      'insights',
      'superhuman-communication',
      'local-search',
      'developer-custom',
      'commerce',
      'documents',
      'email-intelligence',
      'meal-planning',
      'projects',
      'social-events',
      'transportation',
      'vehicle',
      'workflows',
      'ceo-coaching',
      'event-intelligence',
      'pattern-analytics',
      'ambient-mode',
      'coaching-support',
      'human-transfer',
      'visual-memory',
      'ui-navigation',
    ]);

    for (const toolDomains of Object.values(V7_DOMAIN_TO_TOOL_DOMAINS)) {
      for (const td of toolDomains) {
        expect(knownDomains.has(td)).toBe(true);
      }
    }
  });
});

// ============================================================================
// detectModelVersion() Tests
// ============================================================================

describe('detectFTISModels', () => {
  it('should return available or none based on model files', async () => {
    const { detectFTISModels } = await import('../hierarchical-classifier.js');
    const status = detectFTISModels();
    expect(['available', 'none']).toContain(status);
  });
});

// ============================================================================
// Hierarchical Classifier Tests (model-dependent, skip if absent)
// ============================================================================

describe('Hierarchical Classifier', () => {
  it('should export expected API surface', async () => {
    const mod = await import('../hierarchical-classifier.js');
    expect(typeof mod.initializeHierarchicalClassifier).toBe('function');
    expect(typeof mod.classifyHierarchical).toBe('function');
    expect(typeof mod.classifyHierarchicalSafe).toBe('function');
    expect(typeof mod.isHierarchicalClassifierAvailable).toBe('function');
    expect(typeof mod.getV7DomainLabels).toBe('function');
    expect(typeof mod.getV7MetaToolLabels).toBe('function');
    expect(typeof mod.shutdownHierarchicalClassifier).toBe('function');
  });

  it('should return null safely when not initialized', async () => {
    const { classifyHierarchicalSafe, shutdownHierarchicalClassifier } =
      await import('../hierarchical-classifier.js');
    shutdownHierarchicalClassifier();
    const result = classifyHierarchicalSafe('play some music');
    expect(result).toBeNull();
  });

  it('should report unavailable when not initialized', async () => {
    const { isHierarchicalClassifierAvailable, shutdownHierarchicalClassifier } =
      await import('../hierarchical-classifier.js');
    shutdownHierarchicalClassifier();
    expect(isHierarchicalClassifierAvailable()).toBe(false);
  });
});
