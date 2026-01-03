/**
 * Quick LLM Conversation Generator
 * Generates a small set of synthetic conversations for testing.
 */

import { ConversationGenerator } from './conversation-generator.js';

async function main() {
  console.log('🧪 Quick Synthetic Conversation Generation');
  console.log('==========================================\n');

  const generator = new ConversationGenerator();

  // Generate 16 conversations (2 per category across difficulties)
  const conversations = await generator.generateTestSuite(16);

  await generator.saveTestSuite(conversations, 'test-suite-latest.json');

  console.log('\n✅ Done! Run the tests with:');
  console.log('pnpm vitest run src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts');
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
