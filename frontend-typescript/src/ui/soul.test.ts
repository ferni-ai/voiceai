/**
 * Soul System Test Utilities
 *
 * Quick test functions to verify the presence system is working.
 * Access via browser console: window.testSoul
 *
 * @example
 * // In browser console:
 * testSoul.awakening()     // Show first launch experience
 * testSoul.handoff()       // Test persona transition
 * testSoul.celebrate()     // Test celebration animation
 */

import { createLogger } from '../utils/logger.js';
import {
  celebrationBurst,
  performMagicalHandoff,
  resetAwakening,
  showFerniAwakens,
} from './soul.ui.js';

const log = createLogger('SoulTest');

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Test the awakening sequence
 */
export async function testAwakening(): Promise<void> {
  log.info('Testing awakening...');
  resetAwakening();
  await showFerniAwakens();
  log.info('Awakening test complete');
}

/**
 * Test a persona handoff
 */
export async function testHandoff(): Promise<void> {
  log.info('Testing persona handoff...');

  await performMagicalHandoff({
    fromId: 'ferni',
    fromName: 'Ferni',
    toId: 'maya',
    toName: 'Maya',
    banter: "Maya's wonderful with habits—you'll love her!",
  });

  log.info('Handoff test complete');
}

/**
 * Test celebration animation
 */
export async function testCelebration(): Promise<void> {
  log.info('Testing celebration...');
  await celebrationBurst();
  log.info('Celebration test complete');
}

/**
 * Run all tests in sequence
 */
export async function testAll(): Promise<void> {
  log.info('Running all soul tests...');

  await testCelebration();
  await sleep(500);

  await testHandoff();

  log.info('All soul tests complete');
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPOSE TO WINDOW FOR CONSOLE ACCESS
// ============================================================================

const testSoul = {
  awakening: testAwakening,
  handoff: testHandoff,
  celebrate: testCelebration,
  all: testAll,
};

// Make available globally for console testing
if (typeof window !== 'undefined') {
  (window as unknown as { testSoul: typeof testSoul }).testSoul = testSoul;
}

export default testSoul;
