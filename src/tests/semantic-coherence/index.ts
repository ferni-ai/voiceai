/**
 * Semantic Coherence Test Suite
 *
 * Uses LLM reasoning to validate codebase naming, organization,
 * and architectural alignment with our "Better Than Human" philosophy.
 *
 * @example
 * ```bash
 * # Run all tests
 * pnpm test:semantic
 *
 * # Run specific category
 * pnpm test:semantic --category domain-naming
 *
 * # Generate report only
 * pnpm test:semantic:report
 * ```
 */

export * from './types.js';
export * from './metadata-extractor.js';
export * from './llm-evaluator.js';
export { runTests, DEFAULT_CONFIG } from './run-tests.js';
export { probeCounts, allStaticProbes } from './probes/index.js';
