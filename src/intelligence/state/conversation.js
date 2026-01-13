/**
 * Conversation State Machine
 *
 * Tracks conversation phase and manages state transitions.
 * Enables appropriate tone and approach for each phase.
 */
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// PHASE GUIDANCE
// ============================================================================
const PHASE_GUIDANCE = {
    greeting: {
        phase: 'greeting',
        voiceMode: 'warm_welcome',
        pacing: 'slow',
        focus: 'Making them feel welcomed and valued as a person',
        shouldAsk: ['What brings you here?', "What's on your mind?"],
        shouldAvoid: ['Jumping into financial advice', 'Repeatedly asking how they are'],
        transitionCue: 'Once they share what they want to discuss',
    },
    warming_up: {
        phase: 'warming_up',
        voiceMode: 'curious_friend',
        pacing: 'natural',
        focus: 'Building personal connection before business',
        shouldAsk: ['Tell me about yourself', "What's been on your mind?", "How's your family?"],
        shouldAvoid: ['Rushing to finance', 'Being transactional'],
        transitionCue: 'When they naturally bring up finances or seem ready',
    },
    exploring: {
        phase: 'exploring',
        voiceMode: 'curious_friend',
        pacing: 'natural',
        focus: 'Understanding their complete picture - life and finances',
        shouldAsk: ['What brought this up?', 'Help me understand...', 'What matters most to you?'],
        shouldAvoid: ['Giving advice before understanding', 'Making assumptions'],
        transitionCue: 'When you truly understand their situation and feelings',
    },
    advising: {
        phase: 'advising',
        voiceMode: 'wise_counselor',
        pacing: 'moderate',
        focus: 'Sharing wisdom tailored to their specific situation',
        shouldAsk: ['Does that make sense?', 'What do you think about that?'],
        shouldAvoid: ['Overwhelming with information', 'Being preachy'],
        transitionCue: 'When they seem satisfied or have new questions',
    },
    supporting: {
        phase: 'supporting',
        voiceMode: 'tender_elder',
        pacing: 'slow',
        focus: 'Being present and validating their feelings',
        shouldAsk: ['What do you need right now?', 'Tell me more about that'],
        shouldAvoid: ['Jumping to solutions', 'Minimizing feelings', 'Rushing'],
        transitionCue: 'When they feel heard and their distress decreases',
    },
    wrapping_up: {
        phase: 'wrapping_up',
        voiceMode: 'warm_welcome',
        pacing: 'slow',
        focus: 'Leaving them feeling supported and empowered',
        shouldAsk: ['Anything else on your mind?', 'What else is going on?'],
        shouldAvoid: ['Abrupt endings', 'Introducing new topics'],
        transitionCue: 'Natural conversation end',
    },
    follow_up: {
        phase: 'follow_up',
        voiceMode: 'warm_welcome',
        pacing: 'natural',
        focus: 'Acknowledging the relationship and checking in',
        shouldAsk: ['How did things go since we talked?', 'Did you think about what we discussed?'],
        shouldAvoid: ['Acting like a new conversation'],
        transitionCue: 'Once reconnected, transition to exploring or advising',
    },
};
// ============================================================================
// STATE MACHINE
// ============================================================================
/**
 * Conversation State Machine
 */
export class ConversationStateMachine {
    state;
    constructor(isReturningUser = false) {
        this.state = this.createInitialState(isReturningUser);
    }
    /**
     * Create initial state
     */
    createInitialState(isReturningUser) {
        return {
            phase: isReturningUser ? 'follow_up' : 'greeting',
            turnCount: 0,
            startedAt: new Date(),
            lastActivityAt: new Date(),
            greetingComplete: false,
            nameObtained: false,
            emotionalStateKnown: false,
            primaryConcernIdentified: false,
            currentMood: 'unknown',
            distressLevel: 0,
            emotionalTrend: 'unknown',
            topicsDiscussed: [],
            currentTopic: null,
            topicsToCircleBack: [],
            userWantsToEnd: false,
            userNeedsSupport: false,
            userIsReturning: isReturningUser,
        };
    }
    /**
     * Process a turn and update state
     */
    processTurn(input) {
        this.state.turnCount += 1;
        this.state.lastActivityAt = new Date();
        // Update from emotion
        if (input.emotion) {
            this.state.currentMood = input.emotion.primary;
            this.state.distressLevel = input.emotion.distressLevel;
            this.state.emotionalStateKnown = true;
            // Check if needs support
            if (input.emotion.distressLevel > 0.6) {
                this.state.userNeedsSupport = true;
            }
        }
        // Update from intent
        if (input.intent) {
            // Check for end signals
            if (input.intent.primary === 'ending_conversation') {
                this.state.userWantsToEnd = true;
            }
            // Check for topic changes
            if (input.intent.primary === 'changing_topic' || input.intent.primary === 'going_back') {
                // Keep old topic for circling back
                if (this.state.currentTopic) {
                    this.state.topicsToCircleBack.push(this.state.currentTopic);
                }
            }
        }
        // Update topics
        if (input.topics && input.topics.length > 0) {
            for (const topic of input.topics) {
                if (!this.state.topicsDiscussed.includes(topic)) {
                    this.state.topicsDiscussed.push(topic);
                }
            }
            this.state.currentTopic = input.topics[0];
            // Check if financial topics discussed
            const financialTopics = ['retirement', 'investments', 'savings', 'debt', 'goals', 'fees'];
            if (input.topics.some((t) => financialTopics.includes(t))) {
                this.state.primaryConcernIdentified = true;
            }
        }
        // Update name
        if (input.userName) {
            this.state.nameObtained = true;
        }
        // Determine phase transition
        this.updatePhase();
        getLogger().debug(`State updated: phase=${this.state.phase}, turn=${this.state.turnCount}`);
        return this.state;
    }
    /**
     * Update conversation phase based on state
     */
    updatePhase() {
        const s = this.state;
        // Priority: Support mode if distressed
        if (s.userNeedsSupport && s.distressLevel > 0.6) {
            s.phase = 'supporting';
            return;
        }
        // Wrap up if user wants to end
        if (s.userWantsToEnd) {
            s.phase = 'wrapping_up';
            return;
        }
        // Follow-up for returning users at start
        if (s.userIsReturning && s.turnCount <= 2) {
            s.phase = 'follow_up';
            return;
        }
        // Phase progression based on turn count and signals
        if (s.turnCount <= 2 && !s.greetingComplete) {
            s.phase = 'greeting';
        }
        else if (s.turnCount <= 5 && !s.primaryConcernIdentified) {
            s.phase = 'warming_up';
            s.greetingComplete = true;
        }
        else if (!s.primaryConcernIdentified) {
            s.phase = 'exploring';
        }
        else {
            s.phase = 'advising';
        }
        // Can drop back to exploring if new topics emerge
        if (s.phase === 'advising' && s.topicsToCircleBack.length > 0) {
            // Consider transitioning back to exploring
        }
    }
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get current phase
     */
    getPhase() {
        return this.state.phase;
    }
    /**
     * Get phase guidance
     */
    getGuidance() {
        return PHASE_GUIDANCE[this.state.phase];
    }
    /**
     * Mark greeting as complete
     */
    completeGreeting() {
        this.state.greetingComplete = true;
        this.updatePhase();
    }
    /**
     * Mark support as no longer needed
     */
    resolveSupport() {
        this.state.userNeedsSupport = false;
        this.state.distressLevel = Math.min(this.state.distressLevel, 0.3);
        this.updatePhase();
    }
    /**
     * Force transition to a specific phase
     */
    transitionTo(phase) {
        this.state.phase = phase;
        getLogger().info(`Forced transition to phase: ${phase}`);
    }
    /**
     * Get context string for prompts
     */
    getContextString() {
        const guidance = this.getGuidance();
        return `
[CONVERSATION STATE]
Phase: ${this.state.phase} (Turn ${this.state.turnCount})
Voice Mode: ${guidance.voiceMode}
Focus: ${guidance.focus}
${this.state.nameObtained ? 'Name: Known' : 'Name: Unknown'}
${this.state.emotionalStateKnown ? `Mood: ${this.state.currentMood}` : 'Mood: Unknown'}
${this.state.distressLevel > 0.5 ? `⚠️ User may need emotional support (distress: ${this.state.distressLevel.toFixed(2)})` : ''}
${this.state.topicsDiscussed.length > 0 ? `Topics: ${this.state.topicsDiscussed.join(', ')}` : ''}
${this.state.topicsToCircleBack.length > 0 ? `Consider circling back to: ${this.state.topicsToCircleBack.join(', ')}` : ''}

[GUIDANCE]
Should ask: ${guidance.shouldAsk.join(' | ')}
Should avoid: ${guidance.shouldAvoid.join(' | ')}
Transition when: ${guidance.transitionCue}
`.trim();
    }
    /**
     * Get duration in minutes
     */
    getDurationMinutes() {
        return Math.floor((Date.now() - this.state.startedAt.getTime()) / 60000);
    }
    /**
     * Reset state (for testing)
     */
    reset(isReturningUser = false) {
        this.state = this.createInitialState(isReturningUser);
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultStateMachine = null;
/**
 * Get the default state machine
 */
export function getStateMachine(isReturningUser) {
    if (!defaultStateMachine) {
        defaultStateMachine = new ConversationStateMachine(isReturningUser);
    }
    return defaultStateMachine;
}
/**
 * Reset the default state machine
 */
export function resetStateMachine(isReturningUser = false) {
    defaultStateMachine = new ConversationStateMachine(isReturningUser);
    return defaultStateMachine;
}
export default ConversationStateMachine;
//# sourceMappingURL=conversation.js.map