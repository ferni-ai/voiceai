import SwiftUI

// MARK: - Avatar Soul
/// Superhuman emotional intelligence effects.
/// Implements the "Better Than Human" EQ capabilities:
/// - Iris Shimmer (makes avatar feel alive)
/// - Warmth Bloom (connection moments)
/// - Memory Spark (recognition flash - subliminal)
///
/// These are additive overlay effects on the avatar glow.

struct AvatarSoul: View {
    let persona: Persona
    let size: CGFloat
    let isActive: Bool

    // Continuous timer for shimmer
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Effect states (smooth transitions)
    @State private var shimmerIntensity: CGFloat = 0.5
    @State private var warmthOpacity: CGFloat = 0
    @State private var warmthScale: CGFloat = 1.0
    @State private var sparkOpacity: CGFloat = 0
    @State private var sparkScale: CGFloat = 1.0

    // Active intensity
    @State private var activeIntensity: CGFloat = 0

    var body: some View {
        ZStack {
            // Layer 1: Continuous shimmer (iris-like glow pulse)
            shimmerLayer

            // Layer 2: Warmth bloom (one-shot, triggered)
            warmthLayer

            // Layer 3: Memory spark (subliminal flash)
            sparkLayer
        }
        .frame(width: size * 1.5, height: size * 1.5)
        .onAppear {
            startContinuousAnimation()
        }
        .onChange(of: isActive) { newValue in
            withAnimation(.easeInOut(duration: 0.5)) {
                activeIntensity = newValue ? 1.0 : 0.0
            }
        }
    }

    // MARK: - Shimmer Layer

    private var shimmerLayer: some View {
        // 2-second continuous shimmer cycle
        let phase = sin(time * .pi * 2 / PixarTiming.shimmerCycle)
        let opacity = (0.4 + phase * 0.2) * Double(activeIntensity)

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        persona.glowColor.opacity(opacity),
                        persona.glowColor.opacity(opacity * 0.3),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.35,
                    endRadius: size * 0.7
                )
            )
            .blur(radius: 8)
    }

    // MARK: - Warmth Layer

    private var warmthLayer: some View {
        // Golden warmth bloom (triggered one-shot)
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(warmthOpacity * 0.6),  // Gold
                        Color(hex: 0xc4a265).opacity(warmthOpacity * 0.2),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.2,
                    endRadius: size * 0.8
                )
            )
            .scaleEffect(warmthScale)
            .blur(radius: 12)
    }

    // MARK: - Spark Layer

    private var sparkLayer: some View {
        // Memory spark (80ms subliminal flash)
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(hex: 0xc4a265).opacity(sparkOpacity * 0.9),  // Bright gold
                        Color(hex: 0xc4a265).opacity(sparkOpacity * 0.4),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: size * 0.6
                )
            )
            .scaleEffect(sparkScale)
            .blur(radius: 4)
    }

    // MARK: - Continuous Animation

    private func startContinuousAnimation() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        activeIntensity = isActive ? 1.0 : 0.0

        // 60fps timer for shimmer
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
        }
    }

    // MARK: - One-Shot Effects (Public API)

    /// Trigger warmth bloom (connection moment)
    func triggerWarmthBloom() {
        // Expand outward with fade
        withAnimation(.easeOut(duration: PixarTiming.warmthBloom * 0.4)) {
            warmthOpacity = 1.0
            warmthScale = 1.0
        }

        withAnimation(.easeOut(duration: PixarTiming.warmthBloom * 0.6).delay(PixarTiming.warmthBloom * 0.4)) {
            warmthScale = 1.6
            warmthOpacity = 0
        }

        // Reset after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + PixarTiming.warmthBloom) {
            warmthScale = 1.0
        }
    }

    /// Trigger warmth glow (sustained warmth)
    func triggerWarmthGlow() {
        withAnimation(.easeInOut(duration: 0.3)) {
            warmthOpacity = 0.7
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeOut(duration: 0.5)) {
                warmthOpacity = 0
            }
        }
    }

    /// Trigger memory spark (subliminal recognition - 80ms)
    func triggerMemorySpark() {
        // Instant flash
        sparkOpacity = 0.9
        sparkScale = 1.3

        // Fade out quickly (subliminal)
        withAnimation(.easeOut(duration: PixarTiming.microExpression)) {
            sparkOpacity = 0
            sparkScale = 1.0
        }
    }

    /// Intensify shimmer briefly
    func triggerShimmerIntensify() {
        withAnimation(.easeOut(duration: 0.2)) {
            shimmerIntensity = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeOut(duration: 0.3)) {
                shimmerIntensity = 0.5
            }
        }
    }
}

// MARK: - Soul Controller

/// Controller to trigger soul effects from outside
class SoulController: ObservableObject {
    var onWarmthBloom: (() -> Void)?
    var onWarmthGlow: (() -> Void)?
    var onMemorySpark: (() -> Void)?
    var onShimmerIntensify: (() -> Void)?

    func triggerEffect(_ effect: SoulEffect) {
        switch effect {
        case .none:
            break
        case .warmthBloom:
            onWarmthBloom?()
        case .warmthGlow:
            onWarmthGlow?()
        case .memorySpark:
            onMemorySpark?()
        case .shimmerIntensify:
            onShimmerIntensify?()
        }
    }
}

// MARK: - Stable Wrapper

struct StableAvatarSoul: View, Equatable {
    let personaId: String
    let size: CGFloat
    let isActive: Bool

    var body: some View {
        AvatarSoul(
            persona: PersonaRegistry.get(personaId),
            size: size,
            isActive: isActive
        )
    }

    static func == (lhs: StableAvatarSoul, rhs: StableAvatarSoul) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.size == rhs.size &&
        lhs.isActive == rhs.isActive
    }
}

// MARK: - Preview

#Preview("Avatar Soul - Active") {
    ZStack {
        Color(hex: 0x1a1612)

        Circle()
            .fill(Color(hex: 0x4a6741))
            .frame(width: 80, height: 80)

        AvatarSoul(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: true
        )
    }
    .frame(width: 300, height: 300)
}
