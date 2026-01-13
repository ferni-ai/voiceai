/**
 * Session Recovery Module
 *
 * Handles dropped calls and session interruptions gracefully.
 * Generates appropriate recovery greetings.
 *
 * @module conversation-quality/recovery
 */
/**
 * Generate session recovery state for dropped calls
 */
export function createSessionRecoveryState(lastTopic, lastUserMessage) {
    return {
        wasDisconnected: true,
        disconnectedAt: new Date(),
        lastTopic,
        lastUserMessage,
        recoveryGreeting: generateRecoveryGreeting(lastTopic),
    };
}
/**
 * Generate a natural recovery greeting
 */
function generateRecoveryGreeting(lastTopic) {
    const greetings = [
        'Oh! We got cut off. <break time="200ms"/>Sorry about that. Where were we?',
        'Hey, I think we lost connection there. <break time="150ms"/>You still with me?',
        'Well, technology. <break time="200ms"/>I\'m back. What were you saying?',
        'Sorry about that—something happened with the connection. <break time="200ms"/>I\'m here now.',
    ];
    let greeting = greetings[Math.floor(Math.random() * greetings.length)];
    if (lastTopic) {
        greeting += ` I think we were talking about ${lastTopic}?`;
    }
    return greeting;
}
/**
 * Check if session should attempt recovery
 */
export function shouldAttemptRecovery(disconnectedAt, maxRecoveryMinutes = 5) {
    if (!disconnectedAt)
        return false;
    const minutesSince = (Date.now() - disconnectedAt.getTime()) / (1000 * 60);
    return minutesSince <= maxRecoveryMinutes;
}
//# sourceMappingURL=recovery.js.map