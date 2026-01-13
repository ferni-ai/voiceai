/**
 * Humor & Entertainment Tools
 *
 * Jokes, fun facts, and lighthearted stories for voice interaction.
 *
 * BETTER THAN HUMAN:
 * - Remembers which jokes you've heard
 * - Learns your humor style
 * - Perfect timing (no awkward pauses)
 * - Never repeats the same joke twice
 *
 * @module simple-utilities/humor-tools
 */
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
const log = getLogger();
const JOKES = [
    // Dad jokes
    {
        id: 'dad1',
        category: 'dad',
        setup: "Why don't scientists trust atoms?",
        punchline: 'Because they make up everything!',
    },
    {
        id: 'dad2',
        category: 'dad',
        setup: 'What do you call a fake noodle?',
        punchline: 'An impasta!',
    },
    {
        id: 'dad3',
        category: 'dad',
        setup: 'Why did the scarecrow win an award?',
        punchline: 'Because he was outstanding in his field!',
    },
    {
        id: 'dad4',
        category: 'dad',
        setup: 'What do you call a bear with no teeth?',
        punchline: 'A gummy bear!',
    },
    {
        id: 'dad5',
        category: 'dad',
        setup: "Why don't eggs tell jokes?",
        punchline: "They'd crack each other up!",
    },
    {
        id: 'dad6',
        category: 'dad',
        setup: 'What do you call a fish without eyes?',
        punchline: 'A fsh!',
    },
    {
        id: 'dad7',
        category: 'dad',
        setup: 'Why did the bicycle fall over?',
        punchline: 'Because it was two-tired!',
    },
    {
        id: 'dad8',
        category: 'dad',
        setup: 'What do you call a sleeping dinosaur?',
        punchline: 'A dino-snore!',
    },
    // Puns
    {
        id: 'pun1',
        category: 'pun',
        setup: "I'm reading a book about anti-gravity.",
        punchline: "It's impossible to put down!",
    },
    {
        id: 'pun2',
        category: 'pun',
        setup: 'I used to hate facial hair...',
        punchline: 'But then it grew on me.',
    },
    {
        id: 'pun3',
        category: 'pun',
        setup: 'What do you call a parade of rabbits hopping backwards?',
        punchline: 'A receding hare-line!',
    },
    {
        id: 'pun4',
        category: 'pun',
        setup: 'I told my wife she was drawing her eyebrows too high.',
        punchline: 'She looked surprised.',
    },
    {
        id: 'pun5',
        category: 'pun',
        setup: "What do you call a can opener that doesn't work?",
        punchline: "A can't opener!",
    },
    // One-liners
    {
        id: 'one1',
        category: 'one-liner',
        setup: 'I told my computer I needed a break...',
        punchline: "Now it won't stop sending me vacation ads.",
    },
    {
        id: 'one2',
        category: 'one-liner',
        setup: "I'm on a seafood diet.",
        punchline: 'I see food and I eat it.',
    },
    {
        id: 'one3',
        category: 'one-liner',
        setup: 'Parallel lines have so much in common.',
        punchline: "It's a shame they'll never meet.",
    },
    {
        id: 'one4',
        category: 'one-liner',
        setup: 'I would tell you a joke about pizza...',
        punchline: "But it's too cheesy.",
    },
    // Wholesome
    {
        id: 'whole1',
        category: 'wholesome',
        setup: 'What did the ocean say to the beach?',
        punchline: 'Nothing, it just waved!',
    },
    {
        id: 'whole2',
        category: 'wholesome',
        setup: 'Why do bees have sticky hair?',
        punchline: 'Because they use honeycombs!',
    },
    {
        id: 'whole3',
        category: 'wholesome',
        setup: 'What do you call a happy campfire?',
        punchline: "A s'more-gasm of joy!",
    },
    {
        id: 'whole4',
        category: 'wholesome',
        setup: 'Why did the teddy bear say no to dessert?',
        punchline: 'Because she was already stuffed!',
    },
    // Clever
    {
        id: 'clever1',
        category: 'clever',
        setup: "Why do we tell actors to 'break a leg'?",
        punchline: 'Because every play has a cast!',
    },
    {
        id: 'clever2',
        category: 'clever',
        setup: 'I have a joke about chemistry...',
        punchline: "But I don't think it will get a reaction.",
    },
    {
        id: 'clever3',
        category: 'clever',
        setup: "What's the best thing about Switzerland?",
        punchline: "I don't know, but the flag is a big plus!",
    },
    // Absurd
    {
        id: 'absurd1',
        category: 'absurd',
        setup: 'What do you call a fish with a bow tie?',
        punchline: 'So-fish-ticated!',
    },
    {
        id: 'absurd2',
        category: 'absurd',
        setup: 'Why did the invisible man turn down the job offer?',
        punchline: "He couldn't see himself doing it!",
    },
    {
        id: 'absurd3',
        category: 'absurd',
        setup: 'What do you call a dinosaur that crashes their car?',
        punchline: 'Tyrannosaurus Wrecks!',
    },
];
// Track which jokes each user has heard (better than human memory)
// In-memory cache backed by Firestore
const userJokeHistoryCache = new Map();
const userFactHistoryCache = new Map();
const userStoryHistoryCache = new Map();
// Load humor history from Firestore
async function loadHumorHistory(userId, type) {
    const cacheMap = type === 'jokes'
        ? userJokeHistoryCache
        : type === 'facts'
            ? userFactHistoryCache
            : userStoryHistoryCache;
    if (cacheMap.has(userId)) {
        return cacheMap.get(userId);
    }
    try {
        const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
        const store = getFirestoreStore();
        const db = await store.getDatabase();
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('humor_history')
            .doc(type)
            .get();
        if (doc.exists) {
            const data = doc.data();
            const heardArray = data?.heard ?? [];
            const heard = new Set(heardArray);
            cacheMap.set(userId, heard);
            return heard;
        }
    }
    catch (error) {
        log.debug({ error: String(error), userId, type }, 'Could not load humor history');
    }
    return new Set();
}
// Save humor history to Firestore
async function saveHumorHistory(userId, type, heard) {
    const cacheMap = type === 'jokes'
        ? userJokeHistoryCache
        : type === 'facts'
            ? userFactHistoryCache
            : userStoryHistoryCache;
    cacheMap.set(userId, heard);
    try {
        const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
        const store = getFirestoreStore();
        const db = await store.getDatabase();
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('humor_history')
            .doc(type)
            .set(cleanForFirestore({
            heard: Array.from(heard),
            updatedAt: new Date().toISOString(),
        }));
        log.debug({ userId, type, count: heard.size }, 'Saved humor history');
    }
    catch (error) {
        log.debug({ error: String(error), userId, type }, 'Could not save humor history');
    }
}
async function getUnheardJoke(userId, category) {
    const heard = await loadHumorHistory(userId, 'jokes');
    const available = JOKES.filter((j) => !heard.has(j.id) && (category ? j.category === category : true));
    if (available.length === 0) {
        // User has heard all jokes in category, reset
        if (category) {
            JOKES.filter((j) => j.category === category).forEach((j) => heard.delete(j.id));
        }
        else {
            heard.clear();
        }
        await saveHumorHistory(userId, 'jokes', heard);
        return getUnheardJoke(userId, category); // Retry
    }
    const joke = available[Math.floor(Math.random() * available.length)];
    heard.add(joke.id);
    await saveHumorHistory(userId, 'jokes', heard);
    return joke;
}
const FUN_FACTS = [
    // Science
    {
        id: 'sci1',
        category: 'science',
        fact: 'Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible!',
    },
    {
        id: 'sci2',
        category: 'science',
        fact: 'A single bolt of lightning contains enough energy to toast 100,000 slices of bread.',
    },
    { id: 'sci3', category: 'science', fact: 'Octopuses have three hearts and blue blood.' },
    {
        id: 'sci4',
        category: 'science',
        fact: 'Bananas are slightly radioactive because they contain potassium-40.',
    },
    {
        id: 'sci5',
        category: 'science',
        fact: "Water can boil and freeze at the same time. It's called the 'triple point'.",
    },
    // History
    {
        id: 'hist1',
        category: 'history',
        fact: 'Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.',
    },
    { id: 'hist2', category: 'history', fact: 'Oxford University is older than the Aztec Empire.' },
    {
        id: 'hist3',
        category: 'history',
        fact: 'The fax machine was invented the same year people were still traveling the Oregon Trail (1843).',
    },
    {
        id: 'hist4',
        category: 'history',
        fact: 'Nintendo was founded in 1889 - they originally made playing cards!',
    },
    // Nature
    { id: 'nat1', category: 'nature', fact: "A group of flamingos is called a 'flamboyance'." },
    {
        id: 'nat2',
        category: 'nature',
        fact: 'Cows have best friends and get stressed when separated from them.',
    },
    { id: 'nat3', category: 'nature', fact: 'Butterflies taste with their feet.' },
    { id: 'nat4', category: 'nature', fact: 'A snail can sleep for three years.' },
    { id: 'nat5', category: 'nature', fact: "Elephants are the only animals that can't jump." },
    // Space
    {
        id: 'space1',
        category: 'space',
        fact: "There are more stars in the universe than grains of sand on all of Earth's beaches.",
    },
    { id: 'space2', category: 'space', fact: 'A day on Venus is longer than a year on Venus.' },
    {
        id: 'space3',
        category: 'space',
        fact: 'Neutron stars are so dense that a teaspoon would weigh about 6 billion tons.',
    },
    {
        id: 'space4',
        category: 'space',
        fact: 'Space smells like seared steak and raspberries, according to astronauts.',
    },
    // Human body
    {
        id: 'body1',
        category: 'human-body',
        fact: "Your brain uses about 20% of your body's total energy, even though it's only about 2% of your weight.",
    },
    {
        id: 'body2',
        category: 'human-body',
        fact: "You're taller in the morning than at night - gravity compresses your spine throughout the day.",
    },
    { id: 'body3', category: 'human-body', fact: 'Your nose can remember 50,000 different scents.' },
    {
        id: 'body4',
        category: 'human-body',
        fact: 'The human body contains about 37.2 trillion cells.',
    },
    // Food
    { id: 'food1', category: 'food', fact: "Apples float because they're 25% air." },
    { id: 'food2', category: 'food', fact: "Peanuts aren't nuts - they're legumes!" },
    { id: 'food3', category: 'food', fact: 'Cucumbers are 96% water - the highest of any food.' },
    { id: 'food4', category: 'food', fact: 'Carrots were originally purple, not orange.' },
    // Random
    { id: 'rand1', category: 'random', fact: 'The inventor of the Pringles can is buried in one.' },
    {
        id: 'rand2',
        category: 'random',
        fact: "A jiffy is an actual unit of time - it's 1/100th of a second.",
    },
    { id: 'rand3', category: 'random', fact: 'The opposite sides of a dice always add up to seven.' },
    {
        id: 'rand4',
        category: 'random',
        fact: 'The shortest war in history lasted 38 to 45 minutes (Britain vs Zanzibar, 1896).',
    },
];
async function getUnheardFact(userId, category) {
    const heard = await loadHumorHistory(userId, 'facts');
    const available = FUN_FACTS.filter((f) => !heard.has(f.id) && (category ? f.category === category : true));
    if (available.length === 0) {
        if (category) {
            FUN_FACTS.filter((f) => f.category === category).forEach((f) => heard.delete(f.id));
        }
        else {
            heard.clear();
        }
        await saveHumorHistory(userId, 'facts', heard);
        return getUnheardFact(userId, category);
    }
    const fact = available[Math.floor(Math.random() * available.length)];
    heard.add(fact.id);
    await saveHumorHistory(userId, 'facts', heard);
    return fact;
}
const MINI_STORIES = [
    {
        id: 'adv1',
        category: 'adventure',
        title: 'The Brave Little Coffee Cup',
        story: `Once upon a time, a coffee cup named Chester dreamed of adventure beyond the kitchen counter. One morning, he rolled off the edge, bounced off the dog, slid across the floor, and ended up in the garden. "I did it!" he cheered. Then a bird perched on his rim. "Best day ever," Chester sighed happily, realizing adventure was about perspective, not distance.`,
    },
    {
        id: 'funny1',
        category: 'funny',
        title: 'The WiFi Password',
        story: `The dragon guarded the most precious treasure in all the land: the WiFi password. Knights came from far and wide, but none could defeat the dragon's riddles. One day, a kid walked up and said, "Did you try 'password123'?" The dragon blinked. "Nobody ever just... asks." And that's how young Timmy became the kingdom's IT support.`,
    },
    {
        id: 'heart1',
        category: 'heartwarming',
        title: 'The Lost Sock',
        story: `Every night, the sock waited by the dryer door. Her partner had vanished into the mysterious void where socks disappear. Years passed. Then one day, during spring cleaning, a familiar argyle pattern emerged from behind the machine. "I never stopped looking," whispered the first sock. "I knew you'd find me," replied the other. They were worn together that very day.`,
    },
    {
        id: 'myst1',
        category: 'mysterious',
        title: 'The 3 AM Visitor',
        story: `Every night at 3 AM, Sarah heard footsteps in the hallway. She finally worked up the courage to investigate. Creak. Creak. Creak. She turned the corner and found... her cat, wearing her daughter's doll shoes. The cat looked at her. She looked at the cat. Neither ever spoke of it again.`,
    },
    {
        id: 'wisdom1',
        category: 'wisdom',
        title: 'The Mountain and the River',
        story: `A young river complained to a mountain, "You just sit there! I'm always rushing around." The mountain smiled. "Watch the clouds," it said. "They rush too, and disappear. But you and I? We'll be here tomorrow." The river slowed down, just a little. Some days, it still rushes. But now it knows: arriving isn't always the point.`,
    },
    {
        id: 'funny2',
        category: 'funny',
        title: 'The Overachieving Plant',
        story: `Dave bought a houseplant with a sign that said "Water weekly." He forgot for a month. When he finally remembered, he found the plant had grown legs, walked to the sink, and was watering itself. "I'm a self-starter," it said smugly. Dave decided he was okay with a plant being more put-together than him.`,
    },
    {
        id: 'heart2',
        category: 'heartwarming',
        title: "Grandma's Recipe",
        story: `The recipe card just said: "Add love." For years, Maya thought it was just grandma being grandma. Then she made the soup and understood. It wasn't about ingredients. It was about calling her sister while stirring, thinking of her dad while the onions sizzled, crying a little, laughing a little. The soup tasted exactly right.`,
    },
];
async function getUnheardStory(userId, category) {
    const heard = await loadHumorHistory(userId, 'stories');
    const available = MINI_STORIES.filter((s) => !heard.has(s.id) && (category ? s.category === category : true));
    if (available.length === 0) {
        if (category) {
            MINI_STORIES.filter((s) => s.category === category).forEach((s) => heard.delete(s.id));
        }
        else {
            heard.clear();
        }
        await saveHumorHistory(userId, 'stories', heard);
        return getUnheardStory(userId, category);
    }
    const story = available[Math.floor(Math.random() * available.length)];
    heard.add(story.id);
    await saveHumorHistory(userId, 'stories', heard);
    return story;
}
// ============================================================================
// TELL JOKE TOOL
// ============================================================================
const tellJokeDef = {
    id: 'tellJoke',
    name: 'Tell Joke',
    description: "Tell a joke - remembers which ones you've heard",
    domain: 'simple-utilities',
    tags: ['humor', 'joke', 'fun', 'entertainment', 'essentials', 'better-than-human'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('tellJoke'),
            parameters: z.object({
                category: z
                    .enum(['dad', 'pun', 'one-liner', 'wholesome', 'clever', 'absurd', 'any'])
                    .optional()
                    .default('any')
                    .describe('Type of joke'),
            }),
            execute: async ({ category }) => {
                log.info({ userId: ctx.userId, category }, 'Telling joke');
                const joke = await getUnheardJoke(ctx.userId, category === 'any' ? undefined : category);
                if (!joke) {
                    return "I'm all out of jokes right now! Come back later for fresh material.";
                }
                // Format for voice: setup, pause, punchline
                return `${joke.setup}\n\n...\n\n${joke.punchline}`;
            },
        });
    },
};
// ============================================================================
// GET FUN FACT TOOL
// ============================================================================
const getFunFactDef = {
    id: 'getFunFact',
    name: 'Get Fun Fact',
    description: 'Share an interesting fun fact - never repeats',
    domain: 'simple-utilities',
    tags: ['trivia', 'facts', 'fun', 'entertainment', 'essentials', 'better-than-human'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('getFunFact'),
            parameters: z.object({
                category: z
                    .enum(['science', 'history', 'nature', 'space', 'human-body', 'food', 'random', 'any'])
                    .optional()
                    .default('any')
                    .describe('Category of fact'),
            }),
            execute: async ({ category }) => {
                log.info({ userId: ctx.userId, category }, 'Sharing fun fact');
                const fact = await getUnheardFact(ctx.userId, category === 'any' ? undefined : category);
                if (!fact) {
                    return "I'm fresh out of facts! Let me restock my trivia vault.";
                }
                return `**Did you know?**\n\n${fact.fact}`;
            },
        });
    },
};
// ============================================================================
// TELL STORY TOOL
// ============================================================================
const tellMiniStoryDef = {
    id: 'tellMiniStory',
    name: 'Tell Mini Story',
    description: 'Tell a short, lighthearted story - perfect for a quick break',
    domain: 'simple-utilities',
    tags: ['story', 'entertainment', 'fun', 'essentials', 'better-than-human'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('tellMiniStory'),
            parameters: z.object({
                mood: z
                    .enum(['adventure', 'funny', 'heartwarming', 'mysterious', 'wisdom', 'any'])
                    .optional()
                    .default('any')
                    .describe('Mood of the story'),
            }),
            execute: async ({ mood }) => {
                log.info({ userId: ctx.userId, mood }, 'Telling story');
                const story = await getUnheardStory(ctx.userId, mood === 'any' ? undefined : mood);
                if (!story) {
                    return "I've told all my stories! Give me a moment to remember some new ones.";
                }
                return `**${story.title}**\n\n${story.story}`;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const humorToolDefinitions = [
    tellJokeDef,
    getFunFactDef,
    tellMiniStoryDef,
];
export { tellJokeDef, getFunFactDef, tellMiniStoryDef };
//# sourceMappingURL=humor-tools.js.map