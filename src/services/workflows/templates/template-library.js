/**
 * Workflow Template Library
 *
 * Pre-built workflow templates for common life automation scenarios.
 * Users can browse, customize, and activate these templates.
 *
 * Categories:
 * - Morning routines
 * - Work productivity
 * - Health & fitness
 * - Home automation
 * - Financial management
 * - Social & relationships
 * - Travel & commute
 *
 * @module services/workflows/templates/template-library
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'template-library' });
// ============================================================================
// TEMPLATE DEFINITIONS
// ============================================================================
const WORKFLOW_TEMPLATES = [
    // -------------------------------------------------------------------------
    // MORNING ROUTINES - Warm, caring framing
    // -------------------------------------------------------------------------
    {
        id: 'morning-briefing',
        name: 'Good morning check-in',
        description: 'I\'ll greet you each morning with weather, what\'s on your calendar, and a little encouragement',
        category: 'morning_routine',
        icon: '🌅',
        trigger: {
            type: 'time',
            schedule: '0 7 * * *', // 7:00 AM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Good morning greeting',
                params: { message: 'Good morning! Let me catch you up on your day.' },
            },
            {
                id: 'a2',
                type: 'custom',
                name: 'Get weather',
                params: { integration: 'weather', query: 'current' },
            },
            {
                id: 'a3',
                type: 'custom',
                name: 'Get calendar events',
                params: { integration: 'calendar', query: 'today' },
            },
        ],
        variables: [
            {
                name: 'wakeTime',
                type: 'time',
                label: 'When do you usually wake up?',
                description: 'I\'ll be there to greet you',
                defaultValue: '07:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['morning', 'daily', 'grounding'],
        popularity: 95,
        featured: true,
        requiredIntegrations: ['calendar'],
        requiredPermissions: [],
    },
    {
        id: 'morning-exercise-reminder',
        name: 'Gentle movement nudge',
        description: 'A friendly reminder to move your body - no pressure, just support',
        category: 'morning_routine',
        icon: '🧘',
        trigger: {
            type: 'time',
            schedule: '0 6 * * 1-5', // 6:00 AM weekdays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Movement reminder',
                params: { message: 'Your body is ready to move. Even 10 minutes makes a difference.' },
            },
            {
                id: 'a2',
                type: 'log_habit',
                name: 'Log exercise reminder',
                params: { habitId: 'exercise', action: 'reminder_sent' },
            },
        ],
        variables: [
            {
                name: 'exerciseTime',
                type: 'time',
                label: 'Best time for your reminder',
                defaultValue: '06:00',
                required: true,
            },
            {
                name: 'daysOfWeek',
                type: 'string',
                label: 'Which days?',
                defaultValue: 'weekdays',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['morning', 'movement', 'wellness'],
        popularity: 85,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // WORK & FOCUS - Supportive, not corporate
    // -------------------------------------------------------------------------
    {
        id: 'meeting-prep',
        name: 'Heads up before meetings',
        description: 'I\'ll give you a quick heads up before your meetings so you feel prepared',
        category: 'work_productivity',
        icon: '💭',
        trigger: {
            type: 'calendar',
            triggerOn: 'event_reminder',
            offsetMinutes: -10, // 10 minutes before
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'send_notification',
                name: 'Meeting notification',
                params: { title: 'Meeting coming up', body: '{{event.title}} in 10 minutes' },
            },
            {
                id: 'a2',
                type: 'custom',
                name: 'Get meeting context',
                params: { query: 'previous_meetings_with_attendees' },
            },
        ],
        variables: [
            {
                name: 'prepTime',
                type: 'number',
                label: 'How much notice would you like?',
                defaultValue: 10,
                required: true,
            },
        ],
        estimatedTimeToSetup: '2 minutes',
        tags: ['work', 'calendar', 'preparation'],
        popularity: 88,
        featured: true,
        requiredIntegrations: ['calendar'],
        requiredPermissions: ['calendar_read'],
    },
    {
        id: 'focus-time',
        name: 'Protect your focus',
        description: 'When you need to concentrate, I\'ll help you stay undisturbed',
        category: 'work_productivity',
        icon: '🎯',
        trigger: {
            type: 'calendar',
            triggerOn: 'event_start',
            eventFilter: { titleContains: 'focus' },
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Focus time started',
                params: { message: 'Focus time. I\'ve got your back - notifications silenced.' },
            },
            {
                id: 'a2',
                type: 'custom',
                name: 'Enable DND',
                params: { action: 'enable_dnd' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['focus', 'deep work', 'boundaries'],
        popularity: 82,
        featured: false,
        requiredIntegrations: ['calendar'],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // TAKING CARE OF YOURSELF - Gentle, supportive
    // -------------------------------------------------------------------------
    {
        id: 'hydration-reminder',
        name: 'Water check-in',
        description: 'A gentle nudge to stay hydrated throughout the day',
        category: 'health_fitness',
        icon: '💧',
        trigger: {
            type: 'time',
            schedule: '0 9-17/2 * * *', // Every 2 hours from 9 AM to 5 PM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Water reminder',
                params: { message: 'Hey, have you had some water lately? Your brain will thank you.' },
            },
            {
                id: 'a2',
                type: 'log_habit',
                name: 'Log water reminder',
                params: { habitId: 'hydration', action: 'reminder' },
            },
        ],
        variables: [
            {
                name: 'intervalHours',
                type: 'number',
                label: 'How often should I check in?',
                defaultValue: 2,
                required: true,
            },
        ],
        estimatedTimeToSetup: '30 seconds',
        tags: ['self-care', 'hydration', 'wellness'],
        popularity: 78,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'posture-check',
        name: 'Body check-in',
        description: 'A moment to notice how you\'re holding yourself',
        category: 'health_fitness',
        icon: '🌿',
        trigger: {
            type: 'time',
            schedule: '0 * * * *', // Every hour
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Body check-in',
                params: { message: 'Quick body check - how are you sitting? Take a breath. Roll your shoulders.' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '30 seconds',
        tags: ['self-care', 'mindfulness', 'body'],
        popularity: 65,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // YOUR HOME - Warm, welcoming
    // -------------------------------------------------------------------------
    {
        id: 'arrive-home',
        name: 'Welcome home',
        description: 'I\'ll make sure your home is ready for you when you arrive',
        category: 'home_automation',
        icon: '🏠',
        trigger: {
            type: 'location',
            locationName: 'home',
            radiusMeters: 100,
            triggerOn: 'enter',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'control_lights',
                name: 'Turn on lights',
                params: { zone: 'living_room', state: 'on', brightness: 80 },
            },
            {
                id: 'a2',
                type: 'set_thermostat',
                name: 'Adjust temperature',
                params: { temperature: 72, mode: 'auto' },
            },
            {
                id: 'a3',
                type: 'speak_message',
                name: 'Welcome home',
                params: { message: 'Welcome home. I\'ve got everything warmed up for you.' },
            },
        ],
        variables: [
            {
                name: 'homeLocation',
                type: 'location',
                label: 'Where\'s home?',
                defaultValue: null,
                required: true,
            },
            {
                name: 'preferredTemp',
                type: 'number',
                label: 'What temperature feels right?',
                defaultValue: 72,
                required: true,
            },
        ],
        estimatedTimeToSetup: '3 minutes',
        tags: ['home', 'comfort', 'arrival'],
        popularity: 92,
        featured: true,
        requiredIntegrations: ['smart_home'],
        requiredPermissions: ['location'],
    },
    {
        id: 'bedtime-routine',
        name: 'Wind-down ritual',
        description: 'I\'ll help you transition to rest with soft lights and calm',
        category: 'evening_routine',
        icon: '🌙',
        trigger: {
            type: 'time',
            schedule: '0 22 * * *', // 10:00 PM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'control_lights',
                name: 'Dim lights',
                params: { zone: 'all', brightness: 20, color: 'warm' },
            },
            {
                id: 'a2',
                type: 'add_reminder',
                name: 'Set morning alarm',
                params: { time: '{{wakeTime}}', message: 'Good morning' },
            },
            {
                id: 'a3',
                type: 'speak_message',
                name: 'Bedtime message',
                params: { message: 'Lights dimmed, alarm set. Rest well tonight.' },
            },
        ],
        variables: [
            {
                name: 'bedtime',
                type: 'time',
                label: 'When do you like to wind down?',
                defaultValue: '22:00',
                required: true,
            },
            {
                name: 'wakeTime',
                type: 'time',
                label: 'When should I wake you?',
                defaultValue: '07:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '2 minutes',
        tags: ['evening', 'sleep', 'rest'],
        popularity: 89,
        featured: true,
        requiredIntegrations: ['smart_home'],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // GETTING AROUND - Helpful, not corporate
    // -------------------------------------------------------------------------
    {
        id: 'commute-traffic',
        name: 'Beat the traffic',
        description: 'I\'ll let you know when to leave so you don\'t hit traffic',
        category: 'travel',
        icon: '🚗',
        trigger: {
            type: 'time',
            schedule: '0 7 * * 1-5', // 7 AM weekdays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'custom',
                name: 'Check traffic',
                params: { from: '{{homeAddress}}', to: '{{workAddress}}' },
            },
            {
                id: 'a2',
                type: 'speak_message',
                name: 'Traffic update',
                params: { message: 'Heads up - traffic looks {{trafficCondition}}. Leave by {{suggestedDeparture}} to get there on time.' },
            },
        ],
        variables: [
            {
                name: 'homeAddress',
                type: 'location',
                label: 'Where are you coming from?',
                defaultValue: null,
                required: true,
            },
            {
                name: 'workAddress',
                type: 'location',
                label: 'Where are you headed?',
                defaultValue: null,
                required: true,
            },
            {
                name: 'arrivalTime',
                type: 'time',
                label: 'When do you need to be there?',
                defaultValue: '09:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '3 minutes',
        tags: ['commute', 'travel', 'planning'],
        popularity: 86,
        featured: true,
        requiredIntegrations: ['google_maps'],
        requiredPermissions: ['location'],
    },
    // -------------------------------------------------------------------------
    // MONEY STUFF - Straightforward, helpful
    // -------------------------------------------------------------------------
    {
        id: 'subscription-review',
        name: 'Monthly money check',
        description: 'Once a month, I\'ll remind you to peek at your subscriptions',
        category: 'financial',
        icon: '💰',
        trigger: {
            type: 'time',
            schedule: '0 10 1 * *', // 10 AM on the 1st of each month
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'custom',
                name: 'Get subscriptions',
                params: { query: 'active_subscriptions' },
            },
            {
                id: 'a2',
                type: 'speak_message',
                name: 'Subscription summary',
                params: { message: 'It\'s the first of the month. You have {{count}} subscriptions adding up to {{total}} a month. Worth a quick look?' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['money', 'subscriptions', 'review'],
        popularity: 72,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // GRATITUDE & REFLECTION - Gentle growth
    // -------------------------------------------------------------------------
    {
        id: 'evening-gratitude',
        name: 'Evening gratitude moment',
        description: 'A gentle pause before bed to notice what went well today',
        category: 'evening_routine',
        icon: '✨',
        trigger: {
            type: 'time',
            schedule: '0 21 * * *', // 9:00 PM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Gratitude prompt',
                params: { message: 'Before the day ends... what made you smile today? Even something small counts.' },
            },
        ],
        variables: [
            {
                name: 'gratitudeTime',
                type: 'time',
                label: 'When would you like this moment?',
                description: 'Usually works well an hour or so before sleep',
                defaultValue: '21:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['gratitude', 'reflection', 'evening', 'mindfulness'],
        popularity: 89,
        featured: true,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'weekly-reflection',
        name: 'Sunday reflection',
        description: 'A calm Sunday moment to look back at your week and set intentions',
        category: 'evening_routine',
        icon: '📝',
        trigger: {
            type: 'time',
            schedule: '0 19 * * 0', // 7:00 PM on Sundays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Reflection prompt',
                params: { message: 'Hey. It\'s Sunday evening. Want to spend a few minutes looking back at this week? What felt good? What do you want more of next week?' },
            },
        ],
        variables: [
            {
                name: 'reflectionTime',
                type: 'time',
                label: 'When on Sunday works best?',
                description: 'Many people like Sunday evening, but you do you',
                defaultValue: '19:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['reflection', 'weekly', 'planning', 'growth'],
        popularity: 82,
        featured: true,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'breathing-break',
        name: 'Breathing break',
        description: 'A quick reminder to pause and breathe - you\'ll be surprised how much it helps',
        category: 'health_fitness',
        icon: '🌬️',
        trigger: {
            type: 'time',
            schedule: '0 14 * * 1-5', // 2:00 PM weekdays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Breathing prompt',
                params: { message: 'Quick breathing break? Just 3 deep breaths. Breathe in... hold... breathe out. You\'ve got this.' },
            },
        ],
        variables: [
            {
                name: 'breakTime',
                type: 'time',
                label: 'When could you use a pause?',
                description: 'Usually that afternoon slump is a good time',
                defaultValue: '14:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['breathing', 'mindfulness', 'stress', 'wellbeing'],
        popularity: 78,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'positive-affirmation',
        name: 'Morning encouragement',
        description: 'Start each day with a personalized word of encouragement',
        category: 'morning_routine',
        icon: '💪',
        trigger: {
            type: 'time',
            schedule: '0 8 * * *', // 8:00 AM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Morning affirmation',
                params: { message: 'Hey {{name}}. Just wanted to remind you: you\'re doing better than you think. Today\'s going to be good.' },
            },
        ],
        variables: [
            {
                name: 'name',
                type: 'string',
                label: 'What should I call you?',
                defaultValue: 'friend',
                required: true,
            },
            {
                name: 'affirmationTime',
                type: 'time',
                label: 'When would this help most?',
                defaultValue: '08:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['affirmation', 'encouragement', 'morning', 'positivity'],
        popularity: 75,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'connect-with-friend',
        name: 'Friendship reminder',
        description: 'A gentle nudge to reach out to someone you care about',
        category: 'social',
        icon: '💬',
        trigger: {
            type: 'time',
            schedule: '0 12 * * 3', // Noon on Wednesdays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Connection prompt',
                params: { message: 'It\'s been a while since you reached out to someone. Maybe a quick text to check in? Often the people we care about are just waiting for a reason to talk.' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['social', 'connection', 'friendship', 'relationships'],
        popularity: 71,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'daily-intention',
        name: 'Morning intention',
        description: 'Start each day with one clear thing you want to focus on',
        category: 'morning_routine',
        icon: '🎯',
        trigger: {
            type: 'time',
            schedule: '0 7 * * *', // 7:00 AM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Intention prompt',
                params: { message: 'Good morning. Before the day takes over... what\'s one thing you want to make sure happens today?' },
            },
        ],
        variables: [
            {
                name: 'intentionTime',
                type: 'time',
                label: 'When do you want this prompt?',
                description: 'Works best before you check your phone',
                defaultValue: '07:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['intention', 'focus', 'morning', 'productivity'],
        popularity: 84,
        featured: true,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'screen-break',
        name: 'Screen break nudge',
        description: 'A reminder to look up and away from screens - your eyes will thank you',
        category: 'work_productivity',
        icon: '👀',
        trigger: {
            type: 'time',
            schedule: '0 11,15 * * 1-5', // 11 AM and 3 PM weekdays
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Screen break',
                params: { message: 'Quick screen break? Look at something 20 feet away for 20 seconds. Your eyes have been working hard.' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['eyes', 'health', 'screen', 'break', 'productivity'],
        popularity: 73,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'celebration-reminder',
        name: 'Small wins tracker',
        description: 'At the end of each day, I\'ll help you notice what you accomplished',
        category: 'evening_routine',
        icon: '🎉',
        trigger: {
            type: 'time',
            schedule: '0 18 * * *', // 6:00 PM
            timezone: 'America/New_York',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Celebration prompt',
                params: { message: 'Day\'s wrapping up. What\'s one thing you did today that you feel good about? Even finishing that one email counts.' },
            },
        ],
        variables: [
            {
                name: 'celebrationTime',
                type: 'time',
                label: 'When does your workday usually end?',
                defaultValue: '18:00',
                required: true,
            },
        ],
        estimatedTimeToSetup: '1 minute',
        tags: ['celebration', 'wins', 'accomplishment', 'positivity'],
        popularity: 77,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    // -------------------------------------------------------------------------
    // EVENT-BASED TRIGGERS - Habit & Calendar
    // -------------------------------------------------------------------------
    {
        id: 'habit-streak-celebration',
        name: 'Celebrate your streaks',
        description: 'When you hit a 7-day streak on any habit, I\'ll celebrate with you',
        category: 'health_fitness',
        icon: '🔥',
        trigger: {
            type: 'event',
            eventName: 'streak_achieved',
            conditions: {},
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Celebrate streak',
                params: { message: '🔥 You just hit a {{streak}}-day streak on {{habitName}}! That\'s real commitment showing.' },
            },
            {
                id: 'a2',
                type: 'send_notification',
                name: 'Streak notification',
                params: { title: '🔥 Streak!', body: '{{streak}} days of {{habitName}}!' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['habits', 'streaks', 'celebration', 'motivation'],
        popularity: 85,
        featured: true,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'habit-logged-encouragement',
        name: 'Encouragement when you log habits',
        description: 'A quick word of encouragement every time you complete a habit',
        category: 'health_fitness',
        icon: '✅',
        trigger: {
            type: 'event',
            eventName: 'habit_logged',
            conditions: {},
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Encourage',
                params: { message: 'Nice! {{habitName}} logged. That\'s {{streak}} days in a row now.' },
            },
        ],
        variables: [],
        estimatedTimeToSetup: '1 minute',
        tags: ['habits', 'encouragement', 'tracking'],
        popularity: 68,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: [],
    },
    {
        id: 'meeting-prep',
        name: 'Meeting prep reminder',
        description: 'I\'ll remind you 15 minutes before calendar events to get ready',
        category: 'work_productivity',
        icon: '📅',
        trigger: {
            type: 'calendar',
            triggerOn: 'event_reminder',
            offsetMinutes: -15,
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Prep reminder',
                params: { message: 'Heads up - you have "{{eventTitle}}" in 15 minutes. Anything you need to prep?' },
            },
        ],
        variables: [
            {
                name: 'reminderMinutes',
                type: 'number',
                label: 'How many minutes before?',
                description: 'How much heads up do you need?',
                defaultValue: 15,
                required: true,
            },
        ],
        estimatedTimeToSetup: '2 minutes',
        tags: ['calendar', 'meetings', 'preparation', 'work'],
        popularity: 80,
        featured: true,
        requiredIntegrations: ['calendar'],
        requiredPermissions: [],
    },
    {
        id: 'location-home-arrival',
        name: 'Home arrival wind-down',
        description: 'When you arrive home, I\'ll check in and help you transition',
        category: 'evening_routine',
        icon: '🏠',
        trigger: {
            type: 'location',
            locationName: 'home',
            radiusMeters: 100,
            triggerOn: 'enter',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Home greeting',
                params: { message: 'Welcome home. How was your day? Anything you want to leave at the door?' },
            },
        ],
        variables: [
            {
                name: 'homeAddress',
                type: 'location',
                label: 'Where is home?',
                description: 'Your home address or coordinates',
                defaultValue: '',
                required: true,
            },
        ],
        estimatedTimeToSetup: '2 minutes',
        tags: ['location', 'home', 'wind-down', 'transition'],
        popularity: 72,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: ['location'],
    },
    {
        id: 'location-work-focus',
        name: 'Work arrival focus mode',
        description: 'When you arrive at work, I\'ll help you get into focus mode',
        category: 'work_productivity',
        icon: '💼',
        trigger: {
            type: 'location',
            locationName: 'work',
            radiusMeters: 100,
            triggerOn: 'enter',
        },
        conditions: [],
        actions: [
            {
                id: 'a1',
                type: 'speak_message',
                name: 'Work focus',
                params: { message: 'You\'re at work. What\'s the one thing that would make today successful?' },
            },
        ],
        variables: [
            {
                name: 'workAddress',
                type: 'location',
                label: 'Where is your workplace?',
                description: 'Your office address or coordinates',
                defaultValue: '',
                required: true,
            },
        ],
        estimatedTimeToSetup: '2 minutes',
        tags: ['location', 'work', 'focus', 'productivity'],
        popularity: 70,
        featured: false,
        requiredIntegrations: [],
        requiredPermissions: ['location'],
    },
];
// ============================================================================
// TEMPLATE LIBRARY CLASS
// ============================================================================
export class TemplateLibrary {
    templates = new Map();
    constructor() {
        // Load built-in templates
        for (const template of WORKFLOW_TEMPLATES) {
            this.templates.set(template.id, template);
        }
        log.info({ count: this.templates.size }, 'Template library initialized');
    }
    // ==========================================================================
    // QUERIES
    // ==========================================================================
    /**
     * Get all templates
     */
    getAll() {
        return Array.from(this.templates.values());
    }
    /**
     * Get template by ID
     */
    getById(templateId) {
        return this.templates.get(templateId);
    }
    /**
     * Get templates by category
     */
    getByCategory(category) {
        return this.getAll().filter((t) => t.category === category);
    }
    /**
     * Get featured templates
     */
    getFeatured() {
        return this.getAll()
            .filter((t) => t.featured)
            .sort((a, b) => b.popularity - a.popularity);
    }
    /**
     * Search templates
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.getAll().filter((t) => t.name.toLowerCase().includes(lowerQuery) ||
            t.description.toLowerCase().includes(lowerQuery) ||
            t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)));
    }
    /**
     * Get popular templates
     */
    getPopular(limit = 10) {
        return this.getAll()
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, limit);
    }
    // ==========================================================================
    // INSTANTIATION
    // ==========================================================================
    /**
     * Create a workflow from a template
     */
    createFromTemplate(templateId, userId, variables = {}) {
        const template = this.templates.get(templateId);
        if (!template) {
            return null;
        }
        // Apply variables to trigger
        const trigger = this.applyVariables(template.trigger, variables);
        // Apply variables to actions
        const actions = template.actions.map((action) => ({
            ...action,
            params: this.applyVariablesToObject(action.params, variables),
        }));
        return {
            userId,
            name: template.name,
            description: template.description,
            status: 'paused', // Start paused so user can review
            trigger,
            conditions: template.conditions,
            actions,
            variables,
            category: template.category,
            tags: [...template.tags],
            icon: template.icon,
            runCount: 0,
            isTemplate: false,
            templateId,
        };
    }
    /**
     * Apply variables to a trigger
     */
    applyVariables(trigger, variables) {
        if (trigger.type === 'time') {
            const time = variables.wakeTime || variables.exerciseTime || variables.bedtime;
            if (typeof time === 'string') {
                const [hours, minutes] = time.split(':').map(Number);
                return {
                    ...trigger,
                    schedule: `${minutes} ${hours} * * *`,
                };
            }
        }
        return trigger;
    }
    /**
     * Apply variables to an object (recursive)
     */
    applyVariablesToObject(obj, variables) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.interpolateString(value, variables);
            }
            else if (typeof value === 'object' && value !== null) {
                result[key] = this.applyVariablesToObject(value, variables);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Interpolate variables in a string
     */
    interpolateString(str, variables) {
        return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
            const value = variables[name];
            return value !== undefined ? String(value) : `{{${name}}}`;
        });
    }
    // ==========================================================================
    // CATEGORIES
    // ==========================================================================
    /**
     * Get all categories with counts
     */
    getCategories() {
        const counts = new Map();
        for (const template of this.templates.values()) {
            counts.set(template.category, (counts.get(template.category) || 0) + 1);
        }
        const labels = {
            morning_routine: 'Morning routines',
            work_productivity: 'Focus & flow',
            health_fitness: 'Taking care of yourself',
            home_automation: 'Your home',
            financial: 'Money stuff',
            social: 'Staying connected',
            travel: 'Getting around',
            evening_routine: 'Wind-down rituals',
            custom: 'Start from scratch',
        };
        return Array.from(counts.entries()).map(([category, count]) => ({
            category,
            count,
            label: labels[category],
        }));
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let templateLibraryInstance = null;
export function getTemplateLibrary() {
    if (!templateLibraryInstance) {
        templateLibraryInstance = new TemplateLibrary();
    }
    return templateLibraryInstance;
}
export function resetTemplateLibrary() {
    templateLibraryInstance = null;
}
//# sourceMappingURL=template-library.js.map