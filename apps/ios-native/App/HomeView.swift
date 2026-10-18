import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// The first screen is the call: Ferni, one big button, live captions, and the
/// account one tap away. Never silent, never stuck: every state says what's
/// happening, and End (Cancel while connecting) is always there.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        @Bindable var model = model
        let call = model.call
        NavigationStack {
            ScrollView {
                VStack(spacing: FerniSpace.rest) {
                    CallAvatar(avatar: call.avatar, level: call.agentLevel)
                    .opacity(call.phase == .reconnecting ? 0.5 : 1)
                    .padding(.top, FerniSpace.silence)
                    CallStatus(call: call)
                    if call.isActive {
                        CaptionsView(lines: call.captions.lines)
                    } else {
                        TeamRow(team: model.team)
                    }
                    // At accessibility text sizes the controls scroll with the
                    // content instead of covering it.
                    if typeSize.isAccessibilitySize { CallControls(call: call, team: model.team, talk: model.talk) }
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, FerniSpace.rest)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .bottom) {
                if !typeSize.isAccessibilitySize { CallControls(call: call, team: model.team, talk: model.talk) }
            }
            .background(RoomBackground(persona: WindowPersona(personaId: call.avatar.personaID)))
            .task(id: reduceMotion) { call.avatar.reduceMotion = reduceMotion }
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
            .fullScreenCover(isPresented: $model.isAskingConsent) {
                ConsentView(
                    onAgree: {
                        model.isAskingConsent = false
                        Task { await model.agreeAndTalk() }
                    },
                    onNotNow: { model.isAskingConsent = false }
                )
            }
        }
    }
}

/// Ferni's face, driven by the call's avatar state and Ferni's voice level.
private struct CallAvatar: View {
    let avatar: AvatarModel
    let level: AudioLevelMeter

    var body: some View {
        AvatarView(
            persona: WindowPersona(personaId: avatar.personaID),
            expression: avatar.expression,
            activity: Self.activity(avatar.pose),
            name: PersonaRegistry.get(avatar.personaID).name,
            level: { [level] in level.level }
        )
        .frame(width: 200, height: 200)
    }

    static func activity(_ pose: AvatarPose) -> AvatarActivity {
        switch pose {
        case .idle, .departing: .idle
        case .arriving, .handoffArriving: .arriving
        case .listening: .listening
        case .thinking: .thinking
        case .speaking: .speaking
        case .reconnecting: .reconnecting
        case .error: .error
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
                .font(FerniType.greeting)
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
        case .idle: Greeting.headline(hour: Calendar.current.component(.hour, from: .now), firstVisit: !call.hasTalked)
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

/// Ferni's hello, by time of day. A first visit gets an introduction.
enum Greeting {
    static func headline(hour: Int, firstVisit: Bool) -> String {
        if firstVisit { return "Hi, I'm Ferni." }
        switch hour {
        case 5..<12: return "Good morning."
        case 12..<17: return "Good afternoon."
        case 17..<22: return "Good evening."
        default: return "Up late? I'm here."
        }
    }
}

/// Your corner: the team, small. Tap a teammate to choose who answers next;
/// someone not on the team yet says why in their own words.
private struct TeamRow: View {
    let team: TeamStore
    @State private var note: String?

    var body: some View {
        VStack(spacing: FerniSpace.breath) {
            HStack(spacing: FerniSpace.pause) {
                ForEach(PersonaRegistry.all) { persona in
                    let here = team.isOnTeam(persona.id)
                    Button {
                        note = here ? nil : team.teasers[persona.id] ?? "\(persona.name) joins as you and Ferni get to know each other."
                        team.choose(persona.id)
                    } label: {
                        AvatarPortrait(persona: WindowPersona(personaId: persona.id), present: here)
                            .frame(width: 40, height: 40)
                            .padding(2)
                            .overlay {
                                if team.chosen == persona.id {
                                    Circle().stroke(FerniColor.accent, lineWidth: 2)
                                }
                            }
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(persona.name), \(persona.role.lowercased())")
                    .accessibilityValue(team.chosen == persona.id ? "Answers next" : here ? "On your team" : "Not on your team yet")
                }
            }
            if let note {
                Text(note)
                    .font(FerniType.footnote)
                    .foregroundStyle(FerniColor.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .sensoryFeedback(.selection, trigger: team.chosen)
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
    let team: TeamStore
    let talk: () -> Void

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
                .ferniGlass()
                .buttonBorderShape(.circle)
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
                Button(action: talk) {
                    Label(talkLabel, systemImage: "waveform")
                        .font(FerniType.button)
                        .frame(maxWidth: 420, minHeight: 56)
                }
                .ferniPrimaryGlass()
                .buttonBorderShape(.capsule)
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
        default: "Talk to \(PersonaRegistry.get(team.chosen).name)"
        }
    }
}

#Preview {
    HomeView().environment(AppModel(config: .production, firebaseReady: false))
}
