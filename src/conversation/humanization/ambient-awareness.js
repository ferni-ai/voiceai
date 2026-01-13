/**
 * Ambient Sound Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detect and appropriately respond to background sounds that provide
 * context about the user's situation. This enables contextually aware
 * conversations—knowing when to keep things brief because someone is
 * in public, or when to be more open because they're in a quiet space.
 *
 * **What we detect:**
 * - Location indicators (traffic, office, home)
 * - Privacy level (quiet, public, semi-private)
 * - Interruption potential (doorbell, phone, kids)
 * - Activity context (driving, working, relaxing)
 *
 * @module @ferni/humanization/ambient-awareness
 */
import { seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'AmbientAwareness' });
// ============================================================================
// AMBIENT ADAPTATIONS
// ============================================================================
const AMBIENT_ADAPTATIONS = {
    traffic: {
        implications: {
            shouldKeepBrief: true,
            shouldAvoidSensitiveTopics: false, // Often private in car
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: [
            "Sounds like you're driving. Want me to keep this brief?",
            'I hear road sounds—safe to talk?',
            "On the road? I'll keep it simple.",
        ],
        ssmlAcknowledgments: [
            "Sounds like you're driving.<break time='150ms'/> Want me to keep this brief?",
            'I hear road sounds—<break time="100ms"/>safe to talk?',
        ],
        volumeAdjust: 1.1,
        paceAdjust: 0.95,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'normal',
    },
    wind: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: true, // Outdoors, others might hear
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        },
        acknowledgments: ["Sounds like you're outside. Nice day?", 'I hear wind—out for a walk?'],
        ssmlAcknowledgments: ["Sounds like you're outside.<break time='150ms'/> Nice day?"],
        volumeAdjust: 1.15,
        paceAdjust: 0.9,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'ask_before_discussing',
    },
    crowd: {
        implications: {
            shouldKeepBrief: true,
            shouldAvoidSensitiveTopics: true,
            mayBeInterrupted: true,
            attentionMayBeDivided: true,
        },
        acknowledgments: [
            "Sounds like you're somewhere busy. Good time to talk?",
            'I hear people around—let me know if you need to go.',
            'Seems public there. Want to chat later instead?',
        ],
        ssmlAcknowledgments: [
            "Sounds like you're somewhere busy.<break time='150ms'/> Good time to talk?",
        ],
        volumeAdjust: 1.1,
        paceAdjust: 0.9,
        interruptionTolerance: 'high',
        sensitiveTopicBehavior: 'avoid',
    },
    keyboard: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: [], // Don't usually acknowledge
        ssmlAcknowledgments: [],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'normal',
    },
    tv_radio: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: [
            'I hear something in the background. Want me to wait while you turn it down?',
        ],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.05,
        paceAdjust: 0.95,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'normal',
    },
    baby_child: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: true, // Kids might hear
            mayBeInterrupted: true,
            attentionMayBeDivided: true,
        },
        acknowledgments: [
            "Sounds like you've got a little one there! No rush.",
            'I hear a kiddo—want me to pause if you need to step away?',
            'Little ears around? Just let me know if you need a moment.',
        ],
        ssmlAcknowledgments: [
            "Sounds like you've got a little one there!<break time='150ms'/> No rush.",
        ],
        volumeAdjust: 0.95,
        paceAdjust: 1.0,
        interruptionTolerance: 'high',
        sensitiveTopicBehavior: 'ask_before_discussing',
    },
    pet: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: true,
            attentionMayBeDivided: false,
        },
        acknowledgments: [
            'I hear a furry friend! Need to attend to them?',
            'Sounds like someone wants attention!',
        ],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'normal',
    },
    cooking: {
        implications: {
            shouldKeepBrief: true,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: true,
            attentionMayBeDivided: true,
        },
        acknowledgments: ["Sounds like you're cooking! Multitasking champion."],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.05,
        paceAdjust: 0.95,
        interruptionTolerance: 'high',
        sensitiveTopicBehavior: 'normal',
    },
    water: {
        implications: {
            shouldKeepBrief: true,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: [],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.05,
        paceAdjust: 1.0,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
    gym: {
        implications: {
            shouldKeepBrief: true,
            shouldAvoidSensitiveTopics: true,
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: ["Working out? Nice! I'll keep it short.", 'Gym time! Quick chat?'],
        ssmlAcknowledgments: ["Working out? Nice!<break time='100ms'/> I'll keep it short."],
        volumeAdjust: 1.15,
        paceAdjust: 0.9,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'ask_before_discussing',
    },
    office: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: true,
            mayBeInterrupted: true,
            attentionMayBeDivided: false,
        },
        acknowledgments: ["Sounds like you're at work. Is this a good time?"],
        ssmlAcknowledgments: [],
        volumeAdjust: 0.95,
        paceAdjust: 1.0,
        interruptionTolerance: 'medium',
        sensitiveTopicBehavior: 'ask_before_discussing',
    },
    quiet: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        },
        acknowledgments: [], // No need to acknowledge quiet
        ssmlAcknowledgments: [],
        volumeAdjust: 0.95,
        paceAdjust: 1.0,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
    echo: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        },
        acknowledgments: [],
        ssmlAcknowledgments: [],
        volumeAdjust: 0.9, // Less volume in echoey space
        paceAdjust: 0.95,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
    doorbell: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: true,
            attentionMayBeDivided: true,
        },
        acknowledgments: [
            "Sounds like someone's at the door—go ahead if you need to!",
            "I'll wait if you need to get that.",
        ],
        ssmlAcknowledgments: [
            "Sounds like someone's at the door—<break time='150ms'/>go ahead if you need to!",
        ],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'high',
        sensitiveTopicBehavior: 'normal',
    },
    phone_ring: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: true,
            attentionMayBeDivided: true,
        },
        acknowledgments: ['Phone ringing! Need to grab that?', 'Go ahead if you need to get that.'],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'high',
        sensitiveTopicBehavior: 'normal',
    },
    notification: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: true,
        },
        acknowledgments: [],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
    music: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        },
        acknowledgments: ['Nice tunes in the background!'],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.05,
        paceAdjust: 1.0,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
    nature: {
        implications: {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        },
        acknowledgments: ['Sounds peaceful where you are.'],
        ssmlAcknowledgments: [],
        volumeAdjust: 1.0,
        paceAdjust: 1.0,
        interruptionTolerance: 'low',
        sensitiveTopicBehavior: 'normal',
    },
};
// ============================================================================
// LOCATION INFERENCE
// ============================================================================
function inferLocation(sounds) {
    if (sounds.includes('traffic') || sounds.includes('wind')) {
        return sounds.includes('traffic') ? 'car' : 'outside';
    }
    if (sounds.includes('crowd') || sounds.includes('gym')) {
        return 'public';
    }
    if (sounds.includes('office') || sounds.includes('keyboard')) {
        return 'work';
    }
    if (sounds.includes('cooking') ||
        sounds.includes('baby_child') ||
        sounds.includes('pet') ||
        sounds.includes('tv_radio')) {
        return 'home';
    }
    if (sounds.includes('quiet')) {
        return 'home';
    }
    return 'unknown';
}
function inferPrivacyLevel(sounds, location) {
    if (sounds.includes('crowd') || location === 'public') {
        return 'public';
    }
    if (sounds.includes('office') || sounds.includes('baby_child') || sounds.includes('gym')) {
        return 'semi_private';
    }
    if (location === 'home' || location === 'car' || sounds.includes('quiet')) {
        return 'private';
    }
    return 'semi_private';
}
// ============================================================================
// AMBIENT AWARENESS ENGINE
// ============================================================================
export class AmbientAwarenessEngine {
    currentContext = null;
    contextHistory = [];
    lastAcknowledgmentTurn = -999;
    acknowledgedSounds = new Set();
    constructor() {
        logger.debug('AmbientAwarenessEngine initialized');
    }
    /**
     * Process ambient detection results
     */
    processDetection(detection, turnCount) {
        // Get primary and secondary sounds
        const sortedSounds = [...detection.sounds].sort((a, b) => b.confidence - a.confidence);
        const primarySound = sortedSounds.length > 0 && sortedSounds[0].confidence > 0.5 ? sortedSounds[0].sound : null;
        const secondarySounds = sortedSounds
            .slice(1)
            .filter((s) => s.confidence > 0.3)
            .map((s) => s.sound);
        // Get all detected sounds for inference
        const allSounds = [primarySound, ...secondarySounds].filter((s) => s !== null);
        // Infer location and privacy
        const likelyLocation = inferLocation(allSounds);
        const privacyLevel = inferPrivacyLevel(allSounds, likelyLocation);
        // Get adaptation for primary sound
        const adaptation = primarySound ? AMBIENT_ADAPTATIONS[primarySound] : null;
        // Combine implications from all sounds
        const implications = this.combineImplications(allSounds);
        // Decide if we should acknowledge
        const shouldAcknowledge = this.shouldAcknowledge(primarySound, turnCount);
        // Get acknowledgments if appropriate
        const acknowledgments = shouldAcknowledge && adaptation ? adaptation.acknowledgments : [];
        const context = {
            primarySound,
            secondarySounds,
            confidence: detection.overallConfidence,
            likelyLocation,
            privacyLevel,
            implications,
            acknowledgments,
            shouldAcknowledge,
            detectedAt: new Date(),
        };
        // Update state
        this.currentContext = context;
        this.contextHistory.push(context);
        if (this.contextHistory.length > 10) {
            this.contextHistory.shift();
        }
        if (primarySound && shouldAcknowledge) {
            this.lastAcknowledgmentTurn = turnCount;
            this.acknowledgedSounds.add(primarySound);
        }
        logger.debug({
            primarySound,
            location: likelyLocation,
            privacy: privacyLevel,
            shouldAcknowledge,
        }, '🔊 Ambient context updated');
        return context;
    }
    /**
     * Simulate detection from audio features
     * (In production, this would come from actual audio analysis)
     */
    simulateDetection(hints) {
        const sounds = [];
        if (hints.isQuiet) {
            sounds.push({ sound: 'quiet', confidence: 0.8 });
        }
        if (hints.hasTraffic) {
            sounds.push({ sound: 'traffic', confidence: 0.7 });
        }
        if (hints.hasVoices) {
            sounds.push({ sound: 'crowd', confidence: 0.6 });
        }
        if (hints.hasMusic) {
            sounds.push({ sound: 'music', confidence: 0.6 });
        }
        if (hints.energyLevel && hints.energyLevel > 0.7) {
            sounds.push({ sound: 'crowd', confidence: 0.5 });
        }
        return {
            sounds,
            overallConfidence: sounds.length > 0 ? sounds[0].confidence : 0.3,
            features: {
                energyLevel: hints.energyLevel || 0.5,
                frequencyProfile: 'normal',
                periodicityScore: 0.5,
                noisiness: hints.isQuiet ? 0.2 : 0.5,
            },
        };
    }
    /**
     * Get current ambient context
     */
    getCurrentContext() {
        return this.currentContext;
    }
    /**
     * Get adaptation for current context
     */
    getAdaptation() {
        if (!this.currentContext?.primarySound)
            return null;
        return AMBIENT_ADAPTATIONS[this.currentContext.primarySound];
    }
    /**
     * Check if topic is appropriate for current context
     */
    isTopicAppropriate(isSensitive) {
        if (!isSensitive)
            return true;
        if (!this.currentContext)
            return true;
        const adaptation = this.getAdaptation();
        if (!adaptation)
            return true;
        return adaptation.sensitiveTopicBehavior !== 'avoid';
    }
    /**
     * Get random acknowledgment for current context
     */
    getAcknowledgment() {
        if (!this.currentContext?.shouldAcknowledge)
            return null;
        const acks = this.currentContext.acknowledgments;
        if (acks.length === 0)
            return null;
        return seededPick(`${Date.now()}:642`, acks) ?? acks[0];
    }
    /**
     * Mark that we've acknowledged the current sound
     */
    markAcknowledged() {
        if (this.currentContext?.primarySound) {
            this.acknowledgedSounds.add(this.currentContext.primarySound);
        }
    }
    /**
     * Reset for new session
     */
    reset() {
        this.currentContext = null;
        this.contextHistory = [];
        this.lastAcknowledgmentTurn = -999;
        this.acknowledgedSounds.clear();
        logger.debug('AmbientAwarenessEngine reset');
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    combineImplications(sounds) {
        const implications = {
            shouldKeepBrief: false,
            shouldAvoidSensitiveTopics: false,
            mayBeInterrupted: false,
            attentionMayBeDivided: false,
        };
        for (const sound of sounds) {
            const adaptation = AMBIENT_ADAPTATIONS[sound];
            if (adaptation) {
                if (adaptation.implications.shouldKeepBrief)
                    implications.shouldKeepBrief = true;
                if (adaptation.implications.shouldAvoidSensitiveTopics)
                    implications.shouldAvoidSensitiveTopics = true;
                if (adaptation.implications.mayBeInterrupted)
                    implications.mayBeInterrupted = true;
                if (adaptation.implications.attentionMayBeDivided)
                    implications.attentionMayBeDivided = true;
            }
        }
        return implications;
    }
    shouldAcknowledge(sound, turnCount) {
        if (!sound)
            return false;
        // Don't acknowledge quiet
        if (sound === 'quiet')
            return false;
        // Don't acknowledge if already acknowledged this sound
        if (this.acknowledgedSounds.has(sound))
            return false;
        // Don't acknowledge too often
        if (turnCount - this.lastAcknowledgmentTurn < 10)
            return false;
        // Only acknowledge notable sounds
        const notableSounds = [
            'traffic',
            'crowd',
            'baby_child',
            'doorbell',
            'phone_ring',
            'gym',
            'wind',
        ];
        if (!notableSounds.includes(sound))
            return false;
        return true;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
const engines = new Map();
export function getAmbientAwarenessEngine(sessionId) {
    if (!engines.has(sessionId)) {
        engines.set(sessionId, new AmbientAwarenessEngine());
    }
    return engines.get(sessionId);
}
export function resetAmbientAwarenessEngine(sessionId) {
    const engine = engines.get(sessionId);
    if (engine) {
        engine.reset();
        engines.delete(sessionId);
    }
}
export function resetAllAmbientAwarenessEngines() {
    engines.clear();
}
export default AmbientAwarenessEngine;
//# sourceMappingURL=ambient-awareness.js.map