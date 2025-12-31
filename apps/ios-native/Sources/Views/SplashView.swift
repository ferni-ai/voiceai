import SwiftUI
import FerniShared

// MARK: - Splash View
/// Clean animated splash showing the Avatar face (PixarVoiceOrb) with gentle breathing.
/// Matches the web app experience - avatar with subtle glow animation.

struct SplashView: View {
    @Binding var showSplash: Bool
    var personaColor: Color = Color(hex: 0x4a6741)

    // Animation state
    @State private var opacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var scale: CGFloat = 0.8

    var body: some View {
        ZStack {
            // Deep black background
            Color.black.ignoresSafeArea()

            // Ambient glow behind avatar
            RadialGradient(
                colors: [
                    personaColor.opacity(0.15),
                    personaColor.opacity(0.05),
                    Color.clear
                ],
                center: .center,
                startRadius: 40,
                endRadius: 250
            )
            .offset(y: -60)

            VStack(spacing: 40) {
                // Avatar face using PixarVoiceOrb
                PixarVoiceOrb(
                    persona: PersonaRegistry.get("ferni"),
                    isActive: true,  // Breathing animation
                    size: 140,
                    emotionHint: nil,
                    showEyes: true,
                    useMagicalEyes: true
                )
                .scaleEffect(scale)

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
        // Fade in and scale up
        withAnimation(.easeOut(duration: 0.5)) {
            opacity = 1.0
            scale = 1.0
        }

        // Text fade in
        withAnimation(.easeOut(duration: 0.4).delay(0.3)) {
            textOpacity = 1.0
        }

        // Complete and transition out after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
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
