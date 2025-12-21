import SwiftUI

// MARK: - Glow Halo
/// Three-ring warm halo system behind the avatar.
/// Uses continuous timer animation - NEVER restarts on state changes.
///
/// Rings:
/// 1. Outer Glow - Radial gradient, 1.5x avatar size, 8s breathing
/// 2. Inner Ring - Circle stroke, 1.2x size, 5s breathing
/// 3. Pulse Ring - Expanding ripple on energy spikes

struct GlowHalo: View {
    let persona: Persona
    let size: CGFloat
    let isActive: Bool

    // Continuous animation - NEVER restarts
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Smooth transitions for isActive
    @State private var activeIntensity: CGFloat = 0

    var body: some View {
        ZStack {
            // Layer 1: Outer ambient glow (slowest breathing)
            outerGlow

            // Layer 2: Inner presence ring (synced with avatar)
            innerRing

            // Layer 3: Active pulse ring (expands when energy is high)
            pulseRing
        }
        .frame(width: size * 2.2, height: size * 2.2)
        .onAppear {
            startContinuousAnimation()
        }
        .onChange(of: isActive) { newValue in
            withAnimation(.easeInOut(duration: 0.5)) {
                activeIntensity = newValue ? 1.0 : 0.0
            }
        }
    }

    // MARK: - Outer Glow

    private var outerGlow: some View {
        // 8-second slow breathing cycle
        let breathPhase = sin(time * .pi * 2 / PixarTiming.haloOuterCycle)
        let scale = 1.0 + breathPhase * 0.05  // 1.0 - 1.05 range
        let opacity = (0.15 + breathPhase * 0.05) * Double(activeIntensity)

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        persona.glowColor.opacity(opacity),
                        persona.glowColor.opacity(opacity * 0.5),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.4,
                    endRadius: size * 1.1
                )
            )
            .frame(width: size * 1.5, height: size * 1.5)
            .scaleEffect(scale)
    }

    // MARK: - Inner Ring

    private var innerRing: some View {
        // 5-second breathing synced with avatar
        let breathPhase = sin(time * .pi * 2 / PixarTiming.haloInnerCycle)
        let scale = 1.0 + breathPhase * 0.03  // 1.0 - 1.03 range
        let baseOpacity = isActive ? 0.35 : 0.15
        let opacity = baseOpacity + breathPhase * 0.1

        return Circle()
            .stroke(
                persona.glowColor.opacity(opacity * Double(max(0.3, activeIntensity))),
                lineWidth: 2
            )
            .frame(width: size * 1.2, height: size * 1.2)
            .scaleEffect(scale)
    }

    // MARK: - Pulse Ring

    private var pulseRing: some View {
        // Expanding pulse that loops when active
        let pulsePhase = (time / PixarTiming.haloPulseExpand).truncatingRemainder(dividingBy: 1.0)
        let scale = 1.1 + pulsePhase * 0.7  // 1.1 - 1.8 expansion
        let opacity = (1.0 - pulsePhase) * 0.5 * Double(activeIntensity)

        return Circle()
            .stroke(
                persona.glowColor.opacity(opacity),
                lineWidth: 3
            )
            .frame(width: size * 1.0, height: size * 1.0)
            .scaleEffect(scale)
            .opacity(activeIntensity > 0.5 ? 1 : 0)  // Only show when active
    }

    // MARK: - Continuous Animation

    private func startContinuousAnimation() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        // Set initial intensity
        activeIntensity = isActive ? 1.0 : 0.0

        // 60fps timer that NEVER restarts
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
        }
    }
}

// MARK: - Stable Wrapper

/// Equatable wrapper to prevent parent re-renders from destroying animation
struct StableGlowHalo: View, Equatable {
    let personaId: String
    let size: CGFloat
    let isActive: Bool

    var body: some View {
        GlowHalo(
            persona: PersonaRegistry.get(personaId),
            size: size,
            isActive: isActive
        )
    }

    static func == (lhs: StableGlowHalo, rhs: StableGlowHalo) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.size == rhs.size &&
        lhs.isActive == rhs.isActive
    }
}

// MARK: - Preview

#Preview("Glow Halo - Active") {
    ZStack {
        Color(hex: 0x1a1612)

        GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: true
        )
    }
    .frame(width: 300, height: 300)
}

#Preview("Glow Halo - Inactive") {
    ZStack {
        Color(hex: 0x1a1612)

        GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: false
        )
    }
    .frame(width: 300, height: 300)
}
