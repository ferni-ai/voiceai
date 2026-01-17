import SwiftUI
import Combine

// MARK: - Easter Egg Triggers
/// Convenience API for triggering "Better Than Human" Easter egg moments.
/// These create those magical "they really know me" moments that build deep connection.
///
/// From BETTER-THAN-HUMAN.md:
/// - Memory Spark: "Remember when..." recognition
/// - Insider: Inside joke recognition - brief knowing look
/// - Recognition: User mentions familiar topic
/// - Delight: User achieves something
/// - Epiphany: "Aha!" moment shared together

public extension BetterThanHumanEngine {

    // MARK: - Memory & Recognition Easter Eggs

    /// Trigger when recognizing something from shared history
    /// Use when: User references a past conversation, mentions a familiar topic, or recalls shared memory
    func flashMemoryRecognition() {
        triggerMicroExpression(.memorySpark)
        triggerMemorySpark()
    }

    /// Trigger for inside joke recognition - the "we both know" moment
    /// Use when: User references something only you two understand
    func flashInsiderMoment() {
        triggerMicroExpression(.insider)
    }

    /// Trigger when user mentions a familiar topic (from their profile/history)
    /// Use when: User talks about their known interests, family members, work, etc.
    func flashRecognition() {
        triggerMicroExpression(.recognition)
    }

    // MARK: - Achievement & Joy Easter Eggs

    /// Trigger when user achieves something they've been working toward
    /// Use when: User reports success, reaches a goal, overcomes a challenge
    func flashDelight() {
        triggerMicroExpression(.delight)
        // Delight also triggers the sound effect
        sounds.playMicroExpression(.delight)
        #if os(iOS)
        haptics.playMicroExpression(.delight)
        #endif
    }

    /// Trigger for shared "aha!" moment - when understanding clicks
    /// Use when: User has a realization, puzzle solves, insight emerges
    func flashEpiphany() {
        triggerMicroExpression(.epiphany)
    }

    // MARK: - Interest & Curiosity Easter Eggs

    /// Trigger when genuinely intrigued by something user shares
    /// Use when: User shares unexpected information, new perspective
    func flashCuriosity() {
        triggerMicroExpression(.curiosityPeak)
    }

    /// Trigger for sustained interest in what user is saying
    /// Use when: Following an interesting story or explanation
    func flashInterest() {
        triggerMicroExpression(.interest)
    }

    // MARK: - Connection & Warmth Easter Eggs

    /// Trigger for moments of deep mutual understanding
    /// Use when: Connection feels particularly strong, understanding is mutual
    func flashConnection() {
        triggerMicroExpression(.connection)
    }

    /// Trigger for warm caring moments
    /// Use when: Supporting user through difficulty, showing you care
    func flashWarmth() {
        triggerMicroExpression(.warmth)
    }

    /// Trigger brief caring expression
    /// Use when: Gentle supportive moments, quiet affection
    func flashAffection() {
        triggerMicroExpression(.affection)
    }

    // MARK: - Concern & Care Easter Eggs

    /// Trigger subtle concern flash before empathy kicks in
    /// Use when: Sensing something might be wrong
    func flashConcern() {
        triggerMicroExpression(.concern)
    }

    /// Trigger protective instinct flash
    /// Use when: Sensing vulnerability, wanting to help
    func flashProtective() {
        triggerMicroExpression(.protective)
    }

    // MARK: - Compound Easter Eggs (Multi-Expression Sequences)

    /// Full celebration sequence for major achievements
    /// Use when: User hits a major milestone, big win, important moment
    func celebrateMilestone() {
        // Flash delight immediately
        flashDelight()

        // Follow with memory spark (this moment will be remembered!)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.triggerMicroExpression(.memorySpark)
        }
    }

    /// Reunion greeting - when user returns after time away
    /// Use when: First message after days/weeks apart
    func flashReunionWarmth() {
        // Recognition first
        triggerMicroExpression(.recognition)

        // Then deep warmth
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            self?.flashWarmth()
        }
    }

    /// Breakthrough moment - when user has major realization
    /// Use when: User expresses having figured something out, "I finally understand..."
    func flashBreakthrough() {
        // Curiosity peak first
        triggerMicroExpression(.curiosityPeak)

        // Then shared epiphany
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.flashEpiphany()
        }

        // Then delight at their success
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.flashDelight()
        }
    }
}

// MARK: - Context-Based Trigger Helpers

public extension BetterThanHumanEngine {

    /// Analyze text for Easter egg opportunities
    /// Call this with transcript segments to auto-trigger appropriate expressions
    func analyzeForEasterEggs(text: String, context: EasterEggContext) {
        let lowercased = text.lowercased()

        // Memory triggers
        if lowercased.contains("remember when") ||
           lowercased.contains("last time we") ||
           lowercased.contains("you told me") {
            flashMemoryRecognition()
            return
        }

        // Achievement triggers
        if lowercased.contains("i did it") ||
           lowercased.contains("finally") && (lowercased.contains("finished") || lowercased.contains("done")) ||
           lowercased.contains("i got the") ||
           lowercased.contains("made it") {
            flashDelight()
            return
        }

        // Epiphany triggers
        if lowercased.contains("i just realized") ||
           lowercased.contains("it hit me") ||
           lowercased.contains("aha") ||
           lowercased.contains("oh my god") && lowercased.contains("that's why") {
            flashEpiphany()
            return
        }

        // Concern triggers
        if context.voiceTone == .breaking ||
           context.voiceTone == .strained {
            flashConcern()
        }
    }
}

// MARK: - Easter Egg Context

public struct EasterEggContext {
    /// Detected voice tone
    public var voiceTone: VoiceTone?

    /// Time since last interaction
    public var timeSinceLastSession: TimeInterval?

    /// Whether this is user's first message of the session
    public var isSessionStart: Bool

    /// Known user topics/interests for recognition
    public var knownTopics: [String]

    public init(
        voiceTone: VoiceTone? = nil,
        timeSinceLastSession: TimeInterval? = nil,
        isSessionStart: Bool = false,
        knownTopics: [String] = []
    ) {
        self.voiceTone = voiceTone
        self.timeSinceLastSession = timeSinceLastSession
        self.isSessionStart = isSessionStart
        self.knownTopics = knownTopics
    }
}
