/**
 * Conversational Memory
 *
 * Tracks and references things said during the conversation:
 * - Callback to earlier statements ("Earlier you mentioned...")
 * - Thread tracking (topics to return to)
 * - Commitments & promises ("You said you'd...")
 * - Notable quotes from the user
 * - Key facts shared during conversation
 *
 * This makes the AI feel like it's truly listening and remembering,
 * not just responding to the immediate message.
 *
 * @module conversation/conversational-memory
 */
import { getLogger } from '../../utils/safe-logger.js';
import { seededChance, seededPick } from '../utils/rng.js';
import { CallbackGenerator } from './callbacks.js';
import { ContradictionDetector } from './contradiction-detection.js';
import { QuotedMemoryEngine } from './quoted-memory.js';
import { StatementClassifier } from './statement-classifier.js';
import { ThreadTracker } from './thread-tracking.js';
import { TopicDetector } from './topic-detection.js';
const log = getLogger();
// ============================================================================
// CONVERSATIONAL MEMORY ENGINE
// ============================================================================
const MAX_STATEMENTS = 20;
const MAX_NOTABLE_QUOTES = 5;
export class ConversationalMemoryEngine {
    // Sub-engines
    threadTracker = new ThreadTracker();
    quotedMemory = new QuotedMemoryEngine();
    callbacks = new CallbackGenerator();
    contradictions = new ContradictionDetector();
    topicDetector = new TopicDetector();
    classifier = new StatementClassifier();
    // Local state
    userStatements = [];
    commitments = [];
    currentTurn = 0;
    notableQuotes = [];
    constructor() {
        log.debug('ConversationalMemoryEngine initialized');
    }
    // ============================================================================
    // CALLBACK FREQUENCY TUNING
    // ============================================================================
    /**
     * Record user reaction to a memory callback
     * Used to tune callback frequency for this user
     */
    recordCallbackReaction(wasPositive) {
        this.callbacks.recordReaction(wasPositive);
    }
    /**
     * Get current callback multiplier for external use
     */
    getCallbackMultiplier() {
        return this.callbacks.getMultiplier();
    }
    /**
     * Export tuning preferences for persistence
     */
    exportTuningPreferences() {
        return this.callbacks.exportPreferences();
    }
    /**
     * Import tuning preferences from a previous session
     */
    importTuningPreferences(prefs) {
        this.callbacks.importPreferences(prefs);
    }
    /**
     * Check if we just gave a callback (for reaction tracking)
     */
    wasLastTurnCallback() {
        return this.callbacks.wasLastTurnCallback(this.currentTurn);
    }
    // ============================================================================
    // MESSAGE RECORDING
    // ============================================================================
    /**
     * Record a user message and extract memorable elements
     */
    recordUserMessage(text, context = {}) {
        this.currentTurn++;
        // Classify and assess
        const type = this.classifier.classifyStatement(text, context);
        const importance = this.classifier.assessImportance(text, context);
        // Store if important enough
        if (importance > 0.3 || type !== 'fact') {
            this.userStatements.push({
                text: this.classifier.extractKey(text),
                turn: this.currentTurn,
                timestamp: Date.now(),
                type,
                topic: context.topic,
                emotion: context.emotion,
                importance,
            });
            // Trim old statements (keep last N)
            if (this.userStatements.length > MAX_STATEMENTS) {
                this.userStatements = this.userStatements
                    .sort((a, b) => b.importance - a.importance)
                    .slice(0, MAX_STATEMENTS);
            }
        }
        // Detect commitments
        const detectedCommitments = this.classifier.detectCommitments(text, 'user', this.currentTurn);
        for (const commitment of detectedCommitments) {
            if (!this.commitments.some((c) => c.what === commitment.what)) {
                this.commitments.push(commitment);
            }
        }
        // Check for notable quotes
        if (this.classifier.isNotableQuote(text)) {
            this.notableQuotes.push(this.classifier.extractKey(text));
            if (this.notableQuotes.length > MAX_NOTABLE_QUOTES) {
                this.notableQuotes.shift();
            }
        }
        // Extract hyper-specific quoted memories
        this.quotedMemory.extractQuotedMemories(text, this.currentTurn, context);
        // Update threads
        if (context.topic) {
            this.threadTracker.update(context.topic, this.currentTurn, context.isQuestion || false);
        }
    }
    /**
     * Record agent message (for commitment tracking)
     */
    recordAgentMessage(text) {
        const detectedCommitments = this.classifier.detectCommitments(text, 'agent', this.currentTurn);
        for (const commitment of detectedCommitments) {
            if (!this.commitments.some((c) => c.what === commitment.what)) {
                this.commitments.push(commitment);
            }
        }
    }
    // ============================================================================
    // MEMORY CALLBACKS
    // ============================================================================
    /**
     * Get a callback to something said earlier
     * Returns null if nothing appropriate to reference
     */
    getMemoryCallback(currentTopic, currentTurn) {
        if (!this.callbacks.shouldCallback(currentTurn))
            return null;
        const m = this.callbacks.getMultiplier();
        const seed = `callback:${currentTopic}:${currentTurn}`;
        // Strategy 1: Return to an unresolved thread
        const unresolvedThread = this.threadTracker.findForCallback(currentTopic, currentTurn);
        if (unresolvedThread && seededChance(`${seed}:thread`, 0.3 * m)) {
            this.threadTracker.markMentioned(unresolvedThread.topic, currentTurn);
            this.callbacks.recordCallback(currentTurn);
            return this.callbacks.createThreadCallback(unresolvedThread, `${seed}:thread`);
        }
        // Strategy 2: Reference a related statement
        const relatedStatement = this.userStatements.find((s) => s.topic === currentTopic && currentTurn - s.turn > 2 && s.importance > 0.5);
        if (relatedStatement && seededChance(`${seed}:statement`, 0.25 * m)) {
            this.callbacks.recordCallback(currentTurn);
            return this.callbacks.createStatementCallback(relatedStatement, `${seed}:statement`);
        }
        // Strategy 3: Follow up on commitments
        const unfulfilledCommitment = this.commitments.find((c) => !c.fulfilled && currentTurn - c.turn > 4);
        if (unfulfilledCommitment && seededChance(`${seed}:commitment`, 0.2 * m)) {
            this.callbacks.recordCallback(currentTurn);
            return this.callbacks.createCommitmentCallback(unfulfilledCommitment, `${seed}:commitment`);
        }
        // Strategy 4: Echo a notable quote
        if (this.notableQuotes.length > 0 && seededChance(`${seed}:quote`, 0.1 * m)) {
            const quote = seededPick(`${seed}:quotePick`, this.notableQuotes) ?? this.notableQuotes[0];
            this.callbacks.recordCallback(currentTurn);
            return this.callbacks.createQuoteCallback(quote);
        }
        // Strategy 5: Hyper-specific quoted memory callback
        if (this.quotedMemory.hasMemories() && seededChance(`${seed}:quotedMemory`, 0.25 * m)) {
            const callback = this.quotedMemory.getCallback(currentTurn);
            if (callback) {
                this.callbacks.recordCallback(currentTurn);
                return callback;
            }
        }
        return null;
    }
    // ============================================================================
    // THREAD MANAGEMENT
    // ============================================================================
    /**
     * Get unresolved threads that could be revisited
     */
    getUnresolvedThreads() {
        return this.threadTracker.getUnresolved();
    }
    /**
     * Get unfulfilled commitments
     */
    getUnfulfilledCommitments() {
        return this.commitments.filter((c) => !c.fulfilled);
    }
    /**
     * Generate a "circling back" phrase for a topic
     */
    generateCircleBack(topic) {
        return this.topicDetector.generateCircleBack(topic);
    }
    /**
     * Mark a thread as resolved
     */
    resolveThread(topic) {
        this.threadTracker.resolve(topic);
    }
    /**
     * Mark a commitment as fulfilled
     */
    fulfillCommitment(what) {
        const commitment = this.commitments.find((c) => c.what.toLowerCase().includes(what.toLowerCase()) ||
            what.toLowerCase().includes(c.what.toLowerCase()));
        if (commitment) {
            commitment.fulfilled = true;
            commitment.followedUpAt = this.currentTurn;
        }
    }
    // ============================================================================
    // CONTRADICTION DETECTION
    // ============================================================================
    /**
     * Check if user contradicted something they said earlier (this session)
     */
    checkForContradiction(newStatement, topic) {
        return this.contradictions.checkForContradiction(newStatement, topic, this.userStatements);
    }
    /**
     * Enhanced contradiction detection using profile memory
     */
    checkForContradictionWithProfile(newStatement, topic, profile) {
        const sessionContradiction = this.checkForContradiction(newStatement, topic);
        if (sessionContradiction) {
            return { contradiction: sessionContradiction };
        }
        const profileContradiction = this.contradictions.checkForProfileContradiction(newStatement, profile);
        return {
            contradiction: null,
            profileContradiction: profileContradiction || undefined,
        };
    }
    /**
     * Generate a gentle contradiction acknowledgment
     */
    generateContradictionAcknowledgment(original) {
        return this.contradictions.generateAcknowledgment(original);
    }
    /**
     * Generate a gentle clarification for a profile contradiction
     */
    generateContradictionClarification(profileContradiction) {
        return this.contradictions.generateProfileClarification(profileContradiction);
    }
    // ============================================================================
    // TOPIC DETECTION
    // ============================================================================
    /**
     * Detect topic from text
     */
    detectTopic(text) {
        return this.topicDetector.detectTopic(text);
    }
    /**
     * Analyze message for topic change
     */
    analyzeTopicChange(userMessage) {
        return this.topicDetector.analyzeTopicChange(userMessage);
    }
    /**
     * Get natural transition phrase for topic change
     */
    getTopicTransitionPhrase(fromTopic, toTopic) {
        return this.topicDetector.getTopicTransitionPhrase(fromTopic, toTopic);
    }
    /**
     * Get current detected topic
     */
    getCurrentTopic() {
        return this.topicDetector.getCurrentTopic();
    }
    /**
     * Get topic history
     */
    getTopicHistory() {
        return this.topicDetector.getTopicHistory();
    }
    /**
     * Check if returning to a previous topic
     */
    isReturningToTopic(topic) {
        return this.topicDetector.isReturningToTopic(topic);
    }
    // ============================================================================
    // QUOTED MEMORY
    // ============================================================================
    /**
     * Get quoted memories for persistence / cross-session callbacks
     */
    getQuotedMemories() {
        return this.quotedMemory.getAll();
    }
    /**
     * Import quoted memories from a previous session
     */
    importQuotedMemories(memories) {
        this.quotedMemory.import(memories);
    }
    /**
     * Reset quoted memories (explicit)
     */
    resetQuotedMemories() {
        this.quotedMemory.reset();
    }
    // ============================================================================
    // SUMMARY & RESET
    // ============================================================================
    /**
     * Get conversation summary for handoff/persistence
     */
    getConversationSummary() {
        return {
            keyTopics: this.threadTracker.getTopics(),
            userStatements: this.userStatements.filter((s) => s.importance > 0.5),
            unresolvedThreads: this.threadTracker.getUnresolved().map((t) => t.topic),
            commitments: this.commitments.filter((c) => !c.fulfilled),
        };
    }
    /**
     * Reset for new conversation
     */
    reset() {
        this.threadTracker.reset();
        this.topicDetector.reset();
        this.callbacks.reset();
        this.userStatements = [];
        this.commitments = [];
        this.currentTurn = 0;
        this.notableQuotes = [];
        // Note: quotedMemory is NOT reset here - persists for cross-session magic
        log.debug('ConversationalMemoryEngine reset');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let instance = null;
export function getConversationalMemory() {
    if (!instance) {
        instance = new ConversationalMemoryEngine();
    }
    return instance;
}
export function resetConversationalMemory() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
export default ConversationalMemoryEngine;
//# sourceMappingURL=index.js.map