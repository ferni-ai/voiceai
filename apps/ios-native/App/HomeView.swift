import FerniDesign
import FerniVoice
import SwiftUI

/// The first screen is the call: Ferni, one big button, live captions, and the
/// account one tap away. Never silent, never stuck: every state says what's
/// happening, and End (Cancel while connecting) is always there.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        @Bindable var model = model
        let call = model.call
        NavigationStack {
            ScrollView {
                VStack(spacing: FerniSpace.rest) {
                    FerniWindowAvatar(
                        size: 200,
                        persona: WindowPersona(personaId: call.personaID),
                        expression: call.expression,
                        isSpeaking: .constant(call.isFerniSpeaking),
                        volume: .constant(call.isFerniSpeaking ? 0.6 : 0)
                    )
                    .opacity(call.phase == .reconnecting ? 0.5 : 1)
                    .padding(.top, FerniSpace.silence)
                    CallStatus(call: call)
                    CaptionsView(lines: call.captions.lines)
                    // At accessibility text sizes the controls scroll with the
                    // content instead of covering it.
                    if typeSize.isAccessibilitySize { CallControls(call: call) }
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, FerniSpace.rest)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .bottom) {
                if !typeSize.isAccessibilitySize { CallControls(call: call) }
            }
            .background(FerniColor.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.isShowingSettings = true
                    } label: {
                        Image(systemName: model.account.user?.isSignedInWithApple == true
                              ? "person.crop.circle.fill" : "person.crop.circle")
                            .font(.title2)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .tint(FerniColor.accent)
                    .accessibilityLabel("Account and settings")
                }
            }
            .sheet(isPresented: $model.isShowingSettings) {
                SettingsView()
            }
        }
    }
}

/// One line about the call from the person's side, plus what to do on a failure.
private struct CallStatus: View {
    let call: CallSession
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: FerniSpace.breath) {
            Text(headline)
                .font(FerniType.title)
                .foregroundStyle(FerniColor.textPrimary)
            if let detail {
                Text(detail)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(FerniColor.textSecondary)
            }
            if call.phase == .failed(.microphoneDenied) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .tint(FerniColor.accent)
            }
        }
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .contain)
        .onChange(of: headline) { _, line in
            AccessibilityNotification.Announcement(line).post()
        }
    }

    private var headline: String {
        switch call.phase {
        case .idle: "Hi, I'm Ferni."
        case .connecting: "Calling Ferni…"
        case .waitingForFerni: "Ferni's on the way…"
        case .live:
            if call.isMuted { "You're muted" } else {
                switch call.agentActivity {
                case .speaking?: "Ferni's talking"
                case .thinking?: "Ferni's thinking…"
                default: "Listening…"
                }
            }
        case .reconnecting: "Reconnecting…"
        case .ended: "Talk soon."
        case .failed: "Hmm."
        }
    }

    private var detail: String? {
        switch call.phase {
        case .idle: "Whenever you're ready, I'm here."
        case .ended: "I'm here whenever you want to talk again."
        case .failed(let problem): problem.message
        default: nil
        }
    }
}

/// The latest exchange, newest at the bottom: Ferni in the primary color, you in the secondary.
private struct CaptionsView: View {
    let lines: [Caption]

    var body: some View {
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            ForEach(lines.suffix(3)) { line in
                let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
                let isFerni = line.speaker == .ferni
                Text(text)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(isFerni ? FerniColor.textPrimary : FerniColor.textSecondary)
                    .frame(maxWidth: .infinity, alignment: isFerni ? .leading : .trailing)
                    .multilineTextAlignment(isFerni ? .leading : .trailing)
                    .accessibilityLabel(isFerni ? "Ferni: \(text)" : "You: \(text)")
            }
        }
        .animation(.easeOut(duration: 0.2), value: lines)
    }
}

/// Talk when there's no call; mute, end and the audio route during one.
private struct CallControls: View {
    let call: CallSession

    var body: some View {
        HStack(spacing: FerniSpace.rest) {
            if call.isActive {
                Button {
                    Task { await call.toggleMute() }
                } label: {
                    Image(systemName: call.isMuted ? "mic.slash.fill" : "mic.fill")
                        .font(.title2)
                        .frame(width: 60, height: 60)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
                .tint(FerniColor.textSecondary)
                .accessibilityLabel(call.isMuted ? "Unmute" : "Mute")
                .disabled(call.phase != .live)

                Button(role: .destructive) {
                    Task { await call.end() }
                } label: {
                    Image(systemName: "phone.down.fill")
                        .font(.title)
                        .frame(width: 72, height: 72)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.circle)
                .tint(FerniColor.error)
                .accessibilityLabel(call.phase == .live || call.phase == .reconnecting ? "End call" : "Cancel")

                AudioRoutePicker()
                    .frame(width: 60, height: 60)
                    .accessibilityLabel("Audio output")
            } else {
                Button {
                    call.start()
                } label: {
                    Label(talkLabel, systemImage: "waveform")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 56)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(FerniColor.accent)
            }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: call.isActive)
        .padding(.horizontal, FerniSpace.rest)
        .padding(.bottom, FerniSpace.pause)
    }

    private var talkLabel: String {
        switch call.phase {
        case .failed(.connectionLost): "Call back"
        case .failed: "Try again"
        default: "Talk to Ferni"
        }
    }
}

#Preview {
    HomeView().environment(AppModel(config: .production, firebaseReady: false))
}
