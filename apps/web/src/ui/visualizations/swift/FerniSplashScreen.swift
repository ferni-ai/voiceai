// MARK: - Ferni Splash Screen
// A beautiful, animated splash that shows Ferni "waking up"
// Instead of a static logo, the avatar comes alive -
// demonstrating presence before the user even speaks.
//
// Design Philosophy: "Better than the Pixar lamp"
// - The Pixar lamp has personality through movement
// - Ferni has personality through AWARENESS
// - Eyes that open, see you, and recognize you
//
// Animation Sequence:
// 1. Dark/quiet start
// 2. Gentle ambient glow appears
// 3. Avatar fades in (sleeping/peaceful)
// 4. Eyes gently open
// 5. Pupils dilate (recognition - "I see you")
// 6. Warm smile/acknowledgment
// 7. Transition to main app

import SwiftUI

// MARK: - Splash Animation Phase

enum SplashPhase: Int, CaseIterable {
    case darkness = 0       // Pure black
    case ambientGlow        // Subtle warmth appears
    case avatarAppears      // Avatar fades in, eyes closed
    case eyesOpen           // Eyes gently open
    case recognition        // Pupils dilate - "I see you"
    case greeting           // Warm acknowledgment
    case ready              // Transition out

    var duration: Double {
        switch self {
        case .darkness: return 0.3
        case .ambientGlow: return 0.8
        case .avatarAppears: return 0.6
        case .eyesOpen: return 0.5
        case .recognition: return 0.4
        case .greeting: return 0.6
        case .ready: return 0.3
        }
    }

    var cumulativeTime: Double {
        SplashPhase.allCases
            .prefix(while: { $0.rawValue < self.rawValue })
            .reduce(0) { $0 + $1.duration }
    }
}

// MARK: - Ferni Splash Screen

struct FerniSplashScreen: View {
    var onComplete: () -> Void = {}
    var userName: String? = nil

    @State private var currentPhase: SplashPhase = .darkness
    @State private var ambientOpacity: CGFloat = 0
    @State private var avatarOpacity: CGFloat = 0
    @State private var avatarScale: CGFloat = 0.8
    @State private var eyeOpenness: CGFloat = 0
    @State private var pupilDilation: CGFloat = 0.7
    @State private var warmthGlow: CGFloat = 0
    @State private var greetingOpacity: CGFloat = 0
    @State private var transitionOpacity: CGFloat = 1

    private let avatarSize: CGFloat = 140

    var body: some View {
        ZStack {
            // Background - starts dark, warms up
            backgroundColor
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Main avatar area
                ZStack {
                    // Ambient glow (life force)
                    ambientGlowView

                    // The avatar itself
                    awakingAvatarView
                }
                .frame(width: avatarSize * 1.6, height: avatarSize * 1.6)

                // Greeting text
                greetingTextView
                    .padding(.top, 24)

                Spacer()

                // Subtle branding
                brandingView
                    .padding(.bottom, 40)
            }
        }
        .opacity(transitionOpacity)
        .onAppear {
            startAnimation()
        }
    }

    // MARK: - Background

    private var backgroundColor: some View {
        let warmth = ambientOpacity * 0.1 // Subtle warmth as avatar awakens

        return LinearGradient(
            colors: [
                Color(red: 0.02 + warmth, green: 0.02 + warmth * 0.5, blue: 0.03),
                Color(red: 0.01, green: 0.01, blue: 0.02)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Ambient Glow

    private var ambientGlowView: some View {
        ZStack {
            // Outer soft glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            FerniColors.ferni.opacity(0.15 * ambientOpacity),
                            FerniColors.ferni.opacity(0.05 * ambientOpacity),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: avatarSize * 0.4,
                        endRadius: avatarSize * 1.2
                    )
                )
                .frame(width: avatarSize * 2.5, height: avatarSize * 2.5)
                .blur(radius: 20)

            // Inner warm glow (appears during recognition)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            FerniColors.ferni.opacity(0.3 * warmthGlow),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: avatarSize * 0.3,
                        endRadius: avatarSize * 0.8
                    )
                )
                .frame(width: avatarSize * 1.8, height: avatarSize * 1.8)
                .blur(radius: 15)
        }
    }

    // MARK: - Awaking Avatar

    private var awakingAvatarView: some View {
        ZStack {
            // Avatar body
            Circle()
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
                .frame(width: avatarSize, height: avatarSize)
                .shadow(color: FerniColors.ferni.opacity(0.4), radius: 20, y: 8)

            // Eyes
            awakingEyesView
        }
        .opacity(avatarOpacity)
        .scaleEffect(avatarScale)
    }

    private var awakingEyesView: some View {
        let eyeSpacing = avatarSize * 0.18
        let eyeWidth = avatarSize * 0.22
        let eyeHeight = eyeWidth * eyeOpenness.clamped(to: 0.05...1.0)
        let pupilSize = eyeWidth * 0.5 * pupilDilation

        return HStack(spacing: eyeSpacing) {
            // Left eye
            awakingEye(width: eyeWidth, height: eyeHeight, pupilSize: pupilSize)

            // Right eye
            awakingEye(width: eyeWidth, height: eyeHeight, pupilSize: pupilSize)
        }
        .offset(y: -avatarSize * 0.05)
    }

    private func awakingEye(width: CGFloat, height: CGFloat, pupilSize: CGFloat) -> some View {
        ZStack {
            // Eye white
            Ellipse()
                .fill(Color.white)
                .frame(width: width, height: height)

            // Iris + Pupil (only visible when eye is open enough)
            if eyeOpenness > 0.3 {
                ZStack {
                    // Iris
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
                .opacity(Double((eyeOpenness - 0.3) / 0.7).clamped(to: 0...1))
            }
        }
    }

    // MARK: - Greeting Text

    private var greetingTextView: some View {
        VStack(spacing: 8) {
            Text(greetingText)
                .font(.system(size: 24, weight: .medium, design: .rounded))
                .foregroundColor(Color.white.opacity(0.9))

            if userName != nil {
                Text("I'm here.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Color.white.opacity(0.5))
            }
        }
        .opacity(greetingOpacity)
    }

    private var greetingText: String {
        if let name = userName {
            let hour = Calendar.current.component(.hour, from: Date())
            if hour < 12 {
                return "Good morning, \(name)"
            } else if hour < 17 {
                return "Good afternoon, \(name)"
            } else {
                return "Good evening, \(name)"
            }
        } else {
            return "Hello"
        }
    }

    // MARK: - Branding

    private var brandingView: some View {
        Text("ferni")
            .font(.system(size: 14, weight: .medium, design: .rounded))
            .foregroundColor(Color.white.opacity(0.3))
            .opacity(greetingOpacity)
    }

    // MARK: - Animation Sequence

    private func startAnimation() {
        // Phase 1: Darkness (already there)
        advancePhase()
    }

    private func advancePhase() {
        guard currentPhase.rawValue < SplashPhase.ready.rawValue else {
            // Animation complete
            withAnimation(.easeOut(duration: 0.4)) {
                transitionOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                onComplete()
            }
            return
        }

        let nextPhase = SplashPhase(rawValue: currentPhase.rawValue + 1) ?? .ready
        currentPhase = nextPhase

        animatePhase(nextPhase)

        // Schedule next phase
        DispatchQueue.main.asyncAfter(deadline: .now() + nextPhase.duration) {
            advancePhase()
        }
    }

    private func animatePhase(_ phase: SplashPhase) {
        switch phase {
        case .darkness:
            break // Already dark

        case .ambientGlow:
            withAnimation(.easeOut(duration: phase.duration)) {
                ambientOpacity = 1
            }

        case .avatarAppears:
            withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                avatarOpacity = 1
                avatarScale = 1
            }

        case .eyesOpen:
            // Eyes open gently, like waking up
            withAnimation(.easeInOut(duration: phase.duration)) {
                eyeOpenness = 1
            }

        case .recognition:
            // Pupils dilate - the moment of "I see you"
            withAnimation(.easeOut(duration: phase.duration)) {
                pupilDilation = 1.2  // Dilate with interest
                warmthGlow = 1       // Warm glow intensifies
            }

        case .greeting:
            // Text appears
            withAnimation(.easeOut(duration: phase.duration)) {
                greetingOpacity = 1
            }

        case .ready:
            break // Handled in advancePhase
        }
    }
}

// MARK: - Minimal Splash (For Quick Return)

struct FerniMinimalSplashScreen: View {
    var onComplete: () -> Void = {}

    @State private var opacity: CGFloat = 0
    @State private var scale: CGFloat = 0.9

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            FerniAvatarView(size: 100, mood: .calm)
                .opacity(opacity)
                .scaleEffect(scale)
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                opacity = 1
                scale = 1
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                withAnimation(.easeOut(duration: 0.3)) {
                    opacity = 0
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    onComplete()
                }
            }
        }
    }
}

// MARK: - Helpers

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// MARK: - Preview

#Preview("Ferni Splash - Full") {
    FerniSplashScreen(
        onComplete: { print("Complete!") },
        userName: "Seth"
    )
}

#Preview("Ferni Splash - Anonymous") {
    FerniSplashScreen(
        onComplete: { print("Complete!") }
    )
}

#Preview("Ferni Splash - Minimal") {
    FerniMinimalSplashScreen(
        onComplete: { print("Complete!") }
    )
}
