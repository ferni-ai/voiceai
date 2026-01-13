/**
 * Error Humanizer
 *
 * Translates technical errors into human-friendly explanations
 * that Ferni can use to communicate with users.
 *
 * "Better than human" means explaining what went wrong in a way
 * that's warm, honest, and reassuring.
 */
// Error pattern → Human explanation
const ERROR_HUMANIZATIONS = [
    // Connection issues
    {
        pattern: /assignment.*timed?\s*out/i,
        humanize: () => ({
            userMessage: "I had a brief moment where I couldn't connect - like when your phone drops a bar for a second. I'm here now though!",
            technicalSummary: 'LiveKit assignment timeout - server did not respond to availability',
            severity: 'moderate',
            shouldNotifyUser: true,
            recoveryHint: 'Automatic retry should resolve this',
        }),
    },
    {
        pattern: /socket hang up|ECONNRESET/i,
        humanize: () => ({
            userMessage: 'Oops, our connection hiccuped for a second there. All good now - what were you saying?',
            technicalSummary: 'Network connection reset unexpectedly',
            severity: 'minor',
            shouldNotifyUser: false,
        }),
    },
    {
        pattern: /ETIMEDOUT|timeout/i,
        humanize: () => ({
            userMessage: "Things got a bit slow on my end for a moment - like when you're waiting for a page to load. I'm back up to speed now!",
            technicalSummary: 'Network timeout',
            severity: 'minor',
            shouldNotifyUser: false,
        }),
    },
    // Resource issues
    {
        pattern: /out of memory|heap/i,
        humanize: () => ({
            userMessage: 'I was thinking about a lot of things at once and got a bit overwhelmed. Took a quick mental reset - feeling better now!',
            technicalSummary: 'Memory pressure or OOM condition',
            severity: 'major',
            shouldNotifyUser: true,
            recoveryHint: 'Container restart may be needed',
        }),
    },
    {
        pattern: /VAD|voice activity/i,
        humanize: () => ({
            userMessage: 'I had trouble hearing for a second there - almost like when you have water in your ear. Can you say that again?',
            technicalSummary: 'Voice Activity Detection failure',
            severity: 'moderate',
            shouldNotifyUser: true,
        }),
    },
    {
        pattern: /TTS|text.to.speech|cartesia/i,
        humanize: () => ({
            userMessage: 'I had trouble finding my voice for a moment - like when you wake up and your voice is all scratchy. All good now!',
            technicalSummary: 'Text-to-Speech service failure',
            severity: 'moderate',
            shouldNotifyUser: true,
        }),
    },
    // Session issues
    {
        pattern: /disconnect|room.*closed/i,
        humanize: () => ({
            userMessage: "Looks like we got disconnected for a moment. These things happen sometimes with voice calls. I'm back though!",
            technicalSummary: 'Session disconnected unexpectedly',
            severity: 'moderate',
            shouldNotifyUser: true,
        }),
    },
    {
        pattern: /initialization.*failed|init.*timeout/i,
        humanize: () => ({
            userMessage: 'I needed an extra moment to get ready - kind of like when you need a second to collect your thoughts. Ready now!',
            technicalSummary: 'Service initialization failure',
            severity: 'minor',
            shouldNotifyUser: false,
        }),
    },
    // IPC issues
    {
        pattern: /IPC|channel.*closed/i,
        humanize: () => ({
            userMessage: 'I had a small internal mix-up - like when you forget what you were about to say. All sorted now!',
            technicalSummary: 'Inter-process communication failure',
            severity: 'moderate',
            shouldNotifyUser: false,
            recoveryHint: 'Child process may need restart',
        }),
    },
    // Generic fallback
    {
        pattern: /.*/,
        humanize: () => ({
            userMessage: "I had a small technical hiccup, but I'm back now. What's on your mind?",
            technicalSummary: 'Unknown error type',
            severity: 'minor',
            shouldNotifyUser: false,
        }),
    },
];
/**
 * Convert a technical error into a human-friendly explanation
 */
export function humanizeError(error) {
    const errorStr = error instanceof Error ? `${error.name}: ${error.message}` : error;
    for (const { pattern, humanize } of ERROR_HUMANIZATIONS) {
        const match = errorStr.match(pattern);
        if (match) {
            return humanize(match, error instanceof Error ? error : new Error(errorStr));
        }
    }
    // Should never reach here due to fallback pattern, but TypeScript needs it
    return {
        userMessage: "I had a small hiccup, but I'm here now. What were you saying?",
        technicalSummary: 'Unknown error',
        severity: 'minor',
        shouldNotifyUser: false,
    };
}
/**
 * Get a recovery message based on context
 */
export function getRecoveryMessage(context) {
    if (context.wasInConversation && context.lastUserMessage) {
        return `I'm back now! You were saying something about ${context.lastUserMessage.slice(0, 30)}...?`;
    }
    if (context.wasInConversation) {
        return "I'm back! Sorry about that little interruption. Where were we?";
    }
    return "Hey there! I'm ready whenever you are.";
}
//# sourceMappingURL=error-humanizer.js.map