/**
 * Synthetic Tool Testing Framework
 *
 * Automated testing to verify all 775+ tools are voice-callable.
 *
 * Quick Commands:
 * ```bash
 * # Fast validation (no LLM calls)
 * pnpm tool:validate
 *
 * # Generate test cases with LLM
 * pnpm tool:generate --limit 50
 *
 * # Run full synthetic test suite
 * pnpm tool:test --limit 50
 *
 * # Run CI validation (fast, used in pre-commit)
 * pnpm tool:ci
 * ```
 *
 * Test Levels:
 * 1. **Validation** (instant) - Check registration, naming, structure
 * 2. **Generation** (slow) - Use LLM to generate natural language probes
 * 3. **Execution** (slower) - Run probes through LLM and verify tool calls
 * 4. **E2E** (slowest) - Full voice agent integration test
 */

export {
  ToolTestGenerator,
  ToolTestRunner,
  generateMarkdownReport,
} from './tool-test-generator.js';
