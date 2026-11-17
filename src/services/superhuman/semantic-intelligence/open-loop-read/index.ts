/**
 * Story So Far's read of open loops: the loops and how to show them, and nothing else.
 *
 * Orchestration enters a context through an index.ts. The context's main index loads
 * every detector and store in semantic intelligence, which the web app's test build
 * cannot resolve (your-story-dashboard-contract, 2026-11-16), so the read has its own.
 *
 * @module services/superhuman/semantic-intelligence/open-loop-read
 */

export { getAllOpenLoops } from '../open-loops.js';
export { oneLoopPerWording, wholeClause } from '../open-loop-text.js';
