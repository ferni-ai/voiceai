/**
 * Translation & Language Tools
 *
 * Leverage Gemini's native multilingual capabilities for translation,
 * language learning, and cross-cultural communication.
 *
 * BETTER THAN GOOGLE TRANSLATE:
 * - Context-aware translations (formal vs casual)
 * - Pronunciation guidance in natural speech
 * - Cultural notes and usage tips
 * - Learning mode with examples
 *
 * @module simple-utilities/translation-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================
const SUPPORTED_LANGUAGES = [
    'English',
    'Spanish',
    'French',
    'German',
    'Italian',
    'Portuguese',
    'Dutch',
    'Russian',
    'Japanese',
    'Chinese (Mandarin)',
    'Chinese (Cantonese)',
    'Korean',
    'Arabic',
    'Hindi',
    'Hebrew',
    'Greek',
    'Turkish',
    'Vietnamese',
    'Thai',
    'Polish',
    'Swedish',
    'Norwegian',
    'Danish',
    'Finnish',
    'Czech',
    'Hungarian',
    'Romanian',
    'Ukrainian',
    'Indonesian',
    'Malay',
    'Tagalog',
    'Swahili',
];
// Common phrases by category for learning
const PHRASE_CATEGORIES = {
    greetings: [
        'Hello',
        'Good morning',
        'Good evening',
        'Goodbye',
        'Nice to meet you',
        'How are you?',
    ],
    travel: [
        'Where is the bathroom?',
        'How much does this cost?',
        'I would like...',
        'The check, please',
        'Do you speak English?',
        "I don't understand",
        'Can you help me?',
        'Where is the train station?',
    ],
    emergency: ['Help!', 'I need a doctor', 'Call the police', "I'm lost", "It's an emergency"],
    polite: ['Please', 'Thank you', "You're welcome", 'Excuse me', "I'm sorry", 'No problem'],
    food: [
        "I'm vegetarian",
        "I'm allergic to...",
        'Water, please',
        'This is delicious',
        'The menu, please',
    ],
    numbers: ['1-10', 'How to count'],
};
// ============================================================================
// TRANSLATION TOOL
// ============================================================================
const translateDef = {
    id: 'translate',
    name: 'Translate',
    description: 'Translate text between languages',
    domain: 'simple-utilities',
    tags: ['translation', 'language', 'international', 'travel'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('translate'),
            parameters: z.object({
                text: z.string().describe('The text to translate'),
                targetLanguage: z
                    .string()
                    .describe('Language to translate TO (e.g., "Spanish", "Japanese")'),
                sourceLanguage: z
                    .string()
                    .optional()
                    .describe('Language to translate FROM (auto-detect if not specified)'),
                context: z
                    .enum(['casual', 'formal', 'business', 'romantic', 'travel'])
                    .optional()
                    .describe('Context for appropriate formality level'),
            }),
            execute: async ({ text, targetLanguage, sourceLanguage, context }) => {
                getLogger().info({ text, targetLanguage, sourceLanguage, context }, '🌍 Translation requested');
                // Build the translation response
                // Note: The LLM will actually perform the translation in its response
                // This tool provides structure and guidance
                let response = '';
                // Detect if this is a simple word/phrase or longer text
                const isShortPhrase = text.split(' ').length <= 10;
                if (isShortPhrase) {
                    response += `**"${text}"** in ${targetLanguage}:\n\n`;
                    response += `🗣️ **Translation:** [Translate "${text}" to ${targetLanguage}]\n\n`;
                    response += `📝 **Pronunciation tip:** [Provide pronunciation guide]\n\n`;
                    if (context) {
                        response += `💡 **Context (${context}):** [Note any formality adjustments for ${context} situations]\n\n`;
                    }
                    // Add cultural note for certain languages
                    const culturalNoteLanguages = ['Japanese', 'Korean', 'Chinese', 'Arabic', 'Hindi'];
                    if (culturalNoteLanguages.some((lang) => targetLanguage.toLowerCase().includes(lang.toLowerCase()))) {
                        response += `🎌 **Cultural note:** [Add relevant cultural context]\n`;
                    }
                }
                else {
                    // Longer text - just translate
                    response += `**Translation to ${targetLanguage}:**\n\n`;
                    response += `[Translate the following to ${targetLanguage}${context ? ` in a ${context} tone` : ''}]\n\n`;
                    response += `"${text}"`;
                }
                return response;
            },
        });
    },
};
// ============================================================================
// PRONUNCIATION GUIDE
// ============================================================================
const pronounceDef = {
    id: 'pronounce',
    name: 'Pronunciation Guide',
    description: 'Get pronunciation help for words in any language',
    domain: 'simple-utilities',
    tags: ['pronunciation', 'language', 'speaking', 'learning'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('pronounce'),
            parameters: z.object({
                word: z.string().describe('The word or phrase to pronounce'),
                language: z
                    .string()
                    .optional()
                    .describe('The language of the word (auto-detect if not specified)'),
            }),
            execute: async ({ word, language }) => {
                getLogger().info({ word, language }, '🗣️ Pronunciation help requested');
                let response = `**How to pronounce "${word}"**${language ? ` (${language})` : ''}:\n\n`;
                response += `🔊 **Sound it out:** [Break down into syllables with emphasis]\n\n`;
                response += `💡 **Tip:** [Provide a memorable way to remember the pronunciation]\n\n`;
                response += `❌ **Common mistake:** [What people often get wrong]\n`;
                return response;
            },
        });
    },
};
// ============================================================================
// LEARN COMMON PHRASES
// ============================================================================
const learnPhrasesDef = {
    id: 'learnPhrases',
    name: 'Learn Common Phrases',
    description: 'Learn essential phrases in a new language',
    domain: 'simple-utilities',
    tags: ['language-learning', 'travel', 'phrases', 'education'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('learnPhrases'),
            parameters: z.object({
                language: z.string().describe('Language to learn phrases in'),
                category: z
                    .enum(['greetings', 'travel', 'emergency', 'polite', 'food', 'numbers', 'all'])
                    .optional()
                    .default('greetings')
                    .describe('Category of phrases to learn'),
                specificSituation: z
                    .string()
                    .optional()
                    .describe('Specific situation (e.g., "ordering at a restaurant")'),
            }),
            execute: async ({ language, category, specificSituation }) => {
                getLogger().info({ language, category, specificSituation }, '📚 Language learning requested');
                let response = `**Essential ${language} Phrases**`;
                if (specificSituation) {
                    response += ` for ${specificSituation}`;
                }
                else if (category && category !== 'all') {
                    response += ` - ${category.charAt(0).toUpperCase() + category.slice(1)}`;
                }
                response += `\n\n`;
                if (specificSituation) {
                    response += `[Provide 5-8 useful phrases for "${specificSituation}" in ${language}]\n\n`;
                    response += `For each phrase, include:\n`;
                    response += `- The phrase in ${language}\n`;
                    response += `- Pronunciation guide\n`;
                    response += `- English meaning\n`;
                }
                else {
                    const phrases = category === 'all'
                        ? Object.values(PHRASE_CATEGORIES).flat()
                        : PHRASE_CATEGORIES[category] ||
                            PHRASE_CATEGORIES.greetings;
                    response += `[Translate and provide pronunciation for these phrases in ${language}:]\n\n`;
                    phrases.forEach((phrase, i) => {
                        response += `${i + 1}. "${phrase}"\n`;
                    });
                }
                response += `\n💡 **Pro tip:** [Add a helpful cultural or linguistic tip for learning ${language}]`;
                return response;
            },
        });
    },
};
// ============================================================================
// WHAT LANGUAGE IS THIS?
// ============================================================================
const detectLanguageDef = {
    id: 'detectLanguage',
    name: 'Detect Language',
    description: 'Identify what language text is written in',
    domain: 'simple-utilities',
    tags: ['language', 'detection', 'identification'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('detectLanguage'),
            parameters: z.object({
                text: z.string().describe('The text to identify'),
            }),
            execute: async ({ text }) => {
                getLogger().info({ textLength: text.length }, '🔍 Language detection requested');
                let response = `**Language Detection**\n\n`;
                response += `Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"\n\n`;
                response += `🌍 **Language:** [Identify the language]\n\n`;
                response += `📝 **Translation:** [Translate to English]\n\n`;
                response += `💡 **About this language:** [Brief interesting fact about the language]`;
                return response;
            },
        });
    },
};
// ============================================================================
// CULTURAL CONTEXT
// ============================================================================
const culturalContextDef = {
    id: 'culturalContext',
    name: 'Cultural Context',
    description: 'Get cultural context for communication in different cultures',
    domain: 'simple-utilities',
    tags: ['culture', 'etiquette', 'international', 'communication'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('culturalContext'),
            parameters: z.object({
                culture: z.string().describe('The culture or country to learn about'),
                situation: z
                    .enum(['greeting', 'business', 'dining', 'gift-giving', 'general', 'taboos'])
                    .optional()
                    .default('general')
                    .describe('Specific situation for cultural tips'),
            }),
            execute: async ({ culture, situation }) => {
                getLogger().info({ culture, situation }, '🎌 Cultural context requested');
                let response = `**Cultural Guide: ${culture}**`;
                if (situation !== 'general') {
                    response += ` - ${situation.charAt(0).toUpperCase() + situation.slice(1)}`;
                }
                response += `\n\n`;
                switch (situation) {
                    case 'greeting':
                        response += `[How to properly greet someone in ${culture} - physical gestures, verbal greetings, formality levels]\n`;
                        break;
                    case 'business':
                        response += `[Business etiquette in ${culture} - meeting customs, hierarchy, gift-giving in business]\n`;
                        break;
                    case 'dining':
                        response += `[Dining customs in ${culture} - table manners, tipping, what to expect]\n`;
                        break;
                    case 'gift-giving':
                        response += `[Gift-giving etiquette in ${culture} - appropriate gifts, how to present, what to avoid]\n`;
                        break;
                    case 'taboos':
                        response += `[Things to avoid in ${culture} - gestures, topics, behaviors that might offend]\n`;
                        break;
                    default:
                        response += `[General cultural tips for ${culture} - key things to know for respectful interaction]\n`;
                }
                response += `\n✅ **Do:** [2-3 things to do]\n`;
                response += `❌ **Don't:** [2-3 things to avoid]\n`;
                response += `💡 **Pro tip:** [One insider tip that will impress locals]`;
                return response;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const translationToolDefinitions = [
    translateDef,
    pronounceDef,
    learnPhrasesDef,
    detectLanguageDef,
    culturalContextDef,
];
// Individual exports
export { culturalContextDef, detectLanguageDef, learnPhrasesDef, PHRASE_CATEGORIES, pronounceDef, SUPPORTED_LANGUAGES, translateDef, };
export default translationToolDefinitions;
//# sourceMappingURL=translation-tools.js.map