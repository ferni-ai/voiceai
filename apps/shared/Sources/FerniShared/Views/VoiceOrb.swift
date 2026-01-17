import SwiftUI

// MARK: - Voice Orb

/// A Siri-inspired voice visualization with audio-reactive sinusoidal waves.
///
/// **CRITICAL DESIGN: This component is COMPLETELY SELF-CONTAINED.**
///
/// It does NOT depend on frequently-changing props from parent views.
/// Instead, it runs its own continuous animation that:
/// 1. Never restarts (timer-based, not animation-based)
/// 2. Generates its own smooth "audio-like" motion
/// 3. Only responds to `isActive` changes (connect/disconnect)
///
/// This prevents the parent view re-renders from causing flicker.
public struct VoiceOrb: View {
    public let persona: Persona
    public let isActive: Bool      // Only changes on connect/disconnect - NOT on listening/speaking!
    public let size: CGFloat

    // MARK: - Accessibility
    /// Respect user's reduce motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Continuous animation driver - runs FOREVER, never restarts
    @State private var time: Double = 0
    @State private var isTimerRunning = false

    // Smooth transition for isActive (prevents abrupt changes)
    @State private var activeIntensity: CGFloat = 0

    public init(persona: Persona, isActive: Bool, size: CGFloat) {
        self.persona = persona
        self.isActive = isActive
        self.size = size
    }

    public var body: some View {
        ZStack {
            // Layer 1: Ambient glow
            ambientGlow

            // Layer 2: Wave ring (the magic)
            waveRing

            // Layer 3: Core orb
            coreOrb

            // Layer 4: Initials
            initials
        }
        .frame(width: size * 2.2, height: size * 2.2)
        .onAppear {
            startContinuousAnimation()
        }
        .onChange(of: isActive) { newValue in
            // Smooth transition to active/inactive - NO ABRUPT CHANGES
            withAnimation(.easeInOut(duration: 0.5)) {
                activeIntensity = newValue ? 1.0 : 0.0
            }
        }
    }

    // MARK: - Computed Audio Level (Self-Generated)

    /// Generates smooth, organic "audio-like" motion without external input.
    /// This is the key to flicker-free animation.
    private var simulatedAudioLevel: CGFloat {
        // Multiple sine waves at different frequencies create organic motion
        let wave1 = sin(time * 2.5) * 0.3           // Slow breathing
        let wave2 = sin(time * 5.7) * 0.15          // Medium pulse
        let wave3 = sin(time * 11.3) * 0.08         // Fast shimmer

        // Combine waves (0.3 - 0.8 range when active)
        let combined = 0.5 + wave1 + wave2 + wave3
        return CGFloat(max(0.2, min(1.0, combined))) * activeIntensity
    }

    // MARK: - Ambient Glow

    private var ambientGlow: some View {
        let intensity = 0.15 + simulatedAudioLevel * 0.4

        return Circle()
            .fill(
                RadialGradient(
                    colors: [
                        persona.glowColor.opacity(intensity),
                        persona.glowColor.opacity(intensity * 0.5),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.3,
                    endRadius: size * 1.1
                )
            )
            .frame(width: size * 2.2, height: size * 2.2)
    }

    // MARK: - Wave Ring (The Magic)

    private var waveRing: some View {
        // Amplitude driven by simulated audio (0-12 pixels of wave)
        let amplitude = simulatedAudioLevel * 12

        return WavePath(
            radius: size * 0.58,
            amplitude: amplitude,
            frequency: 4,
            phase: time * 1.8  // Continuous rotation from time
        )
        .stroke(
            LinearGradient(
                colors: [
                    persona.primaryColor.opacity(0.9),
                    persona.secondaryColor.opacity(0.7)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            lineWidth: 3
        )
        .blur(radius: 1.5)
        .opacity(0.3 + activeIntensity * 0.7)
    }

    // MARK: - Core Orb

    private var coreOrb: some View {
        // Subtle scale based on simulated audio (1.0 - 1.04)
        let scale = 1.0 + simulatedAudioLevel * 0.04

        return Circle()
            .fill(
                LinearGradient(
                    colors: [persona.primaryColor, persona.secondaryColor],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .shadow(color: persona.glowColor.opacity(0.5), radius: 10)
            .scaleEffect(scale)
    }

    // MARK: - Initials

    private var initials: some View {
        Text(persona.initials)
            .font(.system(size: size * 0.38, weight: .heavy, design: .rounded))
            .foregroundColor(.white)
            .shadow(color: .black.opacity(0.3), radius: 2, y: 2)
    }

    // MARK: - Continuous Animation

    private func startContinuousAnimation() {
        guard !isTimerRunning else { return }
        isTimerRunning = true

        // Set initial intensity based on current state
        activeIntensity = isActive ? 1.0 : 0.0

        // Skip continuous 60fps animation when reduce motion is enabled
        guard !reduceMotion else { return }

        // Timer runs at 60fps, NEVER restarts
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            // This closure captures nothing that would cause restart
            time += 1.0 / 60.0
        }
    }
}

// MARK: - Wave Path (Sinusoidal Ring)

/// A shape that draws a sinusoidal ring - the core of the smooth animation.
/// The wave flows continuously as phase changes.
public struct WavePath: Shape {
    public var radius: CGFloat
    public var amplitude: CGFloat
    public var frequency: Double
    public var phase: Double

    public init(radius: CGFloat, amplitude: CGFloat, frequency: Double, phase: Double) {
        self.radius = radius
        self.amplitude = amplitude
        self.frequency = frequency
        self.phase = phase
    }

    // Enable smooth animation of all properties
    public var animatableData: AnimatablePair<CGFloat, AnimatablePair<Double, Double>> {
        get {
            AnimatablePair(amplitude, AnimatablePair(frequency, phase))
        }
        set {
            amplitude = newValue.first
            frequency = newValue.second.first
            phase = newValue.second.second
        }
    }

    public func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)

        let steps = 360
        for i in 0...steps {
            let angle = Double(i) * .pi / 180.0

            // Sinusoidal wave: r = radius + sin(angle * frequency + phase) * amplitude
            let waveOffset = sin(angle * frequency + phase) * Double(amplitude)
            let r = Double(radius) + waveOffset

            let x = center.x + CGFloat(r * cos(angle))
            let y = center.y + CGFloat(r * sin(angle))

            if i == 0 {
                path.move(to: CGPoint(x: x, y: y))
            } else {
                path.addLine(to: CGPoint(x: x, y: y))
            }
        }
        path.closeSubpath()

        return path
    }
}

// MARK: - Equatable Wrapper (Prevents Unnecessary Rebuilds)

/// Wraps VoiceOrb to prevent parent re-renders from causing reconstruction.
/// Only rebuilds when isActive actually changes.
public struct StableVoiceOrb: View, Equatable {
    public let personaId: String
    public let isActive: Bool
    public let size: CGFloat

    public init(personaId: String, isActive: Bool, size: CGFloat) {
        self.personaId = personaId
        self.isActive = isActive
        self.size = size
    }

    public var body: some View {
        VoiceOrb(
            persona: PersonaRegistry.get(personaId),
            isActive: isActive,
            size: size
        )
    }

    public static func == (lhs: StableVoiceOrb, rhs: StableVoiceOrb) -> Bool {
        // Only re-render when these actually change
        lhs.personaId == rhs.personaId &&
        lhs.isActive == rhs.isActive &&
        lhs.size == rhs.size
    }
}
