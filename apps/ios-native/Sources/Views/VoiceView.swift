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

    var body: some View {
        ZStack {
            // Background gradient
            backgroundGradient

            VStack(spacing: 0) {
                Spacer()

                // Main voice orb (centered, large)
                voiceOrbSection

                // Status text
                statusSection

                Spacer()

                // Bottom control bar
                controlBar
            }
            .padding(.bottom, 30)
        }
        .ignoresSafeArea()
        .onChange(of: session.state) { newState in
            handleStateChange(newState)
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)

        return LinearGradient(
            colors: [
                Color.black,
                persona.primaryColor.opacity(0.15),
                Color.black
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Voice Orb Section

    private var voiceOrbSection: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        let orbSize: CGFloat = 200

        return PixarVoiceOrb(
            persona: persona,
            isActive: session.state.isActive,
            size: orbSize,
            emotionHint: emotionHint
        )
        .frame(width: orbSize, height: orbSize)
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

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: 50) {
            // Mute button
            ControlButton(
                icon: session.isMuted ? "mic.slash.fill" : "mic.fill",
                isActive: !session.isMuted,
                action: {
                    appState.playTapHaptic()
                    session.toggleMute()
                }
            )

            // Connect/Disconnect button (large, center)
            ConnectButton(
                isConnected: session.state.isActive,
                isConnecting: session.state == .connecting,
                action: {
                    handleConnectTap()
                }
            )

            // Persona picker button
            ControlButton(
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
        .padding(.horizontal, 40)
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

// MARK: - Control Button

struct ControlButton: View {
    let icon: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(isActive ? .white : .white.opacity(0.5))
                .frame(width: 50, height: 50)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.1))
                )
        }
    }
}

// MARK: - Connect Button

struct ConnectButton: View {
    let isConnected: Bool
    let isConnecting: Bool
    let action: () -> Void

    @State private var rotationAngle: Double = 0

    var body: some View {
        Button(action: action) {
            ZStack {
                // Background circle
                Circle()
                    .fill(isConnected ? Color.red.opacity(0.8) : Color.green.opacity(0.8))
                    .frame(width: 70, height: 70)

                // Icon
                if isConnecting {
                    // Spinning indicator
                    Circle()
                        .stroke(Color.white.opacity(0.3), lineWidth: 3)
                        .frame(width: 30, height: 30)
                        .overlay(
                            Circle()
                                .trim(from: 0, to: 0.3)
                                .stroke(Color.white, lineWidth: 3)
                                .rotationEffect(.degrees(rotationAngle))
                        )
                        .onAppear {
                            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                                rotationAngle = 360
                            }
                        }
                } else {
                    Image(systemName: isConnected ? "phone.down.fill" : "phone.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .disabled(isConnecting)
    }
}

// MARK: - Preview

#Preview {
    VoiceView()
        .environmentObject(IOSLiveKitSession())
        .environmentObject(AppState())
}
