/**
 * Engagement Domain - Helper Functions
 *
 * Utility functions for engagement games and activities.
 *
 * @module engagement/helpers
 */
// ============================================================================
// WEATHER INSIGHT GENERATION
// ============================================================================
export function generateWeatherInsight(trends) {
    const insights = [];
    if (trends.dominantWeather) {
        const weatherMeanings = {
            sunny: 'Your dominant weather is sunny— <break time="200ms"/>you\'re in a good place overall.',
            'partly-cloudy': 'Partly cloudy is your norm— <break time="200ms"/>realistic, grounded, neither extreme.',
            cloudy: 'There\'s been a lot of cloud cover. <break time="200ms"/>What\'s weighing on you?',
            rainy: 'Rain has been frequent. <break time="200ms"/>That\'s data, not judgment. <break time="200ms"/>What do you need?',
            stormy: 'Storms have been brewing. <break time="200ms"/>Let\'s talk about what\'s creating the turbulence.',
            foggy: 'Lots of fog— <break time="200ms"/>uncertainty, unclear direction. <break time="200ms"/>That\'s worth exploring.',
            rainbow: 'Rainbows showing up— <break time="200ms"/>you\'re finding beauty even in difficulty.',
        };
        insights.push(weatherMeanings[trends.dominantWeather] || '');
    }
    if (trends.energyTrend === 'increasing') {
        insights.push('Your energy is trending up. <break time="200ms"/>Something\'s working.');
    }
    else if (trends.energyTrend === 'decreasing') {
        insights.push('Energy is trending down. <break time="200ms"/>What\'s draining you?');
    }
    if (trends.pattern) {
        insights.push(`I noticed: ${trends.pattern}`);
    }
    return insights.join('\n');
}
// ============================================================================
// DOMAIN INSIGHT GENERATION
// ============================================================================
export function generateDomainInsight(domain, rating) {
    if (rating >= 8) {
        return `${domain} at ${rating}/10— <break time=\"200ms\"/>this is thriving. <break time=\"200ms\"/>What's making it work?`;
    }
    else if (rating >= 6) {
        return `${domain} at ${rating}/10— <break time=\"200ms\"/>solid but room to grow. <break time=\"200ms\"/>What would make it a 9?`;
    }
    else if (rating >= 4) {
        return `${domain} at ${rating}/10— <break time=\"200ms\"/>this needs attention. <break time=\"200ms\"/>What's one small improvement?`;
    }
    else {
        return `${domain} at ${rating}/10— <break time=\"200ms\"/>this is a growth area. <break time=\"200ms\"/>What's blocking progress here?`;
    }
}
//# sourceMappingURL=helpers.js.map