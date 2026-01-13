/**
 * Location & Place Data Capture Definition
 *
 * Passively captures favorite places, locations, and geographic preferences
 * mentioned in conversation and stores them via location hooks.
 *
 * Examples:
 * - "I love this little coffee shop on Main Street"
 * - "My favorite restaurant is that Thai place downtown"
 * - "I grew up in Seattle"
 * - "We got engaged at that overlook in the mountains"
 */
import { onFavoritePlaceChange, onLocationMemoryChange } from '../../../services/data-layer/hooks/location-hooks.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'LocationCapture' });
// Place type detection patterns
const PLACE_TYPES = {
    restaurant: 'restaurant',
    cafe: 'cafe',
    'coffee shop': 'cafe',
    bar: 'bar',
    pub: 'bar',
    park: 'park',
    beach: 'beach',
    gym: 'gym',
    library: 'library',
    bookstore: 'bookstore',
    museum: 'museum',
    theater: 'entertainment',
    cinema: 'entertainment',
    mall: 'shopping',
    store: 'shopping',
    shop: 'shopping',
    church: 'religious',
    temple: 'religious',
    mosque: 'religious',
    hospital: 'medical',
    clinic: 'medical',
    school: 'education',
    university: 'education',
    college: 'education',
    office: 'work',
    workplace: 'work',
    hotel: 'travel',
    airport: 'travel',
    station: 'travel',
};
// Sentiment indicators for places
const POSITIVE_SENTIMENT = ['love', 'favorite', 'best', 'amazing', 'wonderful', 'great', 'awesome', 'perfect'];
const NEGATIVE_SENTIMENT = ['hate', 'worst', 'terrible', 'awful', 'avoid', 'dislike'];
// Map internal place types to valid FavoritePlaceEntity types
const PLACE_TYPE_MAPPING = {
    restaurant: 'restaurant',
    cafe: 'cafe',
    bar: 'venue',
    beach: 'other',
    gym: 'venue',
    library: 'venue',
    bookstore: 'store',
    museum: 'venue',
    entertainment: 'venue',
    shopping: 'store',
    religious: 'venue',
    medical: 'venue',
    education: 'venue',
    work: 'venue',
    travel: 'venue',
    place: 'other',
    park: 'park',
};
function detectPlaceType(text) {
    const lowerText = text.toLowerCase();
    for (const [keyword, type] of Object.entries(PLACE_TYPES)) {
        if (lowerText.includes(keyword)) {
            return PLACE_TYPE_MAPPING[type] || 'other';
        }
    }
    return 'other';
}
function extractPlaceName(text) {
    // Patterns for place names
    const patterns = [
        // "that Thai place downtown" -> "Thai place downtown"
        /that\s+(\w+(?:\s+\w+)*?)\s+(?:downtown|on|near|by)/i,
        // "place called X" or "restaurant called X"
        /(?:place|restaurant|cafe|bar|shop)\s+called\s+["']?([^"']+)["']?/i,
        // "X restaurant" or "X cafe"
        /(\w+(?:\s+\w+)?)\s+(?:restaurant|cafe|bar|shop|place)/i,
        // Proper name patterns "at The Golden Dragon"
        /at\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}
function extractLocation(text) {
    // Patterns for locations
    const patterns = [
        // "on Main Street"
        /on\s+(\w+(?:\s+\w+)?\s+(?:street|avenue|road|boulevard|lane|drive|way))/i,
        // "in downtown Seattle"
        /in\s+(downtown\s+\w+)/i,
        // "in Seattle"
        /in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
        // "near the park"
        /near\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}
export const locationCaptureDefinition = {
    id: 'capture_location_info',
    name: 'Location & Place Capture',
    description: 'Captures favorite places and location memories mentioned in conversation',
    category: 'location',
    triggers: {
        phrases: [
            'my favorite',
            'i love this',
            'i love that',
            'best place',
            'go-to spot',
            'go to spot',
            'grew up in',
            'used to live',
            'moved from',
            'moved to',
            'we got engaged at',
            'we met at',
            'reminds me of',
            'takes me back to',
        ],
        patterns: [
            // "My favorite restaurant is X"
            /my\s+favorite\s+(\w+)\s+is/i,
            // "I love [that/this] X"
            /i\s+love\s+(?:that|this)\s+(\w+)/i,
            // "The best X is"
            /the\s+best\s+(\w+)\s+is/i,
            // Geographic origin patterns
            /i\s+(?:grew\s+up|was\s+raised|am\s+from)\s+in\s+(\w+)/i,
            // Memory locations
            /we\s+(?:got\s+engaged|met|first\s+kissed)\s+at/i,
        ],
        keywords: [
            { word: 'favorite', weight: 0.9 },
            { word: 'love', weight: 0.7 },
            { word: 'best', weight: 0.7 },
            { word: 'restaurant', weight: 0.6 },
            { word: 'cafe', weight: 0.6 },
            { word: 'coffee', weight: 0.5 },
            { word: 'place', weight: 0.5 },
            { word: 'spot', weight: 0.5 },
            { word: 'grew up', weight: 0.8 },
            { word: 'from', weight: 0.3 },
            { word: 'hometown', weight: 0.9 },
        ],
        antiKeywords: ['what', 'where', 'recommend', 'suggestion', 'find', 'looking for'],
    },
    arguments: [
        {
            name: 'placeName',
            type: 'string',
            description: 'Name of the place',
            required: false,
            extractionPatterns: [
                /called\s+["']?([^"']+)["']?/i,
                /(?:at|to)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
            ],
        },
        {
            name: 'placeType',
            type: 'string',
            description: 'Type of place (restaurant, cafe, etc.)',
            required: false,
            extractionPatterns: [
                /(?:favorite|best|go-to)\s+(\w+)/i,
                /(?:this|that)\s+(\w+)\s+(?:on|near|downtown)/i,
            ],
        },
        {
            name: 'location',
            type: 'string',
            description: 'Geographic location',
            required: false,
            extractionPatterns: [
                /(?:in|from|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
                /on\s+(\w+(?:\s+\w+)?\s+(?:street|avenue|road))/i,
            ],
        },
    ],
    confidence: {
        baseScore: 0.5,
        patternMatchBonus: 0.3,
        keywordDensityMultiplier: 1.2,
        negativeKeywordPenalty: 0.3,
    },
    handler: async (args, context) => {
        const { userId, transcript } = context;
        // Extract or use provided values
        const placeName = args.placeName || extractPlaceName(transcript);
        const placeTypeRaw = args.placeType || null;
        const placeType = placeTypeRaw
            ? (PLACE_TYPE_MAPPING[placeTypeRaw] || 'other')
            : detectPlaceType(transcript);
        const location = args.location || extractLocation(transcript);
        // Check for memory-related patterns (special places)
        const memoryPatterns = [
            /we\s+(?:got\s+engaged|met|first\s+kissed|got\s+married)/i,
            /(?:proposed|engaged)\s+(?:at|there)/i,
            /reminds?\s+me\s+of/i,
            /takes?\s+me\s+back/i,
        ];
        const isMemoryLocation = memoryPatterns.some((p) => p.test(transcript));
        // Determine significance
        const hasPositiveSentiment = POSITIVE_SENTIMENT.some((s) => transcript.toLowerCase().includes(s));
        const significance = isMemoryLocation
            ? 'life_changing'
            : hasPositiveSentiment
                ? 'meaningful'
                : 'casual';
        if (isMemoryLocation) {
            // Store as location memory
            const memoryData = {
                place: placeName || location || 'a special place',
                memory: transcript.slice(0, 200),
                emotion: hasPositiveSentiment ? 'happy' : 'nostalgic',
                significance,
            };
            try {
                await onLocationMemoryChange(userId, `loc_mem_${Date.now()}`, memoryData, 'create');
                log.info({ userId, place: memoryData.place }, '📍 Location memory captured');
                return null; // Silent save - no acknowledgment needed
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to save location memory');
                return null;
            }
        }
        if (placeName || (hasPositiveSentiment && placeType !== 'other')) {
            // Store as favorite place
            const placeData = {
                name: placeName || `${placeType} (unnamed)`,
                type: placeType,
                location: location || undefined,
                whyLoved: hasPositiveSentiment ? 'User mentioned loving this place' : 'Mentioned in conversation',
            };
            try {
                await onFavoritePlaceChange(userId, `fav_place_${Date.now()}`, placeData, 'create');
                log.info({ userId, place: placeData.name }, '📍 Favorite place captured');
                return null; // Silent save
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to save favorite place');
                return null;
            }
        }
        return null;
    },
};
//# sourceMappingURL=location.capture.js.map