import SwiftUI

// MARK: - Pixar's 12 Principles of Animation for Ferni

/**
 * LUXO JR. PRINCIPLES (from avatar-lamp.ui.ts):
 * 1. WEIGHT - Movements feel like they have mass
 * 2. ANTICIPATION - Wind-up before every action
 * 3. SQUASH & STRETCH - Deformation during movement
 * 4. FOLLOW-THROUGH - Overshoot and settle
 * 5. SECONDARY ACTION - Small movements that support the main action
 * 6. TIMING - Fast for excitement, slow for contemplation
 * 7. APPEAL - Every pose should be appealing
 */

// MARK: - Animation Timing Constants

/// Golden ratio for organic timing
let PHI: Double = 1.618033988749

/// Animation timing from design-system/tokens/animation.json
enum AnimationTiming {
    // Base durations (matching TypeScript)
    static let microDuration: Double = 0.05
    static let fastPressDuration: Double = 0.08
    static let fastDuration: Double = 0.1
    static let fastReleaseDuration: Double = 0.12
    static let normalDuration: Double = 0.2
    static let slowDuration: Double = 0.3
    static let deliberateDuration: Double = 0.5
    static let dramaticDuration: Double = 0.6
    
    // Breathing (from avatar-lamp.ui.ts)
    static let breathInhaleDuration: Double = 2.8
    static let breathExhaleDuration: Double = 2.8
    
    // Soul timings
    static let glowPulseCycle: Double = 0.610  // Fibonacci F10
    static let comfortPulseDuration: Double = 1.0  // Fibonacci F11
    static let memorySparkDuration: Double = 0.3
    static let anticipationLeadTime: Double = 0.15
}

// MARK: - Squash & Stretch Parameters

/// Parameters for squash and stretch deformation
struct SquashStretchParams {
    let squashY: CGFloat   // Vertical compression (< 1)
    let squashX: CGFloat   // Horizontal expansion (> 1)
    let stretchY: CGFloat  // Vertical extension (> 1)
    let stretchX: CGFloat  // Horizontal compression (< 1)
    let translation: CGFloat
}

/// Reaction intensity presets
enum ReactionIntensity {
    case subtle
    case normal
    case dramatic
    
    var params: SquashStretchParams {
        switch self {
        case .subtle:
            return SquashStretchParams(
                squashY: 0.95, squashX: 1.03,
                stretchY: 1.03, stretchX: 0.97,
                translation: 3
            )
        case .normal:
            return SquashStretchParams(
                squashY: 0.88, squashX: 1.08,
                stretchY: 1.1, stretchX: 0.92,
                translation: 8
            )
        case .dramatic:
            return SquashStretchParams(
                squashY: 0.82, squashX: 1.15,
                stretchY: 1.18, stretchX: 0.88,
                translation: 15
            )
        }
    }
}

// MARK: - Lamp Emotions (from avatar-lamp.ui.ts)

/// Emotions that can be expressed through body language
enum LampEmotion: String, CaseIterable {
    case neutral
    case happy
    case excited
    case curious
    case confused
    case listening
    case thinking
    case sad
    case empathetic
    case proud
    case surprised
    case laughing
    case acknowledging
    case encouraging
    case celebrating
}

// MARK: - Animation State

/// Observable state for avatar animations
class AnimationState: ObservableObject {
    // Transform state
    @Published var scaleX: CGFloat = 1.0
    @Published var scaleY: CGFloat = 1.0
    @Published var offsetX: CGFloat = 0
    @Published var offsetY: CGFloat = 0
    @Published var rotation: Double = 0
    
    // Glow state
    @Published var glowIntensity: Double = 0.4
    @Published var glowScale: CGFloat = 1.0
    @Published var glowColor: Color = Color(hex: 0x4a6741).opacity(0.4)
    
    // Pupil state
    @Published var pupilSize: CGFloat = 1.0
    @Published var pupilOffsetX: CGFloat = 0
    @Published var pupilOffsetY: CGFloat = 0
    
    // Soul effects
    @Published var shimmerIntensity: Double = 0.6
    @Published var warmthBloomActive: Bool = false
    @Published var memorySparkActive: Bool = false
    @Published var comfortPulseActive: Bool = false
    
    // Current emotion
    @Published var currentEmotion: LampEmotion = .neutral
    @Published var isBreathing: Bool = true
    @Published var isAnimating: Bool = false
    
    func reset() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            scaleX = 1.0
            scaleY = 1.0
            offsetX = 0
            offsetY = 0
            rotation = 0
            pupilSize = 1.0
            pupilOffsetX = 0
            pupilOffsetY = 0
        }
    }
}

// MARK: - Animation View Modifier

/// Apply animation state transforms to a view
struct AnimatedAvatarModifier: ViewModifier {
    @ObservedObject var state: AnimationState
    
    func body(content: Content) -> some View {
        content
            .scaleEffect(x: state.scaleX, y: state.scaleY)
            .offset(x: state.offsetX, y: state.offsetY)
            .rotationEffect(.degrees(state.rotation))
    }
}

extension View {
    func animatedAvatar(_ state: AnimationState) -> some View {
        modifier(AnimatedAvatarModifier(state: state))
    }
}

