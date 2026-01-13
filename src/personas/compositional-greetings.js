/**
 * Compositional Greeting System
 *
 * Instead of picking pre-written templates, this system COMPOSES greetings
 * from atomic building blocks at runtime. This creates exponential variety
 * from a small set of pieces.
 *
 * Structure: [Opening] + [Recognition] + [Activity/Moment] + [Transition] + [Closer]
 *
 * Each persona defines their own atoms in greeting-atoms.json, keeping them on-brand
 * while still getting exponential variety.
 *
 * Example: 16 openings × 8 recognitions × 10 activities × 9 transitions × 15 closers
 *        = 172,800 unique combinations per persona (vs ~15 templates)
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// ATOM LOADING - Load from persona bundles
// ============================================================================
// Cache loaded atoms by persona ID
const atomsCache = new Map();
/**
 * Flatten categorized atoms into a single array
 */
function flattenAtoms(categorized) {
    return Object.values(categorized).flat();
}
/**
 * Load greeting atoms from a persona's bundle
 */
async function loadPersonaAtoms(personaId, bundlePath) {
    // Check cache first
    if (atomsCache.has(personaId)) {
        return atomsCache.get(personaId);
    }
    try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        // Determine bundle path
        let atomsPath;
        if (bundlePath) {
            atomsPath = path.join(bundlePath, 'content', 'behaviors', 'greeting-atoms.json');
        }
        else {
            // Try standard bundle location
            const bundlesDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'bundles', personaId, 'content', 'behaviors', 'greeting-atoms.json');
            atomsPath = bundlesDir;
        }
        const content = await fs.readFile(atomsPath, 'utf-8');
        const atomsFile = JSON.parse(content);
        // Flatten all categories into arrays
        const atoms = [
            flattenAtoms(atomsFile.openings),
            flattenAtoms(atomsFile.recognitions),
            flattenAtoms(atomsFile.activities),
            flattenAtoms(atomsFile.transitions),
            flattenAtoms(atomsFile.closers),
        ];
        // Cache for future use
        atomsCache.set(personaId, atoms);
        getLogger().debug({
            personaId,
            openings: atoms[0].length,
            recognitions: atoms[1].length,
            activities: atoms[2].length,
            transitions: atoms[3].length,
            closers: atoms[4].length,
        }, '🧩 Loaded persona-specific greeting atoms');
        return atoms;
    }
    catch (err) {
        getLogger().debug({ personaId, error: String(err) }, 'No persona-specific greeting atoms, using defaults');
        return null;
    }
}
// ============================================================================
// DEFAULT ATOMS - Fallback when no persona-specific atoms exist
// ============================================================================
const DEFAULT_OPENINGS = [
    { text: '<emotion value="curious"/>Oh!', weight: 0.8 },
    { text: 'Hmm?', weight: 0.6 },
    { text: '<emotion value="happy"/>Hey!', weight: 0.9 },
    { text: 'Hey.', weight: 0.7 },
    { text: 'Hi!', weight: 0.6 },
    {
        text: '<volume ratio="0.75"/>Hey.</volume>',
        weight: 0.9,
        timeOfDay: ['early_morning', 'late_night'],
    },
    {
        text: '<emotion value="happy"/>There you are!',
        weight: 0.8,
        returningOnly: true,
        minRelationship: 'acquaintance',
    },
    { text: '', weight: 0.25 },
];
const DEFAULT_RECOGNITIONS = [
    { text: '{name}!', weight: 0.9, requiresName: true },
    { text: '{name}.', weight: 0.7, requiresName: true, timeOfDay: ['early_morning', 'late_night'] },
    { text: 'Hello there.', weight: 0.5, newOnly: true },
    { text: '', weight: 0.4 },
    { text: 'Good to see you.', weight: 0.6, returningOnly: true },
    { text: "I'm {persona}.", weight: 0.9, newOnly: true },
];
const DEFAULT_ACTIVITIES = [
    { text: 'I was just {caughtDoing}', weight: 0.9, requiresCaughtDoing: true },
    { text: 'You caught me {caughtDoing}', weight: 0.7, requiresCaughtDoing: true },
    { text: 'Just settling in here.', weight: 0.5 },
    { text: 'Still waking up.', weight: 0.7, timeOfDay: ['early_morning'] },
    { text: '', weight: 0.4 },
    { text: 'Early bird, huh?', weight: 0.6, timeOfDay: ['early_morning'] },
];
const DEFAULT_TRANSITIONS = [
    { text: 'Come in, come in.', weight: 0.7 },
    { text: 'Good to have you.', weight: 0.6, returningOnly: true },
    { text: "I'm glad you're here.", weight: 0.7 },
    { text: 'But never mind that.', weight: 0.6, requiresCaughtDoing: true },
    { text: '', weight: 0.5 },
];
const DEFAULT_CLOSERS = [
    { text: "What's on your mind?", weight: 0.9 },
    { text: "What's happening?", weight: 0.8 },
    { text: "What's going on?", weight: 0.7 },
    { text: "What's up?", weight: 0.6 },
    { text: 'What brings you here?', weight: 0.6, newOnly: true },
    { text: "How've you been?", weight: 0.7, returningOnly: true },
    { text: "What's keeping you up?", weight: 0.7, timeOfDay: ['late_night'] },
];
const DEFAULT_ATOMS = [
    DEFAULT_OPENINGS,
    DEFAULT_RECOGNITIONS,
    DEFAULT_ACTIVITIES,
    DEFAULT_TRANSITIONS,
    DEFAULT_CLOSERS,
];
// ============================================================================
// RELATIONSHIP HIERARCHY
// ============================================================================
const RELATIONSHIP_LEVELS = {
    stranger: 0,
    acquaintance: 1,
    friend: 2,
    trusted_advisor: 3,
};
function meetsRelationshipRequirement(current, required) {
    if (!required)
        return true;
    return RELATIONSHIP_LEVELS[current] >= RELATIONSHIP_LEVELS[required];
}
// ============================================================================
// WEIGHTED RANDOM SELECTION
// ============================================================================
function selectWeightedOption(options, ctx) {
    // Filter by conditions
    const eligible = options.filter((opt) => {
        // Check relationship level
        if (opt.minRelationship &&
            !meetsRelationshipRequirement(ctx.relationshipStage, opt.minRelationship)) {
            return false;
        }
        // Check time of day
        if (opt.timeOfDay && !opt.timeOfDay.includes(ctx.timeOfDay)) {
            return false;
        }
        // Check weekend
        if (opt.isWeekend !== undefined && opt.isWeekend !== ctx.isWeekend) {
            return false;
        }
        // Check name requirement
        if (opt.requiresName && !ctx.userName) {
            return false;
        }
        // Check caught doing requirement
        if (opt.requiresCaughtDoing && !ctx.caughtDoing) {
            return false;
        }
        // Check returning user requirement
        if (opt.returningOnly && !ctx.isReturningUser) {
            return false;
        }
        // Check new user requirement
        if (opt.newOnly && ctx.isReturningUser) {
            return false;
        }
        return true;
    });
    if (eligible.length === 0)
        return null;
    // Weighted random selection
    const totalWeight = eligible.reduce((sum, opt) => sum + opt.weight, 0);
    let random = Math.random() * totalWeight;
    for (const opt of eligible) {
        random -= opt.weight;
        if (random <= 0)
            return opt;
    }
    return eligible[eligible.length - 1];
}
// ============================================================================
// GREETING COMPOSITION
// ============================================================================
function fillPlaceholders(text, ctx) {
    return text
        .replace(/{name}/g, ctx.userName || '')
        .replace(/{persona}/g, ctx.personaName)
        .replace(/{caughtDoing}/g, ctx.caughtDoing || '');
}
/**
 * Add pauses between parts with "Better Than Human" humanization
 *
 * Creates a greeting that feels like someone arriving:
 * 1. BREATH: Subtle breath sound ~30% of the time
 * 2. SPEED ARC: Opener is slower, then settles to normal pace
 * 3. LANDING: Patient pause at the end
 */
function addPauses(parts, isLateNight = false) {
    // Filter out empty parts
    const nonEmpty = parts.filter((p) => p.trim());
    if (nonEmpty.length === 0)
        return '';
    let result = '';
    // 1. BREATH BEFORE WORDS (~30%, higher for late night)
    const breathChance = isLateNight ? 0.5 : 0.3;
    if (Math.random() < breathChance) {
        const breaths = isLateNight
            ? [
                '<break time="60ms"/>[soft breath]<break time="80ms"/>',
                '<break time="70ms"/>[quiet breath]<break time="70ms"/>',
            ]
            : [
                '<break time="40ms"/>[breath]<break time="60ms"/>',
                '<break time="50ms"/>[soft breath]<break time="70ms"/>',
                '<break time="40ms"/>',
            ];
        result += breaths[Math.floor(Math.random() * breaths.length)];
    }
    else {
        // Small settling pause
        result += '<break time="40ms"/>';
    }
    // 2. BUILD PARTS WITH SPEED ARC
    nonEmpty.forEach((part, i) => {
        if (i === 0) {
            // First part (opener) is SLOWER - the "landing" feel
            const speed = isLateNight ? 0.85 : 0.9;
            result += `<speed ratio="${speed}"/>${part}`;
        }
        else if (i === nonEmpty.length - 1) {
            // Last part (question/closer) at normal pace
            const pauseMs = 150 + Math.floor(Math.random() * 80); // 150-230ms
            result += `<break time="${pauseMs}ms"/><speed ratio="1.0"/>${part}`;
        }
        else {
            // Middle parts - gradual speed increase
            const pauseMs = 120 + Math.floor(Math.random() * 60); // 120-180ms
            const speed = 0.92 + i * 0.03; // Gradually faster
            result += `<break time="${pauseMs}ms"/><speed ratio="${speed.toFixed(2)}"/>${part}`;
        }
    });
    // 3. LANDING PAUSE - patient presence after question
    const landingMs = isLateNight
        ? 500 + Math.floor(Math.random() * 150) // 500-650ms for late night
        : 400 + Math.floor(Math.random() * 120); // 400-520ms normally
    result += `<break time="${landingMs}ms"/>`;
    return result;
}
/**
 * Compose a greeting from atomic building blocks
 *
 * "BETTER THAN HUMAN" - Compositional greetings now have:
 * - Breath before words (~30%)
 * - Speed arc (slower opener → normal question)
 * - Patient landing pause after question
 * - Time-of-day awareness (softer for late night)
 */
export function composeGreeting(ctx, atoms = DEFAULT_ATOMS) {
    const [openings, recognitions, activities, transitions, closers] = atoms;
    const opening = selectWeightedOption(openings, ctx);
    const recognition = selectWeightedOption(recognitions, ctx);
    const activity = selectWeightedOption(activities, ctx);
    const transition = selectWeightedOption(transitions, ctx);
    const closer = selectWeightedOption(closers, ctx);
    // Build the greeting from parts
    const parts = [opening?.text, recognition?.text, activity?.text, transition?.text, closer?.text]
        .filter(Boolean)
        .map((part) => fillPlaceholders(part, ctx));
    // Determine if late night for softer pacing
    const isLateNight = ctx.timeOfDay === 'late_night' || ctx.timeOfDay === 'early_morning';
    // Add humanized pauses with breath, speed arc, and landing
    return addPauses(parts, isLateNight);
}
// ============================================================================
// MAIN EXPORT - Integration with existing system
// ============================================================================
/**
 * Generate a compositional greeting using persona-specific atoms
 */
export async function generateCompositionalGreeting(runtime, persona, options = {}) {
    // Get time context
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const timeOfDay = hour < 6
        ? 'late_night'
        : hour < 9
            ? 'early_morning'
            : hour < 12
                ? 'morning'
                : hour < 17
                    ? 'afternoon'
                    : hour < 21
                        ? 'evening'
                        : 'late_night';
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Load persona-specific atoms (or use defaults)
    const bundlePath = runtime
        ? runtime.bundle?.bundlePath
        : undefined;
    const atoms = (await loadPersonaAtoms(persona.id, bundlePath)) || DEFAULT_ATOMS;
    // Get caught doing from runtime if available
    // Pass sessionId for variety tracking - prevents repetitive quirks
    let caughtDoing;
    if (runtime) {
        try {
            await runtime.loadInnerWorld();
            caughtDoing = runtime.getCaughtDoing(options.sessionId) || undefined;
        }
        catch {
            // Ignore - caughtDoing is optional
        }
    }
    const ctx = {
        personaName: persona.name,
        userName: options.userName,
        isReturningUser: options.isReturningUser || false,
        relationshipStage: options.relationshipStage || 'stranger',
        timeOfDay,
        isWeekend: day === 0 || day === 6,
        dayOfWeek: days[day],
        caughtDoing,
    };
    return composeGreeting(ctx, atoms);
}
/**
 * Clear the atoms cache (useful for hot reload in development)
 */
export function clearAtomsCache() {
    atomsCache.clear();
}
//# sourceMappingURL=compositional-greetings.js.map