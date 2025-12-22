import SwiftUI
import FerniShared

// MARK: - Connecting View
/// Magical full-screen connecting experience using the 3-stone Zen iconography.
/// Stones breathe, float, and slowly converge as connection establishes.
/// Particles of light orbit and gather, building anticipation.

struct ConnectingView: View {
    let persona: Persona

    // Animation timing
    @State private var time: Double = 0
    @State private var convergence: CGFloat = 0  // 0 = spread out, 1 = converged
    @State private var glowIntensity: CGFloat = 0

    // Stone positions (will animate)
    @State private var stone1Offset: CGPoint = .zero
    @State private var stone2Offset: CGPoint = .zero
    @State private var stone3Offset: CGPoint = .zero

    // Particle system
    @State private var particles: [Particle] = []

    private let stoneSpread: CGFloat = 80  // Initial spread distance

    var body: some View {
        ZStack {
            // Deep black background
            Color.black.ignoresSafeArea()

            // Ambient glow behind everything
            ambientGlow

            // Orbiting particles
            ForEach(particles) { particle in
                ParticleView(particle: particle, time: time, persona: persona)
            }

            // Central convergence glow
            convergenceGlow

            // The three stones
            ZStack {
                // Stone 1 (outer, largest) - top
                StoneView(
                    size: 48,
                    color: persona.primaryColor,
                    glowColor: persona.glowColor,
                    breathPhase: time,
                    intensity: 0.6 + glowIntensity * 0.4
                )
                .offset(x: stone1Offset.x, y: stone1Offset.y)

                // Stone 2 (middle) - bottom left
                StoneView(
                    size: 36,
                    color: persona.primaryColor.opacity(0.85),
                    glowColor: persona.glowColor,
                    breathPhase: time + 0.3,
                    intensity: 0.5 + glowIntensity * 0.5
                )
                .offset(x: stone2Offset.x, y: stone2Offset.y)

                // Stone 3 (inner, smallest) - bottom right
                StoneView(
                    size: 24,
                    color: persona.primaryColor.opacity(0.7),
                    glowColor: persona.glowColor,
                    breathPhase: time + 0.6,
                    intensity: 0.4 + glowIntensity * 0.6
                )
                .offset(x: stone3Offset.x, y: stone3Offset.y)
            }

            // Ripple rings expanding outward
            rippleRings

            // Subtle status text at bottom
            VStack {
                Spacer()
                statusText
                    .padding(.bottom, 80)
            }
        }
        .onAppear {
            startAnimations()
            generateParticles()
        }
    }

    // MARK: - Status Text

    private var statusText: some View {
        let dotCount = Int(time * 2) % 4

        return HStack(spacing: 4) {
            Text("Connecting")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(.white.opacity(0.6))

            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.white.opacity(index < dotCount ? 0.6 : 0.2))
                        .frame(width: 4, height: 4)
                }
            }
        }
    }

    // MARK: - Ambient Glow

    private var ambientGlow: some View {
        let pulse = sin(time * 1.5) * 0.15 + 0.85

        return RadialGradient(
            colors: [
                persona.glowColor.opacity(0.15 * pulse),
                persona.glowColor.opacity(0.05 * pulse),
                Color.clear
            ],
            center: .center,
            startRadius: 20,
            endRadius: 300
        )
    }

    // MARK: - Convergence Glow

    private var convergenceGlow: some View {
        let bloomSize: CGFloat = 60 + convergence * 100
        let opacity = convergence * 0.6

        return ZStack {
            // Inner bright core
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(opacity * 0.8),
                            persona.glowColor.opacity(opacity * 0.5),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: bloomSize * 0.5
                    )
                )
                .frame(width: bloomSize, height: bloomSize)
                .blur(radius: 10)

            // Outer warm glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.glowColor.opacity(opacity * 0.4),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: bloomSize * 0.3,
                        endRadius: bloomSize
                    )
                )
                .frame(width: bloomSize * 2, height: bloomSize * 2)
                .blur(radius: 20)
        }
    }

    // MARK: - Ripple Rings

    private var rippleRings: some View {
        let ringCount = 3

        return ZStack {
            ForEach(0..<ringCount, id: \.self) { index in
                let phase = (time / 3.0 + Double(index) / Double(ringCount)).truncatingRemainder(dividingBy: 1.0)
                let scale = 0.5 + phase * 2.0
                let opacity = (1.0 - phase) * 0.3 * Double(glowIntensity)

                Circle()
                    .stroke(persona.glowColor.opacity(opacity), lineWidth: 1.5)
                    .frame(width: 100, height: 100)
                    .scaleEffect(scale)
            }
        }
    }

    // MARK: - Animations

    private func startAnimations() {
        // Set initial stone positions (triangle formation)
        stone1Offset = CGPoint(x: 0, y: -stoneSpread)
        stone2Offset = CGPoint(x: -stoneSpread * 0.866, y: stoneSpread * 0.5)
        stone3Offset = CGPoint(x: stoneSpread * 0.866, y: stoneSpread * 0.5)

        // 60fps animation timer
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            time += 1.0 / 60.0
            updateStonePositions()
        }

        // Convergence animation (stones come together over 3 seconds)
        withAnimation(.easeInOut(duration: 3.0)) {
            convergence = 1.0
        }

        // Glow intensity builds up
        withAnimation(.easeIn(duration: 2.0).delay(0.5)) {
            glowIntensity = 1.0
        }
    }

    private func updateStonePositions() {
        // Floating motion (gentle oscillation)
        let float1 = sin(time * 1.2) * 8
        let float2 = sin(time * 1.5 + 1) * 6
        let float3 = sin(time * 1.8 + 2) * 5

        // Convergence factor (1 = original position, 0 = center)
        let spread = 1.0 - convergence

        // Stone 1: top
        stone1Offset = CGPoint(
            x: sin(time * 0.8) * 5 * Double(spread),
            y: -stoneSpread * spread + float1
        )

        // Stone 2: bottom left
        stone2Offset = CGPoint(
            x: -stoneSpread * 0.866 * spread + cos(time * 0.9) * 4 * Double(spread),
            y: stoneSpread * 0.5 * spread + float2
        )

        // Stone 3: bottom right
        stone3Offset = CGPoint(
            x: stoneSpread * 0.866 * spread + sin(time * 1.1) * 4 * Double(spread),
            y: stoneSpread * 0.5 * spread + float3
        )
    }

    private func generateParticles() {
        particles = (0..<20).map { index in
            Particle(
                id: index,
                orbitRadius: CGFloat.random(in: 100...200),
                orbitSpeed: Double.random(in: 0.3...0.8),
                startAngle: Double.random(in: 0...(.pi * 2)),
                size: CGFloat.random(in: 2...6),
                opacity: Double.random(in: 0.3...0.8)
            )
        }
    }
}

// MARK: - Stone View

struct StoneView: View {
    let size: CGFloat
    let color: Color
    let glowColor: Color
    let breathPhase: Double
    let intensity: CGFloat

    var body: some View {
        let breath = sin(breathPhase * .pi * 2 / 2.5)  // 2.5s breathing cycle
        let scale = 1.0 + breath * 0.08

        ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            glowColor.opacity(0.5 * Double(intensity)),
                            glowColor.opacity(0.2 * Double(intensity)),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: size * 0.3,
                        endRadius: size * 1.2
                    )
                )
                .frame(width: size * 2, height: size * 2)
                .blur(radius: 8)

            // Main stone body
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            color.opacity(0.95),
                            color.opacity(0.7)
                        ],
                        center: UnitPoint(x: 0.35, y: 0.35),
                        startRadius: 0,
                        endRadius: size * 0.6
                    )
                )
                .frame(width: size, height: size)
                .shadow(color: glowColor.opacity(0.6), radius: 10)

            // Highlight
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.6),
                            Color.clear
                        ],
                        center: UnitPoint(x: 0.3, y: 0.3),
                        startRadius: 0,
                        endRadius: size * 0.3
                    )
                )
                .frame(width: size * 0.5, height: size * 0.5)
                .offset(x: -size * 0.15, y: -size * 0.15)
        }
        .scaleEffect(scale)
    }
}

// MARK: - Particle

struct Particle: Identifiable {
    let id: Int
    let orbitRadius: CGFloat
    let orbitSpeed: Double
    let startAngle: Double
    let size: CGFloat
    let opacity: Double
}

struct ParticleView: View {
    let particle: Particle
    let time: Double
    let persona: Persona

    var body: some View {
        let angle = particle.startAngle + time * particle.orbitSpeed
        let x = cos(angle) * particle.orbitRadius
        let y = sin(angle) * particle.orbitRadius * 0.6  // Elliptical orbit

        // Particles fade as they pass behind
        let depthFade = (sin(angle) + 1) / 2 * 0.5 + 0.5

        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color.white.opacity(particle.opacity * depthFade),
                        persona.glowColor.opacity(particle.opacity * 0.5 * depthFade),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: particle.size
                )
            )
            .frame(width: particle.size * 3, height: particle.size * 3)
            .offset(x: x, y: y)
            .blur(radius: 1)
    }
}

// MARK: - Preview

#Preview {
    ConnectingView(persona: PersonaRegistry.get("ferni"))
}
