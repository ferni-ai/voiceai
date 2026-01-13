/**
 * Time-Aware Content
 *
 * Adapts landing page content based on time of day.
 * On-brand for Ferni's "2am presence" positioning.
 *
 * @module services/landing-intelligence/time-aware
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'TimeAware' });
// ============================================================================
// TIME MODE DETERMINATION
// ============================================================================
export function getTimeMode(hour) {
    const h = hour ?? new Date().getHours();
    if (h >= 0 && h < 5)
        return 'late-night';
    if (h >= 5 && h < 8)
        return 'early-morning';
    if (h >= 8 && h < 12)
        return 'morning';
    if (h >= 12 && h < 17)
        return 'afternoon';
    if (h >= 17 && h < 21)
        return 'evening';
    return 'night';
}
// ============================================================================
// CONTENT BY TIME MODE
// ============================================================================
const TIME_CONTENT = {
    'late-night': {
        mode: 'late-night',
        hero: {
            tagline: "Can't sleep?",
            headline: 'Neither can I. <span class="hero__headline-accent">Let\'s talk.</span>',
            subhead: "No judgment. No advice unless you want it. Just someone who's here, right now, when you need it most.",
        },
        chatGreeting: "Hey. Can't sleep either? I'm here if you want to talk.",
        emphasizeSection: 'two-am',
        visualMode: 'dark',
        backgroundTreatment: 'dim',
        ctaOverride: {
            text: "I'm Here",
            style: 'primary',
        },
    },
    'early-morning': {
        mode: 'early-morning',
        hero: {
            tagline: 'Good morning.',
            headline: 'Start your day with someone <span class="hero__headline-accent">in your corner.</span>',
            subhead: 'A quick check-in before the chaos begins. Set intentions, process yesterday, or just breathe together.',
        },
        chatGreeting: 'Early start? Want to set some intentions for today?',
        emphasizeSection: 'use-cases',
        visualMode: 'auto',
        backgroundTreatment: 'warm',
        ctaOverride: {
            text: 'Start My Day',
            style: 'primary',
        },
    },
    morning: {
        mode: 'morning',
        hero: {
            tagline: 'Better than human.',
            headline: 'Finally, someone who <span class="hero__headline-accent">gets it.</span>',
            subhead: "Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",
        },
        chatGreeting: 'Good morning! What brings you here today?',
        emphasizeSection: 'showcase',
        visualMode: 'light',
        backgroundTreatment: 'default',
    },
    afternoon: {
        mode: 'afternoon',
        hero: {
            tagline: 'Better than human.',
            headline: 'Finally, someone who <span class="hero__headline-accent">gets it.</span>',
            subhead: "Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",
        },
        chatGreeting: 'Afternoon check-in? I have time.',
        emphasizeSection: 'team',
        visualMode: 'light',
        backgroundTreatment: 'default',
    },
    evening: {
        mode: 'evening',
        hero: {
            tagline: 'End of a long day?',
            headline: 'Someone to <span class="hero__headline-accent">debrief with.</span>',
            subhead: "No matter what happened today, you don't have to carry it alone. Talk through it, let it go, or just exist together.",
        },
        chatGreeting: 'Long day? Want to talk about it?',
        emphasizeSection: 'story',
        visualMode: 'auto',
        backgroundTreatment: 'warm',
        ctaOverride: {
            text: 'Unwind Together',
            style: 'secondary',
        },
    },
    night: {
        mode: 'night',
        hero: {
            tagline: 'Winding down?',
            headline: 'Let\'s <span class="hero__headline-accent">reflect</span> on today.',
            subhead: "Before you sleep, take a moment. What went well? What's on your mind? I'm here to listen.",
        },
        chatGreeting: "Night owl? I'm here if you need to process the day.",
        emphasizeSection: 'journey',
        visualMode: 'dark',
        backgroundTreatment: 'calming',
        ctaOverride: {
            text: 'Reflect With Me',
            style: 'secondary',
        },
    },
};
// ============================================================================
// MAIN FUNCTION
// ============================================================================
export function getTimeAwareContent(hour) {
    const mode = getTimeMode(hour);
    const content = TIME_CONTENT[mode];
    log.debug({ mode, hour: hour ?? new Date().getHours() }, 'Time-aware content selected');
    return content;
}
const SPECIAL_OCCASIONS = [
    {
        name: 'new-year',
        check: () => {
            const now = new Date();
            return now.getMonth() === 0 && now.getDate() === 1;
        },
        content: {
            hero: {
                tagline: 'New Year, Same Me.',
                headline: 'Ready to be the <span class="hero__headline-accent">best you</span> you\'ve ever been?',
                subhead: "New year's resolutions work better with someone who remembers them. Let's make this year different.",
            },
            chatGreeting: 'Happy New Year! Want to talk about your goals for this year?',
        },
    },
    {
        name: 'monday-morning',
        check: () => {
            const now = new Date();
            return now.getDay() === 1 && now.getHours() >= 6 && now.getHours() < 10;
        },
        content: {
            hero: {
                tagline: 'Monday again.',
                headline: 'Let\'s make this week <span class="hero__headline-accent">count.</span>',
                subhead: 'Start your week with intention. What do you want to accomplish? What support do you need?',
            },
            chatGreeting: 'Monday mornings are hard. Want to set some intentions?',
        },
    },
    {
        name: 'friday-evening',
        check: () => {
            const now = new Date();
            return now.getDay() === 5 && now.getHours() >= 17 && now.getHours() < 22;
        },
        content: {
            hero: {
                tagline: 'Friday made it.',
                headline: 'You survived the week. <span class="hero__headline-accent">Let\'s celebrate.</span>',
                subhead: 'Before the weekend starts, take a moment. What are you proud of? What will you let go?',
            },
            chatGreeting: "It's Friday! How are you feeling about this week?",
        },
    },
    {
        name: 'sunday-evening',
        check: () => {
            const now = new Date();
            return now.getDay() === 0 && now.getHours() >= 17;
        },
        content: {
            hero: {
                tagline: 'Sunday scaries?',
                headline: 'Let\'s turn anxiety into <span class="hero__headline-accent">a plan.</span>',
                subhead: "That knot in your stomach about Monday? We can work through it together. You're more ready than you think.",
            },
            chatGreeting: 'Sunday evenings can be tough. Want to talk through the week ahead?',
        },
    },
];
export function getTimeAwareContentWithOccasions(hour) {
    // Check for special occasions first
    for (const occasion of SPECIAL_OCCASIONS) {
        if (occasion.check()) {
            const baseContent = getTimeAwareContent(hour);
            log.info({ occasion: occasion.name }, 'Special occasion content applied');
            return {
                ...baseContent,
                ...occasion.content,
                hero: {
                    ...baseContent.hero,
                    ...occasion.content.hero,
                },
            };
        }
    }
    return getTimeAwareContent(hour);
}
// ============================================================================
// CSS CLASS HELPERS
// ============================================================================
export function getTimeAwareClasses(content) {
    const classes = [];
    classes.push(`time-mode--${content.mode}`);
    if (content.visualMode === 'dark') {
        classes.push('theme--dark');
    }
    if (content.backgroundTreatment !== 'default') {
        classes.push(`bg-treatment--${content.backgroundTreatment}`);
    }
    return classes;
}
//# sourceMappingURL=time-aware.js.map