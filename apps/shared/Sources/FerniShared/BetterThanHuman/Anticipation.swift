import SwiftUI
import Combine

// MARK: - Anticipation Engine
/// Predicts emotions from partial speech and tone, showing responses BEFORE users finish.
/// Creates the "they understand me before I finish" feeling - the hallmark of deep friendship.
///
/// From BETTER-THAN-HUMAN.md:
/// - "I've been thinking about..." + falling tone → Reflective/sad
/// - "Guess what!" + rising tone → Excitement
/// - "Remember when..." → Nostalgia
/// - "I need to tell you..." → Important/attentive

public class AnticipationEngine: ObservableObject {

    // MARK: - Published State

    @Published public private(set) var anticipatedEmotion: AnticipatedEmotion? = nil
    @Published public private(set) var confidence: CGFloat = 0

    // MARK: - Configuration

    /// Minimum text length before attempting anticipation
    private let minTextLength = 12

    /// Confidence threshold to trigger anticipation
    private let confidenceThreshold: CGFloat = 0.6

    /// How long anticipation stays active
    private let anticipationDuration: TimeInterval = 2.0

    // MARK: - State

    private var resetTask: DispatchWorkItem?

    // MARK: - Phrase Patterns

    /// Patterns that trigger anticipation with their associated emotions
    private let patterns: [(pattern: String, emotion: AnticipatedEmotion, baseConfidence: CGFloat)] = [
        // Reflective/vulnerable
        ("i've been thinking", .reflective, 0.7),
        ("i've been feeling", .vulnerable, 0.75),
        ("sometimes i wonder", .reflective, 0.65),
        ("i don't know if", .uncertain, 0.6),

        // Excitement
        ("guess what", .excited, 0.85),
        ("you won't believe", .excited, 0.8),
        ("i just found out", .excited, 0.75),
        ("oh my god", .excited, 0.7),

        // Nostalgia
        ("remember when", .nostalgic, 0.8),
        ("back when we", .nostalgic, 0.75),
        ("i miss", .nostalgic, 0.7),
        ("those days", .nostalgic, 0.65),

        // Important/serious
        ("i need to tell you", .attentive, 0.8),
        ("there's something", .attentive, 0.7),
        ("i have to be honest", .attentive, 0.85),
        ("can i tell you something", .attentive, 0.8),

        // Distress signals
        ("i can't do this", .concerned, 0.8),
        ("i'm so tired of", .concerned, 0.75),
        ("nobody understands", .concerned, 0.8),
        ("what's the point", .concerned, 0.85),

        // Joy/gratitude
        ("thank you so much", .warm, 0.8),
        ("i'm so grateful", .warm, 0.85),
        ("this means so much", .warm, 0.8),
        ("you always", .warm, 0.7),

        // Curiosity
        ("what do you think about", .curious, 0.7),
        ("have you ever", .curious, 0.65),
        ("i was wondering", .curious, 0.6),
    ]

    // MARK: - Public API

    public init() {}

    /// Analyze partial transcript for emotion anticipation
    /// - Parameters:
    ///   - partialText: The partial (non-final) transcript
    ///   - tone: Optional detected voice tone
    public func analyze(partialText: String, tone: VoiceTone? = nil) {
        guard partialText.count >= minTextLength else { return }

        let normalizedText = partialText.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        // Check patterns
        for (pattern, emotion, baseConfidence) in patterns {
            if normalizedText.contains(pattern) {
                var confidence = baseConfidence

                // Boost confidence with tone matching
                if let tone = tone {
                    confidence = adjustConfidence(confidence, for: emotion, with: tone)
                }

                if confidence >= confidenceThreshold {
                    triggerAnticipation(emotion, confidence: confidence)
                    return
                }
            }
        }

        // Tone-only anticipation (weaker signal)
        if let tone = tone {
            if let emotion = emotionFromTone(tone) {
                triggerAnticipation(emotion, confidence: 0.5)
            }
        }
    }

    // MARK: - Private Methods

    private func triggerAnticipation(_ emotion: AnticipatedEmotion, confidence: CGFloat) {
        // Cancel pending reset
        resetTask?.cancel()

        self.anticipatedEmotion = emotion
        self.confidence = confidence

        // Auto-reset after duration
        let task = DispatchWorkItem { [weak self] in
            self?.anticipatedEmotion = nil
            self?.confidence = 0
        }
        resetTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + anticipationDuration, execute: task)
    }

    private func adjustConfidence(_ base: CGFloat, for emotion: AnticipatedEmotion, with tone: VoiceTone) -> CGFloat {
        // Tone that matches emotion boosts confidence
        switch (emotion, tone) {
        case (.excited, .rising): return base + 0.15
        case (.reflective, .falling): return base + 0.1
        case (.vulnerable, .falling): return base + 0.15
        case (.concerned, .breaking): return base + 0.2
        case (.concerned, .strained): return base + 0.15
        case (.warm, .neutral): return base + 0.05
        default: return base
        }
    }

    private func emotionFromTone(_ tone: VoiceTone) -> AnticipatedEmotion? {
        switch tone {
        case .rising: return .curious
        case .falling: return .reflective
        case .breaking: return .concerned
        case .strained: return .attentive
        case .neutral: return nil
        }
    }

    /// Clear current anticipation
    public func clear() {
        resetTask?.cancel()
        anticipatedEmotion = nil
        confidence = 0
    }
}

// MARK: - Anticipated Emotion

public enum AnticipatedEmotion: String, Equatable {
    case reflective     // Thoughtful, introspective
    case vulnerable     // Opening up emotionally
    case uncertain      // Seeking guidance
    case excited        // Good news incoming
    case nostalgic      // Remembering the past
    case attentive      // Something important coming
    case concerned      // Distress signals detected
    case warm           // Gratitude/connection
    case curious        // Question forming

    /// The expression Ferni should show
    public var expressionHint: EmotionHint {
        switch self {
        case .reflective: return .thinking
        case .vulnerable: return .empathetic
        case .uncertain: return .empathetic
        case .excited: return .curious  // Lean in before celebrating
        case .nostalgic: return .empathetic
        case .attentive: return .curious
        case .concerned: return .empathetic
        case .warm: return .happy
        case .curious: return .curious
        }
    }

    /// Visual shift to apply
    public var visualShift: AnticipationVisual {
        switch self {
        case .reflective:
            return AnticipationVisual(leanY: -2, warmth: 0.2, shimmerBoost: -0.1)
        case .vulnerable:
            return AnticipationVisual(leanY: -3, warmth: 0.4, shimmerBoost: 0)
        case .uncertain:
            return AnticipationVisual(leanY: -2, warmth: 0.3, shimmerBoost: 0)
        case .excited:
            return AnticipationVisual(leanY: -4, warmth: 0.1, shimmerBoost: 0.2)
        case .nostalgic:
            return AnticipationVisual(leanY: -1, warmth: 0.5, shimmerBoost: 0.1)
        case .attentive:
            return AnticipationVisual(leanY: -5, warmth: 0.1, shimmerBoost: 0.15)
        case .concerned:
            return AnticipationVisual(leanY: -3, warmth: 0.6, shimmerBoost: -0.05)
        case .warm:
            return AnticipationVisual(leanY: -2, warmth: 0.5, shimmerBoost: 0.1)
        case .curious:
            return AnticipationVisual(leanY: -4, warmth: 0.1, shimmerBoost: 0.2)
        }
    }
}

// MARK: - Visual Shift

public struct AnticipationVisual: Equatable {
    /// Forward lean (negative = toward user)
    public var leanY: CGFloat

    /// Warmth glow boost
    public var warmth: CGFloat

    /// Shimmer intensity boost
    public var shimmerBoost: CGFloat

    public init(leanY: CGFloat = 0, warmth: CGFloat = 0, shimmerBoost: CGFloat = 0) {
        self.leanY = leanY
        self.warmth = warmth
        self.shimmerBoost = shimmerBoost
    }
}
