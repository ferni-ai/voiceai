// MARK: - Expression Configuration
// Data-driven expression system for the Window Avatar
//
// This file provides expression configurations loaded from design-system tokens.
// The source of truth is design-system/tokens/expressions.json, which is
// compiled to Resources/expressions.json by the build script.
//
// Usage:
//   let config = ExpressionLoader.shared.config(for: "joyful")
//   let topCutoff = config?.topCutoff ?? 0.12
//
// Reference: design-system/tokens/expressions.json

import Foundation

// MARK: - Expression Configuration Model

/// Configuration for a single expression
struct ExpressionConfig: Codable {
    let family: String
    let topCutoff: CGFloat
    let topCurve: CGFloat
    let bottomCutoff: CGFloat
    let bottomCurve: CGFloat
    let asymmetry: CGFloat
    let animation: String?
    let sparkle: Bool

    /// Default neutral configuration
    static let neutral = ExpressionConfig(
        family: "core",
        topCutoff: 0.12,
        topCurve: 0,
        bottomCutoff: 0.12,
        bottomCurve: 0,
        asymmetry: 0,
        animation: nil,
        sparkle: false
    )
}

/// Family metadata
struct ExpressionFamilyMeta: Codable {
    let displayName: String
    let description: String
}

/// Root structure of the expressions.json file
struct ExpressionsData: Codable {
    let version: String
    let generated: String
    let expressions: [String: ExpressionConfig]
    let families: [String: ExpressionFamilyMeta]?
    let microExpressions: [String: MicroExpressionConfig]?
}

/// Micro-expression configuration
struct MicroExpressionConfig: Codable {
    let duration: Int
    let eyeWhite: EyeWhiteConfig?
    let lidTop: LidConfig?
    let smileCrease: SmileCreaseConfig?

    struct EyeWhiteConfig: Codable {
        let scaleY: CGFloat?
        let scaleX: CGFloat?
    }

    struct LidConfig: Codable {
        let curve: CGFloat?
    }

    struct SmileCreaseConfig: Codable {
        let opacity: CGFloat?
    }
}

// MARK: - Expression Loader

/// Singleton loader for expression configurations
final class ExpressionLoader {
    static let shared = ExpressionLoader()

    private var expressionsData: ExpressionsData?
    private var didLoad = false

    private init() {
        loadExpressions()
    }

    // MARK: - Loading

    /// Load expressions from bundled JSON
    private func loadExpressions() {
        guard !didLoad else { return }
        didLoad = true

        // Try to load from bundle
        guard let url = Bundle.main.url(forResource: "expressions", withExtension: "json") else {
            print("⚠️ ExpressionLoader: expressions.json not found in bundle")
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            expressionsData = try decoder.decode(ExpressionsData.self, from: data)
            print("✅ ExpressionLoader: Loaded \(expressionsData?.expressions.count ?? 0) expressions")
        } catch {
            print("❌ ExpressionLoader: Failed to load expressions: \(error)")
        }
    }

    // MARK: - Accessors

    /// Get configuration for an expression by ID
    func config(for expressionId: String) -> ExpressionConfig {
        return expressionsData?.expressions[expressionId] ?? .neutral
    }

    /// Check if an expression exists
    func hasExpression(_ expressionId: String) -> Bool {
        return expressionsData?.expressions[expressionId] != nil
    }

    /// Get all expression IDs
    func allExpressionIds() -> [String] {
        return expressionsData?.expressions.keys.sorted() ?? []
    }

    /// Get expressions in a family
    func expressionsInFamily(_ family: String) -> [String] {
        return expressionsData?.expressions.filter { $0.value.family == family }.map { $0.key } ?? []
    }

    /// Get all family IDs
    func allFamilyIds() -> [String] {
        return expressionsData?.families?.keys.sorted() ?? []
    }

    /// Get family metadata
    func familyMeta(for familyId: String) -> ExpressionFamilyMeta? {
        return expressionsData?.families?[familyId]
    }

    /// Get micro-expression config
    func microExpression(_ name: String) -> MicroExpressionConfig? {
        return expressionsData?.microExpressions?[name]
    }
}

// MARK: - Extended AvatarMood

/// All available expression IDs as an enum
/// This enum is data-driven: unknown strings fall back to .neutral
enum AvatarExpression: String, CaseIterable, Codable {
    // Core
    case neutral, listening, speaking

    // Happy family
    case happy, joyful, delighted, amused, pleased, content, excited, grateful, proud

    // Warmth family
    case warm, caring, loving, tender, supportive, compassionate, empathetic, nurturing

    // Playful family
    case playful, mischievous, cheeky, silly, winking, teasing

    // Surprised family
    case surprised, shocked, amazed, intrigued, astonished, curious

    // Thinking family
    case thinking, pondering, contemplating, focused, processing, reflecting, analyzing

    // Listening family
    case attentive, engaged, interested, absorbing, receptive

    // Presence family
    case present, grounded, calm, serene, peaceful

    // Coaching family
    case encouraging, cheering, guiding, wise, knowing

    // Tired family
    case sleepy, drowsy, exhausted, yawning, resting, blissful

    // Concern family
    case concerned, worried, sympathetic, understanding, comforting

    // Sad family
    case sad, crying, melancholy, disappointed, dejected

    // Frustrated family
    case frustrated, annoyed, irritated, exasperated, eyeroll

    // Confused family
    case confused, skeptical, puzzled, perplexed, bewildered

    // Nervous family
    case nervous, anxious, scared, fearful, uneasy

    // Embarrassed family
    case embarrassed, awkward, cringing, sheepish, flustered

    // Cool family
    case confident, smirking, cool, sassy, smug

    // Intense family
    case determined, fierce, intense, resolute, passionate

    /// Get configuration from the loader
    var config: ExpressionConfig {
        ExpressionLoader.shared.config(for: self.rawValue)
    }

    /// Top lid cutoff
    var topCutoff: CGFloat { config.topCutoff }

    /// Top lid curve
    var topCurve: CGFloat { config.topCurve }

    /// Bottom lid cutoff
    var bottomCutoff: CGFloat { config.bottomCutoff }

    /// Bottom lid curve
    var bottomCurve: CGFloat { config.bottomCurve }

    /// Asymmetry
    var asymmetry: CGFloat { config.asymmetry }

    /// Animation name (if any)
    var animation: String? { config.animation }

    /// Whether to show sparkle effect
    var sparkle: Bool { config.sparkle }

    /// Expression family
    var family: String { config.family }

    // MARK: - Factory

    /// Create from string, falling back to neutral for unknown values
    static func from(_ string: String) -> AvatarExpression {
        return AvatarExpression(rawValue: string) ?? .neutral
    }
}

// MARK: - AvatarMood Compatibility

/// Extension to make existing AvatarMood work with the new system
/// Maps legacy mood values to new expression system
extension AvatarMood {
    /// Convert legacy mood to new expression
    var asExpression: AvatarExpression {
        switch self {
        case .neutral: return .neutral
        case .happy: return .happy
        case .delighted: return .delighted
        case .surprised: return .surprised
        case .sleepy: return .sleepy
        case .skeptical: return .skeptical
        case .sad: return .sad
        case .curious: return .curious
        case .excited: return .excited
        case .thinking: return .thinking
        case .empathetic: return .empathetic
        case .listening: return .listening
        }
    }

    /// Get config from new expression system (hybrid approach)
    var expressionConfig: ExpressionConfig {
        // If expressions.json is available, use it
        if ExpressionLoader.shared.hasExpression(self.rawValue) {
            return ExpressionLoader.shared.config(for: self.rawValue)
        }
        // Otherwise fall back to hardcoded values
        return ExpressionConfig(
            family: "core",
            topCutoff: self.topCutoff,
            topCurve: self.topCurve,
            bottomCutoff: self.bottomCutoff,
            bottomCurve: self.bottomCurve,
            asymmetry: self.asymmetry,
            animation: nil,
            sparkle: false
        )
    }
}
