import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// Ferni's face. While Ferni talks, a tap (or VoiceOver's "Interrupt") asks
/// Ferni to stop; that is the avatar's only gesture.
struct CallAvatar: View {
    let call: CallSession
    /// A sheet or cover hides Ferni, so the avatar stops drawing.
    var covered = false
    /// Bumped when the person comes back after a long time away: Ferni wakes.
    var wake = 0
    /// Bumped when the person comes back after a few seconds away: a double take.
    var doubleTake = 0
    /// What the body asks for (a touch's haptic).
    var onCue: ((KeyedCue) -> Void)?
    /// Ferni's body; a test passes its own to see what reached it.
    var rig: AliveRig?
    /// Who's shown, when not the call's (at home: who answers next).
    var personaID: String?
    /// The room's hour, so its evening light reaches Ferni.
    var roomHour: Int?

    var body: some View {
        let avatar = call.avatar
        let speaking = avatar.pose == .speaking
        let shown = personaID ?? avatar.personaID
        AvatarView(
            persona: WindowPersona(personaId: shown),
            expression: avatar.expression,
            activity: Self.activity(avatar.pose),
            name: PersonaRegistry.get(shown).name,
            covered: covered,
            wake: wake,
            doubleTake: doubleTake,
            personSpeaking: call.isUserSpeaking,
            micro: avatar.micro,
            moment: avatar.moment,
            rig: rig,
            level: { [level = call.agentLevel] in level.level },
            roomHour: roomHour,
            onCue: onCue
        )
        // AvatarView's own shape (Ferni, not his whole square) is the hit area
        // for this tap too; an outer shape here would replace it.
        .onTapGesture { if speaking { Task { await call.interrupt() } } }
        .accessibilityHint(speaking ? "Tap to interrupt" : "")
        .accessibilityActions {
            if speaking {
                Button("Interrupt") { Task { await call.interrupt() } }
            }
        }
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

/// Who you're talking with, small, at the top of a call.
struct NameChip: View {
    let personaID: String
    /// Who it says: in a handoff, the new name waits until the teammate has
    /// the middle of the stage (design audit P1-3: it said Maya ~2.5 s early,
    /// while Ferni was still in front).
    @State private var shown: String?

    var body: some View {
        let persona = PersonaRegistry.get(shown ?? personaID)
        Text("\(persona.name) · \(persona.role)")
            .font(FerniType.caption)
            .foregroundStyle(FerniColor.textSecondary)
            .contentTransition(.opacity)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("call.nameChip")
            .task(id: personaID) {
                if let from = shown, from != personaID {
                    try? await Task.sleep(for: .seconds(AliveRig.handoffSeconds(from: WindowPersona(personaId: from))))
                    guard !Task.isCancelled else { return }
                }
                withAnimation(.easeOut(duration: 0.25)) { shown = personaID }
            }
    }
}

/// The caption area is the state line (north star §3.4): what's being said
/// while it's said, and otherwise who is doing what. Ferni's lines and state
/// lines never trail off in an ellipsis; only progress does ("Calling Ferni…").
struct CallCaptions: View {
    let call: CallSession
    let showWords: Bool
    let report: (Caption) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        // Two lines at accessibility sizes: three no longer fit above the controls.
        let lines = showWords ? Array(call.captions.lines.suffix(typeSize.isAccessibilitySize ? 2 : 3)) : []
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            let labelled = Self.labelled(lines)
            ForEach(lines) { line in
                let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
                let isFerni = line.speaker == .ferni
                if labelled.contains(line.id), let id = line.personaID { Speaker(personaID: id) }
                Text(text)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(isFerni ? FerniColor.textPrimary : FerniColor.textSecondary)
                    .frame(maxWidth: .infinity, alignment: isFerni ? .leading : .trailing)
                    .multilineTextAlignment(isFerni ? .leading : .trailing)
                    .accessibilityLabel(isFerni ? "\(PersonaRegistry.get(line.personaID ?? call.avatar.personaID).name): \(text)" : "You: \(text)")
                    .contextMenu {
                        if isFerni {
                            Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = text }
                            Button("Report this reply", systemImage: "flag") { report(line) }
                        }
                    }
                    .accessibilityActions {
                        // Only Ferni's lines can be reported (critic M4).
                        if isFerni { Button("Report this reply") { report(line) } }
                    }
            }
            if let state = Self.state(call, name: name) {
                HStack(spacing: FerniSpace.breath) {
                    Text(state)
                    if call.avatar.pose == .thinking { ThinkingDots() }
                }
                .font(FerniType.body)
                .foregroundStyle(FerniColor.textMuted)
                .frame(maxWidth: .infinity)
                .contentTransition(.opacity)
                .accessibilityElement(children: .combine)
            }
        }
        .animation(.easeOut(duration: 0.2), value: lines)
    }

    private var name: String { PersonaRegistry.get(call.avatar.personaID).name }

    /// Lines that start a run from one teammate get their name over them, once
    /// more than Ferni has spoken (or a teammate took the call): after a
    /// handoff, Maya's words looked exactly like Ferni's (design audit P1-3).
    /// A call with only Ferni stays as it was.
    static func labelled(_ lines: [Caption]) -> Set<String> {
        let ours = lines.filter { $0.speaker == .ferni }
        let who = Set(ours.compactMap(\.personaID))
        guard who.count > 1 || who.contains(where: { $0 != PersonaRegistry.ferni.id }) else { return [] }
        var labelled: Set<String> = [], previous: String?
        for line in ours {
            if line.personaID != previous { labelled.insert(line.id) }
            previous = line.personaID
        }
        return labelled
    }

    /// Nil while Ferni is talking: the words say it.
    static func state(_ call: CallSession, name: String) -> String? {
        switch call.phase {
        case .connecting: return String(localized: "Calling \(name)…")
        case .waitingForFerni: return String(localized: "\(name)'s on the way…")
        case .reconnecting: return String(localized: "Reconnecting…")
        case .live:
            if call.isOnHold { return String(localized: "On hold") }
            if call.isMuted { return String(localized: "You're muted") }
            switch call.avatar.pose {
            case .speaking: return nil
            case .thinking: return String(localized: "\(name)'s thinking")
            default: return String(localized: "\(name)'s listening")
            }
        default: return nil
        }
    }
}

/// Whose words follow: a dot in the teammate's colour and their name.
private struct Speaker: View {
    let personaID: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(WindowPersona(personaId: personaID).primaryColor)
                .frame(width: 8, height: 8)
            Text(PersonaRegistry.get(personaID).name)
                .font(FerniType.caption)
                .foregroundStyle(FerniColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true) // each line's label already says who
        .accessibilityIdentifier("captions.speaker.\(personaID)")
    }
}

/// What VoiceOver is told about the call on its own: only what needs
/// attention (trouble, being put on hold), never each turn over Ferni's voice
/// (ios-motion-spec §6.3, critic M4). Handoffs are announced by the avatar.
enum CallAnnouncement {
    static func text(phase: CallSession.Phase, onHold: Bool) -> String? {
        switch phase {
        case .reconnecting: String(localized: "Reconnecting…")
        case .live where onHold: String(localized: "On hold")
        case .failed(let problem): problem.message
        default: nil
        }
    }
}

/// Three dots that float while Ferni thinks; opacity only, so Reduce Motion is fine.
private struct ThinkingDots: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    let phase = (t - Double(i) * 0.2).truncatingRemainder(dividingBy: 1.6) / 1.6
                    Circle()
                        .frame(width: 5, height: 5)
                        .opacity(0.4 + 0.6 * sin(phase * .pi))
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Talk when there's no call; in one, the Talk button becomes Mute · End · More
/// on Liquid Glass (one container, so they morph together).
struct CallControls: View {
    let call: CallSession
    let team: TeamStore
    let talk: () -> Void
    let more: () -> Void
    @Namespace private var glass

    var body: some View {
        GlassEffectContainer(spacing: FerniSpace.rest) {
            HStack(spacing: FerniSpace.rest) {
                if call.isActive {
                    Group {
                        if call.isOnHold {
                            // The audio didn't come back on its own: one tap tries again.
                            circle("play.fill", muted: false, label: "Resume call") {
                                Task { await call.resume() }
                            }
                        } else {
                            circle("mic.fill", muted: call.isMuted, label: call.isMuted ? "Unmute" : "Mute") {
                                Task { await call.toggleMute() }
                            }
                            .keyboardShortcut("m", modifiers: .command)
                        }
                    }
                    .disabled(call.phase != .live)
                    .glassEffectID("left", in: glass)

                    Button {
                        Task { await call.end() }
                    } label: {
                        Image(systemName: "phone.down.fill")
                            .font(.title)
                            .dynamicTypeSize(...Self.largestGlyph)
                            .foregroundStyle(FerniColor.onError)
                            .frame(width: 72, height: 72)
                            .contentShape(.circle)
                    }
                    .buttonStyle(.plain)
                    .accessibilityShowsLargeContentViewer {
                        Label(call.phase == .live || call.phase == .reconnecting ? "End call" : "Cancel", systemImage: "phone.down.fill")
                    }
                    .glassEffect(.regular.tint(FerniColor.error).interactive(), in: .circle)
                    .glassEffectID("talk", in: glass)
                    .accessibilityLabel(call.phase == .live || call.phase == .reconnecting ? "End call" : "Cancel")
                    .keyboardShortcut(".", modifiers: .command)

                    circle("ellipsis", muted: false, label: "More", action: more)
                        .glassEffectID("right", in: glass)
                } else {
                    Button(action: talk) {
                        Label(talkLabel, systemImage: "waveform")
                            .font(FerniType.button)
                            .foregroundStyle(FerniColor.onAccent)
                            .frame(maxWidth: 420, minHeight: 56)
                            // A plain button hit-tests only what it draws: without this,
                            // only the words started a call, not the glass around them.
                            .contentShape(.capsule)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.tint(FerniColor.accent).interactive(), in: .capsule)
                    .glassEffectID("talk", in: glass)
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.55), value: call.isActive)
        .padding(.horizontal, FerniSpace.rest)
        .padding(.bottom, FerniSpace.pause)
    }

    /// The call circles keep their size, so their glyphs stop growing here;
    /// a long press shows the Large Content Viewer instead, as bar buttons do.
    static let largestGlyph = DynamicTypeSize.xxxLarge

    private func circle(_ symbol: String, muted: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: muted ? "mic.slash.fill" : symbol)
                .font(.title2)
                .dynamicTypeSize(...Self.largestGlyph)
                .foregroundStyle(FerniColor.textPrimary)
                .frame(width: 60, height: 60)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityShowsLargeContentViewer { Label(label, systemImage: muted ? "mic.slash.fill" : symbol) }
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel(label)
    }

    private var talkLabel: String {
        switch call.phase {
        case .failed(.connectionLost): String(localized: "Call back")
        case .failed: String(localized: "Try again")
        default: String(localized: "Talk to \(PersonaRegistry.get(team.chosen).name)")
        }
    }
}

/// During a call: captions, where the sound goes, and help right now.
struct CallMoreSheet: View {
    @Binding var showCaptions: Bool
    /// Ferni's latest line, if there's one to report.
    let lastReply: Caption?
    let report: (Caption) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Help first: on an SE it was below the half sheet's fold, under
                // the settings (design audit P1-7).
                Section {
                    Link(destination: URL(string: "tel:988")!) {
                        Label("Get help now (988)", systemImage: "phone.arrow.up.right")
                    }
                    Link(destination: URL(string: "sms:988")!) {
                        Label("Text 988", systemImage: "message")
                    }
                } footer: {
                    Text("988 is the Suicide & Crisis Lifeline in the US, free and open all day and night.")
                }
                Section {
                    Toggle("Captions", isOn: $showCaptions)
                    if let lastReply {
                        Button("Report something Ferni said", systemImage: "flag") {
                            dismiss()
                            report(lastReply)
                        }
                    }
                    HStack {
                        Text("Audio output")
                        Spacer()
                        AudioRoutePicker().frame(width: 44, height: 44)
                    }
                }
            }
            .ferniPaper()
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .tint(FerniColor.accent)
        }
        // Half height over the call; drag up for the rest. On paper, not glass:
        // through it End's red and the captions showed behind the 988 rows
        // (design audit P2 #3).
        .presentationDetents([.medium, .large])
        .presentationBackground(FerniColor.background)
    }
}
