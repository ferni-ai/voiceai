/**
 * Nayan's Wisdom Insights Context Builder
 *
 * > "Time in the market beats timing the market. Time in your life beats rushing your life."
 *
 * This builder loads Nayan with DEEP WISDOM INTELLIGENCE when:
 * 1. A user transfers TO Nayan from another persona
 * 2. A user starts talking directly with Nayan
 *
 * NAYAN SEES EVERYTHING - The Full Life Synthesis:
 *
 * FROM PETER (Patterns):
 * - Financial behaviors and their deeper meaning
 * - Decision patterns revealing values
 * - What the numbers say about their life
 *
 * FROM MAYA (Habits):
 * - Daily rhythms and their significance
 * - Self-compassion journey
 * - Growth vs. striving patterns
 *
 * FROM JORDAN (Milestones):
 * - Life chapters and transitions
 * - What they're building toward
 * - Legacy and meaning signals
 *
 * FROM ALEX (Communication):
 * - Relationship patterns
 * - Boundaries and self-expression
 * - How they show up for others
 *
 * FROM FERNI (Core):
 * - Emotional threads across time
 * - Relationship evolution
 * - The whole story so far
 *
 * COMPUTED METRICS (Nayan's Wisdom Dashboard):
 * - Life Integration Score (0-100): Harmony across life areas
 * - Meaning Coherence (0-100): Actions aligned with values
 * - Legacy Readiness (0-100): Long-term impact awareness
 * - Inner Peace Index (0-100): Acceptance vs. striving
 * - Growth Trajectory (0-100): Direction of evolution
 *
 * @module intelligence/context-builders/nayan-wisdom-insights
 */
import { type ContextBuilderInput, type ContextInjection } from '../../index.js';
import { clearNayanWisdomSession, clearAllNayanWisdomSessions } from './session.js';
export type * from './types.js';
export { clearNayanWisdomSession, clearAllNayanWisdomSessions };
declare function buildNayanWisdomInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildNayanWisdomInsightsContext };
//# sourceMappingURL=index.d.ts.map