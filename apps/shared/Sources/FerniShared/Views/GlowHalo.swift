import SwiftUI

// MARK: - Glow Halo
/// Three-ring warm halo system behind the avatar.
/// Uses continuous timer animation - NEVER restarts on state changes.
///
/// Rings:
/// 1. Outer Glow - Radial gradient, 1.5x avatar size, 8s breathing
/// 2. Inner Ring - Circle stroke, 1.2x size, 5s breathing
/// 3. Heartbeat Ring - lub-dub pattern (1.8s cycle)
/// 4. Pulse Ring - Expanding ripple on energy spikes

public struct GlowHalo: View {
    public let persona: Persona
    public let size: CGFloat
    public let isActive: Bool

    // Continuous animation - NEVER restarts
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Smooth transitions for isActive
    @State private var activeIntensity: CGFloat = 0

    public init(persona: Persona, size: CGFloat, isActive: Bool) {
        self.persona = persona
        self.size = size
        self.isActive = isActive
    }

    public var body: some View {
        ZStack {
            // Layer 1: Outer ambient glow (slowest breathing)
            outerGlow

            // Layer 2: Heartbeat ring (lub-dub pattern)
            heartbeatRing

            // Layer 3: Inner presence ring (synced with avatar)
            innerRing

            // Layer 4: Active pulse ring (expands when energy is high)
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

    // MARK: - Heartbeat Ring

    /// The signature "lub-dub" heartbeat pattern - makes the avatar feel alive!
    /// Pattern: rest → lub (beat 1) → settle → dub (beat 2) → rest
    private var heartbeatRing: some View {
        // 1.8 second heartbeat cycle (like a real resting heart rate ~66 BPM)
        let cycleTime = 1.8
        let phase = (time.truncatingRemainder(dividingBy: cycleTime)) / cycleTime

        // Create lub-dub pattern with precise timing
        let scale: CGFloat
        let opacity: Double

        if phase < 0.1 {
            // Rest → Lub (first beat)
            let t = phase / 0.1
            scale = 1.0 + t * 0.12  // 1.0 → 1.12
            opacity = 0.75 + t * 0.25  // 0.75 → 1.0
        } else if phase < 0.2 {
            // Lub → Quick settle
            let t = (phase - 0.1) / 0.1
            scale = 1.12 - t * 0.10  // 1.12 → 1.02
            opacity = 1.0 - t * 0.1  // 1.0 → 0.9
        } else if phase < 0.3 {
            // Settle → Dub (second beat)
            let t = (phase - 0.2) / 0.1
            scale = 1.02 + t * 0.06  // 1.02 → 1.08
            opacity = 0.9 + t * 0.1  // 0.9 → 1.0
        } else if phase < 0.5 {
            // Dub → Return to rest
            let t = (phase - 0.3) / 0.2
            scale = 1.08 - t * 0.08  // 1.08 → 1.0
            opacity = 1.0 - t * 0.25  // 1.0 → 0.75
        } else {
            // Rest (longer pause between heartbeats)
            scale = 1.0
            opacity = 0.75
        }

        // More intense when connected
        let intensityMod = isActive ? 1.0 : 0.5

        return Circle()
            .stroke(
                persona.glowColor.opacity(opacity * intensityMod * 0.6),
                lineWidth: 2.5
            )
            .frame(width: size * 1.35, height: size * 1.35)
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
public struct StableGlowHalo: View, Equatable {
    public let personaId: String
    public let size: CGFloat
    public let isActive: Bool

    public init(personaId: String, size: CGFloat, isActive: Bool) {
        self.personaId = personaId
        self.size = size
        self.isActive = isActive
    }

    public var body: some View {
        GlowHalo(
            persona: PersonaRegistry.get(personaId),
            size: size,
            isActive: isActive
        )
    }

    public static func == (lhs: StableGlowHalo, rhs: StableGlowHalo) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.size == rhs.size &&
        lhs.isActive == rhs.isActive
    }
}
