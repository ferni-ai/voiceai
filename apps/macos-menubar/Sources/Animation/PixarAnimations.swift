import SwiftUI
import FerniShared

// MARK: - Pixar Animation System
// Timing constants and shared state for Luxo Jr. style animations.
// Based on design-system/tokens/animation.json

// MARK: - Timing Constants

/// Pixar-inspired timing constants from design tokens
enum PixarTiming {
    // Breathing cycles (Golden Ratio influenced)
    static let breathCycleIdle: Double = 6.0        // Slow, contemplative
    static let breathCycleActive: Double = 5.0     // Normal connection
    static let breathCycleSpeaking: Double = 4.5   // Slightly faster when engaged

    // Reaction timings
    static let nodDuration: Double = 0.28          // Quick acknowledgment
    static let tiltDuration: Double = 0.4          // Curious lean
    static let bounceDuration: Double = 0.6        // Full bounce with squash/stretch
    static let perkUpDuration: Double = 0.3        // "Aha!" moment

    // Subliminal micro-expressions (Better Than Human)
    static let microExpression: Double = 0.08      // 80ms - below conscious perception
    static let memorySpark: Double = 0.3           // Recognition flash
    static let warmthBloom: Double = 0.6           // Connection moment

    // Glow timings
    static let shimmerCycle: Double = 2.0          // Iris shimmer (makes it feel alive)
    static let glowPulseCycle: Double = 0.61       // Fibonacci F10 (610ms)

    // Halo breathing
    static let haloOuterCycle: Double = 8.0        // Slow ambient
    static let haloInnerCycle: Double = 5.0        // Synced with avatar
    static let haloPulseExpand: Double = 1.2       // Expansion time
}

// MARK: - Squash & Stretch Parameters

/// Squash and stretch values for different states
enum SquashStretch {
    struct Values {
        let scaleY: CGFloat
        let scaleX: CGFloat
        let translateY: CGFloat
        let rotation: CGFloat
    }

    static let idle = Values(
        scaleY: 1.012,
        scaleX: 0.994,
        translateY: -1.5,
        rotation: 0.3
    )

    static let active = Values(
        scaleY: 1.018,
        scaleX: 0.991,
        translateY: -2,
        rotation: 0.5
    )

    static let speaking = Values(
        scaleY: 1.025,
        scaleX: 0.988,
        translateY: -3,
        rotation: 0.8
    )

    static let thinking = Values(
        scaleY: 1.015,
        scaleX: 0.993,
        translateY: -1.8,
        rotation: -0.4
    )

    // Lamp-style (more subtle for Luxo Jr. aesthetic)
    static let lampIdle = Values(
        scaleY: 1.008,
        scaleX: 0.996,
        translateY: -1.0,
        rotation: 0.2
    )

    static let lampActive = Values(
        scaleY: 1.014,
        scaleX: 0.993,
        translateY: -1.8,
        rotation: 0.4
    )
}

// MARK: - Emotion Hints

/// Optional emotion hints from backend for one-shot reactions
enum EmotionHint: String, Equatable {
    case neutral
    case happy
    case excited
    case curious
    case thinking
    case empathetic
    case encouraging
    case calm

    /// Lamp animation to trigger for this emotion
    var lampAnimation: LampAnimation {
        switch self {
        case .neutral: return .none
        case .happy: return .bounce
        case .excited: return .multiBounce
        case .curious: return .tiltRight
        case .thinking: return .tiltLeft
        case .empathetic: return .nod
        case .encouraging: return .perkUp
        case .calm: return .none
        }
    }

    /// Soul effect to trigger
    var soulEffect: SoulEffect {
        switch self {
        case .neutral: return .none
        case .happy: return .warmthBloom
        case .excited: return .memorySpark
        case .curious: return .shimmerIntensify
        case .thinking: return .none
        case .empathetic: return .warmthGlow
        case .encouraging: return .warmthBloom
        case .calm: return .none
        }
    }

    /// Convert to FerniShared EmotionHint for cross-module compatibility
    var toShared: FerniShared.EmotionHint {
        switch self {
        case .neutral: return .neutral
        case .happy: return .happy
        case .excited: return .excited
        case .curious: return .curious
        case .thinking: return .thinking
        case .empathetic: return .empathetic
        case .encouraging: return .encouraging
        case .calm: return .calm
        }
    }
}

// MARK: - Lamp Animations

/// One-shot body language animations
enum LampAnimation {
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
enum SoulEffect {
    case none
    case warmthBloom
    case warmthGlow
    case memorySpark
    case shimmerIntensify
}

// MARK: - Animation State

/// Observable state that drives all Pixar animations.
/// Uses smooth parameter changes instead of discrete state switches.
class PixarAnimationState: ObservableObject {
    // Transform state (Lamp)
    @Published var scaleX: CGFloat = 1.0
    @Published var scaleY: CGFloat = 1.0
    @Published var offsetX: CGFloat = 0
    @Published var offsetY: CGFloat = 0
    @Published var rotation: CGFloat = 0

    // Glow state (Soul)
    @Published var glowIntensity: CGFloat = 0.6
    @Published var glowScale: CGFloat = 1.0
    @Published var shimmerPhase: CGFloat = 0
    @Published var warmthOpacity: CGFloat = 0

    // Halo state
    @Published var haloOpacity: CGFloat = 0.6
    @Published var haloPulseScale: CGFloat = 1.0
    @Published var haloPulseOpacity: CGFloat = 0

    // Breathing
    @Published var breathPhase: CGFloat = 0  // 0-1 cycle

    // Active state
    @Published var isActive: Bool = false

    /// Apply squash/stretch values with animation
    func applyBreathing(_ phase: CGFloat, intensity: SquashStretch.Values) {
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
enum SpringPreset {
    /// Snappy response with slight overshoot
    static let snappy = Animation.spring(response: 0.25, dampingFraction: 0.7)

    /// Bouncy for celebrations
    static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.5)

    /// Gentle for subtle movements
    static let gentle = Animation.spring(response: 0.5, dampingFraction: 0.8)

    /// Organic feel for breathing
    static let organic = Animation.easeInOut(duration: 0.3)
}
