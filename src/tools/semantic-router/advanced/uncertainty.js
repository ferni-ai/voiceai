/**
 * Uncertainty Quantification & Calibration
 *
 * Transforms raw confidence scores into calibrated probabilities
 * and provides uncertainty estimates for better decision making.
 *
 * Key insight: High similarity ≠ high confidence
 * A 0.8 embedding similarity might only mean 60% chance of correct routing.
 *
 * Implements:
 * 1. Platt Scaling for score calibration
 * 2. Ensemble disagreement for uncertainty
 * 3. Epistemic vs Aleatoric uncertainty separation
 * 4. Adaptive clarification triggers
 *
 * @module tools/semantic-router/advanced/uncertainty
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'semantic-router:uncertainty' });
// ============================================================================
// CALIBRATION CLASS
// ============================================================================
export class UncertaintyCalibrator {
    params = {
        A: -2.0, // Default: roughly linear mapping
        B: 1.0,
        toolBiases: new Map(),
    };
    // Validation set for ongoing calibration
    validationExamples = [];
    // Ensemble of different routing strategies
    ensembleScores = new Map();
    constructor() {
        this.initializeDefaultBiases();
    }
    /**
     * Calibrate a set of tool matches
     */
    calibrate(matches, context) {
        const results = [];
        // Calculate ensemble scores for uncertainty
        this.updateEnsembleScores(matches);
        for (const match of matches) {
            const result = this.calibrateMatch(match, matches, context);
            results.push(result);
        }
        // Sort by calibrated probability
        results.sort((a, b) => b.calibratedProbability - a.calibratedProbability);
        return results;
    }
    /**
     * Add a validation example to improve calibration
     */
    addValidationExample(example) {
        this.validationExamples.push({
            ...example,
            wasCorrect: example.predictedTool === example.actualTool,
        });
        // Keep last 500 examples
        if (this.validationExamples.length > 500) {
            this.validationExamples.shift();
        }
        // Recalibrate periodically
        if (this.validationExamples.length % 50 === 0) {
            this.recalibrate();
        }
    }
    /**
     * Get calibration quality metrics
     */
    getCalibrationMetrics() {
        if (this.validationExamples.length < 20) {
            return {
                expectedCalibrationError: 0.5, // Unknown
                brierScore: 0.25, // Unknown
                reliability: 0,
            };
        }
        // Calculate Expected Calibration Error (ECE)
        // Group predictions into bins and compare predicted vs actual accuracy
        const bins = this.createCalibrationBins();
        let ece = 0;
        for (const bin of bins) {
            if (bin.count > 0) {
                const gap = Math.abs(bin.avgPredicted - bin.accuracy);
                ece += (bin.count / this.validationExamples.length) * gap;
            }
        }
        // Calculate Brier Score (mean squared error of probabilities)
        let brierSum = 0;
        for (const ex of this.validationExamples) {
            const predicted = this.plattScale(ex.rawScore);
            const actual = ex.wasCorrect ? 1 : 0;
            brierSum += Math.pow(predicted - actual, 2);
        }
        const brierScore = brierSum / this.validationExamples.length;
        return {
            expectedCalibrationError: ece,
            brierScore,
            reliability: 1 - ece,
        };
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    initializeDefaultBiases() {
        // Tools that users often want even with lower scores
        this.params.toolBiases.set('handoff', 0.1); // Persona switches are often explicit
        this.params.toolBiases.set('music_play', 0.05); // Music requests are common
        this.params.toolBiases.set('calendar_create_event', 0.05);
        // Tools that need higher confidence
        this.params.toolBiases.set('email_send', -0.1); // Sending email is consequential
        this.params.toolBiases.set('transaction_send', -0.2); // Financial actions
        this.params.toolBiases.set('delete_', -0.15); // Destructive actions
    }
    calibrateMatch(match, allMatches, context) {
        // 1. Apply Platt scaling for base calibration
        let calibrated = this.plattScale(match.confidence);
        // 2. Apply tool-specific bias
        const toolBias = this.getToolBias(match.toolId);
        calibrated = Math.max(0, Math.min(1, calibrated + toolBias));
        // 3. Calculate uncertainty
        const uncertainty = this.calculateUncertainty(match, allMatches);
        // 4. Determine if clarification needed
        const { needsClarification, questions, alternatives } = this.assessClarificationNeed(match, allMatches, uncertainty, context);
        return {
            toolId: match.toolId,
            rawScore: match.confidence,
            calibratedProbability: calibrated,
            uncertainty,
            needsClarification,
            clarifyingQuestions: questions,
            alternativeInterpretations: alternatives,
        };
    }
    plattScale(score) {
        // Sigmoid transformation: P(y=1|s) = 1 / (1 + exp(A*s + B))
        const exponent = this.params.A * score + this.params.B;
        return 1 / (1 + Math.exp(exponent));
    }
    getToolBias(toolId) {
        // Check exact match
        if (this.params.toolBiases.has(toolId)) {
            return this.params.toolBiases.get(toolId) ?? 0;
        }
        // Check prefix matches
        const biasEntries = Array.from(this.params.toolBiases.entries());
        for (const [key, value] of biasEntries) {
            if (key.endsWith('_') && toolId.startsWith(key)) {
                return value;
            }
        }
        return 0;
    }
    calculateUncertainty(match, allMatches) {
        // Epistemic uncertainty: disagreement between ensemble methods
        const ensembleVar = this.calculateEnsembleVariance(match.toolId);
        // Aleatoric uncertainty: inherent ambiguity (similar scores for multiple tools)
        const aleatoricUncertainty = this.calculateAmbiguity(allMatches);
        // Total uncertainty (using uncertainty propagation)
        const epistemicUncertainty = Math.sqrt(ensembleVar);
        const total = Math.sqrt(Math.pow(epistemicUncertainty, 2) + Math.pow(aleatoricUncertainty, 2));
        return {
            total: Math.min(1, total),
            epistemic: Math.min(1, epistemicUncertainty),
            aleatoric: Math.min(1, aleatoricUncertainty),
        };
    }
    updateEnsembleScores(matches) {
        // Store scores from different layers for ensemble analysis
        for (const match of matches) {
            const scores = this.ensembleScores.get(match.toolId) || [];
            scores.push(match.confidence);
            // Keep last 10 scores per tool
            if (scores.length > 10) {
                scores.shift();
            }
            this.ensembleScores.set(match.toolId, scores);
        }
    }
    calculateEnsembleVariance(toolId) {
        const scores = this.ensembleScores.get(toolId);
        if (!scores || scores.length < 2) {
            return 0.5; // High uncertainty when no history
        }
        // Calculate variance
        const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
        return variance;
    }
    calculateAmbiguity(matches) {
        if (matches.length < 2) {
            return 0;
        }
        // Sort by confidence
        const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
        // Ambiguity = how close are the top candidates?
        const gap = sorted[0].confidence - sorted[1].confidence;
        // Small gap = high ambiguity
        return Math.max(0, 1 - gap * 3); // Scale gap to ambiguity
    }
    assessClarificationNeed(match, allMatches, uncertainty, context) {
        const needsClarification = uncertainty.total > 0.4 || // High overall uncertainty
            uncertainty.aleatoric > 0.5 || // Very ambiguous
            (match.confidence > 0.3 && match.confidence < 0.6); // Medium confidence zone
        const questions = [];
        const alternatives = [];
        if (needsClarification) {
            // Generate clarifying questions based on alternatives
            const topMatches = allMatches.filter((m) => m.confidence > 0.2).slice(0, 3);
            if (topMatches.length > 1) {
                // Multiple plausible interpretations
                for (const m of topMatches) {
                    if (m.toolId !== match.toolId) {
                        alternatives.push(m.toolId);
                    }
                }
                questions.push(this.generateClarifyingQuestion(match, topMatches, context?.query));
            }
            // Add tool-specific clarifications
            if (match.extractedArgs && Object.keys(match.extractedArgs).length === 0) {
                questions.push(this.generateArgClarification(match));
            }
        }
        return { needsClarification, questions, alternatives };
    }
    generateClarifyingQuestion(primary, alternatives, query) {
        // Generate a natural-sounding clarification
        const toolDescriptions = {
            spotify_play: 'play music',
            calendar_create_event: 'add to calendar',
            handoff: 'connect with a team member',
            weather_current: 'check the weather',
            habit_track: 'track a habit',
            email_send: 'send an email',
            notes_create: 'create a note',
        };
        const primaryDesc = toolDescriptions[primary.toolId] || primary.toolId;
        const altDescs = alternatives
            .filter((a) => a.toolId !== primary.toolId)
            .map((a) => toolDescriptions[a.toolId] || a.toolId)
            .slice(0, 2);
        if (altDescs.length > 0) {
            return `Would you like me to ${primaryDesc}, or did you mean ${altDescs.join(' or ')}?`;
        }
        return `Just to confirm - would you like me to ${primaryDesc}?`;
    }
    generateArgClarification(match) {
        const argPrompts = {
            spotify_play: 'What would you like to listen to?',
            calendar_create_event: 'What should I call this event?',
            handoff: 'Which team member would you like to speak with?',
            email_send: 'Who should I send this to?',
            notes_create: 'What should the note be about?',
        };
        return argPrompts[match.toolId] || 'Could you give me a bit more detail?';
    }
    recalibrate() {
        if (this.validationExamples.length < 20) {
            return;
        }
        log.info({ examples: this.validationExamples.length }, 'Recalibrating...');
        // Simple gradient descent for Platt scaling parameters
        // In production, use scipy or similar for optimization
        const learningRate = 0.01;
        const iterations = 100;
        for (let iter = 0; iter < iterations; iter++) {
            let gradA = 0;
            let gradB = 0;
            for (const ex of this.validationExamples) {
                const predicted = this.plattScale(ex.rawScore);
                const actual = ex.wasCorrect ? 1 : 0;
                const error = predicted - actual;
                // Gradients for logistic function
                gradA += error * ex.rawScore * predicted * (1 - predicted);
                gradB += error * predicted * (1 - predicted);
            }
            // Update parameters
            this.params.A -= learningRate * (gradA / this.validationExamples.length);
            this.params.B -= learningRate * (gradB / this.validationExamples.length);
        }
        log.info({ A: this.params.A, B: this.params.B }, 'Calibration updated');
    }
    createCalibrationBins() {
        const numBins = 10;
        const bins = Array(numBins)
            .fill(null)
            .map(() => ({
            predictions: [],
            correct: 0,
        }));
        for (const ex of this.validationExamples) {
            const predicted = this.plattScale(ex.rawScore);
            const binIdx = Math.min(numBins - 1, Math.floor(predicted * numBins));
            bins[binIdx].predictions.push(predicted);
            if (ex.wasCorrect) {
                bins[binIdx].correct++;
            }
        }
        return bins.map((bin) => ({
            avgPredicted: bin.predictions.length > 0
                ? bin.predictions.reduce((sum, p) => sum + p, 0) / bin.predictions.length
                : 0,
            accuracy: bin.predictions.length > 0 ? bin.correct / bin.predictions.length : 0,
            count: bin.predictions.length,
        }));
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let calibratorInstance = null;
export function getCalibrator() {
    if (!calibratorInstance) {
        calibratorInstance = new UncertaintyCalibrator();
    }
    return calibratorInstance;
}
//# sourceMappingURL=uncertainty.js.map