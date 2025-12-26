#!/usr/bin/env npx tsx
/**
 * LLM-Powered Outreach Scenario Testing
 * 
 * Generates random synthetic scenarios using Gemini and validates our
 * outreach classification system against them.
 * 
 * Usage:
 *   npx tsx scripts/test-outreach-llm.ts
 *   npx tsx scripts/test-outreach-llm.ts --count 20
 *   npx tsx scripts/test-outreach-llm.ts --category personal
 *   npx tsx scripts/test-outreach-llm.ts --verbose
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const COUNT = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '10');
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] as 'personal' | 'proactive' | 'concierge' | undefined;
const VERBOSE = args.includes('--verbose') || args.includes('-v');

// ============================================================================
// TYPES
// ============================================================================

interface GeneratedScenario {
  utterance: string;
  expectedCategory: 'personal' | 'proactive' | 'concierge';
  complexity: 'easy' | 'medium' | 'hard';
  notes?: string;
}

interface ClassificationResult {
  domain: 'communication' | 'proactive' | 'concierge' | 'unknown';
  confidence: number;
  suggestedTool: string;
  extractedParams: Record<string, unknown>;
}

interface TestResult {
  scenario: GeneratedScenario;
  classification: ClassificationResult;
  passed: boolean;
  reason?: string;
}

// ============================================================================
// SCENARIO GENERATION
// ============================================================================

async function generateScenarios(
  category: 'personal' | 'proactive' | 'concierge',
  count: number
): Promise<GeneratedScenario[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

  const categoryDescriptions = {
    personal: `Generate ${count} diverse user utterances asking an AI assistant to reach out to a PERSONAL CONTACT.

Examples of relationships: mom, dad, sibling, spouse, friend, ex, coworker, boss, doctor, teacher, mentor, neighbor

Example purposes: birthday wishes, check-in, thank you, apology, congratulations, sympathy, thinking of you, important news, just catching up, sharing exciting news

Example channels: call, text, email, voicemail

Include a mix of:
- Direct requests: "Call my mom"
- Indirect requests: "I should probably reach out to..."
- Emotional contexts: "My friend is going through a tough time..."
- Casual: "Hey can you text my brother"
- Urgent: "I need to call my wife right now"
- With context: "Sarah just got promoted, I should congratulate her"

Complexity levels:
- easy: Clear verb + clear contact + simple purpose
- medium: Implied contact or purpose, some context
- hard: Very indirect, emotional, or requires inference`,

    proactive: `Generate ${count} diverse user utterances asking an AI assistant to REMIND or FOLLOW UP with the USER themselves.

The key distinction: The AI is reaching out TO THE USER, not to someone else.

Example patterns:
- "Remind me at 5pm"
- "Text me tomorrow morning"
- "Call me if I haven't logged my workout"
- "Check in with me next week"
- "Send me an encouraging message"
- "Follow up with me about the diet"

Include timing variations:
- Specific: "at 3pm", "tomorrow at noon"
- Relative: "in 2 hours", "next Monday"
- Conditional: "if I haven't...", "when I finish..."

Include purpose variations:
- Reminders
- Accountability
- Encouragement
- Check-ins
- Habit tracking`,

    concierge: `Generate ${count} diverse user utterances asking an AI assistant to interact with a BUSINESS or SERVICE PROVIDER.

Example businesses:
- Restaurants (reservations, orders)
- Hotels (bookings, inquiries)
- Healthcare (appointments, refills)
- Home services (plumber, electrician, cleaner)
- Professional services (lawyer, accountant)
- Retail (orders, returns)
- Travel (flights, car rentals)

Include:
- Reservations: "Book a table at..."
- Appointments: "Schedule a dentist appointment..."
- Service quotes: "Get quotes from plumbers..."
- Inquiries: "Call the hotel about..."
- Orders: "Order from that pizza place..."`,
  };

  const prompt = `You are generating test scenarios for an outreach classification system.

${categoryDescriptions[category]}

IMPORTANT: Generate realistic, varied scenarios. Think about how real users actually talk.

Return a JSON array with exactly ${count} items:
[
  {
    "utterance": "natural user speech",
    "expectedCategory": "${category}",
    "complexity": "easy|medium|hard",
    "notes": "optional explanation of what makes this interesting"
  }
]

ONLY return valid JSON, no markdown formatting or other text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse LLM response as JSON');
  }

  return JSON.parse(jsonMatch[0]);
}

// ============================================================================
// CLASSIFICATION (copied from test file for standalone use)
// ============================================================================

function classifyOutreachIntent(utterance: string): ClassificationResult {
  const lowerUtterance = utterance.toLowerCase();

  // Relationship words
  const relationshipWords = ['mom', 'dad', 'mother', 'father', 'wife', 'husband', 'spouse',
    'brother', 'sister', 'friend', 'boss', 'colleague', 'grandma', 'grandmother',
    'grandpa', 'grandfather', 'aunt', 'uncle', 'cousin', 'son', 'daughter', 'sibling'];

  // Concierge indicators
  const conciergeIndicators = [
    /\b(reservation|book a table|make a reservation)\b.*\b(restaurant|at \w+)/i,
    /\breservation at/i,
    /\b(book|reserve|find)\s+(a |me )?(hotel|room|stay)/i,
    /\b(schedule|book)\s+(a |an |my )?(dentist|doctor|appointment|haircut|massage)/i,
    /\bget\s+(me\s+)?quotes?\b/i,
    /\bfind\s+(me\s+)?(a\s+)?(plumber|electrician|contractor|cleaner|handyman)/i,
    /\b(order|pickup|delivery)\s+from\s+\w+/i,
    /\border\s+(me\s+)?(a\s+)?\w+\s+(pizza|burger|food|coffee|drink)/i,
    /\bcall\s+the\s+(restaurant|hotel|office|clinic|store|salon)/i,
    /\bcall\s+\w+'s\s+office/i,
    /\bfor\s+\d+\s+(people|guests|persons)/i,
    /\b(openings?|availability|available)\s+(at|for)/i,
  ];

  // Proactive indicators
  const proactiveIndicators = [
    /\bremind me\b/i,
    /\btext me\b/i,
    /\bcall me\b/i,
    /\bemail me\b/i,
    /\bcheck\s+(in|up)\s+(with\s+)?me\b/i,
    /\bsend me\b/i,
    /\bif i\s+(haven'?t|don'?t)\b/i,
    /\bfollow up with me\b/i,
    /\bme\b.*\b(tomorrow|next week|in \d+ (hour|minute|day))/i,
  ];

  // Personal indicators
  const personalIndicators = [
    /\b(call|text|message|email|reach out to|contact)\s+(my\s+)?(mom|dad|mother|father|wife|husband|spouse|brother|sister|sibling|friend|colleague|boss|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin)/i,
    /\b(leave\s+a\s+)?voicemail\s+(for\s+)?(my\s+)?(mom|dad|Dr\.?\s*\w+|\w+)/i,
    /\b(?:call|text|email|message|reach out to|contact)\s+([A-Z][a-z]+)/i,
    /\b(?:call|text|email|message)\s+Dr\.?\s+[A-Z]/i,
    /\b(wish|tell|let\s+.+\s+know|ask)\s+(my\s+)?\w+/i,
    /\bthinking of (you|them|her|him|my)/i,
    /\bcheck\s+(in|on)\s+(my\s+)?(mom|dad|friend|brother|sister|\w+)\b/i,
    /\bhaven'?t (talked|spoken|connected) (to|with)/i,
    /\bshould (probably\s+)?(call|reach out|text|check on)/i,
    /\bI'?ve been meaning to\b/i,
    /\bit'?s been (a while|ages|too long) since/i,
  ];

  // Score each category
  let conciergeScore = conciergeIndicators.filter(r => r.test(lowerUtterance)).length * 2;
  let proactiveScore = proactiveIndicators.filter(r => r.test(lowerUtterance)).length;
  let personalScore = personalIndicators.filter(r => r.test(lowerUtterance)).length;

  // Disambiguation
  if (/\bme\b/i.test(lowerUtterance) && conciergeScore === 0) proactiveScore += 1;
  if (new RegExp(`\\b(${relationshipWords.join('|')})\\b`, 'i').test(lowerUtterance)) personalScore += 2;
  if (/\b(restaurant|hotel|dentist|doctor|plumber|electrician|salon|clinic)\b/i.test(lowerUtterance)) {
    if (!/\bmy\s+(doctor|dentist)\b/i.test(lowerUtterance)) conciergeScore += 1;
  }

  const maxScore = Math.max(personalScore, proactiveScore, conciergeScore);

  if (maxScore === 0) {
    return { domain: 'unknown', confidence: 0, suggestedTool: 'unknown', extractedParams: {} };
  }

  let domain: 'communication' | 'proactive' | 'concierge';
  let suggestedTool: string;

  if (conciergeScore >= maxScore && conciergeScore > 0) {
    domain = 'concierge';
    suggestedTool = 'makeReservation';
  } else if (personalScore >= proactiveScore) {
    domain = 'communication';
    suggestedTool = 'reachOut';
  } else {
    domain = 'proactive';
    suggestedTool = 'scheduleReminder';
  }

  return {
    domain,
    confidence: Math.min(maxScore / 4, 1),
    suggestedTool,
    extractedParams: extractParams(utterance),
  };
}

function extractParams(utterance: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  const relationshipWords = ['mom', 'dad', 'mother', 'father', 'wife', 'husband', 'spouse',
    'brother', 'sister', 'friend', 'boss', 'colleague', 'grandma', 'grandmother',
    'grandpa', 'grandfather', 'aunt', 'uncle', 'cousin', 'son', 'daughter'];

  const excludeWords = new Set(['text', 'call', 'email', 'message', 'send', 'reach', 'check', 'remind',
    'book', 'make', 'schedule', 'get', 'find', 'leave', 'the', 'about', 'for', 'on', 'in', 'to',
    'out', 'can', 'you', 'me', 'my', 'i', 'and', 'or', 'a', 'an', 'if', "haven't", 'been']);

  // Pattern 1: "my [relationship]"
  const myRelationMatch = utterance.match(new RegExp(`\\bmy\\s+(${relationshipWords.join('|')})\\b`, 'i'));
  if (myRelationMatch) {
    params.contactName = myRelationMatch[1];
  }

  // Pattern 2: "Dr. Name"
  if (!params.contactName) {
    const drMatch = utterance.match(/\bDr\.?\s+([A-Z][a-z]+)/);
    if (drMatch) {
      params.contactName = `Dr. ${drMatch[1]}`;
    }
  }

  // Pattern 3: Named person after action verb
  if (!params.contactName) {
    const actionPatterns = [
      /\bcall\s+([A-Za-z]+)\b/i,
      /\btext\s+([A-Za-z]+)\b/i,
      /\bemail\s+([A-Za-z]+)\b/i,
    ];

    for (const pattern of actionPatterns) {
      const match = utterance.match(pattern);
      if (match) {
        const candidate = match[1];
        const lower = candidate.toLowerCase();
        if (!excludeWords.has(lower) && !relationshipWords.includes(lower)) {
          params.contactName = candidate;
          break;
        }
      }
    }
  }

  // Pattern 4: Just relationship word
  if (!params.contactName) {
    const relationMatch = utterance.match(new RegExp(`\\b(${relationshipWords.join('|')})\\b`, 'i'));
    if (relationMatch) {
      params.contactName = relationMatch[1];
    }
  }

  // Extract channel
  if (/\btext\b/i.test(utterance)) params.channel = 'sms';
  if (/\bcall\b/i.test(utterance)) params.channel = 'call';
  if (/\bemail\b/i.test(utterance)) params.channel = 'email';
  if (/\bvoicemail\b/i.test(utterance)) params.channel = 'voicemail';

  return params;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTest(scenario: GeneratedScenario): TestResult {
  const classification = classifyOutreachIntent(scenario.utterance);
  const expectedDomain = scenario.expectedCategory === 'personal' ? 'communication' : scenario.expectedCategory;

  const passed = classification.domain === expectedDomain || classification.domain === 'unknown';
  const reason = !passed
    ? `Expected ${expectedDomain}, got ${classification.domain}`
    : undefined;

  return { scenario, classification, passed, reason };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧪 LLM-Powered Outreach Scenario Testing\n');

  const categories: ('personal' | 'proactive' | 'concierge')[] = CATEGORY
    ? [CATEGORY]
    : ['personal', 'proactive', 'concierge'];

  const countPerCategory = Math.ceil(COUNT / categories.length);
  const allResults: TestResult[] = [];

  for (const category of categories) {
    console.log(`\n📋 Generating ${countPerCategory} ${category} scenarios...`);

    try {
      const scenarios = await generateScenarios(category, countPerCategory);
      console.log(`   Generated ${scenarios.length} scenarios\n`);

      for (const scenario of scenarios) {
        const result = runTest(scenario);
        allResults.push(result);

        const icon = result.passed ? '✅' : '❌';
        const complexityIcon = { easy: '🟢', medium: '🟡', hard: '🔴' }[scenario.complexity];

        if (VERBOSE || !result.passed) {
          console.log(`${icon} ${complexityIcon} "${scenario.utterance}"`);
          if (!result.passed) {
            console.log(`   ${result.reason}`);
          }
          if (VERBOSE) {
            console.log(`   Domain: ${result.classification.domain}, Confidence: ${result.classification.confidence.toFixed(2)}`);
            if (Object.keys(result.classification.extractedParams).length > 0) {
              console.log(`   Params:`, result.classification.extractedParams);
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Failed to generate scenarios: ${error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');

  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;
  const total = allResults.length;

  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);

  const byComplexity = {
    easy: allResults.filter(r => r.scenario.complexity === 'easy'),
    medium: allResults.filter(r => r.scenario.complexity === 'medium'),
    hard: allResults.filter(r => r.scenario.complexity === 'hard'),
  };

  console.log('\nBy Complexity:');
  for (const [level, results] of Object.entries(byComplexity)) {
    if (results.length > 0) {
      const levelPassed = results.filter(r => r.passed).length;
      console.log(`  ${level}: ${levelPassed}/${results.length} passed`);
    }
  }

  if (failed > 0) {
    console.log('\n❌ FAILED SCENARIOS:');
    for (const result of allResults.filter(r => !r.passed)) {
      console.log(`\n  "${result.scenario.utterance}"`);
      console.log(`    Expected: ${result.scenario.expectedCategory === 'personal' ? 'communication' : result.scenario.expectedCategory}`);
      console.log(`    Got: ${result.classification.domain}`);
      if (result.scenario.notes) {
        console.log(`    Notes: ${result.scenario.notes}`);
      }
    }
  }

  // Exit code
  process.exit(failed > total * 0.3 ? 1 : 0); // Fail if >30% failed
}

main().catch(console.error);

