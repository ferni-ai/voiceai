/**
 * Pet Data Capture Definition
 *
 * Passively captures pet information mentioned in conversation
 * and stores it via pet hooks.
 *
 * Examples:
 * - "My dog Max is a golden retriever"
 * - "I have two cats named Luna and Mochi"
 * - "My parrot talks all day"
 * - "We lost our dog last year"
 */
import { onPetChange, onPetMilestoneChange } from '../../../services/data-layer/hooks/pets-hooks.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'PetCapture' });
// Pet type mapping to valid species
const PET_TYPES = {
    dog: 'dog',
    puppy: 'dog',
    pup: 'dog',
    cat: 'cat',
    kitten: 'cat',
    kitty: 'cat',
    bird: 'bird',
    parrot: 'bird',
    parakeet: 'bird',
    budgie: 'bird',
    cockatiel: 'bird',
    fish: 'fish',
    goldfish: 'fish',
    betta: 'fish',
    hamster: 'small_mammal',
    guinea: 'small_mammal',
    rabbit: 'small_mammal',
    bunny: 'small_mammal',
    turtle: 'reptile',
    tortoise: 'reptile',
    snake: 'reptile',
    lizard: 'reptile',
    gecko: 'reptile',
    horse: 'other',
    pony: 'other',
};
// Common dog breeds for detection
const DOG_BREEDS = [
    'golden retriever',
    'labrador',
    'lab',
    'german shepherd',
    'bulldog',
    'poodle',
    'beagle',
    'rottweiler',
    'husky',
    'corgi',
    'dachshund',
    'boxer',
    'yorkie',
    'chihuahua',
    'shih tzu',
    'maltese',
    'pomeranian',
    'border collie',
    'aussie',
    'australian shepherd',
    'pit bull',
    'pitbull',
    'mutt',
    'mixed breed',
];
// Common cat breeds
const CAT_BREEDS = [
    'persian',
    'siamese',
    'maine coon',
    'ragdoll',
    'bengal',
    'british shorthair',
    'scottish fold',
    'sphynx',
    'tabby',
    'calico',
    'tuxedo',
    'orange tabby',
];
function detectPetType(text) {
    const lowerText = text.toLowerCase();
    for (const [keyword, type] of Object.entries(PET_TYPES)) {
        if (lowerText.includes(keyword)) {
            return type;
        }
    }
    return null;
}
function extractPetName(text) {
    // Patterns for pet names
    const patterns = [
        // "my dog Max" or "my cat Luna"
        /my\s+(?:dog|cat|bird|fish|hamster|rabbit|turtle|horse)\s+(?:named\s+)?([A-Z][a-z]+)/i,
        // "named Max" or "called Luna"
        /(?:named|called)\s+([A-Z][a-z]+)/i,
        // "Max is a golden retriever"
        /([A-Z][a-z]+)\s+is\s+(?:a\s+)?(?:\w+\s+)?(?:retriever|poodle|shepherd|bulldog|beagle|husky|corgi|cat|kitten)/i,
        // "have a dog named X"
        /(?:have|got|adopted)\s+a\s+(?:\w+\s+)?(?:named|called)\s+([A-Z][a-z]+)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}
function extractBreed(text) {
    const lowerText = text.toLowerCase();
    // Check dog breeds
    for (const breed of DOG_BREEDS) {
        if (lowerText.includes(breed)) {
            return breed;
        }
    }
    // Check cat breeds
    for (const breed of CAT_BREEDS) {
        if (lowerText.includes(breed)) {
            return breed;
        }
    }
    return null;
}
function detectPetLoss(text) {
    const lossPatterns = [
        /lost\s+(?:my|our)\s+(?:dog|cat|pet)/i,
        /passed\s+away/i,
        /had\s+to\s+put\s+(?:him|her|them)\s+down/i,
        /crossed\s+the\s+rainbow\s+bridge/i,
        /miss\s+(?:him|her|my\s+(?:dog|cat))/i,
        /(?:dog|cat|pet)\s+(?:died|passed)/i,
    ];
    return lossPatterns.some((p) => p.test(text));
}
export const petCaptureDefinition = {
    id: 'capture_pet_info',
    name: 'Pet Information Capture',
    description: 'Captures pet details and pet-related memories mentioned in conversation',
    category: 'pet',
    triggers: {
        phrases: [
            'my dog',
            'my cat',
            'my pet',
            'my puppy',
            'my kitten',
            'my bird',
            'my fish',
            'my hamster',
            'my rabbit',
            'my turtle',
            'my horse',
            'have a dog',
            'have a cat',
            'got a puppy',
            'got a kitten',
            'adopted a',
            'rescue dog',
            'rescue cat',
            'lost my dog',
            'lost my cat',
        ],
        patterns: [
            // "My dog Max is a golden retriever"
            /my\s+(?:dog|cat|pet)\s+([A-Z][a-z]+)\s+is/i,
            // "I have a dog named Max"
            /(?:have|got)\s+a\s+(?:\w+\s+)?(?:dog|cat|pet)\s+named\s+/i,
            // "Max is my golden retriever"
            /([A-Z][a-z]+)\s+is\s+my\s+(?:\w+\s+)?(?:dog|cat|pet)/i,
            // "We adopted Luna"
            /(?:we\s+)?adopted\s+(?:a\s+)?([A-Z][a-z]+)/i,
            // Pet loss patterns
            /lost\s+(?:my|our)\s+(?:dog|cat|pet)/i,
        ],
        keywords: [
            { word: 'dog', weight: 0.8 },
            { word: 'cat', weight: 0.8 },
            { word: 'puppy', weight: 0.9 },
            { word: 'kitten', weight: 0.9 },
            { word: 'pet', weight: 0.7 },
            { word: 'retriever', weight: 0.8 },
            { word: 'poodle', weight: 0.8 },
            { word: 'shepherd', weight: 0.8 },
            { word: 'adopted', weight: 0.7 },
            { word: 'rescue', weight: 0.7 },
            { word: 'vet', weight: 0.5 },
            { word: 'walks', weight: 0.4 },
            { word: 'barks', weight: 0.6 },
            { word: 'meows', weight: 0.6 },
        ],
        antiKeywords: ['what kind of', 'should i get', 'recommend', 'thinking about getting'],
    },
    arguments: [
        {
            name: 'petName',
            type: 'string',
            description: 'Name of the pet',
            required: false,
            extractionPatterns: [
                /(?:named|called)\s+([A-Z][a-z]+)/i,
                /my\s+(?:dog|cat|pet)\s+([A-Z][a-z]+)/i,
            ],
        },
        {
            name: 'petType',
            type: 'string',
            description: 'Type of pet (dog, cat, etc.)',
            required: false,
            extractionPatterns: [/my\s+(\w+)\s+(?:named|is)/i, /(?:have|got)\s+a\s+(\w+)/i],
        },
        {
            name: 'breed',
            type: 'string',
            description: 'Breed of the pet',
            required: false,
            extractionPatterns: [
                /is\s+a\s+(\w+(?:\s+\w+)?)\s*$/i,
                /(\w+\s+retriever|\w+\s+shepherd|\w+\s+poodle)/i,
            ],
        },
    ],
    confidence: {
        baseScore: 0.6,
        patternMatchBonus: 0.25,
        keywordDensityMultiplier: 1.15,
        negativeKeywordPenalty: 0.4,
    },
    handler: async (args, context) => {
        const { userId, transcript } = context;
        // Extract or use provided values
        const petName = args.petName || extractPetName(transcript);
        const petTypeArg = args.petType;
        const petType = petTypeArg
            ? (PET_TYPES[petTypeArg.toLowerCase()] || 'other')
            : detectPetType(transcript);
        const breed = args.breed || extractBreed(transcript);
        if (!petType) {
            // Can't identify pet type, skip
            return null;
        }
        // Check for pet loss (sensitive topic)
        const isPetLoss = detectPetLoss(transcript);
        if (isPetLoss && petName) {
            // Store as pet milestone (loss/passing)
            // Note: 'memorial' is not a valid type, so we use 'other' for pet loss events
            const milestoneData = {
                petName,
                milestone: 'Rainbow Bridge',
                type: 'other',
                date: new Date().toISOString(),
            };
            try {
                await onPetMilestoneChange(userId, `pet_mem_${Date.now()}`, milestoneData, 'create');
                log.info({ userId, petName, type: 'loss' }, '🐾 Pet loss memory captured (sensitive)');
                return null; // Silent - don't acknowledge loss explicitly
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to save pet memory');
                return null;
            }
        }
        if (petName || breed) {
            // Store pet information
            const petData = {
                name: petName || 'Unnamed pet',
                species: petType,
                breed: breed || undefined,
            };
            try {
                await onPetChange(userId, `pet_${Date.now()}`, petData, 'create');
                log.info({ userId, petName: petData.name, petType }, '🐾 Pet captured');
                return null; // Silent save
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to save pet');
                return null;
            }
        }
        return null;
    },
};
//# sourceMappingURL=pets.capture.js.map