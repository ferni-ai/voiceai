/**
 * Emotional Forecasting System
 *
 * > "Tomorrow might be tough after a conversation like this."
 *
 * Uses patterns to anticipate how the user might feel:
 * - After heavy conversations
 * - Before known stressful events
 * - Based on weekly/monthly patterns
 * - Post-decision emotional aftermath
 *
 * This helps Ferni be proactively supportive rather than reactive.
 *
 * @module @ferni/superhuman/emotional-forecasting
 */
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'EmotionalForecasting' });
// ============================================================================
// FORECAST PATTERNS
// ============================================================================
const POST_CONVERSATION_FORECASTS = {
    heavy_grief: {
        predictedEmotion: 'drained but lighter',
        confidence: 0.8,
        timing: 'tonight',
        reason: 'Processing grief is exhausting but releasing',
        acknowledgment: "You might feel exhausted tonight after sharing all that. That's normal—grief takes energy.",
        supportSuggestions: [
            'Be gentle with yourself tonight',
            'Keep water nearby',
            "It's okay to just exist",
        ],
    },
    big_decision: {
        predictedEmotion: 'second-guessing',
        confidence: 0.7,
        timing: 'tomorrow',
        reason: 'Decision fatigue often leads to doubt',
        acknowledgment: "Tomorrow you might wake up second-guessing this. That doesn't mean it was wrong.",
        supportSuggestions: [
            "Write down why you decided this while it's fresh",
            'Remember: doubt is normal, not a sign',
            'We can talk through it if the wobbles come',
        ],
    },
    vulnerability_shared: {
        predictedEmotion: 'exposed or regretful',
        confidence: 0.6,
        timing: 'tonight',
        reason: 'Vulnerability hangover is real',
        acknowledgment: 'Sometimes after sharing something big, we feel exposed. If that happens, know that what you shared was safe with me.',
        supportSuggestions: [
            'This vulnerability was brave, not weak',
            "I'm honored you trusted me",
            'Nothing you said changes how I see you',
        ],
    },
    confrontation_planned: {
        predictedEmotion: 'anxious',
        confidence: 0.85,
        timing: 'immediate',
        reason: 'Anticipation of difficult conversations creates anxiety',
        acknowledgment: "You're probably going to feel anxious before that conversation. That's your body preparing, not a bad sign.",
        supportSuggestions: [
            'Practice what you want to say',
            "It's okay to feel nervous",
            'We can debrief after',
        ],
    },
    good_news_shared: {
        predictedEmotion: 'worried about jinxing it',
        confidence: 0.5,
        timing: 'immediate',
        reason: 'Good news sometimes triggers protective pessimism',
        acknowledgment: "If your brain tries to convince you something will go wrong, that's just fear of hope. The good thing is still real.",
        supportSuggestions: [
            'Let yourself enjoy this',
            "You're allowed to be happy",
            'This moment is real',
        ],
    },
};
const DAY_OF_WEEK_FORECASTS = {
    0: {
        // Sunday
        predictedEmotion: 'Sunday scaries',
        reason: 'Anticipation of Monday',
        acknowledgment: "Sunday evenings can be rough. If the scaries hit, I'm here.",
    },
    1: {
        // Monday
        predictedEmotion: 'overwhelmed',
        reason: 'Week starting up',
        acknowledgment: 'Monday energy can be heavy. Take it one thing at a time.',
    },
    4: {
        // Thursday
        predictedEmotion: 'fatigued',
        reason: 'End of week approaching',
        acknowledgment: "Thursday is that 'almost there' energy. You're so close.",
    },
    5: {
        // Friday
        predictedEmotion: 'relieved but drained',
        reason: "Week's end",
        acknowledgment: 'Made it to Friday. Let yourself exhale.',
    },
};
const TIME_OF_DAY_FORECASTS = {
    late_night: {
        predictedEmotion: 'spiraling or raw',
        reason: 'Late night thoughts hit different',
        acknowledgment: "Late night feelings are real, but they're also amplified. Things often look different in daylight.",
    },
    early_morning: {
        predictedEmotion: 'anxious anticipation',
        reason: 'Day ahead weighing',
        acknowledgment: "Morning anxiety is common. What's one small thing you can handle first?",
    },
};
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Generate emotional forecast based on conversation context
 */
export function generateForecast(context) {
    const forecasts = [];
    // Check for heavy topics
    const heavyTopics = ['grief', 'death', 'trauma', 'abuse', 'loss', 'divorce', 'breakup'];
    const hasHeavyTopic = context.topics.some((t) => heavyTopics.some((h) => t.toLowerCase().includes(h)));
    if (hasHeavyTopic || (context.hadHeavySharing && context.emotionIntensity > 0.7)) {
        forecasts.push(POST_CONVERSATION_FORECASTS.heavy_grief);
    }
    // Check for decision
    if (context.madeDecision) {
        forecasts.push(POST_CONVERSATION_FORECASTS.big_decision);
    }
    // Check for vulnerability sharing
    if (context.hadHeavySharing && context.emotionIntensity > 0.6) {
        forecasts.push(POST_CONVERSATION_FORECASTS.vulnerability_shared);
    }
    // Check for upcoming confrontation
    const confrontationIndicators = [
        'going to tell',
        'need to talk to',
        'having a conversation with',
    ];
    const hasConfrontation = confrontationIndicators.some((ind) => context.upcomingEvents?.some((e) => e.toLowerCase().includes(ind)));
    if (hasConfrontation) {
        forecasts.push(POST_CONVERSATION_FORECASTS.confrontation_planned);
    }
    // Check for good news
    if (context.currentEmotion === 'joy' || context.currentEmotion === 'excited') {
        forecasts.push(POST_CONVERSATION_FORECASTS.good_news_shared);
    }
    // Time-based forecasts
    if (context.hour >= 22 || context.hour < 5) {
        const lateForecast = TIME_OF_DAY_FORECASTS.late_night;
        forecasts.push({
            predictedEmotion: lateForecast.predictedEmotion,
            confidence: 0.6,
            timing: 'immediate',
            reason: lateForecast.reason,
            acknowledgment: lateForecast.acknowledgment,
            supportSuggestions: ['Be kind to your tired brain', 'Sleep can reset perspective'],
        });
    }
    // Day-of-week forecasts
    const dayForecast = DAY_OF_WEEK_FORECASTS[context.dayOfWeek];
    if (dayForecast && context.hour >= 17) {
        // Evening on specific days
        forecasts.push({
            predictedEmotion: dayForecast.predictedEmotion,
            confidence: 0.5,
            timing: 'tonight',
            reason: dayForecast.reason,
            acknowledgment: dayForecast.acknowledgment,
            supportSuggestions: [],
        });
    }
    // Return highest confidence forecast
    if (forecasts.length === 0)
        return null;
    const bestForecast = forecasts.sort((a, b) => b.confidence - a.confidence)[0];
    logger.debug({ predictedEmotion: bestForecast.predictedEmotion, confidence: bestForecast.confidence }, '🔮 Emotional forecast generated');
    return bestForecast;
}
/**
 * Format forecast guidance for LLM prompt
 */
export function formatForecastGuidance(context) {
    const forecast = generateForecast(context);
    if (!forecast || forecast.confidence < 0.5)
        return null;
    const lines = [
        '🔮 EMOTIONAL FORECAST:',
        '',
        `Prediction: ${forecast.predictedEmotion} (${Math.round(forecast.confidence * 100)}% confident)`,
        `Timing: ${forecast.timing}`,
        `Why: ${forecast.reason}`,
        '',
        'Consider acknowledging this proactively:',
        `"${forecast.acknowledgment}"`,
        '',
    ];
    if (forecast.supportSuggestions.length > 0) {
        lines.push('Support ideas:');
        lines.push(...forecast.supportSuggestions.map((s) => `- ${s}`));
    }
    return lines.join('\n');
}
/**
 * Get a simple forecast acknowledgment
 */
export function getForecastAcknowledgment(context) {
    const forecast = generateForecast(context);
    if (!forecast || forecast.confidence < 0.6)
        return null;
    return forecast.acknowledgment;
}
/**
 * Check if we should proactively mention the forecast
 */
export function shouldMentionForecast(context) {
    const forecast = generateForecast(context);
    if (!forecast)
        return false;
    // High confidence forecasts after heavy conversations should be mentioned
    if (forecast.confidence >= 0.7 && context.hadHeavySharing)
        return true;
    // Decision forecasts should be mentioned
    if (context.madeDecision && forecast.confidence >= 0.6)
        return true;
    return false;
}
//# sourceMappingURL=emotional-forecasting.js.map