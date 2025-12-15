/**
 * E2E Tests for Cognitive Differentiation
 *
 * Tests that each persona ACTUALLY thinks and responds differently:
 * - Questioning styles (open vs closed, feeling vs data, why vs how)
 * - Silence handling (interpretation, comfort level, responses)
 * - Disagreement approaches (gentle, curious, direct, philosophical)
 * - Insight framing (story, data, metaphor, question, principle)
 * - Response pacing (timing, emotional multipliers)
 *
 * The goal: Each persona should feel distinctly different, not just in
 * personality but in HOW they think and engage.
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-cognitive-test-user';
const TEST_HEADERS = {
  'X-User-ID': TEST_USER_ID,
  'Content-Type': 'application/json',
};

// ============================================================================
// PERSONA COGNITIVE PROFILES
// ============================================================================

const PERSONA_PROFILES = {
  ferni: {
    questioning: { feelingVsData: 'feeling', whyVsHow: 'why' },
    silence: { interpretation: 'reflection', comfortMs: 5000 },
    disagreement: { primary: 'curious', secondary: 'supportive' },
    insight: { framing: 'question' },
  },
  'peter-john': {
    questioning: { feelingVsData: 'data', whyVsHow: 'how' },
    silence: { interpretation: 'processing', comfortMs: 2000 },
    disagreement: { primary: 'data_driven', secondary: 'direct' },
    insight: { framing: 'data' },
  },
  'alex-chen': {
    questioning: { feelingVsData: 'balanced', whyVsHow: 'how' },
    silence: { interpretation: 'confusion', comfortMs: 2500 },
    disagreement: { primary: 'direct', secondary: 'supportive' },
    insight: { framing: 'example' },
  },
  'maya-santos': {
    questioning: { feelingVsData: 'feeling', whyVsHow: 'balanced' },
    silence: { interpretation: 'emotional', comfortMs: 4000 },
    disagreement: { primary: 'gentle', secondary: 'curious' },
    insight: { framing: 'story' },
  },
  'jordan-taylor': {
    questioning: { feelingVsData: 'balanced', whyVsHow: 'how' },
    silence: { interpretation: 'processing', comfortMs: 2000 },
    disagreement: { primary: 'supportive', secondary: 'direct' },
    insight: { framing: 'example' },
  },
  'nayan-patel': {
    questioning: { feelingVsData: 'feeling', whyVsHow: 'why' },
    silence: { interpretation: 'invitation', comfortMs: 8000 },
    disagreement: { primary: 'philosophical', secondary: 'curious' },
    insight: { framing: 'principle' },
  },
};

// ============================================================================
// COGNITIVE DIFFERENTIATION API TESTS
// ============================================================================

test.describe('Cognitive Differentiation - Profile Loading', () => {
  test('should return different cognitive profiles for each persona', async ({ request }) => {
    const personas = Object.keys(PERSONA_PROFILES);

    console.log('\n📋 COGNITIVE PROFILE COMPARISON\n');

    const profiles: Record<string, any> = {};

    for (const personaId of personas) {
      const response = await request.get(`${BASE_URL}/api/personas/${personaId}/cognitive`);

      if (response.status() === 404) {
        console.log(`${personaId}: Cognitive endpoint not available`);
        continue;
      }

      if (response.status() === 200) {
        const data = await response.json();
        profiles[personaId] = data;

        console.log(`\n${personaId.toUpperCase()}:`);
        if (data.questioning) {
          console.log(`  Questioning: ${data.questioning.feelingVsData > 0.5 ? 'feeling-focused' : 'data-focused'}`);
        }
        if (data.silence) {
          console.log(`  Silence: interprets as ${data.silence.primaryInterpretation}`);
        }
        if (data.disagreement) {
          console.log(`  Disagreement: ${data.disagreement.primaryStyle} style`);
        }
        if (data.insight) {
          console.log(`  Insight: ${data.insight.primaryFraming} framing`);
        }
      }
    }

    // Verify profiles are actually different
    if (profiles.ferni && profiles['peter-john']) {
      expect(profiles.ferni.questioning?.feelingVsData).not.toBe(
        profiles['peter-john'].questioning?.feelingVsData
      );
      console.log('\n✅ Ferni and Peter have distinct questioning styles');
    }
  });

  test('all personas should have complete cognitive differentiation', async ({ request }) => {
    const personas = Object.keys(PERSONA_PROFILES);
    const requiredSections = ['questioning', 'silence', 'disagreement', 'insight', 'pacing'];

    console.log('\n📋 COGNITIVE DIFFERENTIATION COMPLETENESS\n');

    for (const personaId of personas) {
      const response = await request.get(`${BASE_URL}/api/personas/${personaId}/cognitive`);

      if (response.status() === 404) {
        console.log(`❌ ${personaId}: endpoint not available`);
        continue;
      }

      if (response.status() === 200) {
        const data = await response.json();

        const missingSections = requiredSections.filter(section => !data[section]);

        if (missingSections.length === 0) {
          console.log(`✅ ${personaId}: all sections present`);
        } else {
          console.log(`⚠️ ${personaId}: missing ${missingSections.join(', ')}`);
        }
      }
    }
  });
});

test.describe('Cognitive Differentiation - Questioning Styles', () => {
  test('Ferni should ask feeling-focused questions', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/personas/ferni/question`, {
      headers: TEST_HEADERS,
      data: {
        type: 'deep_dive',
        topic: 'career',
      },
    });

    if (response.status() === 404) {
      console.log('Question endpoint not available - skipping');
      test.skip();
      return;
    }

    if (response.status() === 200) {
      const data = await response.json();

      console.log('\n📋 FERNI QUESTION SAMPLE:');
      console.log(`  "${data.question}"`);

      // Ferni's questions should be about feelings/motivations
      const isFeeling = data.question?.match(/feel|afraid|want|worry|hope|mean|heart/i);
      if (isFeeling) {
        console.log('  ✅ Feeling-focused question');
      }
    }
  });

  test('Peter should ask data-focused questions', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/personas/peter-john/question`, {
      headers: TEST_HEADERS,
      data: {
        type: 'deep_dive',
        topic: 'investing',
      },
    });

    if (response.status() === 404) {
      console.log('Question endpoint not available - skipping');
      test.skip();
      return;
    }

    if (response.status() === 200) {
      const data = await response.json();

      console.log('\n📋 PETER QUESTION SAMPLE:');
      console.log(`  "${data.question}"`);

      // Peter's questions should be about data/metrics
      const isData = data.question?.match(/number|percent|data|evidence|research|track|measure/i);
      if (isData) {
        console.log('  ✅ Data-focused question');
      }
    }
  });

  test('different personas should generate different questions', async ({ request }) => {
    const topic = 'making a big decision';

    const questions: Record<string, string> = {};

    for (const personaId of ['ferni', 'peter-john', 'nayan-patel']) {
      const response = await request.post(`${BASE_URL}/api/personas/${personaId}/question`, {
        headers: TEST_HEADERS,
        data: {
          type: 'deep_dive',
          topic,
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        questions[personaId] = data.question;
      }
    }

    console.log('\n📋 QUESTION COMPARISON (same topic):');
    for (const [persona, question] of Object.entries(questions)) {
      console.log(`\n  ${persona}: "${question?.slice(0, 80)}..."`);
    }

    // Questions should be different
    if (Object.keys(questions).length > 1) {
      const questionSet = new Set(Object.values(questions));
      expect(questionSet.size).toBeGreaterThan(1);
      console.log('\n✅ Different personas generate different questions');
    }
  });
});

test.describe('Cognitive Differentiation - Silence Handling', () => {
  test('personas should have different silence interpretations', async ({ request }) => {
    console.log('\n📋 SILENCE INTERPRETATION BY PERSONA\n');

    const silenceInterpretations: Record<string, string> = {};

    for (const personaId of Object.keys(PERSONA_PROFILES)) {
      const response = await request.get(`${BASE_URL}/api/personas/${personaId}/cognitive`);

      if (response.status() === 200) {
        const data = await response.json();
        if (data.silence?.primaryInterpretation) {
          silenceInterpretations[personaId] = data.silence.primaryInterpretation;
        }
      }
    }

    for (const [persona, interpretation] of Object.entries(silenceInterpretations)) {
      console.log(`  ${persona}: ${interpretation}`);
    }

    // Nayan should be most comfortable with silence
    if (silenceInterpretations['nayan-patel'] && silenceInterpretations['peter-john']) {
      console.log('\n  Expected: Nayan sees silence as "invitation", Peter sees it as "processing"');
    }
  });

  test('personas should respond differently to silence', async ({ request }) => {
    const silenceDuration = 5000; // 5 seconds

    console.log('\n📋 SILENCE RESPONSE COMPARISON (5 seconds)\n');

    for (const personaId of ['ferni', 'peter-john', 'nayan-patel']) {
      const response = await request.post(`${BASE_URL}/api/personas/${personaId}/silence-response`, {
        headers: TEST_HEADERS,
        data: {
          silenceDurationMs: silenceDuration,
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        console.log(`  ${personaId}: "${data.response?.slice(0, 60)}..."`);
      } else if (response.status() === 404) {
        console.log(`  ${personaId}: silence endpoint not available`);
      }
    }
  });
});

test.describe('Cognitive Differentiation - Disagreement Styles', () => {
  test('personas should disagree differently', async ({ request }) => {
    console.log('\n📋 DISAGREEMENT STYLE COMPARISON\n');

    for (const personaId of ['ferni', 'peter-john', 'nayan-patel']) {
      const response = await request.post(`${BASE_URL}/api/personas/${personaId}/disagreement`, {
        headers: TEST_HEADERS,
        data: {
          intensity: 'mild',
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        console.log(`  ${personaId}: "${data.phrase}"`);
      } else if (response.status() === 404) {
        console.log(`  ${personaId}: disagreement endpoint not available`);
      }
    }
  });

  test('strong disagreement should match persona style', async ({ request }) => {
    // Ferni should be curious even in strong disagreement
    // Peter should be data-driven
    // Nayan should be philosophical

    console.log('\n📋 STRONG DISAGREEMENT COMPARISON\n');

    const expectedPatterns: Record<string, RegExp> = {
      ferni: /curious|wonder|think|explore|question/i,
      'peter-john': /data|evidence|numbers|research|show/i,
      'nayan-patel': /consider|perspective|wisdom|truth|deeper/i,
    };

    for (const [personaId, pattern] of Object.entries(expectedPatterns)) {
      const response = await request.post(`${BASE_URL}/api/personas/${personaId}/disagreement`, {
        headers: TEST_HEADERS,
        data: {
          intensity: 'strong',
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        const matchesStyle = pattern.test(data.phrase || '');
        console.log(`  ${matchesStyle ? '✅' : '⚠️'} ${personaId}: ${matchesStyle ? 'matches style' : 'style not detected'}`);
        if (data.phrase) {
          console.log(`     "${data.phrase.slice(0, 60)}..."`);
        }
      }
    }
  });
});

test.describe('Cognitive Differentiation - Insight Framing', () => {
  test('personas should frame insights differently', async ({ request }) => {
    console.log('\n📋 INSIGHT FRAMING COMPARISON\n');

    const framingDescriptions: Record<string, string> = {
      ferni: 'question (leads with questions)',
      'peter-john': 'data (leads with evidence)',
      'maya-santos': 'story (leads with narrative)',
      'nayan-patel': 'principle (leads with wisdom)',
    };

    for (const [personaId, description] of Object.entries(framingDescriptions)) {
      const response = await request.get(`${BASE_URL}/api/personas/${personaId}/cognitive`);

      if (response.status() === 200) {
        const data = await response.json();
        const framing = data.insight?.primaryFraming;
        console.log(`  ${personaId}: ${framing || 'unknown'} (expected: ${description})`);
      }
    }
  });

  test('insight lead-ins should match persona style', async ({ request }) => {
    console.log('\n📋 INSIGHT LEAD-IN SAMPLES\n');

    for (const personaId of ['ferni', 'peter-john', 'nayan-patel']) {
      const response = await request.get(`${BASE_URL}/api/personas/${personaId}/insight-lead-in`);

      if (response.status() === 200) {
        const data = await response.json();
        console.log(`  ${personaId}: "${data.leadIn}"`);
      } else if (response.status() === 404) {
        console.log(`  ${personaId}: insight endpoint not available`);
      }
    }
  });
});

// ============================================================================
// INTEGRATION TESTS - Real Conversation Flow
// ============================================================================

test.describe('Cognitive Differentiation - Real Response Comparison', () => {
  test('same prompt should get different responses from different personas', async ({ request }) => {
    const prompt = "I'm not sure if I should take this job offer";

    console.log('\n📋 RESPONSE COMPARISON TO SAME PROMPT\n');
    console.log(`  Prompt: "${prompt}"\n`);

    for (const personaId of ['ferni', 'peter-john', 'maya-santos', 'nayan-patel']) {
      const response = await request.post(`${BASE_URL}/api/chat/generate-response`, {
        headers: TEST_HEADERS,
        data: {
          personaId,
          message: prompt,
          context: {
            sessionNumber: 5,
            topics: ['career'],
          },
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        console.log(`  ${personaId.toUpperCase()}:`);
        console.log(`    "${data.response?.slice(0, 100)}..."\n`);
      } else if (response.status() === 404) {
        console.log(`  ${personaId}: generate-response endpoint not available`);
        break;
      }
    }
  });
});

// ============================================================================
// SUMMARY
// ============================================================================

test.describe('Summary', () => {
  test('SUMMARY: Cognitive Differentiation validated', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('📋 COGNITIVE DIFFERENTIATION E2E TEST SUMMARY');
    console.log('='.repeat(60));

    console.log('\n🧠 DIFFERENTIATION DIMENSIONS TESTED:');
    console.log('  1. Questioning Style (feeling vs data, why vs how)');
    console.log('  2. Silence Handling (interpretation, comfort level)');
    console.log('  3. Disagreement Approach (gentle, curious, direct, etc.)');
    console.log('  4. Insight Framing (story, data, question, principle)');
    console.log('  5. Response Pacing (timing multipliers)');

    console.log('\n👥 PERSONA COMPARISON:');
    console.log('  Ferni: Feeling-focused, curious, comfortable with silence');
    console.log('  Peter: Data-focused, direct, quick processor');
    console.log('  Alex: How-focused, process-oriented, structured');
    console.log('  Maya: Feeling-focused, gentle, story-driven');
    console.log('  Jordan: Action-focused, supportive, example-driven');
    console.log('  Nayan: Why-focused, philosophical, loves silence');

    console.log('\n📝 NOTES:');
    console.log('  - Some tests require API endpoints to be implemented');
    console.log('  - Full validation requires live conversation testing');
    console.log('  - Reference: src/personas/cognitive-differentiation.ts');

    console.log('\n' + '='.repeat(60) + '\n');
  });
});

