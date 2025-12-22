import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Voice View
/// Full-screen voice interface with Pixar-quality animated orb.
/// This is the main screen of the iOS app.

struct VoiceView: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @EnvironmentObject var appState: AppState

    // Animation state
    @State private var emotionHint: EmotionHint? = nil

    // Waveform animation
    @State private var waveformPhase: Double = 0

    var body: some View {
        ZStack {
            // Background gradient
            backgroundGradient

            // Show magical connecting view during connection
            if session.state == .connecting {
                ConnectingView(persona: PersonaRegistry.get(session.currentPersonaId))
                    .transition(.opacity)
            } else {
                // Main content
                VStack(spacing: 0) {
                    Spacer()

                    // Main voice orb (centered, large)
                    voiceOrbSection

                    // Status text
                    statusSection

                    Spacer()

                    // Audio waveform visualization
                    if session.state.isActive {
                        audioWaveform
                            .padding(.bottom, 20)
                    }

                    // Bottom control bar
                    controlBar
                }
                .padding(.bottom, 30)
                .transition(.opacity)
            }
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.5), value: session.state == .connecting)
        .onChange(of: session.state) { newState in
            handleStateChange(newState)
        }
        .onAppear {
            startWaveformAnimation()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)

        return ZStack {
            // Deep black base for maximum glow contrast
            Color.black

            // Subtle persona-colored ambient glow at center
            RadialGradient(
                colors: [
                    persona.primaryColor.opacity(0.12),
                    persona.primaryColor.opacity(0.05),
                    Color.clear
                ],
                center: .center,
                startRadius: 50,
                endRadius: 400
            )
            .offset(y: -100) // Center around orb area

            // Bottom gradient fade
            LinearGradient(
                colors: [
                    Color.clear,
                    Color.black.opacity(0.8)
                ],
                startPoint: .center,
                endPoint: .bottom
            )
        }
    }

    // MARK: - Voice Orb Section

    private var voiceOrbSection: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        // Larger orb for iOS - more prominent!
        let orbSize: CGFloat = 260
        // Frame needs to be 2.2x to show full glow halo
        let frameSize: CGFloat = orbSize * 2.2

        return PixarVoiceOrb(
            persona: persona,
            isActive: session.state.isActive,
            size: orbSize,
            emotionHint: emotionHint
        )
        .frame(width: frameSize, height: frameSize)
        .onTapGesture {
            handleOrbTap()
        }
    }

    // MARK: - Status Section

    private var statusSection: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)

        return VStack(spacing: 8) {
            // State text
            Text(session.state.title)
                .font(.system(size: 17, weight: .medium, design: .rounded))
                .foregroundColor(.white.opacity(0.9))

            // Persona name
            Text(persona.name)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(.white.opacity(0.6))

            // Latest transcript preview (strip SSML tags)
            if let lastMessage = session.transcriptMessages.last {
                Text(stripSSML(lastMessage.text))
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.top, 12)
            }
        }
        .padding(.top, 30)
    }

    // MARK: - Audio Waveform

    private var audioWaveform: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        let barCount = 40

        return HStack(spacing: 3) {
            ForEach(0..<barCount, id: \.self) { index in
                let indexPhase = Double(index) / Double(barCount)
                // Create organic wave pattern
                let wave1 = sin(waveformPhase * 2 + indexPhase * .pi * 4) * 0.4
                let wave2 = sin(waveformPhase * 3.7 + indexPhase * .pi * 6) * 0.25
                let wave3 = sin(waveformPhase * 7.3 + indexPhase * .pi * 2) * 0.15
                let height = max(0.15, 0.5 + wave1 + wave2 + wave3)

                RoundedRectangle(cornerRadius: 2)
                    .fill(
                        LinearGradient(
                            colors: [
                                persona.primaryColor.opacity(0.8),
                                persona.secondaryColor.opacity(0.6)
                            ],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                    .frame(width: 4, height: CGFloat(height) * 30)
            }
        }
        .frame(height: 35)
    }

    private func startWaveformAnimation() {
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            waveformPhase += 0.08
        }
    }

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: 40) {
            // Mute button
            GlassControlButton(
                icon: session.isMuted ? "mic.slash.fill" : "mic.fill",
                isActive: !session.isMuted,
                action: {
                    appState.playTapHaptic()
                    session.toggleMute()
                }
            )

            // Connect/Disconnect button (large, center)
            PremiumConnectButton(
                state: session.state,
                persona: PersonaRegistry.get(session.currentPersonaId),
                action: {
                    handleConnectTap()
                }
            )

            // Persona picker button
            GlassControlButton(
                icon: "person.2.fill",
                isActive: false,
                action: {
                    appState.playTapHaptic()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        appState.showPersonaPicker = true
                    }
                }
            )
        }
        .padding(.horizontal, 30)
    }

    // MARK: - Actions

    private func handleOrbTap() {
        appState.playTapHaptic()

        switch session.state {
        case .disconnected, .error:
            Task {
                await session.connect()
            }
        case .connected, .listening, .speaking, .thinking:
            // Tap during active session could trigger push-to-talk or show transcript
            appState.showTranscript = true
        case .connecting:
            break // Do nothing while connecting
        }
    }

    private func handleConnectTap() {
        switch session.state {
        case .disconnected, .error:
            appState.playTapHaptic()
            Task {
                await session.connect()
            }
        case .connected, .listening, .speaking, .thinking:
            appState.playTapHaptic()
            session.disconnect()
        case .connecting:
            break
        }
    }

    private func handleStateChange(_ newState: VoiceState) {
        switch newState {
        case .connected:
            appState.playSuccessHaptic()
            // Trigger happy emotion on connect
            emotionHint = .happy
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                emotionHint = nil
            }
        case .error:
            appState.playErrorHaptic()
        default:
            break
        }
    }

    /// Strip SSML tags from transcript text
    private func stripSSML(_ text: String) -> String {
        // Remove all XML/SSML tags like <break time="200ms"/>
        var result = text
        // Remove self-closing tags
        result = result.replacingOccurrences(
            of: "<[^>]+/>",
            with: "",
            options: .regularExpression
        )
        // Remove opening and closing tags
        result = result.replacingOccurrences(
            of: "<[^>]+>",
            with: "",
            options: .regularExpression
        )
        // Clean up extra whitespace
        result = result.replacingOccurrences(
            of: "\\s+",
            with: " ",
            options: .regularExpression
        )
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Glass Control Button

/// iOS-native glassmorphism control button
struct GlassControlButton: View {
    let icon: String
    let isActive: Bool
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            ZStack {
                // Glass background
                Circle()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.3),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )

                // Icon
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(isActive ? .white : .white.opacity(0.6))
            }
            .frame(width: 54, height: 54)
            .scaleEffect(isPressed ? 0.92 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.1)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { isPressed = false }
                }
        )
    }
}

// MARK: - Premium Connect Button

/// Premium iOS-native connect button with persona colors
struct PremiumConnectButton: View {
    let state: VoiceState
    let persona: Persona
    let action: () -> Void

    @State private var isPressed = false
    @State private var rotationAngle: Double = 0
    @State private var pulseScale: CGFloat = 1.0

    var isConnected: Bool { state.isActive }
    var isConnecting: Bool { state == .connecting }

    var body: some View {
        Button(action: action) {
            ZStack {
                // Outer glow ring (when connected)
                if isConnected {
                    Circle()
                        .stroke(persona.glowColor.opacity(0.3), lineWidth: 2)
                        .frame(width: 90, height: 90)
                        .scaleEffect(pulseScale)
                }

                // Glass background with gradient
                Circle()
                    .fill(
                        LinearGradient(
                            colors: isConnected
                                ? [Color(hex: 0xe85d5d), Color(hex: 0xc23c3c)]  // Red gradient for disconnect
                                : [persona.primaryColor, persona.secondaryColor],  // Persona colors for connect
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.4),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: (isConnected ? Color(hex: 0xe85d5d) : persona.glowColor).opacity(0.4), radius: 12)
                    .frame(width: 76, height: 76)

                // Icon or spinner
                if isConnecting {
                    // Spinning indicator
                    ZStack {
                        Circle()
                            .stroke(Color.white.opacity(0.3), lineWidth: 3)
                            .frame(width: 32, height: 32)

                        Circle()
                            .trim(from: 0, to: 0.3)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .frame(width: 32, height: 32)
                            .rotationEffect(.degrees(rotationAngle))
                    }
                    .onAppear {
                        withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                            rotationAngle = 360
                        }
                    }
                } else {
                    Image(systemName: isConnected ? "phone.down.fill" : "waveform")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
            .scaleEffect(isPressed ? 0.92 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isConnecting)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.1)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { isPressed = false }
                }
        )
        .onAppear {
            // Pulse animation for connected state
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulseScale = 1.1
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VoiceView()
        .environmentObject(IOSLiveKitSession())
        .environmentObject(AppState())
}
