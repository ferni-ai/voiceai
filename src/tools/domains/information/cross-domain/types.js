/**
 * Cross-Domain Connection Types
 *
 * Type definitions for connecting information domain to other domains.
 * This enables "Better Than Human" features like:
 * - "Rainy day → suggest indoor workout"
 * - "Stressful news → offer to skip"
 * - "Long commute → offer podcast or pep talk"
 */
export const WEATHER_HABIT_MAPPINGS = [
    {
        condition: 'rainy',
        affectedHabits: ['outdoor_run', 'walk', 'cycling', 'outdoor_yoga'],
        suggestion: 'Rainy day! How about an indoor workout instead?',
        alternatives: ['indoor_workout', 'yoga', 'stretching', 'strength_training'],
    },
    {
        condition: 'very_hot',
        affectedHabits: ['outdoor_run', 'hiking', 'outdoor_sports'],
        suggestion: "It's going to be hot! Maybe exercise early morning or try something indoors?",
        alternatives: ['swimming', 'indoor_workout', 'early_morning_run'],
    },
    {
        condition: 'very_cold',
        affectedHabits: ['outdoor_activities', 'walk'],
        suggestion: "Bundle up! It's cold. Indoor activities might be more comfortable.",
        alternatives: ['indoor_workout', 'yoga', 'home_exercises'],
    },
    {
        condition: 'high_pollen',
        affectedHabits: ['outdoor_run', 'hiking', 'outdoor_yoga', 'gardening'],
        suggestion: 'Pollen is high today. If you have allergies, indoor activities might be better.',
        alternatives: ['indoor_workout', 'yoga', 'swimming'],
    },
    {
        condition: 'poor_air_quality',
        affectedHabits: ['outdoor_run', 'cycling', 'hiking', 'outdoor_sports'],
        suggestion: "Air quality isn't great. Indoor exercise would be healthier today.",
        alternatives: ['indoor_workout', 'yoga', 'stretching'],
    },
    {
        condition: 'nice_weather',
        affectedHabits: ['indoor_workout', 'treadmill'],
        suggestion: 'Beautiful day outside! Perfect for taking your workout outdoors.',
        alternatives: ['outdoor_run', 'walk', 'hiking', 'outdoor_yoga'],
    },
];
export const GRAY_DAY_INTERVENTIONS = [
    'How are you feeling today? Sometimes a few gray days in a row can affect our mood.',
    "We've had a few cloudy days. Want to do something to lift your spirits?",
    'The weather has been dreary. Would some music or a quick chat help brighten things up?',
];
//# sourceMappingURL=types.js.map