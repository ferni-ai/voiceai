import SwiftUI

// MARK: - Celebration Particles
/// Pixar-quality celebration effects for milestone moments.
/// Creates magical confetti, sparkles, and fireworks that make achievements FEEL special.
///
/// Usage:
/// ```swift
/// CelebrationOverlay(type: .confetti, isActive: $showCelebration)
/// CelebrationOverlay(type: .fireworks, isActive: $showCelebration)
/// CelebrationOverlay(type: .sparkles, isActive: $showCelebration)
/// ```

// MARK: - Celebration Types

public enum CelebrationType {
    case confetti       // Colorful falling confetti
    case fireworks      // Bursting fireworks
    case sparkles       // Gentle sparkle shower
    case hearts         // Floating hearts (for connection moments)
    case stars          // Achievement stars
    case milestone      // Combined epic celebration
}

// MARK: - Celebration Overlay

public struct CelebrationOverlay: View {
    let type: CelebrationType
    @Binding var isActive: Bool
    var personaColor: Color = Color(hexString: "4a6741")
    var duration: TimeInterval = 3.0

    @State private var particles: [CelebrationParticle] = []
    @State private var animationPhase: CGFloat = 0

    public init(
        type: CelebrationType,
        isActive: Binding<Bool>,
        personaColor: Color = Color(hexString: "4a6741"),
        duration: TimeInterval = 3.0
    ) {
        self.type = type
        self._isActive = isActive
        self.personaColor = personaColor
        self.duration = duration
    }

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(particles) { particle in
                    ParticleView(particle: particle, animationPhase: animationPhase)
                }
            }
            .onChange(of: isActive) { active in
                if active {
                    startCelebration(in: geometry.size)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func startCelebration(in size: CGSize) {
        particles = generateParticles(for: type, in: size)

        // Animate
        withAnimation(.linear(duration: duration)) {
            animationPhase = 1.0
        }

        // Clean up
        DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.5) {
            particles = []
            animationPhase = 0
            isActive = false
        }
    }

    private func generateParticles(for type: CelebrationType, in size: CGSize) -> [CelebrationParticle] {
        switch type {
        case .confetti:
            return generateConfetti(count: 60, in: size)
        case .fireworks:
            return generateFireworks(bursts: 5, in: size)
        case .sparkles:
            return generateSparkles(count: 40, in: size)
        case .hearts:
            return generateHearts(count: 20, in: size)
        case .stars:
            return generateStars(count: 30, in: size)
        case .milestone:
            // Epic combination
            return generateConfetti(count: 40, in: size) +
                   generateSparkles(count: 30, in: size) +
                   generateStars(count: 20, in: size)
        }
    }

    // MARK: - Particle Generators

    private func generateConfetti(count: Int, in size: CGSize) -> [CelebrationParticle] {
        let colors: [Color] = [
            personaColor,
            personaColor.opacity(0.7),
            Color(hexString: "c4a265"),  // Gold
            .white,
            Color(hexString: "7a9a7a"),  // Soft green
            Color(hexString: "d4a574")   // Amber
        ]

        return (0..<count).map { i in
            CelebrationParticle(
                id: UUID(),
                shape: .confetti,
                color: colors.randomElement()!,
                startPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: -20
                ),
                endPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: size.height + 50
                ),
                rotation: CGFloat.random(in: 0...360),
                rotationSpeed: CGFloat.random(in: 180...720),
                scale: CGFloat.random(in: 0.5...1.2),
                delay: Double(i) * 0.02,
                wobbleAmplitude: CGFloat.random(in: 20...60)
            )
        }
    }

    private func generateFireworks(bursts: Int, in size: CGSize) -> [CelebrationParticle] {
        var particles: [CelebrationParticle] = []

        for burst in 0..<bursts {
            let center = CGPoint(
                x: CGFloat.random(in: size.width * 0.2...size.width * 0.8),
                y: CGFloat.random(in: size.height * 0.2...size.height * 0.5)
            )

            let burstColor = [personaColor, Color(hexString: "c4a265"), .white].randomElement()!
            let particleCount = Int.random(in: 12...20)

            for i in 0..<particleCount {
                let angle = (CGFloat(i) / CGFloat(particleCount)) * 2 * .pi
                let distance = CGFloat.random(in: 60...120)

                particles.append(CelebrationParticle(
                    id: UUID(),
                    shape: .spark,
                    color: burstColor,
                    startPosition: center,
                    endPosition: CGPoint(
                        x: center.x + cos(angle) * distance,
                        y: center.y + sin(angle) * distance
                    ),
                    rotation: 0,
                    rotationSpeed: 0,
                    scale: CGFloat.random(in: 0.3...0.8),
                    delay: Double(burst) * 0.3,
                    wobbleAmplitude: 0,
                    fadeOut: true
                ))
            }
        }

        return particles
    }

    private func generateSparkles(count: Int, in size: CGSize) -> [CelebrationParticle] {
        return (0..<count).map { i in
            let startY = CGFloat.random(in: -50...size.height * 0.3)

            return CelebrationParticle(
                id: UUID(),
                shape: .sparkle,
                color: [.white, Color(hexString: "c4a265"), personaColor.opacity(0.8)].randomElement()!,
                startPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: startY
                ),
                endPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: startY + CGFloat.random(in: 100...300)
                ),
                rotation: 0,
                rotationSpeed: CGFloat.random(in: -180...180),
                scale: CGFloat.random(in: 0.3...1.0),
                delay: Double(i) * 0.03,
                wobbleAmplitude: CGFloat.random(in: 10...30),
                twinkle: true
            )
        }
    }

    private func generateHearts(count: Int, in size: CGSize) -> [CelebrationParticle] {
        return (0..<count).map { i in
            CelebrationParticle(
                id: UUID(),
                shape: .heart,
                color: [personaColor, Color(hexString: "c44b4b").opacity(0.8), .pink].randomElement()!,
                startPosition: CGPoint(
                    x: CGFloat.random(in: size.width * 0.2...size.width * 0.8),
                    y: size.height + 20
                ),
                endPosition: CGPoint(
                    x: CGFloat.random(in: size.width * 0.1...size.width * 0.9),
                    y: -50
                ),
                rotation: CGFloat.random(in: -15...15),
                rotationSpeed: CGFloat.random(in: -30...30),
                scale: CGFloat.random(in: 0.4...1.0),
                delay: Double(i) * 0.1,
                wobbleAmplitude: CGFloat.random(in: 15...40)
            )
        }
    }

    private func generateStars(count: Int, in size: CGSize) -> [CelebrationParticle] {
        return (0..<count).map { i in
            CelebrationParticle(
                id: UUID(),
                shape: .star,
                color: [Color(hexString: "c4a265"), .white, .yellow].randomElement()!,
                startPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: CGFloat.random(in: 0...size.height)
                ),
                endPosition: CGPoint(
                    x: CGFloat.random(in: 0...size.width),
                    y: CGFloat.random(in: 0...size.height)
                ),
                rotation: 0,
                rotationSpeed: CGFloat.random(in: 60...180),
                scale: 0,
                targetScale: CGFloat.random(in: 0.5...1.2),
                delay: Double(i) * 0.05,
                wobbleAmplitude: 0,
                popIn: true
            )
        }
    }
}

// MARK: - Particle Model

struct CelebrationParticle: Identifiable {
    let id: UUID
    let shape: ParticleShape
    let color: Color
    let startPosition: CGPoint
    let endPosition: CGPoint
    let rotation: CGFloat
    let rotationSpeed: CGFloat
    let scale: CGFloat
    var targetScale: CGFloat?
    let delay: TimeInterval
    let wobbleAmplitude: CGFloat
    var fadeOut: Bool = false
    var twinkle: Bool = false
    var popIn: Bool = false

    enum ParticleShape {
        case confetti
        case spark
        case sparkle
        case heart
        case star
    }
}

// MARK: - Particle View

private struct ParticleView: View {
    let particle: CelebrationParticle
    let animationPhase: CGFloat

    var body: some View {
        particleView
            .frame(width: shapeSize.width, height: shapeSize.height)
            .scaleEffect(currentScale)
            .rotationEffect(.degrees(currentRotation))
            .position(currentPosition)
            .opacity(currentOpacity)
    }

    @ViewBuilder
    private var particleView: some View {
        switch particle.shape {
        case .confetti:
            RoundedRectangle(cornerRadius: 2)
                .fill(particle.color)
        case .spark:
            Circle()
                .fill(particle.color)
        case .sparkle:
            DiamondShape()
                .fill(particle.color)
        case .heart:
            HeartShape()
                .fill(particle.color)
        case .star:
            StarShape(points: 5)
                .fill(particle.color)
        }
    }

    private var shapeSize: CGSize {
        switch particle.shape {
        case .confetti:
            return CGSize(width: 8, height: 12)
        case .spark:
            return CGSize(width: 6, height: 6)
        case .sparkle:
            return CGSize(width: 10, height: 10)
        case .heart:
            return CGSize(width: 16, height: 16)
        case .star:
            return CGSize(width: 14, height: 14)
        }
    }

    private var effectivePhase: CGFloat {
        let adjustedPhase = max(0, animationPhase - particle.delay)
        return min(1, adjustedPhase / (1 - particle.delay))
    }

    private var currentPosition: CGPoint {
        let wobble = sin(effectivePhase * .pi * 4) * particle.wobbleAmplitude

        return CGPoint(
            x: particle.startPosition.x + (particle.endPosition.x - particle.startPosition.x) * effectivePhase + wobble,
            y: particle.startPosition.y + (particle.endPosition.y - particle.startPosition.y) * effectivePhase
        )
    }

    private var currentRotation: Double {
        Double(particle.rotation + particle.rotationSpeed * effectivePhase)
    }

    private var currentScale: CGFloat {
        if particle.popIn {
            let targetScale = particle.targetScale ?? 1.0
            if effectivePhase < 0.3 {
                // Pop in
                return targetScale * (effectivePhase / 0.3) * 1.2
            } else if effectivePhase < 0.4 {
                // Settle
                return targetScale * 1.2 * (1 - (effectivePhase - 0.3) / 0.1 * 0.2)
            } else {
                // Hold then fade
                return targetScale
            }
        }

        return particle.scale * (particle.twinkle ? (0.5 + sin(effectivePhase * .pi * 6) * 0.5) : 1.0)
    }

    private var currentOpacity: Double {
        if effectivePhase == 0 { return 0 }

        if particle.fadeOut {
            return 1.0 - effectivePhase
        }

        if particle.popIn {
            if effectivePhase > 0.7 {
                return 1.0 - (effectivePhase - 0.7) / 0.3
            }
        }

        // Fade in at start, fade out at end
        if effectivePhase < 0.1 {
            return effectivePhase / 0.1
        } else if effectivePhase > 0.8 {
            return (1.0 - effectivePhase) / 0.2
        }

        return 1.0
    }
}

// MARK: - Custom Shapes

private struct DiamondShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}

private struct HeartShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let width = rect.width
        let height = rect.height

        path.move(to: CGPoint(x: width / 2, y: height))

        path.addCurve(
            to: CGPoint(x: 0, y: height / 4),
            control1: CGPoint(x: width / 2, y: height * 3 / 4),
            control2: CGPoint(x: 0, y: height / 2)
        )

        path.addArc(
            center: CGPoint(x: width / 4, y: height / 4),
            radius: width / 4,
            startAngle: .degrees(180),
            endAngle: .degrees(0),
            clockwise: false
        )

        path.addArc(
            center: CGPoint(x: width * 3 / 4, y: height / 4),
            radius: width / 4,
            startAngle: .degrees(180),
            endAngle: .degrees(0),
            clockwise: false
        )

        path.addCurve(
            to: CGPoint(x: width / 2, y: height),
            control1: CGPoint(x: width, y: height / 2),
            control2: CGPoint(x: width / 2, y: height * 3 / 4)
        )

        return path
    }
}

private struct StarShape: Shape {
    let points: Int

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outerRadius = min(rect.width, rect.height) / 2
        let innerRadius = outerRadius * 0.4

        for i in 0..<points * 2 {
            let angle = (CGFloat(i) / CGFloat(points * 2)) * 2 * .pi - .pi / 2
            let radius = i % 2 == 0 ? outerRadius : innerRadius
            let point = CGPoint(
                x: center.x + cos(angle) * radius,
                y: center.y + sin(angle) * radius
            )

            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }

        path.closeSubpath()
        return path
    }
}

// MARK: - Convenience View Modifier

public extension View {
    /// Add celebration overlay to any view
    func celebration(
        type: CelebrationType,
        isActive: Binding<Bool>,
        personaColor: Color = Color(hexString: "4a6741")
    ) -> some View {
        self.overlay(
            CelebrationOverlay(
                type: type,
                isActive: isActive,
                personaColor: personaColor
            )
        )
    }
}

// MARK: - Preview

#if DEBUG
struct CelebrationParticles_Previews: PreviewProvider {
    static var previews: some View {
        CelebrationPreviewContainer()
    }
}

private struct CelebrationPreviewContainer: View {
    @State private var showConfetti = false
    @State private var showFireworks = false
    @State private var showHearts = false
    @State private var showMilestone = false

    var body: some View {
        ZStack {
            Color(hexString: "1a1612")
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Text("Celebration Particles")
                    .font(.title)
                    .foregroundColor(.white)

                Button("Confetti") { showConfetti = true }
                Button("Fireworks") { showFireworks = true }
                Button("Hearts") { showHearts = true }
                Button("Milestone (Epic)") { showMilestone = true }
            }
            .buttonStyle(.borderedProminent)

            CelebrationOverlay(type: .confetti, isActive: $showConfetti)
            CelebrationOverlay(type: .fireworks, isActive: $showFireworks)
            CelebrationOverlay(type: .hearts, isActive: $showHearts)
            CelebrationOverlay(type: .milestone, isActive: $showMilestone)
        }
    }
}
#endif
