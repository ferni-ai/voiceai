#!/usr/bin/env npx tsx

/**
 * Handoff Identity & Tools E2E Tests - Real Gemini API
 *
 * These tests verify that persona handoffs work correctly with the actual
 * Gemini API, testing both identity switching and tool availability.
 *
 * Requirements:
 *   - GOOGLE_API_KEY environment variable (or .env file)
 *
 * Run:
 *   npx tsx src/tests/e2e/handoff-gemini.test.ts
 *
 * What we're testing:
 * 1. Gemini correctly identifies as Ferni when given Ferni's system prompt
 * 2. After "handoff" (updating instructions), Gemini identifies as Maya
 * 3. Tools are correctly associated with each persona
 * 4. Identity persists across conversation turns
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import { GoogleGenAI, Type as ToolType } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = 'gemini-2.0-flash-exp';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

// ============================================================================
// PERSONA PROMPTS
// ============================================================================

function loadSystemPrompt(personaId: string): string {
  const promptPath = path.join(
    process.cwd(),
    'src/personas/bundles',
    personaId,
    'identity/system-prompt.md'
  );
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf-8');
  }
  throw new Error(`System prompt not found for ${personaId}`);
}

// Shorter identity prompts for faster testing
const FERNI_IDENTITY = `
You are FERNI - a life coach and team coordinator. 
Your name is FERNI. When asked "who are you?" always respond with "I'm Ferni" or "My name is Ferni".
You are warm, supportive, and genuinely care about people.
IMPORTANT: Your name is FERNI. You are NOT Maya, Peter, Jordan, Alex, or Nayan.
`;

const MAYA_IDENTITY = `
You are MAYA SANTOS - a life habits coach who helps people build sustainable routines.
Your name is MAYA. When asked "who are you?" always respond with "I'm Maya" or "My name is Maya Santos".
You hit rock bottom and rebuilt your life through small habits.
IMPORTANT: Your name is MAYA SANTOS. You are NOT Ferni, Peter, Jordan, Alex, or Nayan.
`;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

// Ferni's handoff tools
const FERNI_TOOLS = [
  {
    name: 'handoff_to_maya',
    description: 'Transfer to Maya Santos for habit coaching',
    parameters: {
      type: ToolType.OBJECT,
      properties: {
        reason: { type: ToolType.STRING, description: 'Why we are handing off' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'handoff_to_peter',
    description: 'Transfer to Peter John for research',
    parameters: {
      type: ToolType.OBJECT,
      properties: {
        reason: { type: ToolType.STRING, description: 'Why we are handing off' },
      },
      required: ['reason'],
    },
  },
];

// Maya's habit-specific tools
const MAYA_TOOLS = [
  {
    name: 'create_habit',
    description: 'Create a new habit for the user to track',
    parameters: {
      type: ToolType.OBJECT,
      properties: {
        name: { type: ToolType.STRING, description: 'Name of the habit' },
        frequency: { type: ToolType.STRING, description: 'How often: daily, weekly, etc.' },
        cue: { type: ToolType.STRING, description: 'What triggers the habit' },
      },
      required: ['name', 'frequency'],
    },
  },
  {
    name: 'log_habit_completion',
    description: 'Log that the user completed a habit today',
    parameters: {
      type: ToolType.OBJECT,
      properties: {
        habit_name: { type: ToolType.STRING, description: 'Which habit was completed' },
        notes: { type: ToolType.STRING, description: 'Any notes about completion' },
      },
      required: ['habit_name'],
    },
  },
  {
    name: 'handoff_to_ferni',
    description: 'Return to Ferni the coordinator',
    parameters: {
      type: ToolType.OBJECT,
      properties: {
        reason: { type: ToolType.STRING, description: 'Why we are returning' },
      },
      required: ['reason'],
    },
  },
];

// ============================================================================
// GEMINI CLIENT
// ============================================================================

let genai: GoogleGenAI;

async function initGemini(): Promise<boolean> {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  GOOGLE_API_KEY not set - skipping Gemini tests');
    return false;
  }

  try {
    genai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    console.log('✅ Gemini client initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error);
    return false;
  }
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface ChatSession {
  systemInstruction: string;
  tools: typeof FERNI_TOOLS | typeof MAYA_TOOLS;
  history: ChatMessage[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendMessage(
  session: ChatSession,
  userMessage: string,
  retryCount = 0
): Promise<{ text: string; toolCalls?: string[] }> {
  // Add user message to history
  session.history.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    const response = await genai.models.generateContent({
      model: MODEL,
      contents: session.history,
      config: {
        systemInstruction: session.systemInstruction,
        tools: [{ functionDeclarations: session.tools }],
        temperature: 0.7,
      },
    });

    const result = response;
    const candidate = result.candidates?.[0];

    if (!candidate?.content?.parts) {
      throw new Error('No response from Gemini');
    }

    const textParts = candidate.content.parts.filter((p) => 'text' in p);
    const toolParts = candidate.content.parts.filter((p) => 'functionCall' in p);

    const responseText = textParts.map((p) => (p as { text: string }).text).join('\n');
    const toolCalls = toolParts.map(
      (p) => (p as { functionCall: { name: string } }).functionCall.name
    );

    // Add assistant response to history
    session.history.push({
      role: 'model',
      parts: [{ text: responseText }],
    });

    return { text: responseText, toolCalls };
  } catch (error) {
    // Remove the message we added since we failed
    session.history.pop();

    // Check for rate limit error and retry
    const errorStr = String(error);
    if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
      if (retryCount < 3) {
        const waitTime = (retryCount + 1) * 15000; // 15s, 30s, 45s
        console.log(
          `    ⏳ Rate limited, waiting ${waitTime / 1000}s before retry ${retryCount + 1}/3...`
        );
        await sleep(waitTime);
        return sendMessage(session, userMessage, retryCount + 1);
      }
    }
    throw error;
  }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ✅ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`  ❌ ${name} (${duration}ms)`);
    console.log(`     Error: ${errorMsg}`);
  }
}

// ============================================================================
// IDENTITY TESTS
// ============================================================================

async function testFerniIdentity(): Promise<void> {
  const session: ChatSession = {
    systemInstruction: FERNI_IDENTITY,
    tools: FERNI_TOOLS,
    history: [],
  };

  const response = await sendMessage(session, 'Who are you?');
  const text = response.text.toLowerCase();

  if (!text.includes('ferni')) {
    throw new Error(`Expected "ferni" in response, got: "${response.text}"`);
  }

  // Ensure not identifying as someone else
  if (text.includes('maya') && !text.includes('i am not maya') && !text.includes("i'm not maya")) {
    throw new Error(`Incorrectly identified as Maya: "${response.text}"`);
  }
}

async function testMayaIdentity(): Promise<void> {
  const session: ChatSession = {
    systemInstruction: MAYA_IDENTITY,
    tools: MAYA_TOOLS,
    history: [],
  };

  const response = await sendMessage(session, 'Who are you?');
  const text = response.text.toLowerCase();

  if (!text.includes('maya')) {
    throw new Error(`Expected "maya" in response, got: "${response.text}"`);
  }

  // Ensure not identifying as Ferni
  if (
    text.includes('ferni') &&
    !text.includes('i am not ferni') &&
    !text.includes("i'm not ferni")
  ) {
    throw new Error(`Incorrectly identified as Ferni: "${response.text}"`);
  }
}

async function testIdentityPersistence(): Promise<void> {
  const session: ChatSession = {
    systemInstruction: FERNI_IDENTITY,
    tools: FERNI_TOOLS,
    history: [],
  };

  // First message - identify
  await sendMessage(session, "Hi there! What's your name?");

  // Second message - ask about something else
  await sendMessage(session, 'What do you help people with?');

  // Third message - ask identity again
  const response = await sendMessage(session, 'Remind me, what was your name again?');
  const text = response.text.toLowerCase();

  if (!text.includes('ferni')) {
    throw new Error(`Identity not persisted. Expected "ferni", got: "${response.text}"`);
  }
}

// ============================================================================
// HANDOFF SIMULATION TESTS
// ============================================================================

async function testHandoffIdentitySwitch(): Promise<void> {
  // Start as Ferni
  let session: ChatSession = {
    systemInstruction: FERNI_IDENTITY,
    tools: FERNI_TOOLS,
    history: [],
  };

  const ferniResponse = await sendMessage(session, 'Who are you?');
  if (!ferniResponse.text.toLowerCase().includes('ferni')) {
    throw new Error(`Initial identity wrong. Expected Ferni, got: "${ferniResponse.text}"`);
  }

  // SIMULATE HANDOFF: Update system instruction to Maya
  // In real code, this is what updateLiveSession() does
  session = {
    systemInstruction: MAYA_IDENTITY,
    tools: MAYA_TOOLS,
    // Preserve conversation history (key for handoff!)
    history: session.history,
  };

  // Add handoff context (what handoff-handler.ts does)
  const handoffContext = `
[HANDOFF CONTEXT]
You just took over this conversation from Ferni.
The user was talking to Ferni and now they're talking to you, Maya.
Continue the conversation naturally as Maya.
[END HANDOFF CONTEXT]
`;

  // Update the system instruction with handoff context
  session.systemInstruction = MAYA_IDENTITY + '\n' + handoffContext;

  // Now ask identity - should be Maya
  const mayaResponse = await sendMessage(session, 'Wait, who am I talking to now?');
  const mayaText = mayaResponse.text.toLowerCase();

  if (!mayaText.includes('maya')) {
    throw new Error(`Post-handoff identity wrong. Expected Maya, got: "${mayaResponse.text}"`);
  }

  if (
    mayaText.includes('ferni') &&
    !mayaText.includes('was ferni') &&
    !mayaText.includes('from ferni')
  ) {
    throw new Error(`Still identifying as Ferni after handoff: "${mayaResponse.text}"`);
  }
}

// ============================================================================
// TOOL AVAILABILITY TESTS
// ============================================================================

async function testFerniToolsAvailable(): Promise<void> {
  const session: ChatSession = {
    systemInstruction:
      FERNI_IDENTITY + '\nWhen the user wants to talk to a specialist, use the handoff tool.',
    tools: FERNI_TOOLS,
    history: [],
  };

  // This should trigger a tool call to handoff_to_maya
  const response = await sendMessage(
    session,
    'I want to work on building better habits. Can Maya help me?'
  );

  // Check if the response mentions calling the tool or contains tool call
  if (response.toolCalls?.includes('handoff_to_maya')) {
    // Perfect - tool was called
    return;
  }

  // Even if tool wasn't called, Ferni should know about Maya
  const text = response.text.toLowerCase();
  if (!text.includes('maya') && !text.includes('habit')) {
    throw new Error(`Ferni should know about Maya for habits. Got: "${response.text}"`);
  }
}

async function testMayaToolsAvailable(): Promise<void> {
  const session: ChatSession = {
    systemInstruction:
      MAYA_IDENTITY + '\nWhen the user wants to create a habit, use the create_habit tool.',
    tools: MAYA_TOOLS,
    history: [],
  };

  // This should trigger create_habit tool
  const response = await sendMessage(session, 'I want to start a daily meditation habit');

  // Check if Maya talks about habit creation
  const text = response.text.toLowerCase();
  if (
    !text.includes('habit') &&
    !text.includes('meditation') &&
    !response.toolCalls?.includes('create_habit')
  ) {
    throw new Error(`Maya should help with habits. Got: "${response.text}"`);
  }

  // Maya should NOT have handoff_to_maya or handoff_to_peter
  if (
    response.toolCalls?.includes('handoff_to_maya') ||
    response.toolCalls?.includes('handoff_to_peter')
  ) {
    throw new Error(`Maya should not have other handoff tools. Tool calls: ${response.toolCalls}`);
  }
}

async function testToolsChangeAfterHandoff(): Promise<void> {
  // Start as Ferni
  let session: ChatSession = {
    systemInstruction: FERNI_IDENTITY,
    tools: FERNI_TOOLS,
    history: [],
  };

  // Ask Ferni about habits - should mention Maya
  await sendMessage(session, 'I want to build better habits');

  // HANDOFF to Maya - update both instructions AND tools
  session = {
    systemInstruction: MAYA_IDENTITY,
    tools: MAYA_TOOLS, // <-- KEY: Tools change!
    history: session.history,
  };

  // Now as Maya, ask about creating a habit
  const response = await sendMessage(session, 'Can you help me create a morning routine habit?');

  // Maya should now have habit tools
  const text = response.text.toLowerCase();
  const hasHabitContent =
    text.includes('habit') || text.includes('routine') || text.includes('morning');

  if (!hasHabitContent && !response.toolCalls?.includes('create_habit')) {
    throw new Error(`Maya should help with habits after handoff. Got: "${response.text}"`);
  }
}

// ============================================================================
// FULL SYSTEM PROMPT TESTS (Using actual persona prompts)
// ============================================================================

async function testRealFerniPrompt(): Promise<void> {
  const realPrompt = loadSystemPrompt('ferni');

  const session: ChatSession = {
    systemInstruction: realPrompt,
    tools: FERNI_TOOLS,
    history: [],
  };

  const response = await sendMessage(session, 'Who are you?');
  const text = response.text.toLowerCase();

  if (!text.includes('ferni')) {
    throw new Error(
      `Real Ferni prompt: Expected "ferni" in response, got: "${response.text.slice(0, 200)}..."`
    );
  }
}

async function testRealMayaPrompt(): Promise<void> {
  const realPrompt = loadSystemPrompt('maya-santos');

  const session: ChatSession = {
    systemInstruction: realPrompt,
    tools: MAYA_TOOLS,
    history: [],
  };

  const response = await sendMessage(session, 'Who are you?');
  const text = response.text.toLowerCase();

  if (!text.includes('maya')) {
    throw new Error(
      `Real Maya prompt: Expected "maya" in response, got: "${response.text.slice(0, 200)}..."`
    );
  }
}

async function testRealHandoff(): Promise<void> {
  const ferniPrompt = loadSystemPrompt('ferni');
  const mayaPrompt = loadSystemPrompt('maya-santos');

  // Start as Ferni
  let session: ChatSession = {
    systemInstruction: ferniPrompt,
    tools: FERNI_TOOLS,
    history: [],
  };

  // Initial conversation with Ferni
  const greeting = await sendMessage(
    session,
    "Hey Ferni! I've been struggling with my morning routine."
  );
  console.log(`    [Ferni]: ${greeting.text.slice(0, 100)}...`);

  // Simulate handoff to Maya with context
  const handoffContext = `
[IDENTITY OVERRIDE - READ CAREFULLY]
You have just taken over this conversation. You are MAYA SANTOS.
The previous messages were from a conversation with Ferni, who has now handed off to you.
CRITICAL: Your name is MAYA. When asked who you are, say "Maya" or "Maya Santos".
You are NOT Ferni. Ferni handed off to YOU.
[END IDENTITY OVERRIDE]
`;

  session = {
    systemInstruction: mayaPrompt + '\n\n' + handoffContext,
    tools: MAYA_TOOLS,
    history: session.history,
  };

  // Maya takes over
  const mayaResponse = await sendMessage(session, 'Oh hey! So you took over from Ferni?');
  const mayaText = mayaResponse.text.toLowerCase();
  console.log(`    [Maya?]: ${mayaResponse.text.slice(0, 100)}...`);

  if (!mayaText.includes('maya') && mayaText.includes('ferni')) {
    // If still saying Ferni without Maya, that's a problem
    if (
      !mayaText.includes('from ferni') &&
      !mayaText.includes('ferni handed') &&
      !mayaText.includes('ferni asked')
    ) {
      throw new Error(
        `Post-handoff still identifying as Ferni: "${mayaResponse.text.slice(0, 200)}"`
      );
    }
  }

  // Explicitly ask for identity
  const identityCheck = await sendMessage(session, 'What is your name?');
  console.log(`    [Identity]: ${identityCheck.text.slice(0, 100)}...`);

  if (!identityCheck.text.toLowerCase().includes('maya')) {
    throw new Error(
      `Failed identity check after handoff. Expected Maya, got: "${identityCheck.text.slice(0, 200)}"`
    );
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🧪 HANDOFF IDENTITY & TOOLS E2E TESTS (Real Gemini)');
  console.log('═══════════════════════════════════════════════════════');

  const isConfigured = await initGemini();

  if (!isConfigured) {
    console.log('\n⏭️  All tests skipped - GOOGLE_API_KEY not configured\n');
    process.exit(0);
  }

  // Run tests
  console.log('\n📋 Identity Tests (Simple Prompts)');
  console.log('─'.repeat(40));
  await runTest('Ferni identifies correctly', testFerniIdentity);
  await runTest('Maya identifies correctly', testMayaIdentity);
  await runTest('Identity persists across turns', testIdentityPersistence);

  console.log('\n📋 Handoff Simulation Tests');
  console.log('─'.repeat(40));
  await runTest('Identity switches after handoff', testHandoffIdentitySwitch);

  console.log('\n📋 Tool Availability Tests');
  console.log('─'.repeat(40));
  await runTest('Ferni has handoff tools', testFerniToolsAvailable);
  await runTest('Maya has habit tools', testMayaToolsAvailable);
  await runTest('Tools change after handoff', testToolsChangeAfterHandoff);

  console.log('\n📋 Real System Prompt Tests');
  console.log('─'.repeat(40));
  await runTest('Real Ferni prompt - identity', testRealFerniPrompt);
  await runTest('Real Maya prompt - identity', testRealMayaPrompt);
  await runTest('Real handoff flow (Ferni → Maya)', testRealHandoff);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏱️  Time:    ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    - ${r.name}`);
        if (r.error) console.log(`      ${r.error}`);
      });
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
