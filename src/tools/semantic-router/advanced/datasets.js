/**
 * Open Source Datasets & Training Data Collection
 *
 * Leverages publicly available datasets and collects our own training data
 * to create a fine-tuned retriever that's better than generic embeddings.
 *
 * AVAILABLE DATASETS:
 * - Gorilla API-Bench: 1,600+ APIs with queries (Berkeley)
 * - ToolBench: 16,000+ APIs (Tsinghua + ModelScope)
 * - APIGen: Synthetic function calling data
 * - NL2API: Natural language to API mapping
 *
 * OUR DATA:
 * - Routing events (query → tool)
 * - Corrections (what we got wrong)
 * - User preferences (per-user patterns)
 *
 * @module tools/semantic-router/advanced/datasets
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'semantic-router:datasets' });
// ============================================================================
// OPEN SOURCE DATASET LOADERS
// ============================================================================
/**
 * Load Gorilla API-Bench dataset
 * Source: https://github.com/ShishirPatil/gorilla
 *
 * Contains ~1,600 APIs with natural language queries
 */
export function loadGorillaDataset() {
    const examples = [];
    // Gorilla API-Bench categories: calendar, email, music, weather, search, communication
    // In production, fetch from HuggingFace:
    // https://huggingface.co/datasets/gorilla-llm/APIBench
    //
    // For now, we'll use synthetic examples based on Gorilla patterns
    const gorillaPatterns = [
        {
            api: 'spotify.play',
            queries: [
                'Play some jazz music on Spotify',
                'Start playing my liked songs',
                'Play the album Abbey Road',
                'Put on some background music',
                'Play something relaxing',
            ],
            mapToTool: 'spotify_play',
        },
        {
            api: 'spotify.pause',
            queries: ['Pause the music', 'Stop playing', 'Pause Spotify', 'Hold the music'],
            mapToTool: 'spotify_pause',
        },
        {
            api: 'google_calendar.create_event',
            queries: [
                'Schedule a meeting for tomorrow at 2pm',
                'Add a dentist appointment next Tuesday',
                'Create a calendar event for my birthday party',
                'Put a reminder on my calendar',
            ],
            mapToTool: 'calendar_create_event',
        },
        {
            api: 'openweathermap.get_current',
            queries: [
                "What's the weather like today?",
                'Is it going to rain?',
                'Weather in San Francisco',
                'Do I need an umbrella?',
            ],
            mapToTool: 'weather_current',
        },
        {
            api: 'twilio.send_sms',
            queries: [
                'Send a text to John',
                "Text my mom that I'll be late",
                'Send a message to +1234567890',
            ],
            mapToTool: 'communication_text',
        },
    ];
    for (const pattern of gorillaPatterns) {
        for (const query of pattern.queries) {
            examples.push({
                query,
                toolId: pattern.mapToTool,
                source: 'gorilla',
                confidence: 0.9, // High confidence - curated dataset
            });
        }
    }
    log.info({ count: examples.length }, 'Loaded Gorilla-style examples');
    return examples;
}
/**
 * Load ToolBench patterns
 * Source: https://github.com/OpenBMB/ToolBench
 *
 * Contains 16,000+ real APIs with diverse queries
 */
export function loadToolBenchPatterns() {
    const examples = [];
    // ToolBench categories mapped to Ferni tools
    const toolbenchMappings = [
        {
            category: 'Entertainment/Music',
            queries: [
                'Play music',
                'Find a song',
                'Play artist',
                'Music recommendations',
                'Start a playlist',
                'Play genre',
            ],
            mapToTool: 'spotify_play',
        },
        {
            category: 'Finance/Stocks',
            queries: [
                'Check stock price',
                'How is the market doing',
                'What is Apple trading at',
                'Show me my portfolio',
                'Get stock quote',
            ],
            mapToTool: 'finance_stock_lookup',
        },
        {
            category: 'Productivity/Calendar',
            queries: [
                "What's on my calendar",
                'Schedule meeting',
                'Set reminder',
                'Book appointment',
                'When is my next event',
            ],
            mapToTool: 'calendar_list_events',
        },
        {
            category: 'Health/Wellness',
            queries: ['Log my workout', 'Track my meditation', 'How am I sleeping', 'Health summary'],
            mapToTool: 'wellness_log',
        },
        {
            category: 'Communication/Email',
            queries: ['Check my email', 'Send email to', 'Read latest emails', 'Compose message'],
            mapToTool: 'email_check',
        },
        {
            category: 'Persona/Handoff',
            queries: [
                'Talk to Maya',
                'I need Peter',
                'Connect me with Alex',
                'Switch to Jordan',
                'Let me speak with Nayan',
            ],
            mapToTool: 'handoff',
        },
    ];
    for (const mapping of toolbenchMappings) {
        for (const query of mapping.queries) {
            examples.push({
                query,
                toolId: mapping.mapToTool,
                source: 'toolbench',
                confidence: 0.85,
            });
        }
    }
    log.info({ count: examples.length }, 'Loaded ToolBench-style examples');
    return examples;
}
// In-memory log store (replace with Firestore in production)
const routingLogs = [];
/**
 * Log a routing decision for training
 */
export function logRoutingDecision(entry) {
    routingLogs.push({
        ...entry,
        timestamp: new Date(),
    });
    // Keep last 100K entries
    if (routingLogs.length > 100000) {
        routingLogs.shift();
    }
}
/**
 * Export routing logs as training data
 */
export function exportRoutingLogsAsTraining() {
    const examples = [];
    for (const log of routingLogs) {
        // Only use correct predictions or corrections
        if (log.wasCorrect && log.executedTool) {
            examples.push({
                query: log.query,
                toolId: log.executedTool,
                source: 'ferni_logs',
                confidence: log.confidence,
            });
        }
        else if (!log.wasCorrect && log.executedTool) {
            // Correction - what user actually wanted
            examples.push({
                query: log.query,
                toolId: log.executedTool,
                source: 'ferni_corrections',
                confidence: 0.95, // High confidence - user explicitly corrected
            });
        }
    }
    return examples;
}
// Pre-defined templates as constants (avoid function length limit)
const MUSIC_TEMPLATE = {
    patterns: [
        'play {genre}',
        'play some {genre}',
        'play {genre} music',
        'put on {genre}',
        'I want to listen to {genre}',
        'play something {mood}',
    ],
    toolId: 'spotify_play',
    slots: {
        genre: ['jazz', 'rock', 'classical', 'pop', 'hip hop', 'electronic', 'ambient', 'lofi'],
        mood: ['relaxing', 'energetic', 'calm', 'upbeat', 'chill', 'focused'],
    },
};
const HANDOFF_TEMPLATE = {
    patterns: [
        'talk to {persona}',
        'I need {persona}',
        'can I speak with {persona}',
        'transfer me to {persona}',
        'switch to {persona}',
        'hand me off to {persona}',
        'connect me with {persona}',
    ],
    toolId: 'handoff',
    slots: { persona: ['Maya', 'Peter', 'Alex', 'Jordan', 'Nayan', 'Ferni'] },
};
const REMINDER_TEMPLATE = {
    patterns: [
        'remind me to {task}',
        'set a reminder for {task}',
        'remind me about {task}',
        "don't let me forget to {task}",
    ],
    toolId: 'calendar_reminder',
    slots: {
        task: [
            'call mom',
            'buy groceries',
            'take medicine',
            'exercise',
            'meditate',
            'review goals',
            'check email',
            'water plants',
        ],
    },
};
const EMOTION_TEMPLATE = {
    patterns: ["I'm feeling {emotion}", 'I feel {emotion}', 'things are {emotion}'],
    toolId: 'emotional_support',
    slots: {
        emotion: [
            'stressed',
            'anxious',
            'overwhelmed',
            'sad',
            'frustrated',
            'lonely',
            'confused',
            'stuck',
        ],
    },
};
const HABIT_TEMPLATE = {
    patterns: ['track my {habit}', 'log my {habit}', 'I did my {habit}', 'mark {habit} as done'],
    toolId: 'habit_track',
    slots: {
        habit: [
            'meditation',
            'exercise',
            'reading',
            'journaling',
            'water intake',
            'sleep',
            'workout',
            'walk',
        ],
    },
};
// ============================================================================
// LIFE COACHING DOMAIN TEMPLATES
// ============================================================================
const BOUNDARIES_TEMPLATE = {
    patterns: [
        "I can't say no to {person}",
        'people keep crossing my boundaries',
        'how do I set boundaries with {person}',
        'I feel like a pushover',
        '{person} always expects too much from me',
        'I need help saying no to {person}',
        "my {person} doesn't respect my limits",
        'I feel guilty when I set boundaries',
    ],
    toolId: 'identifyBoundaryNeeds',
    slots: {
        person: ['my family', 'my boss', 'my partner', 'my friends', 'my parents', 'my coworkers'],
    },
};
const SOCIAL_SKILLS_TEMPLATE = {
    patterns: [
        "I don't know what to say in {situation}",
        'I feel awkward at {situation}',
        'how do I make friends',
        "I'm lonely",
        'I struggle with {situation}',
        "I'm not good at small talk",
        'I feel left out in {situation}',
        'how do I start conversations',
    ],
    toolId: 'buildConversationSkills',
    slots: {
        situation: [
            'parties',
            'conversations',
            'social events',
            'meetings',
            'networking events',
            'group settings',
        ],
    },
};
const ANGER_TEMPLATE = {
    patterns: [
        "I'm so angry right now",
        'I keep losing my temper',
        'how do I control my anger',
        'I exploded at someone',
        'I get {intensity} angry',
        'I need help with anger',
        'I said something I regret in anger',
        'my anger is hurting my relationships',
    ],
    toolId: 'understandAnger',
    slots: {
        intensity: ['really', 'so', 'extremely', 'incredibly', 'unreasonably'],
    },
};
const PROCRASTINATION_TEMPLATE = {
    patterns: [
        "I can't seem to start {task}",
        "I've been putting off {task}",
        'I keep procrastinating',
        "I don't know how to get motivated",
        "I'm avoiding {task}",
        'help me stop procrastinating',
        "I can't focus on what I need to do",
        'I feel stuck and unmotivated',
    ],
    toolId: 'understandProcrastination',
    slots: {
        task: [
            'this project',
            'my work',
            'important things',
            'studying',
            'cleaning',
            'that conversation',
        ],
    },
};
const PERFECTIONISM_TEMPLATE = {
    patterns: [
        'nothing I do is ever {standard}',
        "I can't finish things because they're not perfect",
        "I'm too hard on myself",
        "I'm a perfectionist and it's {effect}",
        'I obsess over every detail',
        "I'm afraid of making mistakes",
        'I never feel like my work is good enough',
        'my perfectionism is holding me back',
    ],
    toolId: 'recognizePerfectionism',
    slots: {
        standard: ['good enough', 'perfect', 'right'],
        effect: ['exhausting', 'hurting me', 'stressing me out', 'destroying me'],
    },
};
const DIGITAL_WELLNESS_TEMPLATE = {
    patterns: [
        "I'm on my phone too much",
        'I keep doomscrolling',
        'I need a digital detox',
        'social media is affecting my {wellbeing}',
        'I spend too much time on {platform}',
        "I can't put my phone down",
        'screen time is out of control',
        'I check my phone compulsively',
    ],
    toolId: 'assessScreenTime',
    slots: {
        wellbeing: ['mental health', 'self-esteem', 'sleep', 'relationships', 'productivity'],
        platform: ['social media', 'TikTok', 'Instagram', 'Twitter', 'my phone', 'screens'],
    },
};
const BURNOUT_TEMPLATE = {
    patterns: [
        "I'm so burnt out",
        "I can't keep up with everything",
        'I have no energy left',
        'work is {draining}',
        'I feel completely depleted',
        "I'm exhausted all the time",
        'I need to recover from burnout',
        "I can't sustain this pace",
    ],
    toolId: 'assessBurnout',
    slots: {
        draining: ['exhausting me', 'killing me', 'draining me', 'overwhelming me'],
    },
};
const BODY_RELATIONSHIP_TEMPLATE = {
    patterns: [
        'I hate how I {appearance}',
        "I don't feel good about my body",
        'I struggle with body image',
        "I'm uncomfortable in my own skin",
        'I compare myself to {others}',
        'I feel {negative} about how I look',
        "I can't accept my body",
        'my body image is affecting me',
    ],
    toolId: 'exploreBodyImage',
    slots: {
        appearance: ['look', 'feel', 'weigh'],
        others: ['others', 'people online', 'models', 'influencers'],
        negative: ['bad', 'terrible', 'ashamed', 'embarrassed', 'ugly'],
    },
};
const DATING_TEMPLATE = {
    patterns: [
        "I'm nervous about dating",
        'dating is so {difficult}',
        "I don't know what I want in a partner",
        'I keep getting rejected',
        'how do I meet someone',
        "I'm scared to put myself out there",
        "I'm bad at dating",
        'I need dating advice',
    ],
    toolId: 'clarifyDatingGoals',
    slots: {
        difficult: ['hard', 'confusing', 'overwhelming', 'frustrating', 'scary'],
    },
};
const NEURODIVERSITY_TEMPLATE = {
    patterns: [
        'I think I might have {condition}',
        'I was diagnosed with {condition}',
        'my {condition} makes it hard to',
        'I struggle with {challenge} because of my brain',
        'I feel different from everyone',
        "I can't function like other people",
        'my brain works differently',
        'help me understand my neurodivergence',
    ],
    toolId: 'understandNeurodivergence',
    slots: {
        condition: ['ADHD', 'autism', 'dyslexia', 'anxiety'],
        challenge: ['focus', 'social situations', 'organization', 'sensory stuff'],
    },
};
const TRAUMA_TEMPLATE = {
    patterns: [
        'something bad happened to me',
        "I can't stop thinking about what happened",
        'I keep getting triggered',
        'I have trauma from {source}',
        'my past is affecting my present',
        "I don't feel safe",
        'I need help processing trauma',
        'I have flashbacks',
    ],
    toolId: 'assessTraumaReadiness',
    slots: {
        source: ['my childhood', 'a relationship', 'an accident', 'my family', 'work'],
    },
};
const INTIMACY_TEMPLATE = {
    patterns: [
        'I struggle with {type} intimacy',
        "I'm afraid of getting close to people",
        'I have trouble being {vulnerable}',
        'my relationship lacks intimacy',
        "I can't open up to my partner",
        "I'm scared of being seen",
        'I need help with emotional closeness',
        'intimacy makes me uncomfortable',
    ],
    toolId: 'exploreIntimacyNeeds',
    slots: {
        type: ['emotional', 'physical', 'sexual'],
        vulnerable: ['vulnerable', 'open', 'honest', 'close'],
    },
};
const CHRONIC_CONDITIONS_TEMPLATE = {
    patterns: [
        'living with {condition} is {hard}',
        "I'm having a flare up",
        'my chronic illness is {affecting}',
        "I can't do what I used to",
        'I need help managing my {condition}',
        'my health limits me',
        "I'm grieving my healthy self",
        'chronic pain is exhausting',
    ],
    toolId: 'manageChronicCondition',
    slots: {
        condition: [
            'chronic pain',
            'my illness',
            'this condition',
            'fibromyalgia',
            'autoimmune issues',
        ],
        hard: ['so hard', 'exhausting', 'isolating', 'frustrating'],
        affecting: ['affecting my mood', 'limiting my life', 'getting worse'],
    },
};
const MIDLIFE_TEMPLATE = {
    patterns: [
        'I feel like my life is {status}',
        "I'm questioning everything at this age",
        'what have I accomplished',
        'is this all there is',
        "I'm having a midlife crisis",
        'I need to reinvent myself',
        "I don't know who I am anymore",
        'my priorities are changing',
    ],
    toolId: 'exploreMidlifeQuestions',
    slots: {
        status: ['half over', 'passing me by', 'not what I expected', 'meaningless'],
    },
};
const BREAKUP_TEMPLATE = {
    patterns: [
        'I just went through a {breakup}',
        "I can't get over my ex",
        'my heart is broken',
        'how do I move on from {relationship}',
        "I'm devastated after the breakup",
        'I miss {them}',
        "I don't know who I am without my partner",
        'the breakup is destroying me',
    ],
    toolId: 'processBreakupPain',
    slots: {
        breakup: ['breakup', 'divorce', 'separation'],
        relationship: ['this relationship', 'my marriage', 'my ex'],
        them: ['them', 'my ex', 'my partner', 'what we had'],
    },
};
/** Get predefined templates for synthetic generation */
function getSyntheticTemplates() {
    return [
        // Core templates
        MUSIC_TEMPLATE,
        HANDOFF_TEMPLATE,
        REMINDER_TEMPLATE,
        EMOTION_TEMPLATE,
        HABIT_TEMPLATE,
        // Life coaching templates
        BOUNDARIES_TEMPLATE,
        SOCIAL_SKILLS_TEMPLATE,
        ANGER_TEMPLATE,
        PROCRASTINATION_TEMPLATE,
        PERFECTIONISM_TEMPLATE,
        DIGITAL_WELLNESS_TEMPLATE,
        BURNOUT_TEMPLATE,
        BODY_RELATIONSHIP_TEMPLATE,
        DATING_TEMPLATE,
        NEURODIVERSITY_TEMPLATE,
        TRAUMA_TEMPLATE,
        INTIMACY_TEMPLATE,
        CHRONIC_CONDITIONS_TEMPLATE,
        MIDLIFE_TEMPLATE,
        BREAKUP_TEMPLATE,
    ];
}
/** Generate examples from a single template */
function generateFromTemplate(template) {
    const examples = [];
    for (const pattern of template.patterns) {
        if (!template.slots) {
            examples.push({
                query: pattern,
                toolId: template.toolId,
                source: 'synthetic',
                confidence: 0.75,
            });
            continue;
        }
        const slotNames = Object.keys(template.slots);
        if (slotNames.length !== 1)
            continue;
        const slotName = slotNames[0];
        const values = template.slots[slotName];
        for (const value of values) {
            examples.push({
                query: pattern.replace(`{${slotName}}`, value),
                toolId: template.toolId,
                source: 'synthetic',
                confidence: 0.8,
            });
        }
    }
    return examples;
}
/** Generate negative examples (conversational, no tool needed) */
function generateNegativeExamples() {
    const conversationalQueries = [
        'How are you?',
        'Tell me about yourself',
        'What can you do?',
        "I'm just thinking out loud",
        'Never mind',
        'Thanks',
        "That's interesting",
        'I agree',
        'Tell me more',
        'What do you think?',
    ];
    return conversationalQueries.map((query) => ({
        query,
        toolId: '__conversation__',
        source: 'synthetic',
        confidence: 0.9,
    }));
}
/**
 * Generate synthetic training examples using templates
 */
export function generateSyntheticExamples() {
    const templates = getSyntheticTemplates();
    const examples = templates.flatMap(generateFromTemplate);
    examples.push(...generateNegativeExamples());
    log.info({ count: examples.length }, 'Generated synthetic examples');
    return examples;
}
// ============================================================================
// COMBINED DATASET
// ============================================================================
/**
 * Load and combine all training data sources
 */
export function loadCombinedTrainingData() {
    const allExamples = [];
    // Load from all sources
    const gorilla = loadGorillaDataset();
    const toolbench = loadToolBenchPatterns();
    const ferniLogs = exportRoutingLogsAsTraining();
    const synthetic = generateSyntheticExamples();
    allExamples.push(...gorilla, ...toolbench, ...ferniLogs, ...synthetic);
    // Calculate stats
    const bySource = {};
    const byTool = {};
    let totalLength = 0;
    for (const ex of allExamples) {
        bySource[ex.source] = (bySource[ex.source] || 0) + 1;
        byTool[ex.toolId] = (byTool[ex.toolId] || 0) + 1;
        totalLength += ex.query.length;
    }
    const stats = {
        totalExamples: allExamples.length,
        bySource,
        byTool,
        avgQueryLength: totalLength / allExamples.length,
    };
    log.info(stats, 'Combined training data loaded');
    return { examples: allExamples, stats };
}
// ============================================================================
// DATA EXPORT FOR FINE-TUNING
// ============================================================================
/** Helper to select a random negative example from other tools */
function selectNegativeExample(byTool, toolIds, excludeToolId) {
    const otherTools = toolIds.filter((t) => t !== excludeToolId);
    if (otherTools.length === 0)
        return null;
    const randomTool = otherTools[Math.floor(Math.random() * otherTools.length)];
    const otherExamples = byTool.get(randomTool) || [];
    if (otherExamples.length === 0)
        return null;
    return otherExamples[Math.floor(Math.random() * otherExamples.length)].query;
}
/**
 * Export data in format suitable for sentence-transformers fine-tuning
 *
 * Format: (anchor, positive, negative) triplets
 */
export function exportForSentenceTransformers(examples) {
    const triplets = [];
    // Group examples by tool
    const byTool = new Map();
    for (const ex of examples) {
        const list = byTool.get(ex.toolId) || [];
        list.push(ex);
        byTool.set(ex.toolId, list);
    }
    const toolIds = Array.from(byTool.keys());
    // Generate triplets for each tool
    const byToolEntries = Array.from(byTool.entries());
    for (const [toolId, toolExamples] of byToolEntries) {
        for (let i = 0; i < toolExamples.length; i++) {
            const anchor = toolExamples[i].query;
            const positive = toolExamples[(i + 1) % toolExamples.length].query;
            const negative = selectNegativeExample(byTool, toolIds, toolId);
            if (negative) {
                triplets.push({ anchor, positive, negative });
            }
        }
    }
    return triplets;
}
/**
 * Export data for classification fine-tuning
 *
 * Format: { text, label }
 */
export function exportForClassification(examples) {
    return examples.map((ex) => ({
        text: ex.query,
        label: ex.toolId,
    }));
}
//# sourceMappingURL=datasets.js.map