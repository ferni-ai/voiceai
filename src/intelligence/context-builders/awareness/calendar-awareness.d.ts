/**
 * Calendar Awareness Context Builder
 *
 * Injects calendar context into conversations for ALL personas.
 * Each persona gets a tailored level of detail based on their specialty:
 *
 * PERSONA DETAIL LEVELS:
 * - alex-chen:    'full'      - Full calendar management (primary calendar persona)
 * - jordan-taylor: 'events'   - Event planning and celebration focus
 * - ferni:        'awareness' - General awareness for life coaching context
 * - maya-patel:   'habits'    - Habit-related schedule awareness
 * - peter-john:   'research'  - Research and focus time scheduling
 * - nayan-kumar:  'wisdom'    - Life rhythm and balance awareness
 *
 * ENHANCED WITH "BETTER THAN HUMAN" CAPABILITIES:
 * - Ambient calendar awareness (meeting starting soon, just ended)
 * - Calendar load factors (burnout detection)
 * - Recovery protection (proactive rest suggestions)
 *
 * Alex gets full BTH features, other personas get tiered awareness.
 */
import { type DayOverview } from '../../../services/calendar/calendar-service.js';
import { type CalendarAlert } from '../../../services/calendar/calendar-intelligence.js';
import { type AmbientCalendarContext } from '../../../services/calendar/ambient-calendar-awareness.js';
import { type CalendarLoadFactors } from '../../../services/calendar/calendar-load-service.js';
import { type RecoveryRecommendation } from '../../../services/calendar/recovery-protection.js';
import { type ContextBuilder } from '../index.js';
export interface CalendarAwarenessContext {
    isConnected: boolean;
    todayOverview?: DayOverview;
    alerts?: CalendarAlert[];
    nextMeetingIn?: number;
    contextInjection: string | null;
    ambientContext?: AmbientCalendarContext;
    loadFactors?: CalendarLoadFactors;
    recoveryNeeds?: RecoveryRecommendation[];
    betterThanHumanInjection?: string | null;
}
/**
 * Build calendar awareness context for ALL personas
 *
 * Returns null context if:
 * - Calendar not connected
 * - No relevant context to inject
 *
 * Different personas get different levels of detail:
 * - Alex: Full detail + full BTH (primary calendar manager)
 * - Jordan: Event planning focus (for milestone scheduling)
 * - Ferni: Light awareness + lite BTH (for life coaching)
 * - Maya: Habit schedule context + lite BTH (for routines)
 * - Peter: Research/focus time context (for deep work)
 * - Nayan: Life rhythm context + lite BTH (for wisdom)
 */
export declare function buildCalendarAwarenessContext(userId: string | undefined, personaId: string | undefined): Promise<CalendarAwarenessContext>;
/**
 * Format calendar context for speech output (used by tools)
 */
export declare function formatCalendarContextForSpeech(context: CalendarAwarenessContext): string;
/**
 * Calendar Awareness Context Builder
 *
 * Injects calendar context for ALL personas with tiered detail:
 * - Alex: Full detail + full BTH (primary calendar manager)
 * - Jordan: Event planning focus
 * - Ferni: Light awareness + lite BTH
 * - Maya: Habit schedule context + lite BTH
 * - Peter: Research/focus time context
 * - Nayan: Life rhythm context + lite BTH
 */
export declare const calendarAwarenessBuilder: ContextBuilder;
export default buildCalendarAwarenessContext;
//# sourceMappingURL=calendar-awareness.d.ts.map