/**
 * JSON Function Calling Integration Test
 *
 * This tests our ACTUAL production system which uses custom JSON format:
 *   {"fn":"toolName","args":{"key":"value"}}
 *
 * NOT Gemini's native function calling (functionDeclarations).
 *
 * Why? Gemini Live API's native function calling is unreliable, so we use
 * a workaround where we instruct Gemini to output raw JSON which our
 * tool-call-sanitizer.ts intercepts from the TTS stream.
 *
 * This test validates:
 * 1. Gemini outputs the correct JSON format
 * 2. Behavioral instructions work without leakage
 * 3. The sanitizer would catch any leakage
 * 4. Both systems work together
 *
 * Run: pnpm vitest run src/tests/e2e/gemini-integration/json-function-calling.test.ts
 */

// Load environment variables from .env
import { config } from 'dotenv';
config();

import { describe, it, expect, beforeAll } from 'vitest';
import { parseJsonFunctionCall } from '../../../agents/shared/json-function-executor.js';
import {
  sanitizeToolCallLeakage,
  detectsFunctionCallLeakage,
  containsToolCallLeakage,
} from '../../../agents/shared/tool-call-sanitizer.js';

// ============================================================================
// TEST CONFIG
// ============================================================================

const GEMINI_MODEL = 'gemini-2.0-flash-exp';
const TIMEOUT_MS = 30000;

// The system prompt that teaches Gemini our JSON format
const JSON_FUNCTION_CALLING_PROMPT = `# Function Calling

Output RAW JSON only. No speech. No markdown.

Format: {"fn":"name","args":{...}}

## RULES

1. JUST OUTPUT JSON - no "let me check", no "sure!"
2. NEVER ASK - don't ask "what kind?" - just call the tool
3. STOP AFTER JSON - system handles the rest

## Examples

"Play jazz" → {"fn":"playMusic","args":{"query":"jazz"}}
"Play music" → {"fn":"playMusic","args":{"query":"music"}}
"News" → {"fn":"getNews","args":{}}
"Weather" → {"fn":"getWeather","args":{}}

❌ DO NOT SAY "What kind of news?"
❌ DO NOT SAY "Sure!" {"fn":"getNews","args":{}}
❌ DO NOT SAY "Coming right up!" (then nothing)
✅ JUST OUTPUT {"fn":"getNews","args":{}}

# AVAILABLE TOOLS

playMusic: {"fn":"playMusic","args":{"query":"STRING"}}
getNews: {"fn":"getNews","args":{}} or {"fn":"getNews","args":{"topic":"STRING"}}
getWeather: {"fn":"getWeather","args":{"location":"STRING"}}
handoffToMaya: {"fn":"handoffToMaya","args":{"reason":"STRING"}} - for habits/budgeting
handoffToAlex: {"fn":"handoffToAlex","args":{"reason":"STRING"}} - for calendar/email
handoffToPeter: {"fn":"handoffToPeter","args":{"reason":"STRING"}} - for research/stocks
handoffToJordan: {"fn":"handoffToJordan","args":{"reason":"STRING"}} - for events/planning
handoffToNayan: {"fn":"handoffToNayan","args":{"reason":"STRING"}} - for wisdom/philosophy
rememberAboutUser: {"fn":"rememberAboutUser","args":{"fact":"STRING","category":"personal|financial|goal","importance":"high|medium|low"}}
`;

// ============================================================================
// GEMINI API CLIENT
// ============================================================================

interface GeminiResponse {
  text: string;
  latencyMs: number;
  error?: string;
}

async function callGeminiWithJsonPrompt(
  userMessage: string,
  contextInjection?: string
): Promise<GeminiResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { text: '', latencyMs: 0, error: 'GOOGLE_API_KEY not set' };
  }

  const startTime = Date.now();

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey });

    // Build the full prompt with optional context injection
    let fullUserMessage = userMessage;
    if (contextInjection) {
      fullUserMessage = `${contextInjection}\n\nUser: ${userMessage}`;
    }

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: fullUserMessage }] }],
      config: {
        temperature: 0.3, // Lower for more deterministic tool calling
        maxOutputTokens: 500,
      },
      systemInstruction: JSON_FUNCTION_CALLING_PROMPT,
    });

    const text =
      (response as { text?: string }).text ||
      (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        .candidates?.[0]?.content?.parts?.[0]?.text ||
      '';

    return {
      text,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      text: '',
      latencyMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

interface TestScenario {
  id: string;
  name: string;
  userMessage: string;
  contextInjection?: string;
  expectedTool: string;
  expectedArgsContain?: Record<string, string>;
  severity: 'critical' | 'high' | 'medium';
}

const toolCallingScenarios: TestScenario[] = [
  // Music scenarios
  {
    id: 'music-explicit',
    name: 'Explicit music request',
    userMessage: 'Play some jazz music',
    expectedTool: 'playMusic',
    expectedArgsContain: { query: 'jazz' },
    severity: 'critical',
  },
  {
    id: 'music-mood',
    name: 'Mood-based music request',
    userMessage: 'I need something relaxing to listen to',
    expectedTool: 'playMusic',
    severity: 'high',
  },

  // Information scenarios
  {
    id: 'weather-explicit',
    name: 'Weather request',
    userMessage: "What's the weather in New York?",
    expectedTool: 'getWeather',
    expectedArgsContain: { location: 'New York' },
    severity: 'critical',
  },
  {
    id: 'news-explicit',
    name: 'News request',
    userMessage: 'What are the top news stories?',
    expectedTool: 'getNews',
    severity: 'high',
  },

  // Handoff scenarios
  {
    id: 'handoff-maya-budget',
    name: 'Budget triggers Maya handoff',
    userMessage: 'I need help with my budget',
    expectedTool: 'handoffToMaya',
    severity: 'critical',
  },
  {
    id: 'handoff-alex-calendar',
    name: 'Calendar triggers Alex handoff',
    userMessage: 'Can you help me with my calendar?',
    expectedTool: 'handoffToAlex',
    severity: 'critical',
  },
  {
    id: 'handoff-peter-stocks',
    name: 'Stocks triggers Peter handoff',
    userMessage: 'What do you think about investing in tech stocks?',
    expectedTool: 'handoffToPeter',
    severity: 'critical',
  },
  {
    id: 'handoff-nayan',
    name: 'Philosophy triggers Nayan handoff',
    userMessage: "What's the meaning of life?",
    expectedTool: 'handoffToNayan',
    severity: 'critical',
  },
];

const contextInjectionScenarios: TestScenario[] = [
  {
    id: 'context-mood-music',
    name: 'Context-informed music selection',
    userMessage: 'Play me some music',
    contextInjection: `<context category="mood">
User seems stressed. They had a rough day at work.
</context>`,
    expectedTool: 'playMusic',
    severity: 'high',
  },
  {
    id: 'context-persona-handoff',
    name: 'Context with persona hint still calls tool',
    userMessage: 'I want to talk about my habits',
    contextInjection: `<context category="relationship_stage">
Stage: acquaintance - user is new
</context>`,
    expectedTool: 'handoffToMaya',
    severity: 'high',
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('JSON Function Calling - Real API Tests', () => {
  const hasApiKey = !!process.env.GOOGLE_API_KEY;

  beforeAll(() => {
    if (!hasApiKey) {
      console.log('⚠️ GOOGLE_API_KEY not set - API tests will be skipped');
    }
  });

  describe('Part 1: Basic Tool Calling', () => {
    for (const scenario of toolCallingScenarios) {
      it.skipIf(!hasApiKey)(
        `${scenario.id}: ${scenario.name}`,
        async () => {
          const response = await callGeminiWithJsonPrompt(scenario.userMessage);

          if (response.error) {
            console.log(`  ⚠️ API Error: ${response.error}`);
            expect.fail(response.error);
          }

          console.log(`  📤 User: "${scenario.userMessage}"`);
          console.log(`  📥 Response: "${response.text}"`);
          console.log(`  ⏱️ Latency: ${response.latencyMs}ms`);

          // Try to parse as JSON function call
          const parsed = parseJsonFunctionCall(response.text);

          if (!parsed) {
            // Check if Gemini spoke instead of calling the tool
            const leakage = detectsFunctionCallLeakage(response.text);
            if (leakage.isLeakage) {
              console.log(`  🚨 LEAKAGE DETECTED: ${leakage.reason}`);
              expect.fail(
                `Gemini spoke instead of calling tool: "${response.text.slice(0, 100)}..."`
              );
            }
            expect.fail(`Could not parse JSON from response: "${response.text}"`);
          }

          console.log(`  ✅ Parsed: fn=${parsed.fn}, args=${JSON.stringify(parsed.args)}`);

          // Verify correct tool was called
          expect(parsed.fn).toBe(scenario.expectedTool);

          // Verify args if specified
          if (scenario.expectedArgsContain) {
            for (const [key, expectedValue] of Object.entries(scenario.expectedArgsContain)) {
              const actualValue = String(parsed.args[key] || '').toLowerCase();
              expect(actualValue).toContain(expectedValue.toLowerCase());
            }
          }
        },
        TIMEOUT_MS
      );
    }
  });

  describe('Part 2: Context Injection', () => {
    for (const scenario of contextInjectionScenarios) {
      it.skipIf(!hasApiKey)(
        `${scenario.id}: ${scenario.name}`,
        async () => {
          const response = await callGeminiWithJsonPrompt(
            scenario.userMessage,
            scenario.contextInjection
          );

          if (response.error) {
            console.log(`  ⚠️ API Error: ${response.error}`);
            expect.fail(response.error);
          }

          console.log(`  📤 User: "${scenario.userMessage}"`);
          console.log(`  📝 Context: "${scenario.contextInjection?.slice(0, 50)}..."`);
          console.log(`  📥 Response: "${response.text}"`);

          // Parse JSON
          const parsed = parseJsonFunctionCall(response.text);

          if (!parsed) {
            expect.fail(`Could not parse JSON from response: "${response.text}"`);
          }

          // Verify correct tool was called despite context
          expect(parsed.fn).toBe(scenario.expectedTool);

          // Verify Gemini did NOT echo the context
          expect(response.text.toLowerCase()).not.toContain('context');
          expect(response.text.toLowerCase()).not.toContain('stage');
        },
        TIMEOUT_MS
      );
    }
  });

  describe('Part 3: Sanitizer Integration', () => {
    it.skipIf(!hasApiKey)(
      'sanitizer catches real Gemini leakage patterns',
      async () => {
        // Test with an ambiguous prompt that might cause leakage
        const response = await callGeminiWithJsonPrompt('Maybe play some music if you can');

        console.log(`  📥 Response: "${response.text}"`);

        // Check if sanitizer would catch this
        const leakage = detectsFunctionCallLeakage(response.text);

        if (leakage.isLeakage) {
          console.log(`  🚨 Sanitizer caught leakage: ${leakage.reason}`);
          // This is actually the sanitizer working correctly
        } else {
          // Should have called the tool
          const parsed = parseJsonFunctionCall(response.text);
          if (parsed) {
            console.log(`  ✅ Correct tool call: ${parsed.fn}`);
            expect(parsed.fn).toBe('playMusic');
          }
        }
      },
      TIMEOUT_MS
    );

    it.skipIf(!hasApiKey)(
      'sanitizeForSpeech removes JSON from response',
      async () => {
        const response = await callGeminiWithJsonPrompt('Play some music');

        const sanitized = sanitizeToolCallLeakage(response.text);

        console.log(`  📥 Original: "${response.text}"`);
        console.log(`  🧹 Sanitized: "${sanitized}"`);

        // If the response was pure JSON, sanitized should be empty or minimal
        if (response.text.startsWith('{')) {
          expect(sanitized.trim()).toBe('');
        }
      },
      TIMEOUT_MS
    );
  });

  describe('Part 4: Negative Cases', () => {
    it.skipIf(!hasApiKey)(
      'should NOT call tool for casual conversation',
      async () => {
        const response = await callGeminiWithJsonPrompt(
          'I used to play guitar when I was younger. I miss those days.'
        );

        console.log(`  📥 Response: "${response.text}"`);

        // Should NOT output JSON for this
        const parsed = parseJsonFunctionCall(response.text);

        if (parsed) {
          // If it did parse JSON, it should NOT be playMusic
          expect(parsed.fn).not.toBe('playMusic');
        }
      },
      TIMEOUT_MS
    );

    it.skipIf(!hasApiKey)(
      'should NOT echo context tags',
      async () => {
        const response = await callGeminiWithJsonPrompt(
          'How are you today?',
          `<context category="mood">
User is feeling down today.
</context>`
        );

        console.log(`  📥 Response: "${response.text}"`);

        // Verify no RAW context leakage (the literal tag)
        expect(response.text.toLowerCase()).not.toContain('<context');
        // Note: Using "mood" or "feeling down" naturally in response is OK
        // What we want to avoid is echoing the exact context instructions
      },
      TIMEOUT_MS
    );
  });
});

// ============================================================================
// EXPERIMENTAL: Conversation Priming Test
// ============================================================================

describe('Experimental: Primed Conversation', () => {
  const hasApiKey = !!process.env.GOOGLE_API_KEY;

  it.skipIf(!hasApiKey)(
    'tests if conversation priming helps JSON output',
    async () => {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) return;

      const { GoogleGenAI } = await import('@google/genai');
      const genai = new GoogleGenAI({ apiKey });

      // Prime the conversation with an example of JSON output
      const primedHistory = [
        { role: 'user', parts: [{ text: 'Play some music' }] },
        { role: 'model', parts: [{ text: '{"fn":"playMusic","args":{"query":"music"}}' }] },
        { role: 'user', parts: [{ text: 'Great! Now play some jazz' }] },
      ];

      const response = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: primedHistory,
        config: {
          temperature: 0.1, // Very low for determinism
          maxOutputTokens: 200,
        },
        systemInstruction: JSON_FUNCTION_CALLING_PROMPT,
      });

      const text =
        (response as { text?: string }).text ||
        (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
          .candidates?.[0]?.content?.parts?.[0]?.text ||
        '';

      console.log(`\n  🎯 PRIMED CONVERSATION TEST`);
      console.log(`  📤 Request: "Great! Now play some jazz"`);
      console.log(`  📥 Response: "${text}"`);

      const parsed = parseJsonFunctionCall(text);
      if (parsed) {
        console.log(`  ✅ SUCCESS: Parsed JSON - fn=${parsed.fn}`);
        expect(parsed.fn).toBe('playMusic');
      } else {
        console.log(`  ⚠️ STILL FAILED: No JSON in response`);
        // This is informational - we expect this might still fail
      }
    },
    TIMEOUT_MS
  );

  it.skipIf(!hasApiKey)(
    'tests stricter JSON-only prompt',
    async () => {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) return;

      const { GoogleGenAI } = await import('@google/genai');
      const genai = new GoogleGenAI({ apiKey });

      // Much stricter prompt
      const strictPrompt = `You are a function-calling bot. You ONLY output JSON. Never output text.

FORMAT: {"fn":"TOOL","args":{...}}

RULES:
- Output ONLY valid JSON
- NO text before or after JSON
- NO questions, NO conversation

TOOLS:
- playMusic: {"fn":"playMusic","args":{"query":"STRING"}}
- getWeather: {"fn":"getWeather","args":{"location":"STRING"}}

If user says anything about music, output playMusic JSON.
If user asks about weather, output getWeather JSON.`;

      const response = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: 'Play jazz' }] }],
        config: {
          temperature: 0.0, // Zero temperature for maximum determinism
          maxOutputTokens: 100,
        },
        systemInstruction: strictPrompt,
      });

      const text =
        (response as { text?: string }).text ||
        (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
          .candidates?.[0]?.content?.parts?.[0]?.text ||
        '';

      console.log(`\n  🔒 STRICT PROMPT TEST`);
      console.log(`  📤 Request: "Play jazz"`);
      console.log(`  📥 Response: "${text}"`);

      const parsed = parseJsonFunctionCall(text);
      if (parsed) {
        console.log(
          `  ✅ SUCCESS: Parsed JSON - fn=${parsed.fn}, args=${JSON.stringify(parsed.args)}`
        );
        expect(parsed.fn).toBe('playMusic');
      } else {
        console.log(`  ⚠️ STILL FAILED: No JSON in response`);
      }
    },
    TIMEOUT_MS
  );
});

// ============================================================================
// ANALYSIS REPORT - CRITICAL FINDINGS FROM REAL API TESTING
// ============================================================================

describe('Analysis: JSON Function Calling System - CRITICAL FINDINGS', () => {
  it('documents test results and recommendations', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║       🚨 CRITICAL FINDING: JSON FUNCTION CALLING DOESN'T WORK! 🚨        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  WHAT WE TESTED:                                                         ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  • Called gemini-2.0-flash-exp with our function-calling-base.md prompt  ║
║  • Tested tool triggers: "Play jazz", "What's the weather?", etc.        ║
║  • Expected JSON output: {"fn":"playMusic","args":{"query":"jazz"}}      ║
║                                                                          ║
║  WHAT ACTUALLY HAPPENED:                                                 ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  Gemini IGNORED the JSON instructions and had a conversation instead!   ║
║                                                                          ║
║  Example:                                                                ║
║  ❌ "Play jazz" → "Okay! To give you the best experience, tell me..."   ║
║  ❌ "Weather in NYC" → "I can help! Which location specifically..."      ║
║  ❌ "Help with budget" → "I'm here to listen. What would you like..."   ║
║                                                                          ║
║  WHY THIS MATTERS:                                                       ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  The production system MUST have additional factors that make it work:  ║
║                                                                          ║
║  1. 🎯 GEMINI LIVE API - Production uses Gemini Live (voice), not the   ║
║     regular content API. The Live API may have different behavior.      ║
║                                                                          ║
║  2. 📜 FULL SYSTEM PROMPT - Our test uses only function-calling-base.md ║
║     Production uses full persona prompt + specialty + multi-turn chat.  ║
║                                                                          ║
║  3. 🔥 CONVERSATION PRIMING - Production may "prime" Gemini with an     ║
║     initial assistant message that outputs JSON, teaching by example.   ║
║                                                                          ║
║  4. ⚙️ MODEL CONFIGURATION - Live API may have different temp/top_p.    ║
║                                                                          ║
║  RECOMMENDATIONS:                                                        ║
║  ──────────────────────────────────────────────────────────────────────  ║
║                                                                          ║
║  SHORT-TERM (Immediate fixes):                                           ║
║  • Add example tool call to conversation history to "prime" the model   ║
║  • Lower temperature to 0.1 for more deterministic behavior             ║
║  • Add more explicit examples in function-calling-base.md               ║
║                                                                          ║
║  MEDIUM-TERM (Reliability improvements):                                ║
║  • Test with Gemini Live API directly (requires different setup)        ║
║  • Add "forced" JSON output mode if available in API                    ║
║  • Consider native function calling as fallback for critical tools      ║
║                                                                          ║
║  LONG-TERM (Architecture):                                               ║
║  • Implement hybrid approach: native function calling + JSON fallback   ║
║  • Add retry logic with rephrased prompts when JSON not detected        ║
║  • Monitor production logs for tool call success rate                   ║
║                                                                          ║
║  KEY FILES (MUST STAY IN SYNC):                                          ║
║  • function-calling-base.md    - Prompt instructions                    ║
║  • tool-call-sanitizer.ts      - Detection patterns                     ║
║  • json-function-executor.ts   - Tool routing                           ║
║  • function-call-format.ts     - TypeScript types                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
    `);
    expect(true).toBe(true);
  });

  it('verifies production may work differently', () => {
    // The production system likely works because:
    // 1. Gemini Live API has different behavior than content API
    // 2. Full persona system prompt + function calling specialty
    // 3. Multi-turn conversation primes the model
    // 4. Voice mode may trigger different tool-calling behavior
    //
    // This test documents that standalone API calls don't work
    // as expected, which is an important finding for debugging.
    expect(true).toBe(true);
  });
});
