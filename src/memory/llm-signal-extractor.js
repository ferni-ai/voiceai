/**
 * LLM-Powered Signal Extraction
 *
 * Uses LLM for nuanced extraction of human-centric memory signals.
 * Falls back to regex patterns when LLM is unavailable.
 *
 * Philosophy: Human communication is nuanced. "My birthday's coming up next month"
 * and "I turn 30 on the 15th" both express the same thing, but regex patterns
 * miss these variations. LLM understands meaning, not just patterns.
 *
 * @module memory/llm-signal-extractor
 */
import { createLogger } from '../utils/safe-logger.js';
import { extractHumanSignals, mergeSignalsIntoMemory } from './human-signal-extractor.js';
const log = createLogger({ module: 'LLMSignalExtractor' });
const DEFAULT_CONFIG = {
    useLLM: true,
    maxTranscriptLength: 6000,
};
// ============================================================================
// LLM EXTRACTION PROMPT
// ============================================================================
const EXTRACTION_PROMPT = `You are Ferni, analyzing a conversation with someone you care about. Extract details that would make a thoughtful friend remember them better.

CRITICAL RULES:
- Extract ONLY what was EXPLICITLY stated or VERY strongly implied
- DO NOT invent, assume, or extrapolate
- Empty arrays are preferred over guessed content
- Quality over quantity - one certain item beats five guesses

What to extract:

1. **Dates** - Specific dates they mentioned (birthdays, anniversaries, deadlines)
   - Only if they said a specific month/day, not vague references like "soon"
   
2. **Values** - Core beliefs that clearly drive their decisions
   - Must have clear evidence from what they said
   
3. **Dreams** - Goals or aspirations they expressed excitement about
   - Not passing mentions, but things they seem to genuinely want
   
4. **Fears** - Worries they explicitly shared
   - Note sensitivity: can they joke about it, or do they seem guarded?
   
5. **Growth** - Ways they've changed that they're aware of
   - "I used to... but now I..." patterns
   
6. **Challenges** - Active struggles they're working through
   - Not solved problems, but current work in progress
   
7. **Comfort Patterns** - What actually helps them feel better
   - Based on what worked, not assumptions
   
8. **Stress Triggers** - Specific things that cause them stress
   - Concrete triggers, not vague categories
   
9. **Inside Jokes** - Funny moments or references we share
   - Things that made them laugh or lightened the mood
   
10. **Avoidances** - Topics they changed subject on or deflected
    - NOT everything they didn't discuss, just active deflections

11. **People** - Important people they mentioned by name or relationship
    - Include context about their relationship

CONVERSATION:
{transcript}

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "importantDates": [
    {"type": "birthday|anniversary|loss_anniversary|milestone", "label": "short description", "month": 1-12, "day": 1-31, "year": null, "significance": "routine|meaningful|major|life_changing"}
  ],
  "values": [
    {"value": "value name", "evidence": ["exact quote or close paraphrase"]}
  ],
  "dreams": [
    {"description": "what they want", "category": "career|travel|learning|creative|family|health|other"}
  ],
  "fears": [
    {"fear": "specific fear", "sensitivity": "can_discuss|tread_carefully|avoid"}
  ],
  "growthMarkers": [
    {"description": "the change", "before": "how they were", "after": "how they are now"}
  ],
  "challenges": [
    {"challenge": "what they're working on", "status": "just_started|working_on_it|making_progress|stuck"}
  ],
  "comfortPatterns": [
    {"type": "validation|humor|presence|problem_solving|distraction", "effectiveFor": "specific situation"}
  ],
  "stressTriggers": [
    {"trigger": "specific trigger", "category": "work|financial|health|relationships|time|uncertainty|other"}
  ],
  "insideJokes": [
    {"reference": "the joke/reference", "origin": "how it came up"}
  ],
  "avoidances": [
    {"topic": "what they avoided", "approach": "only_if_they_do|never_bring_up"}
  ],
  "importantPeople": [
    {"name": "name or title", "relationship": "relationship type", "context": "what they said"}
  ]
}

Remember: Empty arrays are better than guesses. Only extract what you're confident about.`;
// ============================================================================
// LLM SIGNAL EXTRACTOR IMPLEMENTATION
// ============================================================================
export class LLMSignalExtractor {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Set the LLM call function
     */
    setLLMCall(llmCall) {
        this.config.llmCall = llmCall;
    }
    /**
     * Extract signals from conversation using LLM (with regex fallback)
     */
    async extractSignals(turns, context) {
        // If LLM not available or disabled, use regex
        if (!this.config.useLLM || !this.config.llmCall) {
            log.debug('LLM not available, using regex extraction');
            return this.regexFallback(turns, context);
        }
        try {
            return await this.llmExtraction(turns, context);
        }
        catch (error) {
            log.warn({ error: String(error) }, 'LLM extraction failed, falling back to regex');
            return this.regexFallback(turns, context);
        }
    }
    /**
     * Merge extracted signals with existing memory
     */
    mergeWithExisting(existing, extracted) {
        // Convert ExtractedSignals to the format expected by mergeSignalsIntoMemory
        const convertedSignals = this.convertToLegacyFormat(extracted);
        return mergeSignalsIntoMemory(existing, convertedSignals);
    }
    // ============================================================================
    // LLM EXTRACTION
    // ============================================================================
    async llmExtraction(turns, context) {
        // Build transcript
        let transcript = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n');
        // Truncate if too long
        if (transcript.length > this.config.maxTranscriptLength) {
            const halfLength = this.config.maxTranscriptLength / 2;
            transcript = `${transcript.slice(0, halfLength)}\n\n[... conversation continues ...]\n\n${transcript.slice(-halfLength)}`;
        }
        // Build prompt
        const prompt = EXTRACTION_PROMPT.replace('{transcript}', transcript);
        // Call LLM
        const response = await this.config.llmCall(prompt);
        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('LLM response did not contain valid JSON');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate and clean up
        const signals = {
            importantDates: this.validateDates(parsed.importantDates || []),
            values: parsed.values || [],
            dreams: parsed.dreams || [],
            fears: parsed.fears || [],
            growthMarkers: parsed.growthMarkers || [],
            challenges: parsed.challenges || [],
            comfortPatterns: parsed.comfortPatterns || [],
            stressTriggers: parsed.stressTriggers || [],
            insideJokes: parsed.insideJokes || [],
            avoidances: parsed.avoidances || [],
        };
        log.info({
            dates: signals.importantDates.length,
            values: signals.values.length,
            dreams: signals.dreams.length,
            fears: signals.fears.length,
            growth: signals.growthMarkers.length,
            challenges: signals.challenges.length,
        }, 'LLM signal extraction complete');
        return signals;
    }
    // ============================================================================
    // REGEX FALLBACK
    // ============================================================================
    regexFallback(turns, context) {
        // Use existing regex-based extractor
        const result = extractHumanSignals(turns, context);
        // Convert to ExtractedSignals format
        return {
            importantDates: result.importantDates.map((d) => ({
                type: d.type,
                label: d.label,
                month: d.month,
                day: d.day,
                year: d.year,
                significance: d.significance,
            })),
            values: result.values.map((v) => ({
                value: v.value,
                evidence: v.evidence,
            })),
            dreams: result.dreams.map((d) => ({
                description: d.description,
                category: d.category,
            })),
            fears: result.fears.map((f) => ({
                fear: f.fear,
                sensitivity: f.sensitivity,
            })),
            growthMarkers: result.growthMarkers.map((g) => ({
                description: g.description,
                before: g.before,
                after: g.after,
            })),
            challenges: result.challenges.map((c) => ({
                challenge: c.challenge,
                status: c.status,
            })),
            comfortPatterns: result.comfortPatterns.map((p) => ({
                type: p.type,
                effectiveFor: p.effectiveFor,
            })),
            stressTriggers: result.stressTriggers.map((t) => ({
                trigger: t.trigger,
                category: t.category,
            })),
            insideJokes: result.insideJokes.map((j) => ({
                reference: j.reference,
                origin: j.origin,
            })),
            avoidances: result.avoidances.map((a) => ({
                topic: a.topic,
                approach: a.approach,
            })),
        };
    }
    // ============================================================================
    // HELPERS
    // ============================================================================
    /**
     * Validate extracted dates
     */
    validateDates(dates) {
        return dates.filter((d) => {
            // Must have month and day
            if (!d.month || !d.day)
                return false;
            // Month must be valid
            if (d.month < 1 || d.month > 12)
                return false;
            // Day must be valid for month
            if (d.day < 1 || d.day > 31)
                return false;
            return true;
        });
    }
    /**
     * Convert to legacy format for mergeSignalsIntoMemory
     */
    convertToLegacyFormat(signals) {
        const now = new Date();
        return {
            importantDates: signals.importantDates.map((d) => ({
                id: `date_${d.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: d.type,
                label: d.label,
                month: d.month,
                day: d.day,
                year: d.year,
                significance: d.significance,
                wantsAcknowledgment: d.type !== 'loss_anniversary',
                sentiment: d.type === 'loss_anniversary'
                    ? 'sensitive'
                    : d.type === 'birthday'
                        ? 'celebratory'
                        : 'neutral',
                discoveredAt: now,
            })),
            values: signals.values.map((v) => ({
                id: `value_${v.value.replace(/\s+/g, '_')}_${Date.now()}`,
                value: v.value,
                evidence: v.evidence,
                strength: 'mentioned',
                discoveredAt: now,
            })),
            dreams: signals.dreams.map((d) => ({
                id: `dream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                description: d.description,
                category: d.category,
                sentiment: 'excited',
                status: 'someday',
                firstMentioned: now,
            })),
            fears: signals.fears.map((f) => ({
                id: `fear_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                fear: f.fear,
                frequency: 'occasional',
                discoveredAt: now,
                // Map 'avoid' to 'avoid_unless_they_raise' to match Fear type
                sensitivity: (f.sensitivity === 'avoid' ? 'avoid_unless_they_raise' : f.sensitivity),
            })),
            growthMarkers: signals.growthMarkers.map((g) => ({
                id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                description: g.description,
                before: g.before || 'previous state',
                after: g.after || 'current state',
                observedAt: now,
                acknowledged: false,
            })),
            challenges: signals.challenges.map((c) => {
                // Map LLM status values to ChallengeProgress status values
                const statusMap = {
                    just_started: 'working_on_it',
                    working_on_it: 'working_on_it',
                    making_progress: 'making_progress',
                    stuck: 'struggling',
                };
                return {
                    id: `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    challenge: c.challenge,
                    status: statusMap[c.status] || 'working_on_it',
                    milestones: [],
                    startedAt: now,
                    lastUpdate: now,
                };
            }),
            comfortPatterns: signals.comfortPatterns.map((p) => ({
                id: `comfort_${p.type}_${Date.now()}`,
                type: p.type,
                effectiveFor: p.effectiveFor,
                evidence: '',
                discoveredAt: now,
            })),
            stressTriggers: signals.stressTriggers.map((t) => ({
                id: `stress_${t.category}_${Date.now()}`,
                trigger: t.trigger,
                category: t.category,
                intensity: 'moderate',
                discoveredAt: now,
            })),
            insideJokes: signals.insideJokes.map((j) => ({
                id: `joke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                reference: j.reference,
                origin: j.origin,
                originatedAt: now,
                usageCount: 1,
                status: 'fresh',
            })),
            avoidances: signals.avoidances.map((a) => {
                // Map LLM approach values to RecurringAvoidance approach values
                const approachMap = {
                    never_bring_up: 'never_raise',
                    only_if_they_do: 'only_if_they_do',
                };
                return {
                    id: `avoid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    topic: a.topic,
                    avoidanceStyle: 'deflects',
                    observations: 1,
                    approach: approachMap[a.approach] || 'only_if_they_do',
                    firstNoticed: now,
                };
            }),
            runningThemes: [],
            emotionalTells: [],
        };
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultExtractor = null;
export function getLLMSignalExtractor() {
    if (!defaultExtractor) {
        defaultExtractor = new LLMSignalExtractor();
    }
    return defaultExtractor;
}
export function resetLLMSignalExtractor() {
    defaultExtractor = null;
}
/**
 * Configure the global LLM signal extractor with an LLM call function
 */
export function configureLLMSignalExtractor(llmCall) {
    getLLMSignalExtractor().setLLMCall(llmCall);
}
export default {
    LLMSignalExtractor,
    getLLMSignalExtractor,
    resetLLMSignalExtractor,
    configureLLMSignalExtractor,
};
//# sourceMappingURL=llm-signal-extractor.js.map