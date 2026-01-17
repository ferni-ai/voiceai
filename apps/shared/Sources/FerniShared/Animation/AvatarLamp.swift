import SwiftUI

// MARK: - Avatar Lamp
/// Pixar body language system inspired by Luxo Jr.
/// Implements squash/stretch, anticipation, and follow-through.
///
/// This is a ViewModifier that applies transforms to any view.
/// Uses continuous breathing animation with one-shot reactions layered on top.

public struct AvatarLamp: ViewModifier {
    public let isActive: Bool

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Continuous timer for breathing
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Transform state (smooth interpolation)
    @State private var scaleX: CGFloat = 1.0
    @State private var scaleY: CGFloat = 1.0
    @State private var offsetY: CGFloat = 0
    @State private var rotation: CGFloat = 0

    // One-shot animation overlay
    @State private var reactionOffset: CGPoint = .zero
    @State private var reactionScale: CGFloat = 1.0
    @State private var reactionRotation: CGFloat = 0

    // Active intensity for smooth transitions
    @State private var activeIntensity: CGFloat = 0

    public init(isActive: Bool) {
        self.isActive = isActive
    }

    public func body(content: Content) -> some View {
        content
            // Combine breathing + reaction transforms
            .scaleEffect(x: scaleX * reactionScale, y: scaleY * reactionScale)
            .offset(x: reactionOffset.x, y: offsetY + reactionOffset.y)
            .rotationEffect(.degrees(Double(rotation + reactionRotation)))
            .onAppear {
                startBreathingAnimation()
            }
            .onChange(of: isActive) { newValue in
                withAnimation(.easeInOut(duration: 0.5)) {
                    activeIntensity = newValue ? 1.0 : 0.0
                }
            }
    }

    // MARK: - Breathing Animation

    private func startBreathingAnimation() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        activeIntensity = isActive ? 1.0 : 0.0

        // Skip continuous 60fps animation when reduce motion is enabled
        guard !reduceMotion else { return }

        // 60fps continuous timer
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
            updateBreathing()
        }
    }

    private func updateBreathing() {
        // Use active breathing rate
        let cycle = isActive ? PixarTiming.breathCycleActive : PixarTiming.breathCycleIdle
        let phase = sin(time * .pi * 2 / cycle)

        // Interpolate between idle and active squash/stretch
        let intensity = isActive ? SquashStretch.active : SquashStretch.idle

        // Apply with smooth easing (no withAnimation needed - continuous)
        scaleY = 1.0 + (intensity.scaleY - 1.0) * CGFloat(phase)
        scaleX = 1.0 + (intensity.scaleX - 1.0) * CGFloat(phase)
        offsetY = intensity.translateY * CGFloat(phase)
        rotation = intensity.rotation * CGFloat(phase)
    }

    // MARK: - One-Shot Reactions

    /// Trigger a nod animation (acknowledgment)
    public func triggerNod() {
        let duration = PixarTiming.nodDuration

        // Anticipation: slight up
        withAnimation(.easeOut(duration: duration * 0.2)) {
            reactionOffset.y = -3
            reactionScale = 0.98
        }

        // Action: nod down
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.2) {
            withAnimation(SpringPreset.snappy) {
                reactionOffset.y = 4
                reactionScale = 1.02
                reactionRotation = 3
            }
        }

        // Follow-through: settle
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.6) {
            withAnimation(SpringPreset.gentle) {
                reactionOffset = .zero
                reactionScale = 1.0
                reactionRotation = 0
            }
        }
    }

    /// Trigger a curious tilt (WALL-E examining)
    public func triggerTilt(direction: TiltDirection) {
        let duration = PixarTiming.tiltDuration
        let sign: CGFloat = direction == .right ? 1 : -1

        withAnimation(SpringPreset.bouncy) {
            reactionRotation = 5 * sign
            reactionOffset.x = 3 * sign
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(SpringPreset.gentle) {
                reactionRotation = 0
                reactionOffset.x = 0
            }
        }
    }

    /// Trigger an excited bounce (Luxo Jr. hopping)
    public func triggerBounce() {
        let duration = PixarTiming.bounceDuration

        // Anticipation: squash down
        withAnimation(.easeIn(duration: duration * 0.15)) {
            reactionScale = 0.92
            reactionOffset.y = 2
        }

        // Action: stretch up
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.15) {
            withAnimation(SpringPreset.bouncy) {
                reactionScale = 1.08
                reactionOffset.y = -12
            }
        }

        // Follow-through: land and settle
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.5) {
            withAnimation(SpringPreset.snappy) {
                reactionScale = 0.96
                reactionOffset.y = 2
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.7) {
            withAnimation(SpringPreset.gentle) {
                reactionScale = 1.0
                reactionOffset.y = 0
            }
        }
    }

    /// Trigger a perk-up (attention snap)
    public func triggerPerkUp() {
        let duration = PixarTiming.perkUpDuration

        // Quick pop up
        withAnimation(SpringPreset.snappy) {
            reactionScale = 1.05
            reactionOffset.y = -5
        }

        // Settle
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(SpringPreset.gentle) {
                reactionScale = 1.0
                reactionOffset.y = 0
            }
        }
    }

    public enum TiltDirection {
        case left, right
    }
}

// MARK: - View Extension

extension View {
    /// Apply Pixar body language animations
    public func avatarLamp(isActive: Bool) -> some View {
        modifier(AvatarLamp(isActive: isActive))
    }
}

// MARK: - Lamp Controller

/// Controller to trigger one-shot lamp animations from outside
public class LampController: ObservableObject {
    public var onNod: (() -> Void)?
    public var onTilt: ((AvatarLamp.TiltDirection) -> Void)?
    public var onBounce: (() -> Void)?
    public var onPerkUp: (() -> Void)?

    public init() {}

    public func triggerAnimation(_ animation: LampAnimation) {
        switch animation {
        case .none:
            break
        case .nod:
            onNod?()
        case .tiltRight:
            onTilt?(.right)
        case .tiltLeft:
            onTilt?(.left)
        case .bounce:
            onBounce?()
        case .multiBounce:
            onBounce?()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self.onBounce?()
            }
        case .perkUp:
            onPerkUp?()
        case .shake:
            // Shake is tilt left then right quickly
            onTilt?(.left)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                self.onTilt?(.right)
            }
        }
    }
}
