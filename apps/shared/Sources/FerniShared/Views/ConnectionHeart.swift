import SwiftUI

// MARK: - Connection Heart
/// A living heart indicator that represents the connection between user and Ferni.
/// Inspired by the web app's connection-heart.ui.ts - the heart "comes alive" when connected.
///
/// STATES:
/// - Disconnected: Outline/broken heart, subtle pulse, waiting to connect
/// - Connecting: Heart fills with animation, healing
/// - Connected: Full heart with lub-dub heartbeat, shows milestone count
/// - Speaking: Subtle during conversation
/// - Error: Red broken heart with gentle pulse
///
/// BETTER THAN HUMAN:
/// - The heart literally comes alive when you connect
/// - We track the relationship, not just the session
/// - Every connection strengthens the bond

public struct ConnectionHeart: View {
    // MARK: - Configuration

    public enum ConnectionState: String {
        case disconnected
        case connecting
        case connected
        case speaking
        case error
    }

    let state: ConnectionState
    let milestoneCount: Int
    let personaColor: Color
    let onTap: (() -> Void)?

    // MARK: - Animation State

    @State private var heartScale: CGFloat = 1.0
    @State private var heartOpacity: Double = 1.0
    @State private var glowOpacity: Double = 0
    @State private var glowScale: CGFloat = 1.0
    @State private var fillProgress: CGFloat = 0
    @State private var isAnimating: Bool = false
    @State private var beatPhase: Int = 0  // For lub-dub rhythm

    // MARK: - Constants

    private let size: CGFloat = 36

    public init(
        state: ConnectionState = .disconnected,
        milestoneCount: Int = 0,
        personaColor: Color = Color(hexString: "4a6741"),
        onTap: (() -> Void)? = nil
    ) {
        self.state = state
        self.milestoneCount = milestoneCount
        self.personaColor = personaColor
        self.onTap = onTap
    }

    // MARK: - Body

    public var body: some View {
        Button(action: { onTap?() }) {
            ZStack {
                // Background glow
                heartGlow

                // The heart
                heartIcon
                    .scaleEffect(heartScale)
                    .opacity(heartOpacity)

                // Milestone badge (top right)
                if state == .connected && milestoneCount > 0 {
                    milestoneBadge
                }
            }
            .frame(width: size, height: size)
        }
        .buttonStyle(HeartButtonStyle())
        .onAppear {
            startAnimation()
        }
        .onChange(of: state) { _ in
            startAnimation()
        }
        .accessibilityLabel(accessibilityLabel)
    }

    // MARK: - Heart Icon

    private var heartIcon: some View {
        ZStack {
            // Outline heart (always visible, changes opacity)
            Image(systemName: state == .error ? "heart.slash" : "heart")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(heartOutlineColor)
                .opacity(state == .connected ? 0 : 1)

            // Filled heart (connected state)
            Image(systemName: "heart.fill")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(personaColor)
                .opacity(state == .connected ? 1 : fillProgress)
        }
    }

    // MARK: - Heart Glow

    private var heartGlow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        glowColor.opacity(glowOpacity * 0.6),
                        glowColor.opacity(glowOpacity * 0.2),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: size * 0.8
                )
            )
            .scaleEffect(glowScale)
            .blur(radius: 8)
    }

    // MARK: - Milestone Badge

    private var milestoneBadge: some View {
        Text("\(milestoneCount)")
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .frame(minWidth: 16, minHeight: 16)
            .padding(.horizontal, 4)
            .background(personaColor)
            .clipShape(Capsule())
            .offset(x: 12, y: -12)
            .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Colors

    private var heartOutlineColor: Color {
        switch state {
        case .disconnected:
            return Color(hexString: "9a8a82")  // Muted warm gray
        case .connecting:
            return Color(hexString: "d4a574")  // Amber/healing
        case .connected:
            return personaColor
        case .speaking:
            return personaColor.opacity(0.5)
        case .error:
            return Color(hexString: "c44b4b")  // Red
        }
    }

    private var glowColor: Color {
        switch state {
        case .error:
            return Color(hexString: "c44b4b")
        default:
            return personaColor
        }
    }

    private var accessibilityLabel: String {
        switch state {
        case .disconnected:
            return "Tap to connect with Ferni"
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Connected. \(milestoneCount) milestones together"
        case .speaking:
            return "In conversation"
        case .error:
            return "Connection lost. Tap to reconnect"
        }
    }

    // MARK: - Animations

    private func startAnimation() {
        isAnimating = false

        // Reset
        heartScale = 1.0
        heartOpacity = 1.0
        glowOpacity = 0
        glowScale = 1.0
        fillProgress = 0

        // Brief delay then start
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            isAnimating = true

            switch state {
            case .disconnected:
                startDisconnectedPulse()
            case .connecting:
                startConnectingAnimation()
            case .connected:
                playConnectionAnimation()
                startConnectedHeartbeat()
            case .speaking:
                // Subtle during speech
                withAnimation(.easeOut(duration: 0.3)) {
                    heartOpacity = 0.4
                }
            case .error:
                startErrorPulse()
            }
        }
    }

    // MARK: - Disconnected Pulse

    /// Gentle "waiting" pulse - the heart is dormant but alive
    private func startDisconnectedPulse() {
        guard isAnimating else { return }

        // Subtle breathing pulse
        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
            heartScale = 1.08
            heartOpacity = 0.8
        }
    }

    // MARK: - Connecting Animation

    /// Heart "healing" - transitional state
    private func startConnectingAnimation() {
        guard isAnimating else { return }

        // Faster pulse during connection
        withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
            heartScale = 1.1
            fillProgress = 0.6
        }

        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
            glowOpacity = 0.4
        }
    }

    // MARK: - Connection Animation

    /// Heart "comes alive" - celebration when connecting
    private func playConnectionAnimation() {
        // Big bounce on connection
        withAnimation(.spring(response: 0.3, dampingFraction: 0.4)) {
            heartScale = 1.4
            fillProgress = 1.0
            glowOpacity = 0.8
            glowScale = 1.8
        }

        // Settle back
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                heartScale = 1.0
                glowScale = 1.0
                glowOpacity = 0.3
            }
        }
    }

    // MARK: - Connected Heartbeat (Lub-Dub)

    /// The signature "lub-dub" heartbeat - makes the heart feel ALIVE
    /// Two-beat rhythm like a real heart: lub (first beat) - dub (second beat) - pause
    private func startConnectedHeartbeat() {
        guard isAnimating else { return }

        performLubDub()
    }

    private func performLubDub() {
        guard isAnimating, state == .connected else { return }

        // LUB (first beat) - stronger
        withAnimation(.easeOut(duration: 0.1)) {
            heartScale = 1.12
            glowOpacity = 0.5
        }

        // Quick settle from lub
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            guard self.isAnimating, self.state == .connected else { return }

            withAnimation(.easeIn(duration: 0.08)) {
                self.heartScale = 1.02
                self.glowOpacity = 0.3
            }
        }

        // DUB (second beat) - slightly softer
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            guard self.isAnimating, self.state == .connected else { return }

            withAnimation(.easeOut(duration: 0.1)) {
                self.heartScale = 1.08
                self.glowOpacity = 0.4
            }
        }

        // Settle from dub
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            guard self.isAnimating, self.state == .connected else { return }

            withAnimation(.easeIn(duration: 0.15)) {
                self.heartScale = 1.0
                self.glowOpacity = 0.2
            }
        }

        // Rest period, then repeat
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.performLubDub()
        }
    }

    // MARK: - Error Pulse

    /// Gentle error indication - not alarming, just informative
    private func startErrorPulse() {
        guard isAnimating else { return }

        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
            heartScale = 1.05
            heartOpacity = 0.8
            glowOpacity = 0.3
        }
    }
}

// MARK: - Heart Button Style

private struct HeartButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Celebration Modifier

extension ConnectionHeart {
    /// Play a celebration pulse (called when a new milestone is reached)
    public func celebrationPulse() {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.4)) {
            heartScale = 1.3
            glowOpacity = 0.8
            glowScale = 1.5
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                heartScale = 1.0
                glowScale = 1.0
                glowOpacity = 0.2
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
struct ConnectionHeart_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 40) {
            HStack(spacing: 40) {
                VStack {
                    ConnectionHeart(state: .disconnected)
                    Text("Disconnected")
                        .font(.caption)
                }

                VStack {
                    ConnectionHeart(state: .connecting)
                    Text("Connecting")
                        .font(.caption)
                }
            }

            HStack(spacing: 40) {
                VStack {
                    ConnectionHeart(state: .connected, milestoneCount: 12)
                    Text("Connected")
                        .font(.caption)
                }

                VStack {
                    ConnectionHeart(state: .error)
                    Text("Error")
                        .font(.caption)
                }
            }
        }
        .padding(40)
        .background(Color(hexString: "1a1612"))
        .previewDisplayName("Connection Heart States")
    }
}
#endif
