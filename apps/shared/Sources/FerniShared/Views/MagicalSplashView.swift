import SwiftUI

// MARK: - Magical Splash View
/// A Pixar-inspired splash screen where the Ferni eye "wakes up" and greets the user.
///
/// Animation Sequence (inspired by web app splash-screen.ui.ts):
/// 1. Eye scales in with spring bounce (0-600ms)
/// 2. Pupil dilates and looks around curiously (600-1600ms)
/// 3. Tagline fades in with gentle rise (1600-2200ms)
/// 4. Hold for emotional impact, then fade out
///
/// Design Philosophy:
/// - Character through motion alone
/// - Every element earns its screen time
/// - Respects reduced motion preferences

public struct MagicalSplashView: View {

    // MARK: - Configuration

    /// Callback when splash animation completes
    public var onComplete: (() -> Void)?

    /// Whether to show returning user messaging
    public var isReturningUser: Bool = false

    /// User's name for personalized greeting (if available)
    public var userName: String?

    /// Persona color (defaults to Ferni green)
    public var personaColor: Color = Color(hexString: "4a6741") ?? .green

    // MARK: - Animation State

    @State private var phase: SplashPhase = .initial
    @State private var eyeScale: CGFloat = 0.3
    @State private var eyeOpacity: CGFloat = 0
    @State private var pupilDilation: CGFloat = 0.3
    @State private var pupilLookDirection: CGPoint = .zero
    @State private var taglineOpacity: CGFloat = 0
    @State private var taglineOffset: CGFloat = 20
    @State private var glowIntensity: CGFloat = 0
    @State private var blinkProgress: CGFloat = 0

    // MARK: - Environment

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Constants

    private let eyeSize: CGFloat = 120

    public init(
        onComplete: (() -> Void)? = nil,
        isReturningUser: Bool = false,
        userName: String? = nil,
        personaColor: Color = Color(hexString: "4a6741") ?? .green
    ) {
        self.onComplete = onComplete
        self.isReturningUser = isReturningUser
        self.userName = userName
        self.personaColor = personaColor
    }

    public var body: some View {
        ZStack {
            // Background gradient
            backgroundGradient

            VStack(spacing: 40) {
                Spacer()

                // The Eye
                eyeView
                    .scaleEffect(eyeScale)
                    .opacity(eyeOpacity)

                // Tagline
                taglineView
                    .opacity(taglineOpacity)
                    .offset(y: taglineOffset)

                Spacer()
                Spacer()
            }
        }
        .onAppear {
            startAnimation()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(hexString: "0a0a12") ?? .black,
                Color(hexString: "12121a") ?? .black,
                Color(hexString: "0a0a12") ?? .black
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
        .overlay(
            // Ambient glow behind eye
            RadialGradient(
                colors: [
                    personaColor.opacity(0.3 * glowIntensity),
                    personaColor.opacity(0.1 * glowIntensity),
                    .clear
                ],
                center: .center,
                startRadius: 0,
                endRadius: 200
            )
            .offset(y: -50)
        )
    }

    // MARK: - The Eye

    private var eyeView: some View {
        ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            personaColor.opacity(0.4),
                            personaColor.opacity(0.1),
                            .clear
                        ],
                        center: .center,
                        startRadius: eyeSize * 0.3,
                        endRadius: eyeSize * 0.8
                    )
                )
                .frame(width: eyeSize * 1.5, height: eyeSize * 1.5)
                .blur(radius: 10)

            // Eye white (sclera)
            Ellipse()
                .fill(.white.opacity(0.95))
                .frame(
                    width: eyeSize,
                    height: eyeSize * eyeOpenness
                )
                .shadow(color: .white.opacity(0.3), radius: 5)

            // Iris
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            personaColor,
                            personaColor.opacity(0.8)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeSize * 0.25
                    )
                )
                .frame(width: eyeSize * 0.5, height: eyeSize * 0.5)
                .offset(
                    x: pupilLookDirection.x * eyeSize * 0.15,
                    y: pupilLookDirection.y * eyeSize * 0.1
                )
                .opacity(eyeOpenness > 0.3 ? 1 : 0)

            // Pupil
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hexString: "1a1a1a") ?? .black,
                            Color(hexString: "0a0a0a") ?? .black
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeSize * 0.15
                    )
                )
                .frame(
                    width: eyeSize * 0.3 * pupilDilation,
                    height: eyeSize * 0.3 * pupilDilation
                )
                .offset(
                    x: pupilLookDirection.x * eyeSize * 0.15,
                    y: pupilLookDirection.y * eyeSize * 0.1
                )
                .opacity(eyeOpenness > 0.3 ? 1 : 0)

            // Highlight (gives life to the eye)
            Circle()
                .fill(.white.opacity(0.9))
                .frame(width: eyeSize * 0.08, height: eyeSize * 0.08)
                .offset(
                    x: -eyeSize * 0.1 + pupilLookDirection.x * eyeSize * 0.05,
                    y: -eyeSize * 0.1 + pupilLookDirection.y * eyeSize * 0.03
                )
                .opacity(eyeOpenness > 0.5 ? 0.8 : 0)

            // Secondary highlight (smaller)
            Circle()
                .fill(.white.opacity(0.6))
                .frame(width: eyeSize * 0.04, height: eyeSize * 0.04)
                .offset(
                    x: eyeSize * 0.08 + pupilLookDirection.x * eyeSize * 0.05,
                    y: eyeSize * 0.05 + pupilLookDirection.y * eyeSize * 0.03
                )
                .opacity(eyeOpenness > 0.5 ? 0.5 : 0)
        }
    }

    private var eyeOpenness: CGFloat {
        // Eye closes during blinks
        max(0.1, 1.0 - blinkProgress)
    }

    // MARK: - Tagline

    private var taglineView: some View {
        VStack(spacing: 8) {
            Text(greetingText)
                .font(.system(size: 24, weight: .light, design: .rounded))
                .foregroundColor(.white.opacity(0.9))

            Text(subtitleText)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(.white.opacity(0.5))
        }
        .multilineTextAlignment(.center)
    }

    private var greetingText: String {
        if isReturningUser, let name = userName {
            return "Welcome back, \(name)"
        } else if isReturningUser {
            return "Welcome back"
        } else {
            return "Your AI team is ready"
        }
    }

    private var subtitleText: String {
        if isReturningUser {
            return "I've been thinking about you"
        } else {
            return "Let's get to know each other"
        }
    }

    // MARK: - Animation Sequence

    private func startAnimation() {
        if reduceMotion {
            // Skip to final state immediately
            eyeScale = 1.0
            eyeOpacity = 1.0
            pupilDilation = 1.0
            taglineOpacity = 1.0
            taglineOffset = 0
            glowIntensity = 1.0

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                onComplete?()
            }
            return
        }

        // Phase 1: Eye appears (0-600ms)
        phase = .eyeAppearing

        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
            eyeScale = 1.0
            eyeOpacity = 1.0
            glowIntensity = 0.5
        }

        // Phase 2: Eye wakes up (600-1600ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            phase = .eyeWakingUp

            // Pupil dilates
            withAnimation(.easeOut(duration: 0.4)) {
                pupilDilation = 1.0
                glowIntensity = 1.0
            }

            // Quick blink to "wake up"
            performBlink()

            // Look around curiously
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                lookAround()
            }
        }

        // Phase 3: Tagline appears (1600-2200ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            phase = .taglineAppearing

            withAnimation(.easeOut(duration: 0.5)) {
                taglineOpacity = 1.0
                taglineOffset = 0
            }
        }

        // Phase 4: Hold and complete (2500ms+)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            phase = .complete

            // One more gentle blink before handoff
            performBlink()

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                onComplete?()
            }
        }
    }

    private func performBlink() {
        withAnimation(.easeIn(duration: 0.08)) {
            blinkProgress = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.12)) {
                blinkProgress = 0.0
            }
        }
    }

    private func lookAround() {
        // Look right
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            pupilLookDirection = CGPoint(x: 0.6, y: -0.2)
        }

        // Look left
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                pupilLookDirection = CGPoint(x: -0.5, y: 0.1)
            }
        }

        // Center (looking at user)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                pupilLookDirection = .zero
            }
        }
    }
}

// MARK: - Splash Phase

private enum SplashPhase {
    case initial
    case eyeAppearing
    case eyeWakingUp
    case taglineAppearing
    case complete
}

// MARK: - Preview

#if DEBUG
struct MagicalSplashView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            MagicalSplashView(
                onComplete: { print("Complete!") },
                isReturningUser: false
            )
            .previewDisplayName("New User")

            MagicalSplashView(
                onComplete: { print("Complete!") },
                isReturningUser: true,
                userName: "Sarah"
            )
            .previewDisplayName("Returning User")
        }
    }
}
#endif
