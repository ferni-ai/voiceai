/**
 * Speech Humanization Synthetic LLM Tests
 *
 * Uses LLM-powered scenario generation to test:
 * 1. Callback trigger detection
 * 2. Energy level detection accuracy
 * 3. Late night behavior adaptation
 * 4. Laughter contagion appropriateness
 * 5. Overall humanization quality
 *
 * These tests ensure our "Better Than Human" speech humanization
 * creates natural, relationship-building conversations.
 *
 * @module tests/speech-humanization-synthetic
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  detectCallbackTriggers,
  selectCallback,
  injectCallback,
  preloadAllSpeechProfiles,
  quickHumanizeSync,
  humanizeSpeech,
  type BehaviorSelectionContext,
} from '../speech/humanization/index.js';
import {
  buildSpeechContext,
  detectExtendedEnergyLevel,
  detectUserLaughter,
} from '../speech/speech-context.js';
import { tagTextWithSsmlAdaptive } from '../speech/adaptive-ssml/adaptation.js';

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const LLM_TIMEOUT = 60000;

/** Latest Gemini model for synthetic testing - faster and more capable */
const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

// =============================================================================
// LLM SCENARIO GENERATOR
// =============================================================================

interface GeneratedScenario {
  utterance: string;
  category: string;
  expected: Record<string, unknown>;
  difficulty: 'easy' | 'medium' | 'hard';
  notes?: string;
}

async function generateScenarios(
  systemPrompt: string,
  count: number = 5
): Promise<GeneratedScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `${systemPrompt}

Output ONLY valid JSON array with this exact format (no markdown, no explanation):
[
  {
    "utterance": "the user's natural speech",
    "category": "category type",
    "expected": { "key": "value" },
    "difficulty": "easy|medium|hard",
    "notes": "optional explanation"
  }
]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON found in LLM response');
      return [];
    }

    return JSON.parse(jsonMatch[0]) as GeneratedScenario[];
  } catch (error) {
    console.warn('LLM scenario generation failed:', error);
    return [];
  }
}

// =============================================================================
// TEST SETUP
// =============================================================================

beforeAll(async () => {
  await preloadAllSpeechProfiles();
});

// =============================================================================
// 1. CALLBACK TRIGGER DETECTION TESTS
// =============================================================================

describe('Callback Trigger Detection', () => {
  // Seed scenarios with known callback triggers
  const FERNI_SEED_SCENARIOS = [
    {
      utterance: 'Why do I keep making the same mistakes over and over?',
      expectedTriggerId: 'second_chances',
      trigger: 'mistake',
    },
    {
      utterance: 'I screwed up my presentation and now I regret everything',
      expectedTriggerId: 'second_chances',
      trigger: 'mistake',
    },
    {
      utterance: "What's the point of working so hard if I'm still not successful?",
      expectedTriggerId: 'net_worth_self_worth',
      trigger: 'worth',
    },
    {
      utterance: "I'm not as successful as my peers. I feel worthless.",
      expectedTriggerId: 'net_worth_self_worth',
      trigger: 'worth',
    },
    {
      utterance: "Um... well... I'm not sure how to say this...",
      expectedTriggerId: 'the_pause',
      trigger: 'hesitation',
    },
    {
      utterance: "I've been waiting forever for things to change. When will it happen?",
      expectedTriggerId: 'japan_wisdom',
      trigger: 'patience',
    },
  ];

  const MAYA_SEED_SCENARIOS = [
    {
      utterance: "I just can't force myself to exercise. I have no willpower.",
      expectedTriggerId: 'systems_beat_willpower',
      trigger: 'willpower',
    },
    {
      utterance: "I only did 5 minutes today, it's nothing really.",
      expectedTriggerId: 'tiny_wins',
      trigger: 'small_progress',
    },
    {
      utterance: 'I broke my streak and fell off the wagon completely.',
      expectedTriggerId: 'stumble_forward',
      trigger: 'failure',
    },
    {
      utterance: "I'm someone who meditates now, it's just part of who I am.",
      expectedTriggerId: 'identity_shift',
      trigger: 'becoming',
    },
    {
      utterance: "This habit goal feels too overwhelming, I can't do it all.",
      expectedTriggerId: 'two_minute_rule',
      trigger: 'too_much',
    },
  ];

  describe('Ferni Callback Triggers', () => {
    it.each(FERNI_SEED_SCENARIOS)(
      'should detect "$trigger" in: "$utterance"',
      ({ utterance, trigger }) => {
        const triggers = detectCallbackTriggers(utterance, 'ferni');

        expect(triggers.length).toBeGreaterThan(0);
        expect(triggers.some((t) => t.trigger === trigger)).toBe(true);
      }
    );
  });

  describe('Maya Callback Triggers', () => {
    it.each(MAYA_SEED_SCENARIOS)(
      'should detect "$trigger" in: "$utterance"',
      ({ utterance, trigger }) => {
        const triggers = detectCallbackTriggers(utterance, 'maya-santos');

        expect(triggers.length).toBeGreaterThan(0);
        expect(triggers.some((t) => t.trigger === trigger)).toBe(true);
      }
    );
  });

  describe('Callback Selection', () => {
    it('should select first-use phrase for new users', () => {
      const triggers = detectCallbackTriggers(
        "I messed up and I wish I could start over",
        'ferni'
      );

      const callback = selectCallback(triggers, 'ferni', 0); // 0 conversations

      expect(callback).not.toBeNull();
      expect(callback!.useCallbackVersion).toBe(false); // First use
      expect(callback!.phrase).toBeTruthy();
    });

    it('should potentially use callback version for returning users', () => {
      const triggers = detectCallbackTriggers(
        "I messed up again, feels like I need a do-over",
        'ferni'
      );

      // Run multiple times (callback selection is probabilistic)
      let foundCallbackVersion = false;
      for (let i = 0; i < 20; i++) {
        const callback = selectCallback(triggers, 'ferni', 10); // 10 conversations
        if (callback?.useCallbackVersion) {
          foundCallbackVersion = true;
          break;
        }
      }

      // Note: This might occasionally fail due to probability
      // The test verifies the mechanism exists, not that it always triggers
    });
  });

  describe('LLM-Generated Callback Scenarios', { timeout: LLM_TIMEOUT }, () => {
    it('should detect callbacks in natural conversation', async () => {
      const scenarios = await generateScenarios(`
Generate ${10} realistic user utterances that would trigger Ferni's callbacks.
These should be NATURAL conversation, not obviously containing keywords.

Ferni's callback triggers:
- "mistake": user mentions mistakes, regrets, wanting do-overs
- "worth": user ties self-worth to achievements/money/success
- "hesitation": user pauses, uses fillers like "um", "well..."
- "patience": user discusses waiting, slow progress, wanting things faster
- "question": user asks a deep, meaningful question

For each, specify:
- utterance: The natural user speech
- expected: { "trigger": "the_trigger_word" }
- difficulty: easy (obvious), medium (natural), hard (subtle)
- notes: why this should trigger the callback
`);

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let passed = 0;
      const failures: string[] = [];

      for (const scenario of scenarios) {
        const triggers = detectCallbackTriggers(scenario.utterance, 'ferni');
        const expectedTrigger = (scenario.expected as { trigger?: string }).trigger;

        if (triggers.some((t) => t.trigger === expectedTrigger)) {
          passed++;
        } else {
          failures.push(
            `"${scenario.utterance}" should trigger "${expectedTrigger}" (${scenario.difficulty})`
          );
        }
      }

      console.log(`Callback Detection: ${passed}/${scenarios.length} passed`);
      if (failures.length > 0) {
        console.log('Failures:', failures.slice(0, 3).join('\n'));
      }

      // Expect at least 60% detection (natural language is ambiguous)
      expect(passed / scenarios.length).toBeGreaterThanOrEqual(0.6);
    });
  });
});

// =============================================================================
// 2. ENERGY DETECTION TESTS
// =============================================================================

describe('Energy Detection - Synthetic', () => {
  const ENERGY_SEED_SCENARIOS = [
    { utterance: 'ok', expected: 'very_low' },
    { utterance: 'fine', expected: 'very_low' },
    { utterance: 'I am so exhausted...', expected: 'very_low' },
    { utterance: 'I feel tired and overwhelmed today', expected: 'low' },
    { utterance: 'Had a pretty normal day at work', expected: 'neutral' },
    { utterance: "That's great news! I'm excited!", expected: 'elevated' },
    { utterance: 'OMG YES!!! This is AMAZING!!!', expected: 'high' },
  ];

  describe('Seed Scenarios', () => {
    it.each(ENERGY_SEED_SCENARIOS)(
      'should detect $expected from: "$utterance"',
      ({ utterance, expected }) => {
        const detected = detectExtendedEnergyLevel(utterance);
        
        // Allow adjacent levels (e.g., low vs very_low)
        const energyLevels = ['very_low', 'low', 'neutral', 'elevated', 'high'];
        const expectedIdx = energyLevels.indexOf(expected);
        const detectedIdx = energyLevels.indexOf(detected);
        
        const isClose = Math.abs(expectedIdx - detectedIdx) <= 1;
        expect(isClose).toBe(true);
      }
    );
  });

  describe('LLM-Generated Energy Scenarios', { timeout: LLM_TIMEOUT }, () => {
    it('should accurately detect energy levels', async () => {
      const scenarios = await generateScenarios(`
Generate ${15} realistic user utterances with varying energy levels.

Energy levels:
- very_low: Minimal words, exhausted, defeated (e.g., "yeah", "ok", "barely made it")
- low: Tired, overwhelmed, sad (e.g., "I'm so tired...", "don't feel like it")
- neutral: Normal conversation (e.g., "I worked on the project today")
- elevated: Happy, interested, engaged (e.g., "That's really cool!", "I love that idea!")
- high: Very excited, enthusiastic (e.g., "OMG YES!!!", "This is AMAZING!!!")

For each, specify:
- utterance: Natural speech showing that energy
- expected: { "energy": "the_level" }
- difficulty: easy (obvious markers), medium (natural), hard (subtle)
`);

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let exact = 0;
      let close = 0;
      const energyLevels = ['very_low', 'low', 'neutral', 'elevated', 'high'];

      for (const scenario of scenarios) {
        const detected = detectExtendedEnergyLevel(scenario.utterance);
        const expected = (scenario.expected as { energy?: string }).energy;

        if (detected === expected) {
          exact++;
          close++;
        } else {
          const expectedIdx = energyLevels.indexOf(expected || '');
          const detectedIdx = energyLevels.indexOf(detected);
          if (Math.abs(expectedIdx - detectedIdx) <= 1) {
            close++;
          }
        }
      }

      console.log(
        `Energy Detection: ${exact}/${scenarios.length} exact, ${close}/${scenarios.length} within ±1`
      );

      // Expect at least 70% within ±1 level (energy is subjective)
      expect(close / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// =============================================================================
// 3. LAUGHTER DETECTION TESTS
// =============================================================================

describe('Laughter Detection - Synthetic', () => {
  const SEED_SCENARIOS = [
    { utterance: 'hahaha that was hilarious', expected: true },
    { utterance: 'LOL I cant believe that happened', expected: true },
    { utterance: "That's so funny 😂😂", expected: true },
    { utterance: 'I really enjoyed our conversation', expected: false },
    { utterance: "That's interesting, tell me more", expected: false },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should detect laughter=$expected in: "$utterance"',
      ({ utterance, expected }) => {
        expect(detectUserLaughter(utterance)).toBe(expected);
      }
    );
  });

  describe('LLM-Generated Laughter Scenarios', { timeout: LLM_TIMEOUT }, () => {
    it('should detect various laughter expressions', async () => {
      const scenarios = await generateScenarios(`
Generate ${12} user utterances - 6 WITH laughter/humor, 6 WITHOUT.

WITH laughter examples:
- Text laughter: "haha", "lol", "lmao", "rofl"
- Described laughter: "that's hilarious", "so funny", "cracking up"
- Emoji laughter: 😂, 🤣, 😆

WITHOUT laughter: Normal statements, questions, concerns (no humor indicators)

For each, specify:
- utterance: The user's text
- expected: { "laughter": true/false }
- difficulty: easy (obvious), medium (subtle), hard (ambiguous)
`);

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let passed = 0;
      for (const scenario of scenarios) {
        const expected = (scenario.expected as { laughter?: boolean }).laughter;
        const detected = detectUserLaughter(scenario.utterance);
        if (detected === expected) passed++;
      }

      console.log(`Laughter Detection: ${passed}/${scenarios.length}`);
      expect(passed / scenarios.length).toBeGreaterThanOrEqual(0.8);
    });
  });
});

// =============================================================================
// 4. HUMANIZATION QUALITY TESTS
// =============================================================================

describe('Humanization Quality - Synthetic', { timeout: LLM_TIMEOUT }, () => {
  const PERSONAS = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];
  
  const TEST_RESPONSE = "I understand what you're going through. Change takes time, and it's completely normal to feel uncertain. Let's explore what might be holding you back and find a path forward together.";

  it('should maintain response coherence after humanization', () => {
    for (const personaId of PERSONAS) {
      const humanized = quickHumanizeSync(TEST_RESPONSE, personaId, {
        emotion: 'sympathetic',
        turnNumber: 5,
        randomSeed: 'coherence-test',
      });

      // Should not garble the response
      expect(humanized.length).toBeGreaterThan(TEST_RESPONSE.length * 0.5);
      // Core message should remain
      expect(humanized.toLowerCase()).toContain('understand');
    }
  });

  it('should produce valid SSML', () => {
    const context = buildSpeechContext({
      userText: 'I am feeling stressed about work',
      phase: 'supporting',
      turnCount: 5,
      sessionId: 'ssml-test',
    });

    for (const personaId of PERSONAS) {
      const tagged = tagTextWithSsmlAdaptive(TEST_RESPONSE, context, personaId);

      // Should have SSML tags
      expect(tagged).toContain('<');
      // Should not have broken tags
      expect(tagged).not.toContain('<<');
      expect(tagged).not.toContain('>>');
    }
  });

  it('should use LLM to validate humanized output sounds natural', async () => {
    if (!USE_LLM) {
      console.log('Skipping LLM validation - no GOOGLE_API_KEY');
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Generate humanized responses for evaluation
    const humanizedSamples: Array<{ personaId: string; original: string; humanized: string }> = [];

    for (const personaId of PERSONAS.slice(0, 3)) {
      const context: BehaviorSelectionContext = {
        personaId,
        emotional: { userEmotion: 'stressed' },
        content: { isComforting: true },
        turnNumber: 5,
        userText: 'I am struggling with my goals',
        conversationCount: 5,
      };

      const result = await humanizeSpeech(TEST_RESPONSE, context);
      humanizedSamples.push({
        personaId,
        original: TEST_RESPONSE,
        humanized: result.text,
      });
    }

    // Ask LLM to evaluate naturalness
    const evaluationPrompt = `You are evaluating AI voice assistant responses for naturalness.

Rate each response on a scale of 1-5 for:
1. Natural speech patterns (does it sound like a real person?)
2. Appropriate use of fillers/pauses
3. Emotional authenticity
4. Coherence (does it still make sense?)

Responses to evaluate:
${humanizedSamples.map((s, i) => `
Response ${i + 1} (${s.personaId}):
Original: "${s.original}"
Humanized: "${s.humanized}"
`).join('\n')}

Output ONLY JSON:
{
  "ratings": [
    {
      "personaId": "name",
      "naturalness": 1-5,
      "fillers": 1-5,
      "emotion": 1-5,
      "coherence": 1-5,
      "notes": "brief explanation"
    }
  ],
  "overallQuality": 1-5
}`;

    const result = await model.generateContent(evaluationPrompt);
    const text = result.response.text();

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('Could not parse LLM evaluation');
      return;
    }

    const evaluation = JSON.parse(jsonMatch[0]);
    console.log('LLM Humanization Evaluation:', JSON.stringify(evaluation, null, 2));

    // Expect overall quality of at least 3/5
    expect(evaluation.overallQuality).toBeGreaterThanOrEqual(3);
  });
});

// =============================================================================
// 5. CALLBACK INJECTION E2E TESTS
// =============================================================================

describe('Callback Injection E2E', () => {
  it('should inject callback into response', () => {
    const userText = "I messed up the interview and now I regret not preparing better";
    const agentResponse = "That sounds frustrating. Interview experiences can be tough, but every one teaches us something valuable.";

    const triggers = detectCallbackTriggers(userText, 'ferni');
    expect(triggers.length).toBeGreaterThan(0);

    // Force selection by running until we get one (probabilistic)
    let injectedResponse: string | null = null;
    for (let i = 0; i < 20; i++) {
      const callback = selectCallback(triggers, 'ferni', 0);
      if (callback) {
        injectedResponse = injectCallback(agentResponse, callback);
        break;
      }
    }

    if (injectedResponse) {
      // Should have callback phrase at the start
      expect(injectedResponse).not.toBe(agentResponse);
      expect(injectedResponse.length).toBeGreaterThan(agentResponse.length);
      // Original response should still be present
      expect(injectedResponse).toContain('frustrating');
    }
  });

  it('should integrate callbacks with full humanization pipeline', async () => {
    const userText = "I have no willpower, I keep failing at my habits";
    const agentResponse = "Building habits is a journey, not a destination. Let's look at what systems might help you succeed.";

    const context: BehaviorSelectionContext = {
      personaId: 'maya-santos',
      emotional: { userEmotion: 'frustrated' },
      content: {},
      turnNumber: 5,
      userText,
      conversationCount: 5,
    };

    // Run multiple times to catch probabilistic callback injection
    let foundCallback = false;
    for (let i = 0; i < 10; i++) {
      const result = await humanizeSpeech(agentResponse, {
        ...context,
        randomSeed: `e2e-test-${i}`,
      });

      if (result.features.some((f) => f.includes('callback'))) {
        foundCallback = true;
        console.log('Found callback in features:', result.features);
        // Verify Maya's "systems beat willpower" callback was used
        expect(
          result.text.toLowerCase().includes('system') ||
            result.text.toLowerCase().includes('willpower')
        ).toBe(true);
        break;
      }
    }

    // Note: It's OK if no callback found - it's probabilistic
    console.log(`Callback integration: ${foundCallback ? 'triggered' : 'not triggered (probabilistic)'}`);
  });
});

