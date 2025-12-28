// MARK: - Ferni Avatar View
// A living, breathing avatar that embodies "Better Than Human" presence
// Unlike static logos, this avatar feels ALIVE through:
// - Natural breathing rhythm
// - Eye movement and blinking
// - Micro-expressions for emotional connection
// - Anticipatory responses
//
// Design Philosophy: "The feeling of being truly seen"

import SwiftUI

// MARK: - Avatar State

enum AvatarMood: String, CaseIterable {
    case neutral
    case curious      // Slightly wider eyes, head tilt
    case joyful       // Crinkled eyes, warm glow
    case listening    // Attentive, slight lean forward
    case thinking     // Eyes slightly up-left, processing
    case caring       // Soft eyes, gentle warmth
    case excited      // Bright eyes, energetic
    case calm         // Relaxed, peaceful presence

    var pupilDilation: CGFloat {
        switch self {
        case .neutral: return 1.0
        case .curious: return 1.15    // Pupils dilate with interest
        case .joyful: return 1.1
        case .listening: return 1.2   // Maximum attention
        case .thinking: return 0.95
        case .caring: return 1.1
        case .excited: return 1.25
        case .calm: return 0.9
        }
    }

    var eyeOpenness: CGFloat {
        switch self {
        case .neutral: return 1.0
        case .curious: return 1.1     // Slightly wider
        case .joyful: return 0.85     // Crinkled smile eyes
        case .listening: return 1.05
        case .thinking: return 0.95
        case .caring: return 0.9      // Soft, gentle
        case .excited: return 1.15
        case .calm: return 0.85
        }
    }

    var glowIntensity: CGFloat {
        switch self {
        case .neutral: return 0.3
        case .curious: return 0.4
        case .joyful: return 0.6
        case .listening: return 0.35
        case .thinking: return 0.25
        case .caring: return 0.5
        case .excited: return 0.7
        case .calm: return 0.4
        }
    }
}

// MARK: - Ferni Avatar View

struct FerniAvatarView: View {
    var size: CGFloat = 120
    var mood: AvatarMood = .neutral
    var isListening: Bool = false
    var isThinking: Bool = false
    var showBreathing: Bool = true

    // Animation states
    @State private var breathPhase: CGFloat = 0
    @State private var blinkProgress: CGFloat = 0
    @State private var isBlinking: Bool = false
    @State private var gazeOffset: CGPoint = .zero
    @State private var microExpressionOpacity: CGFloat = 0
    @State private var currentMicroExpression: AvatarMood = .neutral
    @State private var irisShimmer: CGFloat = 0

    // Timers
    @State private var blinkTimer: Timer?
    @State private var gazeTimer: Timer?

    var body: some View {
        ZStack {
            // Ambient glow (emotional aura)
            ambientGlow

            // Main avatar body
            avatarBody

            // Eyes with life
            eyeGroup

            // Micro-expression overlay (subliminal)
            microExpressionOverlay
        }
        .frame(width: size, height: size)
        .onAppear {
            startAnimations()
        }
        .onDisappear {
            stopAnimations()
        }
        .onChange(of: mood) { _, newMood in
            triggerMicroExpression(newMood)
        }
    }

    // MARK: - Ambient Glow

    private var ambientGlow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        FerniColors.ferni.opacity(mood.glowIntensity * (0.8 + breathPhase * 0.2)),
                        FerniColors.ferni.opacity(0.1),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.3,
                    endRadius: size * 0.6
                )
            )
            .frame(width: size * 1.4, height: size * 1.4)
            .blur(radius: 8)
    }

    // MARK: - Avatar Body

    private var avatarBody: some View {
        // Breathing causes subtle scale change
        let breathScale = showBreathing ? 1.0 + (breathPhase * 0.02) : 1.0

        return Circle()
            .fill(
                LinearGradient(
                    colors: [
                        FerniColors.ferni,
                        FerniColors.ferni.opacity(0.85)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size * 0.85, height: size * 0.85)
            .scaleEffect(breathScale)
            .shadow(color: FerniColors.ferni.opacity(0.3), radius: 12, y: 4)
    }

    // MARK: - Eye Group

    private var eyeGroup: some View {
        let eyeSpacing = size * 0.18
        let eyeSize = size * 0.22 * mood.eyeOpenness
        let pupilSize = eyeSize * 0.5 * mood.pupilDilation

        // Eye position shifts slightly with gaze
        let gazeShift = CGPoint(
            x: gazeOffset.x * size * 0.02,
            y: gazeOffset.y * size * 0.02
        )

        return HStack(spacing: eyeSpacing) {
            // Left eye
            singleEye(size: eyeSize, pupilSize: pupilSize, isLeft: true)
                .offset(x: gazeShift.x, y: gazeShift.y)

            // Right eye
            singleEye(size: eyeSize, pupilSize: pupilSize, isLeft: false)
                .offset(x: gazeShift.x, y: gazeShift.y)
        }
        .offset(y: -size * 0.05) // Eyes slightly above center
    }

    private func singleEye(size eyeSize: CGFloat, pupilSize: CGFloat, isLeft: Bool) -> some View {
        let blinkScale = isBlinking ? 0.1 : 1.0

        return ZStack {
            // Eye white with warmth
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white,
                            Color.white.opacity(0.95)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeSize
                    )
                )
                .frame(width: eyeSize, height: eyeSize * blinkScale)

            // Iris with shimmer
            if !isBlinking {
                ZStack {
                    // Base iris color
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [
                                    FerniColors.accent.opacity(0.9),
                                    FerniColors.accent
                                ],
                                center: .center,
                                startRadius: 0,
                                endRadius: pupilSize
                            )
                        )
                        .frame(width: pupilSize * 1.3, height: pupilSize * 1.3)

                    // Iris shimmer (life indicator)
                    Circle()
                        .fill(
                            AngularGradient(
                                colors: [
                                    Color.white.opacity(0.3 * irisShimmer),
                                    Color.clear,
                                    Color.white.opacity(0.2 * irisShimmer),
                                    Color.clear
                                ],
                                center: .center
                            )
                        )
                        .frame(width: pupilSize * 1.3, height: pupilSize * 1.3)

                    // Pupil
                    Circle()
                        .fill(Color.black)
                        .frame(width: pupilSize, height: pupilSize)

                    // Catchlight (life spark)
                    Circle()
                        .fill(Color.white.opacity(0.9))
                        .frame(width: pupilSize * 0.25, height: pupilSize * 0.25)
                        .offset(x: -pupilSize * 0.15, y: -pupilSize * 0.15)
                }
                .offset(
                    x: gazeOffset.x * eyeSize * 0.15,
                    y: gazeOffset.y * eyeSize * 0.1
                )
            }
        }
    }

    // MARK: - Micro-Expression Overlay

    private var microExpressionOverlay: some View {
        // Subliminal emotional flash (40-150ms)
        // These build unconscious trust
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        microExpressionColor.opacity(microExpressionOpacity * 0.3),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: size * 0.2,
                    endRadius: size * 0.5
                )
            )
            .frame(width: size, height: size)
    }

    private var microExpressionColor: Color {
        switch currentMicroExpression {
        case .joyful, .excited: return Color.yellow
        case .caring: return FerniColors.moods.calm
        case .curious: return FerniColors.accent
        case .thinking: return Color.blue.opacity(0.5)
        default: return FerniColors.ferni
        }
    }

    // MARK: - Animations

    private func startAnimations() {
        // Breathing animation - continuous, natural rhythm
        withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
            breathPhase = 1
        }

        // Iris shimmer - subtle life indicator
        withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
            irisShimmer = 1
        }

        // Random blinking (every 3-7 seconds, like humans)
        scheduleNextBlink()

        // Subtle gaze movement (curiosity, attention)
        scheduleGazeShift()
    }

    private func stopAnimations() {
        blinkTimer?.invalidate()
        gazeTimer?.invalidate()
    }

    private func scheduleNextBlink() {
        let delay = Double.random(in: 3...7)
        blinkTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { _ in
            performBlink()
            scheduleNextBlink()
        }
    }

    private func performBlink() {
        withAnimation(.easeIn(duration: 0.08)) {
            isBlinking = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.12)) {
                isBlinking = false
            }
        }
    }

    private func scheduleGazeShift() {
        let delay = Double.random(in: 2...5)
        gazeTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { _ in
            shiftGaze()
            scheduleGazeShift()
        }
    }

    private func shiftGaze() {
        withAnimation(.easeInOut(duration: 0.4)) {
            gazeOffset = CGPoint(
                x: CGFloat.random(in: -1...1),
                y: CGFloat.random(in: -0.5...0.5)
            )
        }
    }

    private func triggerMicroExpression(_ mood: AvatarMood) {
        currentMicroExpression = mood

        // Flash in (40-80ms)
        withAnimation(.easeIn(duration: 0.06)) {
            microExpressionOpacity = 1
        }

        // Flash out (80-150ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.1)) {
                microExpressionOpacity = 0
            }
        }
    }
}

// MARK: - Listening Avatar (Active State)

struct FerniListeningAvatarView: View {
    var size: CGFloat = 120

    @State private var pulsePhase: CGFloat = 0
    @State private var ringScale: CGFloat = 1

    var body: some View {
        ZStack {
            // Listening pulse rings
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .stroke(
                        FerniColors.ferni.opacity(0.3 - Double(i) * 0.1),
                        lineWidth: 2
                    )
                    .frame(
                        width: size * (1.1 + CGFloat(i) * 0.15) * ringScale,
                        height: size * (1.1 + CGFloat(i) * 0.15) * ringScale
                    )
                    .opacity(1 - (pulsePhase * 0.5))
            }

            // Main avatar
            FerniAvatarView(
                size: size,
                mood: .listening,
                isListening: true
            )
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulsePhase = 1
                ringScale = 1.1
            }
        }
    }
}

// MARK: - Thinking Avatar (Processing State)

struct FerniThinkingAvatarView: View {
    var size: CGFloat = 120

    @State private var dotPhase: CGFloat = 0

    var body: some View {
        ZStack {
            // Main avatar in thinking mood
            FerniAvatarView(
                size: size,
                mood: .thinking,
                isThinking: true
            )

            // Thinking dots
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(FerniColors.ferni.opacity(0.7))
                        .frame(width: 8, height: 8)
                        .offset(y: sin(dotPhase + Double(i) * 0.5) * 4)
                }
            }
            .offset(y: size * 0.45)
        }
        .onAppear {
            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                dotPhase = .pi * 2
            }
        }
    }
}

// MARK: - Compact Avatar (For Lists, Headers)

struct FerniCompactAvatarView: View {
    var size: CGFloat = 44
    var mood: AvatarMood = .neutral
    var showGlow: Bool = true

    var body: some View {
        ZStack {
            if showGlow {
                Circle()
                    .fill(FerniColors.ferni.opacity(0.2))
                    .frame(width: size * 1.2, height: size * 1.2)
                    .blur(radius: 4)
            }

            Circle()
                .fill(
                    LinearGradient(
                        colors: [FerniColors.ferni, FerniColors.ferni.opacity(0.85)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)

            // Simple eyes
            HStack(spacing: size * 0.15) {
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.2, height: size * 0.18)
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.2, height: size * 0.18)
            }
            .offset(y: -size * 0.05)
        }
        .frame(width: size * 1.2, height: size * 1.2)
    }
}

// MARK: - Preview

#Preview("Ferni Avatar - Moods") {
    ScrollView {
        VStack(spacing: 32) {
            Text("Avatar Moods")
                .font(.title2.bold())
                .foregroundColor(FerniColors.textPrimary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 24) {
                ForEach(AvatarMood.allCases, id: \.self) { mood in
                    VStack(spacing: 8) {
                        FerniAvatarView(size: 100, mood: mood)

                        Text(mood.rawValue.capitalized)
                            .font(.caption)
                            .foregroundColor(FerniColors.textSecondary)
                    }
                }
            }

            Divider().padding(.vertical)

            Text("Active States")
                .font(.title2.bold())
                .foregroundColor(FerniColors.textPrimary)

            HStack(spacing: 40) {
                VStack(spacing: 8) {
                    FerniListeningAvatarView(size: 100)
                    Text("Listening")
                        .font(.caption)
                        .foregroundColor(FerniColors.textSecondary)
                }

                VStack(spacing: 8) {
                    FerniThinkingAvatarView(size: 100)
                    Text("Thinking")
                        .font(.caption)
                        .foregroundColor(FerniColors.textSecondary)
                }
            }

            Divider().padding(.vertical)

            Text("Compact Sizes")
                .font(.title2.bold())
                .foregroundColor(FerniColors.textPrimary)

            HStack(spacing: 20) {
                FerniCompactAvatarView(size: 32)
                FerniCompactAvatarView(size: 44)
                FerniCompactAvatarView(size: 56)
            }
        }
        .padding()
    }
    .background(FerniColors.background)
}

#Preview("Ferni Avatar - Large") {
    FerniAvatarView(size: 200, mood: .joyful)
        .padding(40)
        .background(FerniColors.background)
}
