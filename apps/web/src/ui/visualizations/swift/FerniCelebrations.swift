// MARK: - Ferni Celebrations
// Beautiful animations for milestones and achievements
// Makes progress feel meaningful and celebrated
//
// Design Philosophy:
// - Celebrations should feel personal, not gamified
// - Warmth over flashiness
// - The avatar participates in celebrations
// - Haptic feedback enhances the moment

import SwiftUI

// MARK: - Milestone Types

enum MilestoneType: String, CaseIterable {
    case firstConversation = "first_conversation"
    case oneWeek = "one_week"
    case oneMonth = "one_month"
    case threeMonths = "three_months"
    case sixMonths = "six_months"
    case oneYear = "one_year"
    case conversations10 = "conversations_10"
    case conversations50 = "conversations_50"
    case conversations100 = "conversations_100"
    case conversations500 = "conversations_500"
    case streak7 = "streak_7"
    case streak30 = "streak_30"
    case streak100 = "streak_100"
    case growthMilestone = "growth_milestone"
    case emotionalBreakthrough = "emotional_breakthrough"

    var title: String {
        switch self {
        case .firstConversation: return "First Steps"
        case .oneWeek: return "One Week Together"
        case .oneMonth: return "One Month Together"
        case .threeMonths: return "A Season of Growth"
        case .sixMonths: return "Half a Year"
        case .oneYear: return "One Year Together"
        case .conversations10: return "Getting Started"
        case .conversations50: return "Building Connection"
        case .conversations100: return "100 Conversations"
        case .conversations500: return "Deep Connection"
        case .streak7: return "7 Day Streak"
        case .streak30: return "30 Day Journey"
        case .streak100: return "100 Days Strong"
        case .growthMilestone: return "Personal Growth"
        case .emotionalBreakthrough: return "Breakthrough Moment"
        }
    }

    var subtitle: String {
        switch self {
        case .firstConversation: return "Every journey begins with a single step"
        case .oneWeek: return "A week of showing up for yourself"
        case .oneMonth: return "Consistency is its own reward"
        case .threeMonths: return "Real change takes root over time"
        case .sixMonths: return "Half a year of meaningful connection"
        case .oneYear: return "365 days of growth"
        case .conversations10: return "10 conversations and counting"
        case .conversations50: return "50 moments of connection"
        case .conversations100: return "A century of conversations"
        case .conversations500: return "500 moments we've shared"
        case .streak7: return "A full week of daily presence"
        case .streak30: return "A month of dedication"
        case .streak100: return "100 days of commitment"
        case .growthMilestone: return "You've grown so much"
        case .emotionalBreakthrough: return "A moment of clarity"
        }
    }

    var avatarMood: AvatarMood {
        switch self {
        case .firstConversation: return .curious
        case .emotionalBreakthrough: return .caring
        case .growthMilestone: return .joyful
        default: return .excited
        }
    }

    var celebrationIntensity: CelebrationIntensity {
        switch self {
        case .firstConversation, .conversations10, .streak7:
            return .gentle
        case .oneWeek, .conversations50, .streak30:
            return .warm
        case .oneMonth, .conversations100, .growthMilestone, .emotionalBreakthrough:
            return .joyful
        case .threeMonths, .sixMonths, .conversations500, .streak100:
            return .grand
        case .oneYear:
            return .epic
        }
    }
}

enum CelebrationIntensity {
    case gentle   // Subtle glow, small animation
    case warm     // Moderate particles, growing glow
    case joyful   // Confetti, happy bounce
    case grand    // Full confetti burst, fireworks
    case epic     // Everything + special effects

    var particleCount: Int {
        switch self {
        case .gentle: return 8
        case .warm: return 20
        case .joyful: return 40
        case .grand: return 80
        case .epic: return 150
        }
    }

    var duration: Double {
        switch self {
        case .gentle: return 2.0
        case .warm: return 2.5
        case .joyful: return 3.0
        case .grand: return 4.0
        case .epic: return 5.0
        }
    }
}

// MARK: - Celebration View

struct FerniCelebrationView: View {
    let milestone: MilestoneType
    var onDismiss: () -> Void = {}

    @State private var phase: CelebrationPhase = .hidden
    @State private var particles: [CelebrationParticle] = []
    @State private var glowRadius: CGFloat = 0
    @State private var avatarScale: CGFloat = 0.5
    @State private var textOpacity: CGFloat = 0
    @State private var showConfetti = false

    @StateObject private var haptics = FerniHapticManager.shared

    enum CelebrationPhase {
        case hidden
        case avatarAppears
        case glowBuilds
        case burst
        case celebrate
        case fadeOut
    }

    var body: some View {
        ZStack {
            // Background with animated gradient
            backgroundGradient
                .ignoresSafeArea()

            // Glow effect
            celebrationGlow

            // Confetti particles
            ForEach(particles) { particle in
                ParticleView(particle: particle)
            }

            // Main content
            VStack(spacing: 24) {
                Spacer()

                // Avatar with celebration mood
                FerniAvatarView(
                    size: 140,
                    mood: milestone.avatarMood
                )
                .scaleEffect(avatarScale)
                .shadow(color: FerniColors.ferni.opacity(0.5), radius: glowRadius)

                // Milestone text
                VStack(spacing: 12) {
                    Text(milestone.title)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.white)

                    Text(milestone.subtitle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .opacity(textOpacity)

                Spacer()

                // Dismiss button
                Button(action: dismiss) {
                    Text("Continue")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(FerniColors.ferni)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 14)
                        .background(
                            Capsule()
                                .fill(.white)
                        )
                }
                .opacity(textOpacity)
                .padding(.bottom, 60)
            }
        }
        .onAppear {
            startCelebration()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                FerniColors.ferni.opacity(0.95),
                FerniColors.accent.opacity(0.9),
                FerniColors.ferni.opacity(0.85)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Glow Effect

    private var celebrationGlow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color.white.opacity(0.3),
                        Color.white.opacity(0.1),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 50,
                    endRadius: 200 + glowRadius
                )
            )
            .frame(width: 400 + glowRadius * 2, height: 400 + glowRadius * 2)
            .blur(radius: 30)
    }

    // MARK: - Animation Sequence

    private func startCelebration() {
        let intensity = milestone.celebrationIntensity

        // Phase 1: Avatar appears
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
            phase = .avatarAppears
            avatarScale = 1.0
        }

        // Phase 2: Glow builds (with haptic)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            withAnimation(.easeOut(duration: 0.8)) {
                phase = .glowBuilds
                glowRadius = 50
            }

            // Haptic builds anticipation
            switch intensity {
            case .gentle, .warm:
                haptics.playSmallWin()
            case .joyful:
                haptics.playAchievement()
            case .grand, .epic:
                haptics.playMilestone()
            }
        }

        // Phase 3: Burst!
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                phase = .burst
                glowRadius = 150
                avatarScale = 1.15
            }

            // Spawn particles
            spawnParticles(count: intensity.particleCount)

            // Bounce back
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                    avatarScale = 1.0
                }
            }
        }

        // Phase 4: Celebrate - text appears
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) {
            withAnimation(.easeOut(duration: 0.5)) {
                phase = .celebrate
                textOpacity = 1
                glowRadius = 80
            }
        }
    }

    private func spawnParticles(count: Int) {
        particles = (0..<count).map { _ in
            CelebrationParticle(
                color: [.yellow, .white, .orange, FerniColors.ferni].randomElement()!,
                size: CGFloat.random(in: 6...14),
                position: CGPoint(x: UIScreen.main.bounds.width / 2, y: UIScreen.main.bounds.height / 2 - 100),
                velocity: CGPoint(
                    x: CGFloat.random(in: -200...200),
                    y: CGFloat.random(in: -400...-100)
                ),
                rotationSpeed: Double.random(in: -10...10)
            )
        }

        // Animate particles
        withAnimation(.easeOut(duration: 2.0)) {
            for i in particles.indices {
                particles[i].fallen = true
            }
        }

        // Remove particles after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            particles.removeAll()
        }
    }

    private func dismiss() {
        withAnimation(.easeOut(duration: 0.3)) {
            textOpacity = 0
            avatarScale = 0.8
            glowRadius = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            onDismiss()
        }
    }
}

// MARK: - Particle

struct CelebrationParticle: Identifiable {
    let id = UUID()
    let color: Color
    let size: CGFloat
    var position: CGPoint
    let velocity: CGPoint
    let rotationSpeed: Double
    var fallen: Bool = false

    var endPosition: CGPoint {
        CGPoint(
            x: position.x + velocity.x * 2,
            y: UIScreen.main.bounds.height + 100
        )
    }
}

struct ParticleView: View {
    let particle: CelebrationParticle

    var body: some View {
        Circle()
            .fill(particle.color)
            .frame(width: particle.size, height: particle.size)
            .position(particle.fallen ? particle.endPosition : particle.position)
            .rotationEffect(.degrees(particle.fallen ? particle.rotationSpeed * 360 : 0))
            .opacity(particle.fallen ? 0 : 1)
    }
}

// MARK: - Quick Celebration (Inline)

struct QuickCelebrationView: View {
    @Binding var isShowing: Bool
    var message: String = "Nice!"
    var intensity: CelebrationIntensity = .gentle

    @State private var scale: CGFloat = 0
    @State private var opacity: CGFloat = 0
    @State private var yOffset: CGFloat = 20

    var body: some View {
        if isShowing {
            HStack(spacing: 8) {
                Image(systemName: "star.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.yellow)

                Text(message)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(FerniColors.ferni.opacity(0.9))
            )
            .scaleEffect(scale)
            .opacity(opacity)
            .offset(y: yOffset)
            .onAppear {
                // Pop in
                withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                    scale = 1
                    opacity = 1
                    yOffset = 0
                }

                // Haptic
                Task { @MainActor in
                    switch intensity {
                    case .gentle:
                        FerniHapticManager.shared.playSmallWin()
                    default:
                        FerniHapticManager.shared.playAchievement()
                    }
                }

                // Pop out after delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    withAnimation(.easeOut(duration: 0.3)) {
                        scale = 0.8
                        opacity = 0
                        yOffset = -10
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        isShowing = false
                    }
                }
            }
        }
    }
}

// MARK: - Streak Flame

struct StreakFlameView: View {
    let streakCount: Int
    var size: CGFloat = 32

    @State private var flamePhase: CGFloat = 0

    private var flameColor: Color {
        if streakCount >= 100 {
            return .purple
        } else if streakCount >= 30 {
            return .orange
        } else if streakCount >= 7 {
            return .yellow
        } else {
            return .orange.opacity(0.7)
        }
    }

    var body: some View {
        ZStack {
            // Flame glow
            Image(systemName: "flame.fill")
                .font(.system(size: size))
                .foregroundColor(flameColor.opacity(0.5))
                .blur(radius: 4)
                .scaleEffect(1 + flamePhase * 0.1)

            // Flame
            Image(systemName: "flame.fill")
                .font(.system(size: size))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.red, flameColor, .yellow],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .scaleEffect(1 + flamePhase * 0.05)

            // Count badge
            Text("\(streakCount)")
                .font(.system(size: size * 0.35, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .offset(y: size * 0.1)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                flamePhase = 1
            }
        }
    }
}

// MARK: - Preview

#Preview("Celebration - First Conversation") {
    FerniCelebrationView(milestone: .firstConversation)
}

#Preview("Celebration - One Year") {
    FerniCelebrationView(milestone: .oneYear)
}

#Preview("Quick Celebration") {
    struct PreviewWrapper: View {
        @State private var showCelebration = true

        var body: some View {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack {
                    Button("Show Celebration") {
                        showCelebration = true
                    }

                    QuickCelebrationView(isShowing: $showCelebration, message: "Streak maintained!")
                }
            }
        }
    }

    return PreviewWrapper()
}

#Preview("Streak Flames") {
    HStack(spacing: 32) {
        VStack {
            StreakFlameView(streakCount: 3)
            Text("3 days")
        }
        VStack {
            StreakFlameView(streakCount: 15)
            Text("15 days")
        }
        VStack {
            StreakFlameView(streakCount: 45)
            Text("45 days")
        }
        VStack {
            StreakFlameView(streakCount: 120)
            Text("120 days")
        }
    }
    .padding()
    .background(FerniColors.background)
}
