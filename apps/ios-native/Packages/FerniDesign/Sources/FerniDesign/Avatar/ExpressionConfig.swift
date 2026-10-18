// MARK: - Expression Configuration
// Data-driven expression system for the Window Avatar
//
// This file provides expression configurations loaded from design-system tokens.
// The source of truth is design-system/tokens/expressions.json, which is
// copied to this package's Resources/expressions.json.
//
// Usage:
//   let config = ExpressionLoader.shared.config(for: "joyful")
//   let topCutoff = config?.topCutoff ?? 0.12
//
// Reference: design-system/tokens/expressions.json

import Foundation
import os

// MARK: - Expression Configuration Model

/// Configuration for a single expression
struct ExpressionConfig: Codable, Sendable {
    let family: String
    let topCutoff: CGFloat
    let topCurve: CGFloat
    let bottomCutoff: CGFloat
    let bottomCurve: CGFloat
    let asymmetry: CGFloat
    let animation: String?
    let sparkle: Bool

    // Eye scale properties (derived from web eyeWhite properties)
    let eyeScaleY: CGFloat?
    let eyeScaleX: CGFloat?

    /// A null or missing number reads as neutral's. expressions.json has
    /// `speaking.bottomCurve: null` (the voice drives the mouth), and a strict
    /// decode of that one value threw away the whole file, so every face was
    /// silently neutral.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let n = ExpressionConfig.neutral
        family = try c.decodeIfPresent(String.self, forKey: .family) ?? n.family
        topCutoff = try c.decodeIfPresent(CGFloat.self, forKey: .topCutoff) ?? n.topCutoff
        topCurve = try c.decodeIfPresent(CGFloat.self, forKey: .topCurve) ?? n.topCurve
        bottomCutoff = try c.decodeIfPresent(CGFloat.self, forKey: .bottomCutoff) ?? n.bottomCutoff
        bottomCurve = try c.decodeIfPresent(CGFloat.self, forKey: .bottomCurve) ?? n.bottomCurve
        asymmetry = try c.decodeIfPresent(CGFloat.self, forKey: .asymmetry) ?? n.asymmetry
        animation = try c.decodeIfPresent(String.self, forKey: .animation)
        sparkle = try c.decodeIfPresent(Bool.self, forKey: .sparkle) ?? false
        eyeScaleY = try c.decodeIfPresent(CGFloat.self, forKey: .eyeScaleY)
        eyeScaleX = try c.decodeIfPresent(CGFloat.self, forKey: .eyeScaleX)
    }

    init(
        family: String, topCutoff: CGFloat, topCurve: CGFloat, bottomCutoff: CGFloat,
        bottomCurve: CGFloat, asymmetry: CGFloat, animation: String?, sparkle: Bool,
        eyeScaleY: CGFloat?, eyeScaleX: CGFloat?
    ) {
        self.family = family
        self.topCutoff = topCutoff
        self.topCurve = topCurve
        self.bottomCutoff = bottomCutoff
        self.bottomCurve = bottomCurve
        self.asymmetry = asymmetry
        self.animation = animation
        self.sparkle = sparkle
        self.eyeScaleY = eyeScaleY
        self.eyeScaleX = eyeScaleX
    }

    /// Computed eye scale with defaults
    var effectiveEyeScaleY: CGFloat { eyeScaleY ?? 1.0 }
    var effectiveEyeScaleX: CGFloat { eyeScaleX ?? 1.0 }

    /// Whether eyes are squinted (scaleY < 0.85)
    var isSquinted: Bool { effectiveEyeScaleY < 0.85 }

    /// Whether eyes are wide (scaleY > 1.05)
    var isWideEyed: Bool { effectiveEyeScaleY > 1.05 }

    /// Default neutral configuration
    static let neutral = ExpressionConfig(
        family: "core",
        topCutoff: 0.12,
        topCurve: 0,
        bottomCutoff: 0.12,
        bottomCurve: 0,
        asymmetry: 0,
        animation: nil,
        sparkle: false,
        eyeScaleY: 1.0,
        eyeScaleX: 1.0
    )
}

/// Family metadata
struct ExpressionFamilyMeta: Codable, Sendable {
    let displayName: String
    let description: String
}

/// Root structure of the expressions.json file
struct ExpressionsData: Codable, Sendable {
    let version: String
    let generated: String
    let expressions: [String: ExpressionConfig]
    let families: [String: ExpressionFamilyMeta]?
    let microExpressions: [String: MicroExpressionConfig]?
}

/// Micro-expression configuration
struct MicroExpressionConfig: Codable, Sendable {
    let duration: Int
    let eyeWhite: EyeWhiteConfig?
    let lidTop: LidConfig?
    let smileCrease: SmileCreaseConfig?

    struct EyeWhiteConfig: Codable, Sendable {
        let scaleY: CGFloat?
        let scaleX: CGFloat?
    }

    struct LidConfig: Codable, Sendable {
        let curve: CGFloat?
    }

    struct SmileCreaseConfig: Codable, Sendable {
        let opacity: CGFloat?
    }
}

// MARK: - Expression Loader

/// Singleton loader for expression configurations
final class ExpressionLoader: Sendable {
    static let shared = ExpressionLoader()

    private let expressionsData: ExpressionsData?

    private init() {
        expressionsData = Self.loadExpressions()
    }

    // MARK: - Loading

    /// Load expressions from this package's bundled JSON
    private static func loadExpressions() -> ExpressionsData? {
        let log = Logger(subsystem: "com.sethdford.ferni", category: "avatar")
        guard let url = Bundle.module.url(forResource: "expressions", withExtension: "json") else {
            log.error("expressions.json is missing from FerniDesign's bundle")
            return nil
        }
        do {
            return try JSONDecoder().decode(ExpressionsData.self, from: Data(contentsOf: url))
        } catch {
            log.error("expressions.json failed to decode: \(error.localizedDescription, privacy: .public)")
            return nil
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
public enum AvatarExpression: String, CaseIterable, Codable, Sendable {
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

    /// Eye vertical scale (1.0 = normal, < 1 = squinted, > 1 = wide)
    var eyeScaleY: CGFloat { config.effectiveEyeScaleY }

    /// Eye horizontal scale (1.0 = normal, > 1 = wider)
    var eyeScaleX: CGFloat { config.effectiveEyeScaleX }

    /// Whether eyes are squinted
    var isSquinted: Bool { config.isSquinted }

    /// Whether eyes are wide open
    var isWideEyed: Bool { config.isWideEyed }

    // MARK: - Factory

    /// Create from string, falling back to neutral for unknown values
    public static func from(_ string: String) -> AvatarExpression {
        return AvatarExpression(rawValue: string) ?? .neutral
    }
}
