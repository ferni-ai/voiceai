/**
 * Temporal Context Engine
 *
 * Awareness of life rhythms and temporal context.
 *
 * @module @ferni/conversation/temporal-context/engine
 */
import { seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import { generateContent, getContentWithFallback, } from '../../services/llm-dynamic-content.js';
import { CLOSINGS, DAY_CONTEXT_PHRASES, EVENT_FOLLOW_UPS, GREETINGS, TEMPORAL_MOODS, } from './content.js';
const logger = createLogger({ module: 'TemporalContext' });
export class TemporalContextEngine {
    upcomingEvents = [];
    lastCheckInTurn = -10;
    turnCount = 0;
    constructor() {
        logger.debug('TemporalContextEngine initialized');
    }
    /**
     * Get current temporal state
     */
    getState(now = new Date()) {
        const hour = now.getHours();
        const day = now.getDay();
        const timeOfDay = this.getTimeOfDay(hour);
        const dayType = this.getDayType(day);
        const mood = this.getTemporalMood(day, hour);
        const daysUntilWeekend = this.getDaysUntilWeekend(day);
        const specialContext = this.getSpecialContext(now);
        return {
            now,
            timeOfDay,
            dayType,
            mood,
            isLate: hour >= 23 || hour < 5,
            daysUntilWeekend,
            specialContext,
            upcomingEvents: this.upcomingEvents.filter((e) => !e.followedUp),
        };
    }
    /**
     * Get temporal guidance for response
     */
    getGuidance(turnCount, now = new Date()) {
        this.turnCount = turnCount;
        const state = this.getState(now);
        const guidance = {
            greeting: null,
            closing: null,
            checkIn: null,
            eventFollowUp: null,
            toneAdjustment: this.getToneAdjustment(state),
            expectedEnergy: this.getExpectedEnergy(state),
        };
        // Greeting only on turn 1
        if (turnCount === 1) {
            guidance.greeting = this.getGreeting(state);
        }
        // Time-contextual check-in
        if (turnCount <= 3 && turnCount - this.lastCheckInTurn >= 2) {
            guidance.checkIn = this.getContextualCheckIn(state);
            this.lastCheckInTurn = turnCount;
        }
        // Event follow-up
        const eventFollowUp = this.getEventFollowUp(now);
        if (eventFollowUp && turnCount > 1) {
            guidance.eventFollowUp = eventFollowUp;
        }
        return guidance;
    }
    /**
     * Get a closing appropriate for time
     */
    getClosing(now = new Date(), context) {
        const state = this.getState(now);
        // Try LLM-generated closing first
        const llmContext = {
            contentType: 'closing',
            emotion: context?.emotion,
            topic: context?.topic,
            metadata: {
                timeOfDay: state.timeOfDay,
                conversationLength: 'medium',
            },
        };
        const llmContent = getContentWithFallback(llmContext);
        if (llmContent.source === 'llm' && llmContent.content) {
            return llmContent.content;
        }
        // Fallback to template
        const closings = CLOSINGS[state.timeOfDay];
        return seededPick(`${Date.now()}:closing`, closings) ?? closings[0];
    }
    /**
     * Get a closing asynchronously with fresh LLM generation
     */
    async getClosingAsync(now = new Date(), context) {
        const state = this.getState(now);
        const llmContext = {
            contentType: 'closing',
            emotion: context?.emotion,
            topic: context?.topic,
            metadata: {
                timeOfDay: state.timeOfDay,
                conversationLength: 'medium',
            },
        };
        const llmContent = await generateContent(llmContext);
        if (llmContent && llmContent.content) {
            return llmContent.content;
        }
        return this.getClosing(now, context);
    }
    /**
     * Record an upcoming event mentioned by user
     */
    recordEvent(description, date, category, sentiment, turnCount) {
        const existing = this.upcomingEvents.find((e) => e.description.toLowerCase() === description.toLowerCase());
        if (!existing) {
            this.upcomingEvents.push({
                description,
                date,
                category,
                sentiment,
                followedUp: false,
                mentionedTurn: turnCount,
            });
            logger.debug({ description, date, sentiment }, 'Event recorded');
        }
    }
    /**
     * Extract events from user message
     */
    extractEvents(message, turnCount) {
        const extracted = [];
        const now = new Date();
        const patterns = [
            {
                pattern: /i have (?:a |an |my )?(.+?) (tomorrow|today|next week|this week)/i,
                timeframe: 1,
            },
            {
                pattern: /(?:interview|meeting|appointment|date|exam|test|deadline|presentation) (?:is |on )?(.+)/i,
                timeframe: 1,
            },
            {
                pattern: /(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday) i (?:have|'ve got) (.+)/i,
                timeframe: 0,
            },
        ];
        for (const { pattern } of patterns) {
            const match = pattern.exec(message);
            if (match) {
                const description = match[1]?.trim();
                if (description && description.length > 3) {
                    const date = this.estimateDate(message, now);
                    const sentiment = this.estimateSentiment(message);
                    const category = this.categorizeEvent(description);
                    const event = {
                        description,
                        date,
                        category,
                        sentiment,
                        followedUp: false,
                        mentionedTurn: turnCount,
                    };
                    extracted.push(event);
                    this.upcomingEvents.push(event);
                }
            }
        }
        return extracted;
    }
    /**
     * Mark event as followed up
     */
    markEventFollowedUp(description) {
        const event = this.upcomingEvents.find((e) => e.description.toLowerCase() === description.toLowerCase());
        if (event) {
            event.followedUp = true;
        }
    }
    /**
     * Get all events
     */
    getEvents() {
        return [...this.upcomingEvents];
    }
    /**
     * Reset for new session (keeps events)
     */
    resetSession() {
        this.lastCheckInTurn = -10;
        this.turnCount = 0;
        logger.debug('TemporalContextEngine session reset');
    }
    /**
     * Full reset
     */
    reset() {
        this.upcomingEvents = [];
        this.lastCheckInTurn = -10;
        this.turnCount = 0;
        logger.debug('TemporalContextEngine fully reset');
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    getTimeOfDay(hour) {
        if (hour >= 5 && hour < 7)
            return 'early_morning';
        if (hour >= 7 && hour < 12)
            return 'morning';
        if (hour >= 12 && hour < 14)
            return 'midday';
        if (hour >= 14 && hour < 18)
            return 'afternoon';
        if (hour >= 18 && hour < 21)
            return 'evening';
        if (hour >= 21 && hour < 24)
            return 'night';
        return 'late_night';
    }
    getDayType(day) {
        if (day === 1)
            return 'monday';
        if (day === 5)
            return 'friday';
        if (day === 6)
            return 'saturday';
        if (day === 0)
            return 'sunday';
        return 'weekday';
    }
    getTemporalMood(day, hour) {
        for (const [, patterns] of Object.entries(TEMPORAL_MOODS)) {
            for (const pattern of patterns) {
                if (pattern.days.includes(day) && pattern.hours.includes(hour)) {
                    return pattern.mood;
                }
            }
        }
        return 'transition';
    }
    getDaysUntilWeekend(day) {
        if (day === 0)
            return 0;
        if (day === 6)
            return 0;
        return 6 - day;
    }
    getSpecialContext(now) {
        const month = now.getMonth();
        const date = now.getDate();
        if (month === 11 && date >= 20)
            return 'holiday_season';
        if (month === 0 && date <= 3)
            return 'new_year';
        if (month === 1 && date === 14)
            return 'valentines';
        if (month >= 2 && month <= 4)
            return 'spring';
        if (month >= 5 && month <= 7)
            return 'summer';
        if (month >= 8 && month <= 10)
            return 'fall';
        if (month === 11 || month <= 1)
            return 'winter';
        return null;
    }
    getGreeting(state) {
        const greetings = GREETINGS[state.timeOfDay];
        return seededPick(`${Date.now()}:greeting`, greetings) ?? greetings[0];
    }
    getContextualCheckIn(state) {
        const dayPhrases = DAY_CONTEXT_PHRASES[state.dayType];
        if (!dayPhrases)
            return null;
        const timePhrases = dayPhrases[state.timeOfDay];
        if (!timePhrases || timePhrases.length === 0)
            return null;
        return seededPick(`${Date.now()}:checkin`, timePhrases) ?? timePhrases[0];
    }
    getToneAdjustment(state) {
        switch (state.mood) {
            case 'fresh_start':
                return 'Energetic, optimistic, forward-looking';
            case 'grinding':
                return 'Supportive, steady, efficient';
            case 'anticipation':
                return 'Lighter, excited energy';
            case 'freedom':
                return 'Relaxed, casual, warm';
            case 'winding_down':
                return 'Gentle, understanding, possibly addressing anxiety';
            case 'reflective':
                return 'Quiet, thoughtful, deeper';
            default:
                return 'Adaptive';
        }
    }
    getExpectedEnergy(state) {
        if (state.isLate)
            return 'lower';
        if (state.timeOfDay === 'early_morning')
            return 'lower';
        if (state.mood === 'freedom' || state.mood === 'anticipation')
            return 'higher';
        if (state.mood === 'winding_down')
            return 'lower';
        return 'normal';
    }
    getEventFollowUp(now) {
        const unfollowedEvents = this.upcomingEvents.filter((e) => !e.followedUp);
        if (unfollowedEvents.length === 0)
            return null;
        for (const event of unfollowedEvents) {
            const daysUntil = Math.floor((event.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            let templates;
            let timeframe;
            if (daysUntil < 0) {
                templates = EVENT_FOLLOW_UPS.past;
                timeframe = '';
            }
            else if (daysUntil === 0) {
                templates = EVENT_FOLLOW_UPS.today;
                timeframe = 'today';
            }
            else if (daysUntil === 1) {
                templates = EVENT_FOLLOW_UPS.approaching;
                timeframe = 'tomorrow';
            }
            else if (daysUntil <= 7) {
                templates = EVENT_FOLLOW_UPS.approaching;
                timeframe = `in ${daysUntil} days`;
            }
            else {
                continue;
            }
            const template = seededPick(`${Date.now()}:event`, templates) ?? templates[0];
            event.followedUp = true;
            return template.replace('{event}', event.description).replace('{timeframe}', timeframe);
        }
        return null;
    }
    estimateDate(message, now) {
        const lower = message.toLowerCase();
        const date = new Date(now);
        if (/today/.test(lower))
            return date;
        if (/tomorrow/.test(lower)) {
            date.setDate(date.getDate() + 1);
            return date;
        }
        if (/next week/.test(lower)) {
            date.setDate(date.getDate() + 7);
            return date;
        }
        if (/this week/.test(lower)) {
            date.setDate(date.getDate() + 3);
            return date;
        }
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
            if (lower.includes(days[i])) {
                const currentDay = now.getDay();
                let daysUntil = i - currentDay;
                if (daysUntil <= 0)
                    daysUntil += 7;
                date.setDate(date.getDate() + daysUntil);
                return date;
            }
        }
        date.setDate(date.getDate() + 3);
        return date;
    }
    estimateSentiment(message) {
        const lower = message.toLowerCase();
        if (/(excited|looking forward|can't wait|pumped)/i.test(lower))
            return 'positive';
        if (/(nervous|anxious|worried|scared|stressed)/i.test(lower))
            return 'anxious';
        if (/(dreading|hate|don't want|ugh)/i.test(lower))
            return 'dreading';
        return 'neutral';
    }
    categorizeEvent(description) {
        const lower = description.toLowerCase();
        if (/(interview|meeting|presentation|deadline|work|boss|client)/i.test(lower))
            return 'work';
        if (/(doctor|dentist|therapy|appointment|health)/i.test(lower))
            return 'health';
        if (/(party|dinner|date|friend|wedding|birthday)/i.test(lower))
            return 'social';
        if (/(anniversary|graduation|birthday|milestone)/i.test(lower))
            return 'milestone';
        if (/(family|mom|dad|brother|sister|kid)/i.test(lower))
            return 'personal';
        return 'other';
    }
}
export default TemporalContextEngine;
//# sourceMappingURL=engine.js.map