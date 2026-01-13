/**
 * Additional Knowledge Tools
 *
 * Supplementary tools for common knowledge requests:
 * - Spelling (with phonetic alphabet)
 *
 * NOTE: Many knowledge tools already exist in the codebase:
 * - Math: math-tools.ts (quickMathDef, calculateTipDef, splitBillDef)
 * - Conversions: conversion-tools.ts (convertUnitsDef, convertTemperatureDef)
 * - Definitions: dictionary-tools.ts (defineWordDef, getSynonymsDef)
 * - Translation: translation-tools.ts (translateDef, pronounceDef)
 *
 * This file adds only what's missing.
 *
 * @module simple-utilities/knowledge-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { trackCapabilityUsage } from './shortcuts-tools.js';
const log = getLogger();
// ============================================================================
// SPELLING (Not available elsewhere in codebase)
// ============================================================================
const spellDef = {
    id: 'spell',
    name: 'Spell',
    description: 'Spell out a word letter by letter',
    domain: 'simple-utilities',
    tags: ['spell', 'spelling', 'letters', 'essentials'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('spell') ||
                'Spell a word letter by letter. Say "how do you spell onomatopoeia" or "spell accommodate".',
            parameters: z.object({
                word: z.string().describe('The word to spell'),
            }),
            execute: async ({ word }) => {
                log.info({ userId: ctx.userId, word }, 'Spelling word');
                trackCapabilityUsage(ctx.userId || 'anon', 'spell');
                const letters = word.toUpperCase().split('');
                const phonetic = {
                    A: 'A as in Alpha',
                    B: 'B as in Bravo',
                    C: 'C as in Charlie',
                    D: 'D as in Delta',
                    E: 'E as in Echo',
                    F: 'F as in Foxtrot',
                    G: 'G as in Golf',
                    H: 'H as in Hotel',
                    I: 'I as in India',
                    J: 'J as in Juliet',
                    K: 'K as in Kilo',
                    L: 'L as in Lima',
                    M: 'M as in Mike',
                    N: 'N as in November',
                    O: 'O as in Oscar',
                    P: 'P as in Papa',
                    Q: 'Q as in Quebec',
                    R: 'R as in Romeo',
                    S: 'S as in Sierra',
                    T: 'T as in Tango',
                    U: 'U as in Uniform',
                    V: 'V as in Victor',
                    W: 'W as in Whiskey',
                    X: 'X as in X-ray',
                    Y: 'Y as in Yankee',
                    Z: 'Z as in Zulu',
                };
                // Simple spelling for short words
                if (word.length <= 6) {
                    return `${word.toUpperCase()} is spelled: ${letters.join(' - ')}`;
                }
                // Phonetic spelling for longer/trickier words
                const phoneticSpelling = letters.map((l) => phonetic[l] || l).join(', ');
                return `${word.toUpperCase()} is spelled:\n${letters.join(' - ')}\n\nPhonetically: ${phoneticSpelling}`;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
// Only export spellDef since other tools already exist in the codebase:
// - Math: math-tools.ts (quickMathDef)
// - Conversions: conversion-tools.ts (convertUnitsDef)
// - Definitions: dictionary-tools.ts (defineWordDef)
// - Translation: translation-tools.ts (translateDef)
export const knowledgeToolDefinitions = [spellDef];
export { spellDef };
//# sourceMappingURL=knowledge-tools.js.map