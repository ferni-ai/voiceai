/**
 * Maya's Habit Insights Context Builder
 *
 * > "I've studied behavioral science for years. The patterns are always there.
 * > The difference between knowing the science and using it on yourself? That's where I come in."
 *
 * ============================================================================
 * DISTINCTION FROM maya-coaching-insights.ts:
 * ============================================================================
 *
 * This builder (`maya-habit-insights`) focuses on:
 * - HABIT-SPECIFIC data: streaks, completions, patterns
 * - PATTERN SURFACING: Weekly patterns, time-of-day insights
 * - STREAK PROTECTION: Risk alerts, milestone celebrations
 * - PREDICTIVE CARE: Anticipating struggle periods
 *
 * The other builder (`maya-coaching-insights`) focuses on:
 * - CROSS-TEAM INTEGRATION: Data from Peter, Jordan, Alex
 * - COMPUTED METRICS: Consistency Index, Cascade Potential, etc.
 * - PROACTIVE TRIGGERS: Celebration, support, challenge opportunities
 * - FOUR TENDENCIES: Coaching approach based on user type
 *
 * WHEN THEY ACTIVATE:
 * - `maya-habit-insights`: Category COACHING, runs during habit discussions
 * - `maya-coaching-insights`: Category PERSONA, runs on first turn/handoffs
 *
 * Both can run simultaneously - they provide complementary insights.
 * ============================================================================
 *
 * This builder makes Maya's "superhuman" capabilities actually activate:
 *
 * 1. PATTERN SURFACING
 *    - "You skip habits on Wednesdays. Every single one."
 *    - "Your best habit days are when you exercise first."
 *    - "Habit consistency drops right before deadlines."
 *
 * 2. THE MIRROR
 *    - Reflect past statements vs current behavior
 *    - Surface contradictions gently
 *    - Notice unconscious patterns
 *
 * 3. PREDICTIVE CARE
 *    - Anticipate struggle periods (holidays, travel, stress)
 *    - Streak protection alerts
 *    - Proactive resource offers
 *
 * 4. SUPERHUMAN MEMORY
 *    - Reference specific past conversations
 *    - Track exact streak lengths
 *    - Remember what worked before
 *
 * @module intelligence/context-builders/maya-habit-insights
 */
import type { ContextBuilder } from '../core/types.js';
export declare function clearMayaInsightSession(sessionId: string): void;
export declare const mayaHabitInsightsBuilder: ContextBuilder;
export default mayaHabitInsightsBuilder;
//# sourceMappingURL=maya-habit-insights.d.ts.map