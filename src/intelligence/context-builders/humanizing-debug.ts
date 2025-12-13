/**
 * Humanizing Debug Utility
 *
 * Enable detailed logging of the humanizing systems by setting:
 *   DEBUG_HUMANIZING=true
 *
 * This helps verify that all systems are working together during
 * real conversations.
 */

import type { HumanizingResult } from './humanizing.js';
import { isDebugEnabled } from '../../config/feature-flags.js';

// Use centralized feature flag system for debug toggle
const DEBUG = isDebugEnabled('humanizing');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

/**
 * Log humanizing context build result
 */
export function logHumanizingResult(result: HumanizingResult, userMessage: string): void {
  if (!DEBUG) return;

  console.log('\n');
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.bright + colors.cyan}                   🎭 HUMANIZING DEBUG${colors.reset}`
  );
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );

  // User message
  console.log(
    `${colors.dim}User: "${userMessage.slice(0, 80)}${userMessage.length > 80 ? '...' : ''}"${
      colors.reset
    }`
  );
  console.log('');

  // 1. RELATIONSHIP
  console.log(`${colors.green + colors.bright}📊 RELATIONSHIP${colors.reset}`);
  console.log(`${colors.green}   Stage: ${result.relationship.stage.toUpperCase()}${colors.reset}`);
  console.log(
    `${colors.dim}   Allowed: ${result.relationship.allowed.slice(0, 3).join(', ')}${colors.reset}`
  );
  if (result.relationship.notYetAllowed.length > 0) {
    console.log(
      `${colors.dim}   Not Yet: ${result.relationship.notYetAllowed.slice(0, 2).join(', ')}${
        colors.reset
      }`
    );
  }
  console.log('');

  // 2. MOOD
  console.log(`${colors.yellow + colors.bright}🌤️  PERSONA MOOD${colors.reset}`);
  console.log(`${colors.yellow}   State: ${result.mood.state.toUpperCase()}${colors.reset}`);
  console.log(
    `${colors.dim}   Energy: ${(result.mood.energyLevel * 100).toFixed(0)}%${colors.reset}`
  );
  console.log(`${colors.dim}   Response Length: ${result.mood.responseLengthBias}${colors.reset}`);
  console.log(`${colors.dim}   Story Frequency: ${result.mood.storyFrequency}${colors.reset}`);
  console.log(`${colors.dim}   Humor: ${result.mood.humorFrequency}${colors.reset}`);
  console.log(`${colors.dim}   Vulnerability: ${result.mood.vulnerabilityLevel}${colors.reset}`);
  console.log('');

  // 3. VOICE EMOTION
  if (result.voiceIntelligence) {
    console.log(`${colors.magenta + colors.bright}🎤 VOICE EMOTION${colors.reset}`);
    console.log(
      `${
        colors.magenta
      }   Discrepancy: ${result.voiceIntelligence.shouldAddressDiscrepancy ? 'YES ⚠️' : 'No'}${
        colors.reset
      }`
    );
    console.log(
      `${colors.dim}   Confidence: ${(result.voiceIntelligence.confidence * 100).toFixed(0)}%${
        colors.reset
      }`
    );
    console.log(
      `${
        colors.dim
      }   Stressed: ${result.voiceIntelligence.analysis.voiceSaysStressed ? '✓' : '✗'}${
        colors.reset
      }`
    );
    console.log(
      `${colors.dim}   Excited: ${result.voiceIntelligence.analysis.voiceSaysExcited ? '✓' : '✗'}${
        colors.reset
      }`
    );
    console.log(
      `${colors.dim}   Sad: ${result.voiceIntelligence.analysis.voiceSaysSad ? '✓' : '✗'}${
        colors.reset
      }`
    );
    console.log(
      `${colors.dim}   Delivery: speed=${result.voiceIntelligence.deliveryAdjustments.speed}, ` +
        `warmth=${result.voiceIntelligence.deliveryAdjustments.warmth}, ` +
        `pauses=${result.voiceIntelligence.deliveryAdjustments.pauseFrequency}${colors.reset}`
    );
    console.log('');
  }

  // 4. INNER WORLD
  if (result.innerWorldContent && result.innerWorldContent.length > 0) {
    console.log(`${colors.blue + colors.bright}🧠 INNER WORLD SHARES${colors.reset}`);
    for (const content of result.innerWorldContent) {
      console.log(`${colors.blue}   [${content.type}] (${content.depth})${colors.reset}`);
      console.log(
        `${
          colors.dim
        }   "${content.content.slice(0, 60)}${content.content.length > 60 ? '...' : ''}"${
          colors.reset
        }`
      );
      console.log(
        `${colors.dim}   Probability: ${(content.probability * 100).toFixed(0)}%${colors.reset}`
      );
    }
    console.log('');
  }

  // 5. SPONTANEOUS SHARE
  if (result.spontaneousShare) {
    console.log(`${colors.red + colors.bright}✨ SPONTANEOUS SHARE${colors.reset}`);
    console.log(`${colors.red}   Type: ${result.spontaneousShare.type}${colors.reset}`);
    console.log(
      `${colors.dim}   Transition: "${result.spontaneousShare.transition}"${colors.reset}`
    );
    console.log(
      `${colors.dim}   Content: "${result.spontaneousShare.content.slice(0, 60)}..."${colors.reset}`
    );
    console.log(`${colors.dim}   Tags: ${result.spontaneousShare.tags.join(', ')}${colors.reset}`);
    console.log('');
  }

  // 6. INJECTIONS SUMMARY
  console.log(`${colors.cyan + colors.bright}📝 CONTEXT INJECTIONS${colors.reset}`);
  console.log(`${colors.dim}   Total: ${result.injections.length}${colors.reset}`);
  for (const injection of result.injections) {
    const priorityIcon =
      injection.priority === 'critical'
        ? '🔴'
        : injection.priority === 'high'
          ? '🟠'
          : injection.priority === 'medium'
            ? '🟡'
            : '🟢';
    console.log(
      `${colors.dim}   ${priorityIcon} [${injection.priority}] ${injection.source}${colors.reset}`
    );
  }
  console.log('');

  // 7. SUMMARY
  console.log(`${colors.cyan + colors.bright}📋 SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}   ${result.summary}${colors.reset}`);

  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log('\n');
}

/**
 * Log a simple one-line summary (less verbose)
 */
export function logHumanizingSummary(result: HumanizingResult): void {
  if (!DEBUG) return;

  const parts: string[] = [];

  parts.push(`🎭 [${result.relationship.stage}]`);
  parts.push(`[${result.mood.state}]`);

  if (result.voiceIntelligence?.shouldAddressDiscrepancy) {
    parts.push('[VOICE MISMATCH ⚠️]');
  }

  if (result.innerWorldContent && result.innerWorldContent.length > 0) {
    parts.push(`[inner:${result.innerWorldContent.length}]`);
  }

  if (result.spontaneousShare) {
    parts.push(`[share:${result.spontaneousShare.type}]`);
  }

  parts.push(`[inj:${result.injections.length}]`);

  console.log(colors.cyan + parts.join(' ') + colors.reset);
}

/**
 * Validate that all humanizing systems are working
 */
export function validateHumanizingResult(result: HumanizingResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Must have relationship
  if (!result.relationship) {
    issues.push('Missing relationship behaviors');
  }

  // Must have mood
  if (!result.mood) {
    issues.push('Missing persona mood');
  }

  // Must have at least relationship injection
  if (result.injections.length === 0) {
    issues.push('No context injections produced');
  }

  // Should have relationship_behaviors source
  if (!result.injections.some((i) => i.source === 'relationship_behaviors')) {
    issues.push('Missing relationship_behaviors injection');
  }

  // Should have persona_mood source
  if (!result.injections.some((i) => i.source === 'persona_mood')) {
    issues.push('Missing persona_mood injection');
  }

  // Injections should be sorted by priority
  const priorities = result.injections.map((i) => i.priority);
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  for (let i = 0; i < priorities.length - 1; i++) {
    const currentOrder = priorityOrder.indexOf(priorities[i]);
    const nextOrder = priorityOrder.indexOf(priorities[i + 1]);
    if (currentOrder > nextOrder) {
      issues.push('Injections not sorted by priority');
      break;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Log validation result
 */
export function logValidation(result: HumanizingResult): void {
  if (!DEBUG) return;

  const validation = validateHumanizingResult(result);

  if (validation.valid) {
    console.log(`${colors.green}✅ Humanizing systems validation PASSED${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Humanizing systems validation FAILED${colors.reset}`);
    for (const issue of validation.issues) {
      console.log(`${colors.red}   - ${issue}${colors.reset}`);
    }
  }
}

export default {
  logHumanizingResult,
  logHumanizingSummary,
  validateHumanizingResult,
  logValidation,
};
