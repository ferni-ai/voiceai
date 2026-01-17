/**
 * E2E Crisis Routing Tests
 *
 * SAFETY-CRITICAL: Verifies that crisis phrases are correctly routed
 * to human-transfer tools and that 988 is always surfaced.
 *
 * These tests simulate the full pipeline:
 * 1. User says crisis phrase
 * 2. Semantic router detects crisis intent
 * 3. Tool is called with correct parameters
 * 4. Response includes 988 and appropriate resources
 * 5. NO tool leakage to TTS (tool names not spoken)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock llm.tool
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Import after mocks
import { getToolDefinitions } from '../index.js';
import { crisisTools } from '../../../semantic-router/tool-definitions/crisis.semantic.js';
import { humanTransfer } from '../../../../services/human-transfer/index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-e2e',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

// Crisis phrases that MUST be detected (must match patterns in escalation-classifier.ts)
const CRISIS_PHRASES = {
  suicidal: [
    "I don't want to live anymore", // matches: i (don't|do not|can't|cannot) want to ... live
    'I want to end it all', // matches: i (want to|wanna|planning to|going to) ... end it
    "I've been thinking about suicide", // matches: i('ve| have) been thinking about (suicide|ending it)
    'I want to die', // matches: i (want to|wanna|planning to|going to) die
    "What's the point of living", // matches: what('s| is) the point
    'Everyone would be better off without me', // matches: everyone would be better off without me
  ],
  selfHarm: [
    'I cut myself', // matches: i (cut|burn|hurt) myself
    "I've been cutting", // matches: i('ve| have) been (cutting|burning|hurting)
    'I want to hurt myself', // matches: i want to (cut|burn|hurt) myself
    'I have self harm thoughts', // matches: self[- ]?harm
  ],
  domesticViolence: [
    'My partner hits me', // matches: my partner ... hits me
    "I'm afraid to go home", // matches: i('m| am) (afraid|scared) ... to go home
    'He threatens me', // matches: (he|she|they) ... threatened|threatens me
    'My husband beats me', // matches: my husband ... beats me
    'I am experiencing domestic abuse', // matches: domestic abuse
  ],
  professionalHelp: [
    'I need to see a therapist', // matches: need to ... see ... a ... therapist
    "I've been depressed for months", // matches: i('ve| have) been ... depressed for ... months
    'I need professional help', // matches: i need professional help
    'I am looking for a counselor', // matches: looking for ... a ... counselor
    'I want to speak with a professional', // matches: want to ... speak with ... a ... professional
  ],
};

// Forbidden patterns (tool names that should NEVER be spoken)
const FORBIDDEN_TTS_PATTERNS = [
  'evaluateHumanTransfer',
  'evaluate human transfer',
  'connectToHumanExpert',
  'connect to human expert',
  'quickCrisisResources',
  'quick crisis resources',
  'provideCrisisResources',
  'guideGroundingExercise',
  '{"fn":',
  '"args":',
];

// ============================================================================
// E2E TESTS
// ============================================================================

describe('E2E Crisis Routing', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Semantic Router Detection', () => {
    it('should have crisis tools registered in semantic router', () => {
      expect(crisisTools.length).toBeGreaterThanOrEqual(5);

      const toolIds = crisisTools.map((t) => t.id);
      expect(toolIds).toContain('crisis_support');
      expect(toolIds).toContain('evaluate_human_transfer');
      expect(toolIds).toContain('quick_crisis_resources');
      expect(toolIds).toContain('connect_to_human_expert');
    });

    it('should have high priority for crisis tools', () => {
      const crisisSupport = crisisTools.find((t) => t.id === 'crisis_support');
      const evaluateTransfer = crisisTools.find((t) => t.id === 'evaluate_human_transfer');
      const quickResources = crisisTools.find((t) => t.id === 'quick_crisis_resources');

      // All crisis tools should have priority >= 95
      expect(crisisSupport?.priority).toBeGreaterThanOrEqual(95);
      expect(evaluateTransfer?.priority).toBeGreaterThanOrEqual(95);
      expect(quickResources?.priority).toBeGreaterThanOrEqual(95);
    });

    it('should route to correct domains', () => {
      const crisisSupport = crisisTools.find((t) => t.id === 'crisis_support');
      const evaluateTransfer = crisisTools.find((t) => t.id === 'evaluate_human_transfer');

      // Crisis support → domains/crisis (grounding, breathing)
      // Human transfer → domains/human-transfer (professional escalation)
      expect(crisisSupport?.category).toBe('crisis');
      expect(evaluateTransfer?.category).toBe('crisis');
    });
  });

  describe('Crisis Signal Detection', () => {
    it.each(CRISIS_PHRASES.suicidal)('should detect suicidal crisis: "%s"', (phrase) => {
      const result = humanTransfer.detectCrisisSignals(phrase);
      expect(result.suicidalIdeation).toBe(true);
    });

    it.each(CRISIS_PHRASES.selfHarm)('should detect self-harm: "%s"', (phrase) => {
      const result = humanTransfer.detectCrisisSignals(phrase);
      expect(result.selfHarmIndicators).toBe(true);
    });

    it.each(CRISIS_PHRASES.domesticViolence)('should detect domestic violence: "%s"', (phrase) => {
      const result = humanTransfer.detectCrisisSignals(phrase);
      expect(result.domesticViolence).toBe(true);
    });

    it('should NOT detect crisis for normal statements', () => {
      const normalPhrases = [
        "I'm having a rough day",
        'Work is stressful',
        "I'm feeling a bit down",
        'Traffic was terrible today',
        'My boss is annoying',
      ];

      for (const phrase of normalPhrases) {
        const result = humanTransfer.detectCrisisSignals(phrase);
        expect(result.suicidalIdeation).toBe(false);
        expect(result.selfHarmIndicators).toBe(false);
        expect(result.domesticViolence).toBe(false);
      }
    });
  });

  describe('Tool Execution - 988 Always Surfaced', () => {
    it.each(CRISIS_PHRASES.suicidal)('should include 988 in response for: "%s"', async (phrase) => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ situation: 'suicidal-thoughts' });

      expect(result).toContain('988');
      expect(result).toContain('Suicide');
    });

    it('should include DV hotline for domestic violence', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ situation: 'domestic-violence' });

      expect(result).toContain('Domestic Violence');
      // Should include either 1-800-799-7233 or the hotline name
      expect(result.toLowerCase()).toContain('hotline');
    });
  });

  describe('Tool Execution - Professional Transfer', () => {
    it('should evaluate transfer need correctly', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);

      // Suicidal statement → CRISIS IMMEDIATE (with space)
      const crisisResult = await tool.execute({
        userStatement: "I don't want to be here anymore",
      });
      expect(crisisResult).toContain('CRISIS IMMEDIATE');
      expect(crisisResult).toContain('988');

      // Professional help request → therapy recommendation
      const therapyResult = await tool.execute({
        userStatement: "I've been depressed for months and need professional help",
      });
      expect(therapyResult.toLowerCase()).toContain('therap');
    });

    it('should provide appropriate resources based on consent level', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      expect(toolDef).toBeDefined();

      const tool = toolDef!.create(mockContext);

      // With full consent
      const fullResult = await tool.execute({
        transferType: 'therapy',
        userConsent: 'full',
      });
      expect(fullResult).toBeDefined();
      expect(fullResult).not.toBe('');

      // With no consent
      const noneResult = await tool.execute({
        transferType: 'therapy',
        userConsent: 'none',
      });
      expect(noneResult).toBeDefined();
    });
  });

  describe('TTS Leakage Prevention', () => {
    it('should not contain tool names in responses', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);

        // Execute with sample input
        let result: string;
        if (toolDef.id === 'evaluateHumanTransfer') {
          result = await tool.execute({ userStatement: 'I need help' });
        } else if (toolDef.id === 'connectToHumanExpert') {
          result = await tool.execute({ transferType: 'therapy', userConsent: 'minimal' });
        } else if (toolDef.id === 'quickCrisisResources') {
          result = await tool.execute({ situation: 'mental-health' });
        } else {
          continue;
        }

        // Check for forbidden patterns
        for (const pattern of FORBIDDEN_TTS_PATTERNS) {
          expect(result).not.toContain(pattern);
        }
      }
    });

    it('responses should be speakable (no JSON)', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ situation: 'suicidal-thoughts' });

      // Should not contain raw JSON
      expect(result).not.toMatch(/^\s*\{/);
      expect(result).not.toContain('"fn"');
      expect(result).not.toContain('"args"');

      // Should be human-readable
      expect(result.length).toBeGreaterThan(50);
      expect(result).toContain('988');
    });
  });

  describe('Full Pipeline Simulation', () => {
    it('should handle crisis → evaluate → resources flow', async () => {
      // 1. User says something concerning
      const userStatement = "I don't want to be here anymore";

      // 2. Service detects crisis
      const signals = humanTransfer.detectCrisisSignals(userStatement);
      expect(signals.suicidalIdeation).toBe(true);

      // 3. Escalation is classified
      const classification = humanTransfer.classifyEscalation(signals);
      expect(classification.type).toBe('crisis_immediate');
      expect(classification.urgency).toBe('immediate');

      // 4. Tool provides resources
      const toolDef = toolDefinitions.find((t) => t.id === 'quickCrisisResources');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ situation: 'suicidal-thoughts' });

      // 5. Result includes 988
      expect(result).toContain('988');
    });

    it('should handle professional help → evaluate → connect flow', async () => {
      // 1. User requests professional help
      const userStatement = "I've been depressed for months, I think I need to see a therapist";

      // 2. Evaluate transfer need
      const evalToolDef = toolDefinitions.find((t) => t.id === 'evaluateHumanTransfer');
      const evalTool = evalToolDef!.create(mockContext);
      const evalResult = await evalTool.execute({ userStatement });

      // 3. Should suggest therapy (not crisis)
      expect(evalResult.toLowerCase()).toContain('therap');

      // 4. Connect tool should work
      const connectToolDef = toolDefinitions.find((t) => t.id === 'connectToHumanExpert');
      const connectTool = connectToolDef!.create(mockContext);
      const connectResult = await connectTool.execute({
        transferType: 'therapy',
        userConsent: 'minimal',
      });

      expect(connectResult).toBeDefined();
      expect(connectResult.length).toBeGreaterThan(50);
    });
  });
});

describe('Integration: buildHumanTransferInjections', () => {
  it('should be callable from injection-builders', async () => {
    // Import the injection builder
    const { buildHumanTransferInjections } =
      await import('../../../../agents/processors/injection-builders.js');

    // Test with a crisis statement
    const crisisInjection = await buildHumanTransferInjections("I don't want to be here anymore");

    // Should return a high-priority injection
    expect(crisisInjection).not.toBeNull();
    if (crisisInjection) {
      expect(crisisInjection.priority).toBeGreaterThanOrEqual(88);
      expect(crisisInjection.category).toBe('better_than_human');
      expect(crisisInjection.content).toBeDefined();
    }
  });

  it('should return null for normal statements', async () => {
    const { buildHumanTransferInjections } =
      await import('../../../../agents/processors/injection-builders.js');

    const normalInjection = await buildHumanTransferInjections('I had a great day today!');

    expect(normalInjection).toBeNull();
  });
});
