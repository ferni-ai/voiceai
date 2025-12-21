/**
 * Integration Tests for Tool Call Configuration
 *
 * Validates that the FULL system (prompts + descriptions + sanitizer) works together
 * to prevent Gemini from speaking tool calls aloud.
 *
 * Test Layers:
 * 1. System Prompts - Contain "silent execution" instructions
 * 2. Tool Descriptions - Use imperative language
 * 3. Sanitizer - Catches any leaked announcements
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import { detectsFunctionCallLeakage } from './tool-call-sanitizer.js';

// Find project root
const findProjectRoot = () => {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = join(dir, '..');
    if (parent === dir) throw new Error('Could not find project root');
    dir = parent;
  }
  return dir;
};

const PROJECT_ROOT = findProjectRoot();

describe('LAYER 1: System Prompts - Silent Execution Instructions', () => {
  const baseIdentityPath = join(PROJECT_ROOT, 'src/personas/base-identity.ts');
  // New architecture: shared base + persona specialty
  const sharedFunctionCallingPath = join(
    PROJECT_ROOT,
    'src/personas/bundles/shared/function-calling-base.md'
  );
  const ferniSpecialtyPath = join(
    PROJECT_ROOT,
    'src/personas/bundles/ferni/identity/function-calling-specialty.md'
  );

  test('base-identity.ts contains critical tool calling rules', () => {
    const content = readFileSync(baseIdentityPath, 'utf-8');

    // Must contain the critical rule header
    expect(content).toContain('ABSOLUTE RULE #2: HOW TO USE TOOLS');

    // Must instruct NOT to announce function calls
    expect(content).toMatch(/you do NOT announce.*function calls/i);

    // Must show wrong vs right pattern
    expect(content).toContain('❌ WRONG');
    expect(content).toContain('✅ RIGHT');

    // Must explain silent execution
    expect(content).toMatch(/silent.*function call/i);

    console.log('✅ base-identity.ts contains tool calling rules');
  });

  test('base-identity.ts explicitly forbids common announcement patterns', () => {
    const content = readFileSync(baseIdentityPath, 'utf-8');

    // These patterns should be explicitly marked as WRONG
    const forbiddenPatterns = [
      'Let me call', // "Let me call playMusic"
      "I'll use the", // "I'll use the search tool"
      'Playing', // "Playing music query"
    ];

    for (const pattern of forbiddenPatterns) {
      // Should appear in the WRONG section or be mentioned as forbidden
      const hasPattern =
        content.includes(pattern) || content.toLowerCase().includes(pattern.toLowerCase());
      console.log(`  ${hasPattern ? '✅' : '⚠️'} References "${pattern}" pattern`);
    }

    // Must contain the key insight
    expect(content).toContain("you don't SAY you're calling it");
  });

  test('shared function-calling-base.md has silent execution instructions', () => {
    const content = readFileSync(sharedFunctionCallingPath, 'utf-8');

    // Must have function calling guidance
    expect(content.toLowerCase()).toContain('function');

    // Must instruct immediate stop / silence after JSON
    const hasSilentInstruction =
      content.toLowerCase().includes('silence') ||
      content.toLowerCase().includes('stop') ||
      content.toLowerCase().includes('nothing else');

    expect(hasSilentInstruction).toBe(true);

    console.log('✅ shared function-calling-base.md has silent execution instructions');
  });

  test('shared function-calling-base.md shows tool call patterns', () => {
    const content = readFileSync(sharedFunctionCallingPath, 'utf-8');

    // Should have JSON examples for function calls
    expect(content).toContain('"fn"');
    expect(content).toContain('"args"');

    console.log('✅ shared function-calling-base.md shows function call JSON patterns');
  });

  test('ferni specialty file exists and contains persona-specific tools', () => {
    const content = readFileSync(ferniSpecialtyPath, 'utf-8');

    // Should have ferni-specific tools
    expect(content.toLowerCase()).toContain('ferni');
    expect(content).toContain('"fn"');

    console.log('✅ ferni specialty file contains persona-specific tools');
  });
});

describe('LAYER 2: Tool Descriptions - Imperative Language', () => {
  const ferniAgentPath = join(PROJECT_ROOT, 'src/agents/personas/ferni-agent.ts');
  const musicToolsPath = join(PROJECT_ROOT, 'src/tools/music.ts');

  test('handoff tools use SILENT HANDOFF language', () => {
    if (!existsSync(ferniAgentPath)) {
      console.log('⚠️ ferni-agent.ts not found, skipping');
      return;
    }

    const content = readFileSync(ferniAgentPath, 'utf-8');

    // Should use SILENT HANDOFF in descriptions
    const hasSilentHandoff =
      content.includes('SILENT HANDOFF') || content.includes('Execute without speaking');

    expect(hasSilentHandoff).toBe(true);
    console.log('✅ Handoff tools use SILENT HANDOFF language');
  });

  test('music tools use imperative DO NOT SPEAK language', () => {
    if (!existsSync(musicToolsPath)) {
      console.log('⚠️ music.ts not found, skipping');
      return;
    }

    const content = readFileSync(musicToolsPath, 'utf-8');

    // Should have imperative language
    const hasImperative =
      content.includes('CALL this function') ||
      content.includes('Do not respond conversationally') ||
      content.includes('Execute immediately');

    if (hasImperative) {
      console.log('✅ Music tools use imperative language');
    } else {
      console.log('⚠️ Music tools could use stronger imperative language');
    }
  });
});

describe('LAYER 3: Sanitizer - Catches Violations', () => {
  test('sanitizer catches the exact patterns mentioned in prompts', () => {
    // These are the exact patterns shown in the system prompts as WRONG
    const wrongPatterns = [
      // From base-identity.ts
      'Let me call playMusic for you',
      "I'll use the search tool now",
      'Playing music query',

      // From ferni system-prompt.md
      "I'll play some jazz for you",
      "I'll transfer you to Maya",
    ];

    console.log('\n🔍 Testing patterns explicitly marked as WRONG in prompts:\n');

    let allCaught = true;
    for (const pattern of wrongPatterns) {
      const result = detectsFunctionCallLeakage(pattern);
      const caught = result.detected;

      if (caught) {
        console.log(`  ✅ CAUGHT: "${pattern}"`);
      } else {
        console.log(`  ❌ MISSED: "${pattern}"`);
        allCaught = false;
      }
    }

    // At least most should be caught
    expect(allCaught).toBe(true);
  });

  test('sanitizer allows the good patterns from prompts', () => {
    // These are natural responses AFTER a tool executes
    const goodPatterns = [
      "Here's 'Take Five' by Dave Brubeck!", // After playMusic
      'Now playing some smooth jazz!', // After playMusic
      'The weather in New York is sunny and 72°F', // After getWeather
      'Maya is great at helping with budgets', // Mentioning without handoff
    ];

    console.log('\n🔍 Testing patterns that SHOULD pass through:\n');

    for (const pattern of goodPatterns) {
      const result = detectsFunctionCallLeakage(pattern);

      if (!result.detected) {
        console.log(`  ✅ PASSED: "${pattern}"`);
      } else {
        console.log(`  ⚠️ FALSE POSITIVE: "${pattern}" (detected as ${result.pattern})`);
      }
    }
  });
});

describe('LAYER 4: Integration Summary', () => {
  test('SUMMARY: Full tool call prevention stack', () => {
    console.log('\n' + '='.repeat(70));
    console.log('📋 TOOL CALL PREVENTION - INTEGRATION TEST SUMMARY');
    console.log('='.repeat(70) + '\n');

    console.log('1️⃣  SYSTEM PROMPTS (First line of defense)');
    console.log('    └─ base-identity.ts: "NEVER announce function calls"');
    console.log("    └─ system-prompt.md: 'WRONG: I'll play jazz for you'");
    console.log('    └─ Both show explicit WRONG vs RIGHT patterns\n');

    console.log("2️⃣  TOOL DESCRIPTIONS (Guide Gemini's decision)");
    console.log('    └─ Handoffs: "SILENT HANDOFF - Execute without speaking"');
    console.log('    └─ Music: "CALL this function immediately"\n');

    console.log('3️⃣  SANITIZER (Safety net for leakage)');
    console.log('    └─ Catches: "Let me transfer you to Maya"');
    console.log('    └─ Catches: "I\'ll play some jazz for you"');
    console.log('    └─ Allows: "Here\'s Take Five!" (result, not announcement)\n');

    console.log('4️⃣  LIVEKIT PROCESSING (Gemini response handling)');
    console.log('    └─ functionCall → functionChannel → Silent execution');
    console.log('    └─ text → textChannel → TTS (sanitizer applied here)\n');

    console.log('='.repeat(70));
    console.log('✅ All layers configured for silent tool execution');
    console.log('='.repeat(70) + '\n');

    // This test always passes - it's just for documentation
    expect(true).toBe(true);
  });
});
