/**
 * Unified Analyzer
 *
 * THE single entry point for analyzing user input.
 * Combines text emotion, voice emotion, intent, topics, and context
 * into one coherent analysis that flows through the entire system.
 *
 * Key principles:
 * 1. Single source of truth - no component re-analyzes
 * 2. Voice/text mismatch is a first-class signal
 * 3. High-emotion mode simplifies everything for focused support
 *
 * @module intelligence/unified/unified-analyzer
 */
import { createLogger } from '../../utils/safe-logger.js';
// Core analyzers (imported dynamically to avoid circular deps)
const log = createLogger({ module: 'UnifiedAnalyzer' });
// ============================================================================
// UNIFIED ANALYZER CLASS
// ============================================================================
export class UnifiedAnalyzer {
    static instance = null;
    static getInstance() {
        if (!UnifiedAnalyzer.instance) {
            UnifiedAnalyzer.instance = new UnifiedAnalyzer();
        }
        return UnifiedAnalyzer.instance;
    }
    /**
     * The main analysis function - call this once per turn
     */
    async analyze(input) {
        const startTime = Date.now();
        // Import analyzers dynamically to avoid circular dependencies
        const { getEmotionDetector } = await import('../emotion-detector.js');
        const { getIntentClassifier } = await import('../intent-classifier.js');
        const { getTopicTracker } = await import('../topic-tracker.js');
        const { getStateMachine } = await import('../conversation-state.js');
        const { DISTRESS } = await import('../distress-levels.js');
        // Run base analyses
        const emotionDetector = getEmotionDetector();
        const intentClassifier = getIntentClassifier();
        const topicTracker = getTopicTracker();
        const stateMachine = getStateMachine(input.isReturningUser);
        // Get text emotion (with optional LLM enhancement)
        let textEmotion = emotionDetector.detect(input.message);
        let llmEnhanced = false;
        if (input.llmCaller && textEmotion.confidence < 0.5) {
            try {
                textEmotion = await emotionDetector.detectWithLLM(input.message, input.llmCaller);
                llmEnhanced = textEmotion.markers.includes('[llm-enhanced]');
            }
            catch {
                // Use keyword result if LLM fails
            }
        }
        // Get intent and topics
        const rawIntent = intentClassifier.classify(input.message);
        const rawTopics = topicTracker.extract(input.message);
        // Update conversation state
        const state = stateMachine.processTurn({
            userMessage: input.message,
            emotion: textEmotion,
            intent: rawIntent,
            topics: rawTopics.detected,
            userName: input.userProfile?.name,
        });
        // Build unified emotion signal
        const emotion = this.buildEmotionSignal(textEmotion, input.voiceEmotion, DISTRESS);
        // Build intent signal
        const intent = this.buildIntentSignal(rawIntent);
        // Build context signal
        const context = this.buildContextSignal(rawTopics, state, input.userProfile);
        // THE SUPERHUMAN SIGNAL: Detect voice/text mismatch
        const mismatch = this.detectMismatch(textEmotion, input.voiceEmotion, input.message);
        // Detect behavioral signals
        const signals = this.detectBehavioralSignals(input.message, emotion, intent);
        // Build response guidance
        const guidance = this.buildResponseGuidance(emotion, intent, context, mismatch, signals, DISTRESS);
        // Build context for prompt
        const contextForPrompt = this.buildContextForPrompt(emotion, intent, context, mismatch, guidance);
        const processingTimeMs = Date.now() - startTime;
        log.debug({
            emotion: emotion.primary,
            intent: intent.primary,
            mismatch: mismatch.detected,
            phase: context.phase,
            useHighEmotionMode: guidance.useHighEmotionMode,
            processingTimeMs,
        }, '✨ Unified analysis complete');
        return {
            emotion,
            intent,
            context,
            mismatch,
            signals,
            guidance,
            contextForPrompt,
            processingTimeMs,
            timestamp: new Date(),
        };
    }
    buildEmotionSignal(textEmotion, voiceEmotion, DISTRESS) {
        // If no voice emotion or low confidence, use text only
        if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
            return {
                primary: textEmotion.primary,
                secondary: textEmotion.secondary,
                confidence: textEmotion.confidence,
                valence: textEmotion.valence === 'positive' ? 0.5 : textEmotion.valence === 'negative' ? -0.5 : 0,
                intensity: textEmotion.intensity,
                distressLevel: textEmotion.distressLevel,
                suggestedTone: this.mapTone(textEmotion.suggestedTone),
                source: 'text',
                textAnalysis: {
                    primary: textEmotion.primary,
                    confidence: textEmotion.confidence,
                    markers: textEmotion.markers,
                },
            };
        }
        // Combine text and voice (voice weighted higher - prosody is often more honest)
        const textWeight = 0.4;
        const voiceWeight = 0.6;
        const combinedValence = (textEmotion.valence === 'positive' ? 0.5 : textEmotion.valence === 'negative' ? -0.5 : 0) *
            textWeight +
            voiceEmotion.valence * voiceWeight;
        const combinedIntensity = textEmotion.intensity * textWeight + voiceEmotion.arousal * voiceWeight;
        const combinedDistress = Math.max(textEmotion.distressLevel, voiceEmotion.stressLevel || 0);
        const combinedConfidence = textEmotion.confidence * textWeight + voiceEmotion.confidence * voiceWeight;
        // Determine primary emotion - use voice if higher confidence
        let primary = textEmotion.primary;
        if (voiceEmotion.confidence > textEmotion.confidence) {
            const voiceToTextMap = {
                happy: 'joy',
                sad: 'sadness',
                angry: 'anger',
                fearful: 'fear',
                anxious: 'anxiety',
                excited: 'anticipation',
                stressed: 'anxiety',
                neutral: 'neutral',
            };
            primary = voiceToTextMap[voiceEmotion.primary] || voiceEmotion.primary;
        }
        // Determine tone based on combined analysis
        let suggestedTone = 'warm';
        if (combinedDistress >= DISTRESS.HIGH) {
            suggestedTone = 'gentle';
        }
        else if (combinedDistress >= DISTRESS.MODERATE) {
            suggestedTone = 'reassuring';
        }
        else if (combinedValence > 0.3) {
            suggestedTone = 'enthusiastic';
        }
        return {
            primary,
            secondary: textEmotion.secondary,
            confidence: combinedConfidence,
            valence: combinedValence,
            intensity: Math.min(1, combinedIntensity),
            distressLevel: combinedDistress,
            suggestedTone,
            source: 'combined',
            textAnalysis: {
                primary: textEmotion.primary,
                confidence: textEmotion.confidence,
                markers: textEmotion.markers,
            },
            voiceAnalysis: {
                primary: voiceEmotion.primary,
                confidence: voiceEmotion.confidence,
                stressLevel: voiceEmotion.stressLevel || 0,
                arousal: voiceEmotion.arousal,
            },
        };
    }
    mapTone(tone) {
        const toneMap = {
            warm: 'warm',
            gentle: 'gentle',
            enthusiastic: 'enthusiastic',
            calm: 'calm',
            serious: 'serious',
            friendly: 'warm',
            reassuring: 'reassuring',
            informative: 'calm',
            measured: 'calm',
        };
        return toneMap[tone] || 'warm';
    }
    buildIntentSignal(rawIntent) {
        return {
            primary: rawIntent.primary,
            confidence: rawIntent.confidence,
            requiresEmpathy: rawIntent.requiresEmpathy,
            requiresAction: rawIntent.requiresAction,
            suggestedApproach: rawIntent.suggestedApproach || 'Listen and respond naturally',
            isQuestion: rawIntent.isQuestion || rawIntent.primary.includes('question'),
            isWrappingUp: rawIntent.primary === 'ending_conversation' || rawIntent.primary === 'farewell',
        };
    }
    buildContextSignal(rawTopics, state, userProfile) {
        return {
            phase: state.phase,
            topics: rawTopics.detected,
            currentTopic: rawTopics.detected[0] || null,
            isTopicShift: rawTopics.isTopicShift || false,
            turnCount: state.turnCount,
            topicsToCircleBack: state.topicsToCircleBack,
            relationshipStage: userProfile?.relationshipStage || 'stranger',
        };
    }
    /**
     * THE SUPERHUMAN CAPABILITY: Detect voice/text emotional mismatch
     *
     * This is what makes Ferni "better than human" - we notice when
     * someone says "I'm fine" but their voice tells a different story.
     */
    detectMismatch(textEmotion, voiceEmotion, userText) {
        // Can't detect mismatch without voice data
        if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
            return {
                detected: false,
                confidence: 0,
                type: 'none',
                textEmotion: textEmotion.primary,
                voiceEmotion: 'unknown',
                interpretation: 'No voice data available',
                approach: '',
                shouldSurface: false,
            };
        }
        // Common masking phrases
        const maskingPhrases = [
            "i'm fine",
            "i'm okay",
            "i'm good",
            "i'm alright",
            "it's fine",
            'no big deal',
            "doesn't matter",
            'whatever',
            'it is what it is',
            "can't complain",
            'could be worse',
            'just tired',
            'just stressed',
        ];
        const textLower = userText.toLowerCase();
        const isMaskingPhrase = maskingPhrases.some((phrase) => textLower.includes(phrase));
        const positiveEmotions = ['happy', 'excited', 'joy', 'grateful', 'trust', 'anticipation'];
        const negativeEmotions = ['sad', 'angry', 'fearful', 'anxious', 'distressed', 'frustrated'];
        const textIsPositive = textEmotion.valence === 'positive' || positiveEmotions.includes(textEmotion.primary);
        const textIsNegative = textEmotion.valence === 'negative' || negativeEmotions.includes(textEmotion.primary);
        const voiceIsPositive = voiceEmotion.valence > 0.2;
        const voiceIsNegative = voiceEmotion.valence < -0.2 || (voiceEmotion.stressLevel || 0) > 0.5;
        // Type 1: Masking negative emotions with "I'm fine"
        if (isMaskingPhrase && voiceIsNegative) {
            return {
                detected: true,
                confidence: voiceEmotion.confidence * 0.9,
                type: 'masking_negative',
                textEmotion: textEmotion.primary,
                voiceEmotion: voiceEmotion.primary,
                interpretation: `User says they're okay but voice reveals ${voiceEmotion.primary} emotion`,
                approach: 'Acknowledge without pushing. Let them know you notice and care.',
                shouldSurface: voiceEmotion.confidence > 0.6 && (voiceEmotion.stressLevel || 0) > 0.3,
                surfacePhrase: this.getMismatchSurfacePhrase('masking_negative'),
            };
        }
        // Type 2: Contradicting (positive text, negative voice)
        if (textIsPositive && voiceIsNegative) {
            return {
                detected: true,
                confidence: Math.min(textEmotion.confidence, voiceEmotion.confidence) * 0.85,
                type: 'contradicting',
                textEmotion: textEmotion.primary,
                voiceEmotion: voiceEmotion.primary,
                interpretation: `Text sounds ${textEmotion.primary} but voice sounds ${voiceEmotion.primary}`,
                approach: 'Gently explore what might be behind the surface',
                shouldSurface: voiceEmotion.confidence > 0.65,
                surfacePhrase: this.getMismatchSurfacePhrase('contradicting'),
            };
        }
        // Type 3: Understating positive (neutral text, excited voice)
        if (!textIsPositive && voiceIsPositive && voiceEmotion.arousal > 0.5) {
            return {
                detected: true,
                confidence: voiceEmotion.confidence * 0.7,
                type: 'understating_positive',
                textEmotion: textEmotion.primary,
                voiceEmotion: voiceEmotion.primary,
                interpretation: 'User is more excited than their words suggest',
                approach: 'Match their underlying energy, celebrate with them',
                shouldSurface: voiceEmotion.arousal > 0.6,
                surfacePhrase: this.getMismatchSurfacePhrase('understating_positive'),
            };
        }
        // Type 4: Suppressing stress
        if (!textIsNegative && (voiceEmotion.stressLevel || 0) > 0.6) {
            return {
                detected: true,
                confidence: (voiceEmotion.stressLevel || 0) * 0.8,
                type: 'suppressing',
                textEmotion: textEmotion.primary,
                voiceEmotion: voiceEmotion.primary,
                interpretation: 'Voice reveals stress despite neutral words',
                approach: 'Create space for them to share more if they want',
                shouldSurface: (voiceEmotion.stressLevel || 0) > 0.7,
                surfacePhrase: this.getMismatchSurfacePhrase('suppressing'),
            };
        }
        return {
            detected: false,
            confidence: 0,
            type: 'none',
            textEmotion: textEmotion.primary,
            voiceEmotion: voiceEmotion.primary,
            interpretation: 'Text and voice are congruent',
            approach: '',
            shouldSurface: false,
        };
    }
    getMismatchSurfacePhrase(type) {
        const phrases = {
            masking_negative: [
                "I hear you saying you're okay, but... I'm here if there's more you want to share.",
                "You don't have to be 'fine' with me. What's really going on?",
                'Something in your voice tells me there might be more to the story.',
            ],
            contradicting: [
                "I'm picking up on some mixed feelings. Want to talk about what's underneath?",
                "Your voice is telling me something different. It's okay to share both sides.",
            ],
            understating_positive: [
                'Wait, I can hear how excited you actually are! Tell me more!',
                'Your voice is lighting up! This sounds like a big deal!',
            ],
            suppressing: [
                "I sense there might be some weight on your shoulders. We can talk about it if you'd like.",
                "No pressure, but I'm here if you want to share what's really on your mind.",
            ],
        };
        const options = phrases[type] || phrases.masking_negative;
        return options[Math.floor(Math.random() * options.length)];
    }
    detectBehavioralSignals(message, emotion, intent) {
        const lower = message.toLowerCase();
        const markers = [];
        // Pattern detection
        const rushPatterns = /\b(gotta go|quick question|running late|no time|hurry|briefly)\b/;
        const relaxedPatterns = /\b(anyway|so tell me|just wanted to|wondering|been thinking)\b/;
        const personalPatterns = /\b(my (wife|husband|kid|mom|dad|family)|i feel|makes me|i'm worried)\b/;
        const advicePatterns = /\b(what should|how should|advice|recommend|suggest|opinion)\b/;
        const ventingPatterns = /\b(just need to|had to tell|so frustrating|can't stand|ugh)\b/;
        const decisionPatterns = /\b(i've decided|going to|made up my mind|i will)\b/;
        const isRushed = rushPatterns.test(lower);
        const isRelaxed = relaxedPatterns.test(lower) || message.split(/\s+/).length > 40;
        const isPersonalSharing = personalPatterns.test(lower) || emotion.distressLevel > 0.5;
        const seekingAdvice = advicePatterns.test(lower) || intent.primary === 'seeking_advice';
        const isVenting = ventingPatterns.test(lower) && emotion.valence < 0;
        const madeDecision = decisionPatterns.test(lower);
        if (isRushed)
            markers.push('rushed');
        if (isRelaxed)
            markers.push('relaxed');
        if (isPersonalSharing)
            markers.push('personal');
        if (seekingAdvice)
            markers.push('advice-seeking');
        if (isVenting)
            markers.push('venting');
        if (madeDecision)
            markers.push('decision');
        return {
            isRushed,
            isRelaxed,
            needsSupport: emotion.distressLevel > 0.4 || intent.requiresEmpathy,
            isPersonalSharing,
            seekingAdvice,
            isVenting,
            madeDecision,
            markers,
        };
    }
    buildResponseGuidance(emotion, intent, context, mismatch, signals, DISTRESS) {
        const guidelines = [];
        // Response length based on signals
        let responseLength = { min: 25, max: 70 };
        if (signals.isRushed) {
            responseLength = { min: 10, max: 30 };
            guidelines.push('User is rushed - be brief and direct');
        }
        else if (signals.isRelaxed) {
            responseLength = { min: 40, max: 100 };
            guidelines.push('User is relaxed - can be more conversational');
        }
        // Emotional guidance
        if (signals.needsSupport) {
            guidelines.push('User needs emotional support - prioritize empathy over advice');
        }
        if (signals.isVenting) {
            guidelines.push("User is venting - listen and validate, don't problem-solve yet");
        }
        if (signals.madeDecision) {
            guidelines.push("User made a decision - affirm and support, don't second-guess");
        }
        // THE SUPERHUMAN GUIDANCE: Voice/text mismatch
        if (mismatch.detected) {
            guidelines.push(`🎯 VOICE INSIGHT: ${mismatch.interpretation}`);
            guidelines.push(`Approach: ${mismatch.approach}`);
            if (mismatch.shouldSurface && mismatch.surfacePhrase) {
                guidelines.push(`If appropriate: "${mismatch.surfacePhrase}"`);
            }
        }
        // Determine approach
        let approach = 'supportive';
        if (emotion.distressLevel >= DISTRESS.HIGH || mismatch.detected) {
            approach = 'empathy_first';
        }
        else if (signals.seekingAdvice && !signals.isVenting) {
            approach = 'direct';
        }
        else if (emotion.valence > 0.3 && signals.madeDecision) {
            approach = 'celebratory';
        }
        else if (context.phase === 'exploring') {
            approach = 'exploratory';
        }
        // Determine priority focus
        let priorityFocus = 'Listen and respond naturally';
        if (mismatch.detected && mismatch.type === 'masking_negative') {
            priorityFocus =
                'Notice the mismatch - words say fine, voice says otherwise. Check in gently.';
        }
        else if (signals.needsSupport) {
            priorityFocus = 'Provide emotional support - acknowledge feelings first';
        }
        else if (signals.isVenting) {
            priorityFocus = "Validate feelings - don't fix yet";
        }
        else if (signals.madeDecision) {
            priorityFocus = 'Affirm their decision';
        }
        // High emotion mode: simplify everything for focused support
        const useHighEmotionMode = Boolean(emotion.distressLevel >= DISTRESS.HIGH ||
            emotion.intensity > 0.8 ||
            signals.needsSupport ||
            (mismatch.detected && mismatch.type === 'masking_negative'));
        return {
            responseLength,
            priorityFocus,
            approach,
            guidelines,
            useHighEmotionMode,
        };
    }
    buildContextForPrompt(emotion, intent, context, mismatch, guidance) {
        const sections = [];
        // MOST IMPORTANT: Voice/text mismatch (the superhuman signal)
        if (mismatch.detected) {
            sections.push(`🎯 [VOICE INSIGHT - PRIORITY] ${mismatch.interpretation}\n` +
                `Approach: ${mismatch.approach}\n` +
                (mismatch.shouldSurface && mismatch.surfacePhrase
                    ? `Consider: "${mismatch.surfacePhrase}"`
                    : ''));
        }
        // Emotional state
        if (emotion.distressLevel > 0.5) {
            sections.push(`[PRIORITY] User appears distressed (${emotion.primary}, distress: ${emotion.distressLevel.toFixed(2)}). Focus on emotional support first.`);
        }
        else if (emotion.valence > 0.3) {
            sections.push(`[MOOD] User seems ${emotion.primary}. Match their energy.`);
        }
        // Intent guidance
        if (intent.requiresEmpathy) {
            sections.push(`[APPROACH] ${intent.suggestedApproach}`);
        }
        // Phase and focus
        sections.push(`[PHASE] ${context.phase} - ${guidance.priorityFocus}`);
        // Topic management
        if (context.isTopicShift) {
            sections.push('[TOPIC SHIFT] User is changing subjects. Acknowledge and follow.');
        }
        if (context.topicsToCircleBack.length > 0 && context.turnCount % 5 === 0) {
            sections.push(`[CIRCLE BACK] Consider returning to: ${context.topicsToCircleBack[0]}`);
        }
        return sections.join('\n\n');
    }
}
// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================
/**
 * Quick analysis function - use this for single calls
 */
export async function analyzeUnified(input) {
    return UnifiedAnalyzer.getInstance().analyze(input);
}
/**
 * Alias for analyzeUnified - backward compatibility with old unified-analyzer.ts
 * @deprecated Use analyzeUnified() instead
 */
export const analyze = analyzeUnified;
export default UnifiedAnalyzer;
//# sourceMappingURL=unified-analyzer.js.map