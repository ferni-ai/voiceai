import SwiftUI
import FerniShared

// MARK: - Splash View
/// Beautiful animated splash screen with 3-stone Zen iconography.
/// Shows briefly after app launch before transitioning to main content.

struct SplashView: View {
    @Binding var showSplash: Bool

    // Animation state
    @State private var time: Double = 0
    @State private var opacity: Double = 0
    @State private var stoneScale: CGFloat = 0.5
    @State private var glowOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var ringScale: CGFloat = 0.8

    let ferniGreen = Color(hex: 0x4a6741)

    var body: some View {
        ZStack {
            // Deep black background
            Color.black.ignoresSafeArea()

            // Ambient glow
            RadialGradient(
                colors: [
                    ferniGreen.opacity(glowOpacity * 0.2),
                    ferniGreen.opacity(glowOpacity * 0.05),
                    Color.clear
                ],
                center: .center,
                startRadius: 20,
                endRadius: 300
            )

            VStack(spacing: 30) {
                // 3-Stone Logo
                ZStack {
                    // Outer glow ring
                    Circle()
                        .stroke(ferniGreen.opacity(glowOpacity * 0.3), lineWidth: 2)
                        .frame(width: 160, height: 160)
                        .scaleEffect(ringScale)

                    // Background circle
                    Circle()
                        .fill(ferniGreen)
                        .frame(width: 120, height: 120)
                        .shadow(color: ferniGreen.opacity(0.5), radius: 20)

                    // Three stones (nested circles)
                    ZStack {
                        // Outer stone (white)
                        Circle()
                            .fill(Color.white)
                            .frame(width: 48, height: 48)

                        // Middle stone (green)
                        Circle()
                            .fill(ferniGreen.opacity(0.8))
                            .frame(width: 32, height: 32)

                        // Inner stone (dark)
                        Circle()
                            .fill(Color(hex: 0x2c2520))
                            .frame(width: 16, height: 16)

                        // Highlight
                        Circle()
                            .fill(Color.white.opacity(0.9))
                            .frame(width: 5, height: 5)
                            .offset(x: -4, y: -4)
                    }
                    .scaleEffect(stoneScale)
                }

                // App name
                VStack(spacing: 8) {
                    Text("Ferni")
                        .font(FerniFont.display(size: 32, weight: .bold))
                        .foregroundColor(.white)

                    Text("Your AI Team")
                        .font(FerniFont.body(size: 15, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
                .opacity(textOpacity)
            }
            .opacity(opacity)
        }
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        // Start continuous timer for subtle animations
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { timer in
            time += 1.0 / 60.0

            // Subtle breathing on the ring
            let breath = sin(time * 2) * 0.05
            ringScale = 1.0 + breath

            // Auto-complete after 2 seconds
            if time > 2.0 {
                timer.invalidate()
            }
        }

        // Fade in
        withAnimation(.easeOut(duration: 0.4)) {
            opacity = 1.0
        }

        // Scale up stones with spring
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.1)) {
            stoneScale = 1.0
        }

        // Glow fade in
        withAnimation(.easeOut(duration: 0.8).delay(0.2)) {
            glowOpacity = 1.0
        }

        // Text fade in
        withAnimation(.easeOut(duration: 0.5).delay(0.4)) {
            textOpacity = 1.0
        }

        // Complete and transition out after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(.easeInOut(duration: 0.4)) {
                opacity = 0
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                showSplash = false
            }
        }
    }
}

// MARK: - Preview

#Preview {
    SplashView(showSplash: .constant(true))
}
