/**
 * Legacy Tool Exports
 *
 * @deprecated These exports are deprecated. Use domain-based tools instead:
 *   - buildAgentTools('agent-id') for agent-specific tool sets
 *   - domains/finance/, domains/memory/, etc. for direct imports
 *
 * See docs/TOOL_MIGRATION.md for migration guide.
 *
 * DEPRECATION SCHEDULE:
 * - Deprecated in: v2.0
 * - Will be removed in: v3.0
 */

// ============================================================================
// FINANCIAL DOMAIN (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/finance/` instead.
 */
export { createCalculatorTools } from '../calculators.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/finance/` instead.
 */
export { createEconomicTools } from '../economic.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/research/` instead.
 */
export { createMarketDataTools } from '../market-data.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/finance/` instead.
 */
export { createPersonalFinanceTools } from '../personal-finance.js';

// ============================================================================
// INFORMATION DOMAIN (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/information/` instead.
 */
export { createNewsTools } from '../news.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/information/` instead.
 */
export { createSearchTools } from '../search.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/information/` instead.
 */
export { createSportsTools } from '../sports.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/information/` instead.
 */
export { createWeatherTools } from '../weather.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/wisdom/` instead.
 */
export { createWisdomTools } from '../wisdom.js';

// ============================================================================
// HUMAN CONNECTION DOMAIN (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/life-planning/` instead.
 */
export { createLifeEventsTools } from '../life-events.js';

/**
 * @deprecated Use `buildAgentTools()` or import from conversation tools instead.
 */
export { createSmallTalkTools } from '../small-talk.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/wellness/` instead.
 */
export { createWellnessTools } from '../wellness.js';

// ============================================================================
// CONVERSATION DOMAIN (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/awareness/` instead.
 */
export { createAwarenessTools } from '../awareness.js';

/**
 * @deprecated Use `buildAgentTools()` instead. Background tools are auto-included.
 */
export { createBackgroundTools } from '../background-tools.js';

/**
 * @deprecated Use `buildAgentTools()` instead.
 */
export { createConversationTools } from '../conversation.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/memory/` instead.
 */
export { createMemoryTools } from '../memory-tools.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/proactive/` instead.
 */
export { createProactiveTools } from '../proactive.js';

/**
 * @deprecated Use `buildAgentTools()` or import from `domains/research/` instead.
 */
export { createResearchTools } from '../research-tools.js';

// ============================================================================
// CAMEO (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use domain-based cameo tools from `domains/cameo/` instead.
 */
export {
  cameoTools,
  clearCameoSessionContext,
  createCameoTools,
  setCameoSessionContext,
} from '../cameo.js';
