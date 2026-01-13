/**
 * Jordan's Milestone Insights Context Builder
 *
 * > "I can SEE this coming together!"
 *
 * This builder loads Jordan with deep life planning insights when:
 * 1. A user transfers TO Jordan from another persona
 * 2. A user starts talking directly with Jordan
 *
 * DATA SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Financial Analysis):
 * - Financial readiness for milestones
 * - Budget health for event planning
 * - Savings velocity toward goals
 * - Investment timing for major purchases
 *
 * FROM MAYA (Habits/Productivity):
 * - Habit momentum supporting goals
 * - Keystone habits driving progress
 * - Energy patterns for planning capacity
 * - Routine stability for event prep
 *
 * FROM ALEX (Calendar/Communication):
 * - Calendar density for planning windows
 * - Upcoming commitments affecting milestones
 * - Communication load analysis
 *
 * FROM NAYAN (Wisdom/Long-term):
 * - Life stage context and transitions
 * - Values alignment with goals
 * - Long-term perspective on decisions
 *
 * FROM FERNI (Memory Orchestrator):
 * - Historical milestone patterns
 * - Emotional significance of past events
 * - Relationship and family context
 * - Anniversary and date tracking
 *
 * INSIGHT CATEGORIES:
 *
 * 1. COMPUTED PLANNING METRICS
 *    - Planning Velocity Index (how fast goals progress)
 *    - Celebration Readiness Score (emotional/financial)
 *    - Life Stage Momentum (transition readiness)
 *    - Event Success Predictor
 *
 * 2. PROACTIVE DISCOVERIES
 *    - Milestone opportunities to celebrate
 *    - Anniversary and date reminders
 *    - Life stage transition signals
 *    - Goal completion approaching
 *
 * 3. CROSS-DOMAIN PATTERNS
 *    - How habits support milestone progress
 *    - Financial readiness for life events
 *    - Calendar capacity for planning
 *    - Emotional readiness indicators
 *
 * 4. SEASONAL AWARENESS
 *    - Wedding season patterns
 *    - Graduation season energy
 *    - Holiday planning windows
 *    - Personal anniversary tracking
 *
 * @module intelligence/context-builders/jordan-milestone-insights
 */
import { type ContextBuilderInput, type ContextInjection } from '../../index.js';
import { clearJordanMilestoneSession, clearAllJordanMilestoneSessions } from './session.js';
export type * from './types.js';
export { clearJordanMilestoneSession, clearAllJordanMilestoneSessions };
declare function buildJordanMilestoneInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildJordanMilestoneInsightsContext };
//# sourceMappingURL=index.d.ts.map