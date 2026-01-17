import SwiftUI

// MARK: - Pixar Animation System
// Timing constants and shared state for Luxo Jr. style animations.
// Based on design-system/tokens/animation.json

// MARK: - Timing Constants

/// Pixar-inspired timing constants from design tokens
public enum PixarTiming {
    // Breathing cycles (Golden Ratio influenced)
    public static let breathCycleIdle: Double = 6.0        // Slow, contemplative
    public static let breathCycleActive: Double = 5.0     // Normal connection
    public static let breathCycleSpeaking: Double = 4.5   // Slightly faster when engaged

    // Reaction timings
    public static let nodDuration: Double = 0.28          // Quick acknowledgment
    public static let tiltDuration: Double = 0.4          // Curious lean
    public static let bounceDuration: Double = 0.6        // Full bounce with squash/stretch
    public static let perkUpDuration: Double = 0.3        // "Aha!" moment

    // Subliminal micro-expressions (Better Than Human)
    public static let microExpression: Double = 0.08      // 80ms - below conscious perception
    public static let memorySpark: Double = 0.3           // Recognition flash
    public static let warmthBloom: Double = 0.6           // Connection moment

    // Glow timings
    public static let shimmerCycle: Double = 2.0          // Iris shimmer (makes it feel alive)
    public static let glowPulseCycle: Double = 0.61       // Fibonacci F10 (610ms)

    // Halo breathing
    public static let haloOuterCycle: Double = 8.0        // Slow ambient
    public static let haloInnerCycle: Double = 5.0        // Synced with avatar
    public static let haloPulseExpand: Double = 1.2       // Expansion time
}

// MARK: - Squash & Stretch Parameters

/// Squash and stretch values for different states
/// Pixar's 12 Principles: Volume preservation (when Y stretches, X squashes)
public enum SquashStretch {
    public struct Values {
        public let scaleY: CGFloat
        public let scaleX: CGFloat
        public let translateY: CGFloat
        public let rotation: CGFloat

        public init(scaleY: CGFloat, scaleX: CGFloat, translateY: CGFloat, rotation: CGFloat) {
            self.scaleY = scaleY
            self.scaleX = scaleX
            self.translateY = translateY
            self.rotation = rotation
        }
    }

    // MARK: - Standard Values (Subtle - original)

    public static let idle = Values(
        scaleY: 1.012,
        scaleX: 0.994,
        translateY: -1.5,
        rotation: 0.3
    )

    public static let active = Values(
        scaleY: 1.018,
        scaleX: 0.991,
        translateY: -2,
        rotation: 0.5
    )

    public static let speaking = Values(
        scaleY: 1.025,
        scaleX: 0.988,
        translateY: -3,
        rotation: 0.8
    )

    public static let thinking = Values(
        scaleY: 1.015,
        scaleX: 0.993,
        translateY: -1.8,
        rotation: -0.4
    )

    // MARK: - Lamp Style Values (More dramatic - Pixar Luxo Jr.)

    /// Idle breathing - visible but gentle (like a resting lamp)
    public static let lampIdle = Values(
        scaleY: 1.04,       // More visible stretch
        scaleX: 0.975,      // Compensating squash
        translateY: -4,     // More bounce
        rotation: 0.5
    )

    /// Active state - engaged and alert
    public static let lampActive = Values(
        scaleY: 1.06,       // Noticeable stretch
        scaleX: 0.965,      // Strong squash
        translateY: -6,     // More dramatic
        rotation: 0.8
    )

    /// Speaking - animated and expressive
    public static let lampSpeaking = Values(
        scaleY: 1.08,       // Very noticeable
        scaleX: 0.955,      // Pronounced squash
        translateY: -8,     // Big movement
        rotation: 1.2
    )

    /// Excited - maximum expression (celebrations)
    public static let lampExcited = Values(
        scaleY: 1.12,       // Maximum stretch
        scaleX: 0.94,       // Maximum squash
        translateY: -12,    // Big bounce
        rotation: 2.0
    )

    /// Impact squash - used at bottom of bounce
    public static let lampSquash = Values(
        scaleY: 0.85,       // Compressed
        scaleX: 1.10,       // Expanded width
        translateY: 4,      // Pushed down
        rotation: 0
    )
}

// MARK: - Emotion Hints

/// Optional emotion hints from backend for one-shot reactions
public enum EmotionHint: String, Equatable {
    case neutral
    case happy
    case excited
    case curious
    case thinking
    case empathetic
    case encouraging
    case calm

    // Extended emotions for richer expression
    case connected      // Deep connection moment
    case celebrating    // Achievement/milestone
    case listening      // Active listening
    case greeting       // Hello/welcome back
    case energized      // Motivated, ready to go
    case peaceful       // Calm, zen moment
    case remembering    // Recognizing/recalling
    case vibing         // Enjoying music/moment

    /// Lamp animation to trigger for this emotion
    public var lampAnimation: LampAnimation {
        switch self {
        case .neutral: return .none
        case .happy: return .bounce
        case .excited, .celebrating: return .multiBounce
        case .curious: return .tiltRight
        case .thinking: return .tiltLeft
        case .empathetic, .connected: return .nod
        case .encouraging, .energized: return .perkUp
        case .calm, .peaceful: return .none
        case .listening: return .none
        case .greeting: return .bounce
        case .remembering: return .nod
        case .vibing: return .bounce
        }
    }

    /// Soul effect to trigger
    public var soulEffect: SoulEffect {
        switch self {
        case .neutral: return .none
        case .happy: return .warmthBloom
        case .excited, .celebrating: return .memorySpark
        case .curious: return .shimmerIntensify
        case .thinking: return .none
        case .empathetic, .connected: return .warmthGlow
        case .encouraging, .energized: return .warmthBloom
        case .calm, .peaceful: return .none
        case .listening: return .none
        case .greeting: return .warmthBloom
        case .remembering: return .memorySpark
        case .vibing: return .shimmerIntensify
        }
    }

    /// Symbolic expression to show for this emotion
    public var symbolicExpression: SymbolicExpression {
        switch self {
        case .neutral: return .none
        case .happy: return .sparkle
        case .excited: return .star
        case .curious: return .curious
        case .thinking: return .thinking
        case .empathetic: return .heart
        case .encouraging: return .bolt
        case .calm: return .peace
        case .connected: return .heart
        case .celebrating: return .confetti
        case .listening: return .listening
        case .greeting: return .wave
        case .energized: return .flame
        case .peaceful: return .moon
        case .remembering: return .heartSpark
        case .vibing: return .music
        }
    }
}

// MARK: - Lamp Animations

/// One-shot body language animations
public enum LampAnimation {
    case none
    case nod
    case tiltRight
    case tiltLeft
    case bounce
    case multiBounce
    case perkUp
    case shake
}

// MARK: - Soul Effects

/// One-shot glow/soul effects
public enum SoulEffect {
    case none
    case warmthBloom
    case warmthGlow
    case memorySpark
    case shimmerIntensify
}

// MARK: - Animation State

/// Observable state that drives all Pixar animations.
/// Uses smooth parameter changes instead of discrete state switches.
public class PixarAnimationState: ObservableObject {
    // Transform state (Lamp)
    @Published public var scaleX: CGFloat = 1.0
    @Published public var scaleY: CGFloat = 1.0
    @Published public var offsetX: CGFloat = 0
    @Published public var offsetY: CGFloat = 0
    @Published public var rotation: CGFloat = 0

    // Glow state (Soul)
    @Published public var glowIntensity: CGFloat = 0.6
    @Published public var glowScale: CGFloat = 1.0
    @Published public var shimmerPhase: CGFloat = 0
    @Published public var warmthOpacity: CGFloat = 0

    // Halo state
    @Published public var haloOpacity: CGFloat = 0.6
    @Published public var haloPulseScale: CGFloat = 1.0
    @Published public var haloPulseOpacity: CGFloat = 0

    // Breathing
    @Published public var breathPhase: CGFloat = 0  // 0-1 cycle

    // Active state
    @Published public var isActive: Bool = false

    public init() {}

    /// Apply squash/stretch values with animation
    public func applyBreathing(_ phase: CGFloat, intensity: SquashStretch.Values) {
        // Sinusoidal breathing (0-1 phase maps to full cycle)
        let t = sin(phase * .pi * 2)

        scaleY = 1.0 + (intensity.scaleY - 1.0) * CGFloat(t)
        scaleX = 1.0 + (intensity.scaleX - 1.0) * CGFloat(t)
        offsetY = intensity.translateY * CGFloat(t)
        rotation = intensity.rotation * CGFloat(t)
    }
}

// MARK: - Spring Presets

/// SwiftUI spring animation presets
public enum SpringPreset {
    /// Snappy response with slight overshoot
    public static let snappy = Animation.spring(response: 0.25, dampingFraction: 0.7)

    /// Bouncy for celebrations
    public static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.5)

    /// Gentle for subtle movements
    public static let gentle = Animation.spring(response: 0.5, dampingFraction: 0.8)

    /// Organic feel for breathing
    public static let organic = Animation.easeInOut(duration: 0.3)
}
