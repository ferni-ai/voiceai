import SwiftUI
import FerniShared

// MARK: - Connecting View
/// Full-screen connecting experience showing the Avatar face with a rotating ring.
/// Matches the web app's connecting state - avatar breathing with spinner.

struct ConnectingView: View {
    let persona: FerniShared.Persona

    // Animation timing
    @State private var time: Double = 0
    @State private var ringRotation: Double = 0
    @State private var pulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.5

    var body: some View {
        ZStack {
            // Deep black background
            Color.black.ignoresSafeArea()

            // Ambient glow behind avatar
            RadialGradient(
                colors: [
                    persona.glowColor.opacity(glowOpacity * 0.2),
                    persona.glowColor.opacity(glowOpacity * 0.05),
                    Color.clear
                ],
                center: .center,
                startRadius: 30,
                endRadius: 280
            )
            .offset(y: -60)
            .scaleEffect(pulseScale)

            VStack(spacing: 0) {
                Spacer()

                // Avatar with rotating ring
                ZStack {
                    // Rotating ring behind avatar
                    rotatingRing
                        .frame(width: 300, height: 300)

                    // Avatar face
                    PixarVoiceOrb(
                        persona: persona,
                        isActive: true,
                        size: 120,
                        emotionHint: nil,
                        showEyes: true,
                        useMagicalEyes: true
                    )
                }

                Spacer()

                // Status text at bottom
                statusText
                    .padding(.bottom, 100)
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    // MARK: - Rotating Ring

    private var rotatingRing: some View {
        ZStack {
            // Outer track ring (subtle)
            Circle()
                .stroke(persona.glowColor.opacity(0.15), lineWidth: 3)

            // Animated arc that rotates
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(
                    LinearGradient(
                        colors: [
                            persona.glowColor.opacity(0.8),
                            persona.glowColor.opacity(0.3)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    style: StrokeStyle(lineWidth: 3, lineCap: .round)
                )
                .rotationEffect(.degrees(ringRotation))

            // Second arc (opposite side, subtle)
            Circle()
                .trim(from: 0.5, to: 0.65)
                .stroke(
                    persona.glowColor.opacity(0.3),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round)
                )
                .rotationEffect(.degrees(ringRotation))
        }
    }

    // MARK: - Status Text

    private var statusText: some View {
        HStack(spacing: 6) {
            Text("Connecting")
                .font(FerniFont.body(size: 16, weight: .medium))
                .foregroundColor(.white.opacity(0.7))

            // Animated dots
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { index in
                    let dotPhase = (time * 2 + Double(index) * 0.3).truncatingRemainder(dividingBy: 1.0)
                    let opacity = sin(dotPhase * .pi)

                    Circle()
                        .fill(Color.white.opacity(0.3 + opacity * 0.5))
                        .frame(width: 5, height: 5)
                }
            }
        }
    }

    // MARK: - Animations

    private func startAnimations() {
        // Continuous rotation
        withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
            ringRotation = 360
        }

        // Subtle pulse on glow
        withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
            pulseScale = 1.1
            glowOpacity = 0.7
        }

        // Time for dot animation
        Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            time += 1.0 / 30.0
        }
    }
}

// MARK: - Preview

#Preview {
    ConnectingView(persona: PersonaRegistry.get("ferni"))
}
