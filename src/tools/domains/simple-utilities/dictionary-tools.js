/**
 * Dictionary & Definition Tools
 *
 * Word definitions, pronunciation, etymology, and usage examples.
 * Uses the Free Dictionary API for real definitions.
 *
 * @module simple-utilities/dictionary-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// DEFINE WORD TOOL
// ============================================================================
const defineWordDef = {
    id: 'defineWord',
    name: 'Define Word',
    description: 'Look up the definition, pronunciation, and usage of a word',
    domain: 'simple-utilities',
    tags: ['dictionary', 'definition', 'vocabulary', 'language', 'words'],
    create: (_ctx) => {
        return llm.tool({
            description: `Look up the definition of a word. Returns the meaning, part of speech, pronunciation, etymology, examples, synonyms, and antonyms. Use when the user asks "What does X mean?", "Define X", or "What's the definition of X?"`,
            parameters: z.object({
                word: z.string().describe('The word to look up'),
                includeExamples: z
                    .boolean()
                    .optional()
                    .describe('Whether to include usage examples (default: true)'),
                includeSynonyms: z
                    .boolean()
                    .optional()
                    .describe('Whether to include synonyms (default: true)'),
            }),
            execute: async ({ word, includeExamples = true, includeSynonyms = true }) => {
                const cleanWord = word.trim().toLowerCase();
                log.info({ word: cleanWord }, 'Looking up word definition');
                try {
                    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            return `I couldn't find "${word}" in the dictionary. Check the spelling, or it might be a very specialized or new term.`;
                        }
                        throw new Error(`Dictionary API returned ${response.status}`);
                    }
                    const data = (await response.json());
                    const entry = data[0];
                    // Build the response
                    const parts = [];
                    // Word and pronunciation
                    let header = `**${entry.word}**`;
                    if (entry.phonetic) {
                        header += ` (${entry.phonetic})`;
                    }
                    else if (entry.phonetics?.find((p) => p.text)) {
                        header += ` (${entry.phonetics.find((p) => p.text)?.text})`;
                    }
                    parts.push(header);
                    // Meanings by part of speech
                    for (const meaning of entry.meanings.slice(0, 3)) {
                        // Limit to 3 parts of speech
                        const pos = meaning.partOfSpeech;
                        const defs = meaning.definitions.slice(0, 2); // Limit to 2 definitions per part
                        for (const def of defs) {
                            let defText = `• *${pos}*: ${def.definition}`;
                            // Add example if requested and available
                            if (includeExamples && def.example) {
                                defText += ` — "${def.example}"`;
                            }
                            parts.push(defText);
                        }
                        // Add synonyms if requested
                        if (includeSynonyms && meaning.synonyms && meaning.synonyms.length > 0) {
                            const syns = meaning.synonyms.slice(0, 4).join(', ');
                            parts.push(`  Synonyms: ${syns}`);
                        }
                    }
                    // Add etymology if available
                    if (entry.origin) {
                        parts.push(`Origin: ${entry.origin}`);
                    }
                    return parts.join('\n');
                }
                catch (error) {
                    log.error({ error: String(error), word: cleanWord }, 'Dictionary lookup failed');
                    return `I couldn't look up "${word}" right now. The dictionary service might be unavailable.`;
                }
            },
        });
    },
};
// ============================================================================
// SYNONYM TOOL
// ============================================================================
const getSynonymsDef = {
    id: 'getSynonyms',
    name: 'Get Synonyms',
    description: 'Find synonyms and antonyms for a word',
    domain: 'simple-utilities',
    tags: ['dictionary', 'synonyms', 'antonyms', 'thesaurus', 'vocabulary'],
    create: (_ctx) => {
        return llm.tool({
            description: `Find synonyms and antonyms for a word. Use when the user asks for "another word for X", "synonyms for X", "opposite of X", or needs to find alternative words.`,
            parameters: z.object({
                word: z.string().describe('The word to find synonyms for'),
                includeAntonyms: z
                    .boolean()
                    .optional()
                    .describe('Whether to include antonyms/opposites (default: true)'),
            }),
            execute: async ({ word, includeAntonyms = true }) => {
                const cleanWord = word.trim().toLowerCase();
                log.info({ word: cleanWord }, 'Looking up synonyms');
                try {
                    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            return `I couldn't find "${word}" in the dictionary.`;
                        }
                        throw new Error(`Dictionary API returned ${response.status}`);
                    }
                    const data = (await response.json());
                    const entry = data[0];
                    // Collect all synonyms and antonyms
                    const synonyms = new Set();
                    const antonyms = new Set();
                    for (const meaning of entry.meanings) {
                        meaning.synonyms?.forEach((s) => synonyms.add(s));
                        meaning.antonyms?.forEach((a) => antonyms.add(a));
                        for (const def of meaning.definitions) {
                            def.synonyms?.forEach((s) => synonyms.add(s));
                            def.antonyms?.forEach((a) => antonyms.add(a));
                        }
                    }
                    const parts = [`**${entry.word}**`];
                    if (synonyms.size > 0) {
                        const synList = Array.from(synonyms).slice(0, 8).join(', ');
                        parts.push(`Similar words: ${synList}`);
                    }
                    else {
                        parts.push(`No synonyms found for "${word}".`);
                    }
                    if (includeAntonyms && antonyms.size > 0) {
                        const antList = Array.from(antonyms).slice(0, 5).join(', ');
                        parts.push(`Opposites: ${antList}`);
                    }
                    return parts.join('\n');
                }
                catch (error) {
                    log.error({ error: String(error), word: cleanWord }, 'Synonym lookup failed');
                    return `I couldn't look up synonyms for "${word}" right now.`;
                }
            },
        });
    },
};
// ============================================================================
// WORD OF THE DAY (Fun bonus)
// ============================================================================
const wordOfDayDef = {
    id: 'wordOfDay',
    name: 'Word of the Day',
    description: 'Get an interesting word to learn today',
    domain: 'simple-utilities',
    tags: ['dictionary', 'vocabulary', 'learning', 'words'],
    create: (_ctx) => {
        // Curated list of interesting words
        const interestingWords = [
            { word: 'ephemeral', hint: 'lasting for a very short time' },
            { word: 'serendipity', hint: 'finding good things by chance' },
            { word: 'mellifluous', hint: 'sweet-sounding' },
            { word: 'petrichor', hint: 'the smell of rain on earth' },
            { word: 'sonder', hint: 'realizing everyone has a complex life' },
            { word: 'ineffable', hint: 'too great to express in words' },
            { word: 'luminous', hint: 'full of light; brilliant' },
            { word: 'ebullient', hint: 'cheerfully enthusiastic' },
            { word: 'limerence', hint: 'the state of being infatuated' },
            { word: 'ethereal', hint: 'extremely delicate and light' },
            { word: 'sanguine', hint: 'optimistic in difficult situations' },
            { word: 'halcyon', hint: 'denoting a period of happiness' },
            { word: 'quixotic', hint: 'extremely idealistic; unrealistic' },
            { word: 'eloquent', hint: 'fluent and persuasive speaking' },
            { word: 'resplendent', hint: 'dazzlingly impressive' },
            { word: 'gossamer', hint: 'light, delicate, and translucent' },
            { word: 'phosphenes', hint: 'lights you see when you close your eyes' },
            { word: 'vellichor', hint: 'the wistfulness of used bookstores' },
            { word: 'kairos', hint: 'the perfect moment for action' },
            { word: 'eudaimonia', hint: 'a state of flourishing and well-being' },
        ];
        return llm.tool({
            description: `Get an interesting word to expand vocabulary. Returns a curated word with its definition and usage. Use when the user asks for "word of the day", "teach me a new word", or wants to learn vocabulary.`,
            parameters: z.object({}),
            execute: async () => {
                // Pick a word based on the day (consistent for the day)
                const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
                const selectedWord = interestingWords[dayOfYear % interestingWords.length];
                log.info({ word: selectedWord.word }, 'Getting word of the day');
                try {
                    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${selectedWord.word}`);
                    if (response.ok) {
                        const data = (await response.json());
                        const entry = data[0];
                        const meaning = entry.meanings[0];
                        const def = meaning?.definitions[0];
                        const parts = [
                            `✨ **Word of the Day: ${entry.word}**`,
                            entry.phonetic ? `Pronunciation: ${entry.phonetic}` : '',
                            `*${meaning?.partOfSpeech}*: ${def?.definition || selectedWord.hint}`,
                        ];
                        if (def?.example) {
                            parts.push(`Example: "${def.example}"`);
                        }
                        return parts.filter(Boolean).join('\n');
                    }
                }
                catch {
                    // Fall back to our hint
                }
                return `✨ **Word of the Day: ${selectedWord.word}**\nMeaning: ${selectedWord.hint}`;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const dictionaryToolDefinitions = [
    defineWordDef,
    getSynonymsDef,
    wordOfDayDef,
];
export { defineWordDef, getSynonymsDef, wordOfDayDef };
//# sourceMappingURL=dictionary-tools.js.map