/**
 * Semantic Calendar Intelligence
 *
 * Enhanced calendar intent detection using semantic similarity.
 * Catches natural phrasing that keyword matching misses:
 *
 * - "When's my next dentist appointment?" → Calendar lookup
 * - "I need to remember to call Sarah tomorrow" → Schedule event
 * - "Push my Tuesday meeting to next week" → Reschedule
 * - "What do I have going on this weekend?" → Calendar query
 *
 * @module SemanticCalendar
 */
export type CalendarIntentType = 'query' | 'create' | 'reschedule' | 'cancel' | 'reminder' | 'availability' | 'conflict' | 'none';
export interface CalendarIntent {
    type: CalendarIntentType;
    confidence: number;
    reason: string;
    extractedInfo?: {
        timeReference?: string;
        eventType?: string;
        person?: string;
        action?: string;
    };
}
/**
 * Detect calendar intent from user message
 */
export declare function detectCalendarIntent(message: string): CalendarIntent;
export { detectCalendarIntent as default };
//# sourceMappingURL=semantic-calendar.d.ts.map