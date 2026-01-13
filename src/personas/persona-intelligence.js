/**
 * Persona Intelligence - Unified Integration Layer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module integrates all the advanced persona systems:
 * - Relationship Memory Engine (tracking relationship depth and history)
 * - Cognitive Differentiation (how each persona thinks differently)
 * - Team Chemistry (natural team dynamics and references)
 * - Predictive Intelligence (anticipating user needs)
 *
 * Together, these systems make Ferni "Better than Human" - a team that
 * truly knows you, thinks in distinct ways, and anticipates your needs.
 */
import { getLogger } from '../utils/safe-logger.js';
// Relationship Memory
import { getRelationshipEngine, } from './relationship-memory/index.js';
// Cognitive Differentiation
import { getCognitiveDifferentiation, getDisagreementPhrase, getInsightLeadIn, getPersonaQuestion, } from './cognitive-differentiation.js';
// Team Chemistry
import { checkTeamInsideJoke, generateHandoffNote, getTeamCompliment, getTeamReference, shouldIncludeTeamReference, } from './shared/team-chemistry.js';
// Cognitive Profiles (existing system)
import { getCognitiveEngine } from './cognitive-intelligence.js';
import { getCognitiveProfile } from './cognitive-profiles.js';
// Stage Behavior Guards - prevents stage-inappropriate behaviors
import { generateBehaviorConstraints, } from './shared/stage-behavior-guards.js';
const log = getLogger();
// ============================================================================
// PERSONA INTELLIGENCE ENGINE
// ============================================================================
/**
 * Unified intelligence engine for a persona-user pair.
 * Coordinates all four intelligence systems.
 */
export class PersonaIntelligenceEngine {
    personaId;
    userId;
    config;
    // Sub-engines
    relationshipEngine;
    cognitiveEngine = null;
    // Cached data
    cognitiveDiff;
    cognitiveProfile;
    // Session state
    sessionNumber = 0;
    lastTeamReferenceSession = 0;
    predictiveInsightsUsed = 0;
    constructor(personaId, userId, existingRelationshipMemory, config) {
        this.personaId = personaId;
        this.userId = userId;
        // Default config
        this.config = {
            enableRelationshipMemory: true,
            enableCognitiveDifferentiation: true,
            enableTeamChemistry: true,
            enablePredictiveIntelligence: true,
            teamReferenceFrequency: 0.15,
            maxPredictiveInsightsPerSession: 2,
            ...config,
        };
        // Initialize relationship engine
        this.relationshipEngine = getRelationshipEngine(userId, personaId, existingRelationshipMemory);
        // Initialize cognitive systems
        this.cognitiveDiff = getCognitiveDifferentiation(personaId);
        this.cognitiveProfile = getCognitiveProfile(personaId);
        if (this.cognitiveProfile) {
            this.cognitiveEngine = getCognitiveEngine(personaId, this.cognitiveProfile);
        }
        log.debug({ personaId, userId }, 'PersonaIntelligenceEngine initialized');
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    /**
     * Build TeamChemistryConfig from PersonaIntelligenceConfig
     * This provides proper typing instead of using `as any`
     */
    buildTeamChemistryConfig() {
        return {
            teamReferenceFrequency: this.config.teamReferenceFrequency,
            teamReferenceMinSessions: 3,
            insideJokeMinRelationship: 'friend',
            teamStoryMinRelationship: 'acquaintance',
            handoffContextAlways: true,
            complimentMaxPerSession: 1,
            complimentMinSessionsBetween: 5,
        };
    }
    // ============================================================================
    // SESSION MANAGEMENT
    // ============================================================================
    /**
     * Start a new session
     */
    startSession() {
        this.sessionNumber = this.relationshipEngine.getMemory().totalSessions + 1;
        this.predictiveInsightsUsed = 0;
        this.relationshipEngine.startSession();
        log.debug({ personaId: this.personaId, userId: this.userId, sessionNumber: this.sessionNumber }, 'Intelligence session started');
    }
    /**
     * End session with summary
     */
    endSession(sessionMood, sessionEnergy, topics) {
        this.relationshipEngine.endSession(sessionMood, sessionEnergy, topics);
        log.debug({ personaId: this.personaId, userId: this.userId, sessionMood, topics }, 'Intelligence session ended');
    }
    // ============================================================================
    // CONTEXT GENERATION
    // ============================================================================
    /**
     * Get complete intelligence context
     */
    getContext() {
        const relationshipContext = this.relationshipEngine.getRelationshipContext();
        return {
            personaId: this.personaId,
            userId: this.userId,
            relationship: relationshipContext,
            cognitive: {
                profile: this.cognitiveProfile,
                differentiation: this.cognitiveDiff,
            },
            predictive: {
                patternsDetected: [], // Populated from predictive-intelligence.json
                proactiveFollowUps: [],
                concerns: relationshipContext.trajectory === 'declining' ? ['User may be struggling'] : [],
            },
            team: {
                referencesAvailable: shouldIncludeTeamReference(this.sessionNumber, this.lastTeamReferenceSession, this.buildTeamChemistryConfig()),
            },
        };
    }
    // ============================================================================
    // PROMPT INJECTION
    // ============================================================================
    /**
     * Build unified prompt injection for LLM
     */
    buildPromptInjection(currentTopic, userMessage) {
        const sections = [];
        // === RELATIONSHIP SECTION ===
        let relationshipSection = '';
        if (this.config.enableRelationshipMemory) {
            const relInjection = this.relationshipEngine.buildPromptInjection();
            const { stage } = this.relationshipEngine.getRelationshipContext();
            relationshipSection = relInjection.relationshipPreamble;
            // Add callback suggestions with USE directive
            if (relInjection.callbackSuggestions.length > 0) {
                relationshipSection += '\n\n[CALLBACK OPPORTUNITIES - USE IF RELEVANT TO TOPIC]\n';
                for (const callback of relInjection.callbackSuggestions.slice(0, 2)) {
                    relationshipSection += `• ${callback}\n`;
                }
                relationshipSection +=
                    'DIRECTIVE: Use ONE of these callbacks when the topic naturally connects.';
            }
            // Add inside jokes with USE directive and stage gating
            if (relInjection.insideJokeOptions.length > 0) {
                // Only inject inside jokes for 'friend' stage and above
                if (['friend', 'trusted_advisor', 'inner_circle'].includes(stage)) {
                    const relevantJoke = this.findRelevantInsideJoke(relInjection.insideJokeOptions, currentTopic, userMessage);
                    if (relevantJoke) {
                        relationshipSection += '\n\n[USE THIS INSIDE JOKE - HIGH RELEVANCE]\n';
                        relationshipSection += `"${relevantJoke}"\n`;
                        relationshipSection +=
                            'DIRECTIVE: Work this reference into your response naturally. It builds connection.';
                    }
                    else {
                        relationshipSection += '\n\n[INSIDE JOKES AVAILABLE - USE IF CONTEXT FITS]\n';
                        relationshipSection += relInjection.insideJokeOptions.slice(0, 2).join('\n');
                        relationshipSection += '\nDIRECTIVE: Only use if the conversation topic connects.';
                    }
                }
            }
            // Add pending acknowledgments with stronger directive
            if (relInjection.pendingAcknowledgments.length > 0) {
                relationshipSection += '\n\n[MILESTONE TO ACKNOWLEDGE - DO THIS]\n';
                relationshipSection += `${relInjection.pendingAcknowledgments[0]}\n`;
                relationshipSection +=
                    'DIRECTIVE: Acknowledge this early in your response. They earned it.';
            }
            // Add stage guidance
            relationshipSection += `\n\n${relInjection.stageGuidance}`;
            sections.push(relationshipSection);
        }
        // === COGNITIVE SECTION - NOW WITH BEHAVIORAL CONSTRAINTS ===
        let cognitiveSection = '';
        if (this.config.enableCognitiveDifferentiation && this.cognitiveDiff) {
            const diff = this.cognitiveDiff;
            cognitiveSection = '[HOW YOU THINK AND RESPOND - FOLLOW THESE CONSTRAINTS]\n\n';
            // Questioning constraints
            cognitiveSection += '[QUESTIONING STYLE]\n';
            if (diff.questioning.whyVsHow > 0.6) {
                cognitiveSection += 'DO: Ask "why" questions that explore meaning and motivation.\n';
                cognitiveSection += 'DON\'T: Jump straight to "how" or tactical questions.\n';
            }
            else if (diff.questioning.whyVsHow < 0.4) {
                cognitiveSection += 'DO: Ask practical "how" and "what" questions.\n';
                cognitiveSection += "DON'T: Get too philosophical or abstract.\n";
            }
            if (diff.questioning.feelingVsData > 0.6) {
                cognitiveSection += 'DO: Ask about feelings, experiences, and emotions.\n';
                cognitiveSection += "DON'T: Lead with data or statistics.\n";
            }
            else if (diff.questioning.feelingVsData < 0.4) {
                cognitiveSection += 'DO: Reference data, research, and evidence.\n';
                cognitiveSection += "DON'T: Rely solely on emotional appeals.\n";
            }
            // Silence handling constraints
            cognitiveSection += '\n[WHEN USER GOES QUIET]\n';
            switch (diff.silence.primaryInterpretation) {
                case 'processing':
                    cognitiveSection += "DO: Give them space. They're thinking deeply.\n";
                    cognitiveSection += "DON'T: Fill the silence immediately or rush them.\n";
                    break;
                case 'emotional':
                    cognitiveSection += 'DO: Check in gently. "Want to share what\'s coming up?"\n';
                    cognitiveSection += "DON'T: Ignore the pause or change topics abruptly.\n";
                    break;
                case 'discomfort':
                    cognitiveSection += 'DO: Acknowledge this might be hard. Offer an out.\n';
                    cognitiveSection += "DON'T: Push deeper into uncomfortable territory.\n";
                    break;
                case 'waiting':
                    cognitiveSection += 'DO: Continue with your thought or move forward.\n';
                    cognitiveSection += "DON'T: Ask if they're still there.\n";
                    break;
            }
            // Disagreement constraints
            cognitiveSection += '\n[WHEN YOU DISAGREE WITH USER]\n';
            switch (diff.disagreement.primaryStyle) {
                case 'gentle_question':
                    cognitiveSection += 'DO: Ask a question that introduces your perspective.\n';
                    cognitiveSection += 'Example: "Have you considered...?" or "What if...?"\n';
                    cognitiveSection += "DON'T: State your disagreement directly.\n";
                    break;
                case 'direct_but_warm':
                    cognitiveSection += 'DO: Share your view warmly but directly.\n';
                    cognitiveSection += 'Example: "I actually see it differently..." with warmth.\n';
                    cognitiveSection += "DON'T: Beat around the bush or be wishy-washy.\n";
                    break;
                case 'evidence_based':
                    cognitiveSection += 'DO: Present evidence or data that challenges their view.\n';
                    cognitiveSection += 'Example: "The research actually suggests..."\n';
                    cognitiveSection += "DON'T: Rely on emotion or opinion alone.\n";
                    break;
                case 'reframe':
                    cognitiveSection += "DO: Offer a different perspective without saying they're wrong.\n";
                    cognitiveSection += 'Example: "Another way to look at this..."\n';
                    cognitiveSection += "DON'T: Directly contradict them.\n";
                    break;
            }
            if (diff.disagreement.strongOpinionTopics.length > 0) {
                cognitiveSection += `Topics where you have STRONG views: ${diff.disagreement.strongOpinionTopics.slice(0, 3).join(', ')}\n`;
            }
            // Insight framing constraints
            cognitiveSection += '\n[HOW TO SHARE INSIGHTS]\n';
            switch (diff.insight.primaryFraming) {
                case 'observation':
                    cognitiveSection += 'DO: Start with "I notice..." or "I\'m seeing..."\n';
                    cognitiveSection += "DON'T: State conclusions as facts.\n";
                    break;
                case 'reflection':
                    cognitiveSection += 'DO: Start with "What strikes me..." or "I\'m wondering..."\n';
                    cognitiveSection += "DON'T: Be too declarative.\n";
                    break;
                case 'hypothesis':
                    cognitiveSection += 'DO: Start with "It sounds like..." or "Could it be that...?"\n';
                    cognitiveSection += "DON'T: Tell them what they're feeling.\n";
                    break;
                case 'story':
                    cognitiveSection += 'DO: Share a relevant story or example first.\n';
                    cognitiveSection += "DON'T: Give direct advice without context.\n";
                    break;
                case 'data':
                    cognitiveSection += 'DO: Lead with facts, statistics, or research.\n';
                    cognitiveSection += "DON'T: Rely solely on anecdotes.\n";
                    break;
            }
            // Response pacing constraints
            cognitiveSection += '\n[RESPONSE PACING]\n';
            if (diff.pacing.emotionalMultiplier > 1.3) {
                cognitiveSection += 'DO: Slow down significantly for emotional topics. Add pauses.\n';
            }
            if (diff.pacing.uncertaintyPause && diff.pacing.uncertaintyPause > 1000) {
                cognitiveSection += 'DO: Add brief pauses before uncertain statements.\n';
            }
            cognitiveSection += `DON\'T: Rush through ${diff.pacing.breathingTopics?.join(', ') || 'heavy topics'}.\n`;
            sections.push(cognitiveSection);
        }
        // === PREDICTIVE SECTION ===
        let predictiveSection = '';
        if (this.config.enablePredictiveIntelligence) {
            const context = this.relationshipEngine.getRelationshipContext();
            if (context.trajectory === 'declining') {
                predictiveSection = '[PROACTIVE AWARENESS]\n';
                predictiveSection +=
                    'User has been struggling lately. Lead with presence, not solutions. Check in on their wellbeing.';
                sections.push(predictiveSection);
            }
            else if (context.trajectory === 'improving') {
                predictiveSection = '[PROACTIVE AWARENESS]\n';
                predictiveSection +=
                    'User has been doing better lately. Acknowledge their growth when appropriate.';
                sections.push(predictiveSection);
            }
            // Add time-based patterns
            const hour = new Date().getHours();
            const dayOfWeek = new Date().getDay();
            if (hour >= 22 || hour < 5) {
                predictiveSection += '\n[TIME CONTEXT] Late night - user may be processing something.';
                sections.push(predictiveSection);
            }
            else if (dayOfWeek === 0 && hour >= 17) {
                predictiveSection += '\n[TIME CONTEXT] Sunday evening - may have week-ahead anxiety.';
                sections.push(predictiveSection);
            }
        }
        // === TEAM SECTION ===
        let teamSection = '';
        if (this.config.enableTeamChemistry) {
            if (shouldIncludeTeamReference(this.sessionNumber, this.lastTeamReferenceSession, this.buildTeamChemistryConfig())) {
                teamSection = '[TEAM AWARENESS]\n';
                teamSection +=
                    'You can naturally reference teammates when relevant. E.g., "Peter would love this data" or "Maya would remind you to celebrate small wins."';
                sections.push(teamSection);
            }
        }
        // === STAGE BEHAVIOR GUARDS ===
        // Prevent behaviors that are too much too soon based on relationship stage
        let behaviorGuardsSection = '';
        if (this.config.enableRelationshipMemory) {
            const relContext = this.relationshipEngine.getRelationshipContext();
            const memory = this.relationshipEngine.getMemory();
            const behaviorContext = {
                stage: relContext.stage,
                sessionCount: memory.totalSessions ?? memory.conversationHistory?.length ?? 0,
                totalTurns: memory.totalTurns ?? 0,
                userHasSharedVulnerability: memory.sharedMoments.some((m) => m.type === 'first_vulnerability' || m.type === 'trust_demonstration'),
                userInDistress: false, // Would need to be passed in from emotion detection
            };
            behaviorGuardsSection = generateBehaviorConstraints(behaviorContext);
            sections.push(behaviorGuardsSection);
        }
        // Combine all sections
        const combined = sections.join('\n\n---\n\n');
        return {
            relationshipSection,
            cognitiveSection,
            predictiveSection,
            teamSection,
            combined,
        };
    }
    // ============================================================================
    // RELATIONSHIP EVENTS
    // ============================================================================
    /**
     * Record a shared moment
     */
    recordMoment(type, summary, options) {
        return this.relationshipEngine.recordMoment(type, summary, options);
    }
    /**
     * Record a callback attempt
     */
    recordCallbackAttempt(reference, type, userResponse, threadContinued, context) {
        this.relationshipEngine.recordCallbackAttempt(reference, type, userResponse, threadContinued, context);
    }
    /**
     * Record inside joke seed
     */
    recordInsideJokeSeed(phrase, context, engagement) {
        this.relationshipEngine.recordInsideJokeSeed(phrase, context, engagement);
    }
    // ============================================================================
    // COGNITIVE HELPERS
    // ============================================================================
    /**
     * Get a persona-appropriate question
     */
    getQuestion(type = 'starter') {
        return getPersonaQuestion(this.personaId, type);
    }
    /**
     * Get a disagreement phrase based on intensity
     */
    getDisagreement(intensity = 'mild') {
        return getDisagreementPhrase(this.personaId, intensity);
    }
    /**
     * Get an insight lead-in
     */
    getInsightIntro() {
        return getInsightLeadIn(this.personaId);
    }
    /**
     * Get silence response based on duration
     */
    getSilenceResponse(durationMs) {
        if (!this.cognitiveDiff)
            return undefined;
        const { silenceResponses } = this.cognitiveDiff.silence;
        if (durationMs < 3000) {
            return silenceResponses.short[Math.floor(Math.random() * silenceResponses.short.length)];
        }
        else if (durationMs < 7000) {
            return silenceResponses.medium[Math.floor(Math.random() * silenceResponses.medium.length)];
        }
        else {
            return silenceResponses.long[Math.floor(Math.random() * silenceResponses.long.length)];
        }
    }
    // ============================================================================
    // TEAM HELPERS
    // ============================================================================
    /**
     * Get a team reference for another persona
     */
    getTeamRef(aboutPersona, type = 'admiration') {
        const ref = getTeamReference(this.personaId, aboutPersona, type);
        if (ref) {
            this.lastTeamReferenceSession = this.sessionNumber;
        }
        return ref || undefined;
    }
    /**
     * Check for team inside joke
     */
    checkTeamJoke(trigger) {
        return checkTeamInsideJoke(trigger, this.personaId);
    }
    /**
     * Get team compliment for user
     */
    getCompliment(trait) {
        return getTeamCompliment(trait);
    }
    /**
     * Generate handoff note for another persona
     */
    generateHandoff(toPersona, topic, emotionalState) {
        const trustLevel = this.relationshipEngine.getStage();
        return generateHandoffNote(this.personaId, toPersona, topic, emotionalState, trustLevel);
    }
    // ============================================================================
    // STATE ACCESS
    // ============================================================================
    /**
     * Get current relationship stage
     */
    getRelationshipStage() {
        return this.relationshipEngine.getStage();
    }
    /**
     * Get trust score
     */
    getTrustScore() {
        return this.relationshipEngine.getTrustScore();
    }
    /**
     * Get full relationship memory
     */
    getRelationshipMemory() {
        return this.relationshipEngine.getMemory();
    }
    /**
     * Get cognitive differentiation profile
     */
    getCognitiveDifferentiation() {
        return this.cognitiveDiff;
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    /**
     * Find an inside joke that's relevant to the current topic/message
     */
    findRelevantInsideJoke(jokes, currentTopic, userMessage) {
        if (!currentTopic && !userMessage)
            return null;
        const searchText = `${currentTopic || ''} ${userMessage || ''}`.toLowerCase();
        for (const joke of jokes) {
            // Extract keywords from the joke to match against context
            const jokeKeywords = this.extractKeywords(joke);
            for (const keyword of jokeKeywords) {
                if (searchText.includes(keyword)) {
                    log.debug({ joke, keyword, topic: currentTopic }, 'Found contextually relevant inside joke');
                    return joke;
                }
            }
        }
        return null;
    }
    /**
     * Extract meaningful keywords from a joke for matching
     */
    extractKeywords(text) {
        // Common inside joke topics and their keywords
        const topicKeywords = {
            spreadsheet: ['excel', 'data', 'track', 'chart', 'numbers', 'organize'],
            confetti: ['celebrate', 'party', 'achievement', 'milestone', 'success'],
            'inbox zero': ['email', 'organize', 'productivity', 'clean'],
            'small wins': ['progress', 'step', 'habit', 'routine', 'improve'],
            'sit with it': ['process', 'think', 'feel', 'emotion', 'reflect', 'pause'],
        };
        const lowerText = text.toLowerCase();
        const keywords = [];
        for (const [trigger, related] of Object.entries(topicKeywords)) {
            if (lowerText.includes(trigger)) {
                keywords.push(trigger, ...related);
            }
        }
        return keywords;
    }
}
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
const engines = new Map();
/**
 * Get or create a persona intelligence engine
 */
export function getPersonaIntelligence(personaId, userId, existingMemory, config) {
    const key = `${personaId}:${userId}`;
    let engine = engines.get(key);
    if (!engine) {
        engine = new PersonaIntelligenceEngine(personaId, userId, existingMemory, config);
        engines.set(key, engine);
    }
    return engine;
}
/**
 * Clear an intelligence engine
 */
export function clearPersonaIntelligence(personaId, userId) {
    const key = `${personaId}:${userId}`;
    engines.delete(key);
}
/**
 * Reset all intelligence engines
 */
export function resetAllPersonaIntelligence() {
    engines.clear();
}
export default PersonaIntelligenceEngine;
//# sourceMappingURL=persona-intelligence.js.map