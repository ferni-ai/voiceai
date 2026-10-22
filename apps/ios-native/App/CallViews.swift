import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// Ferni's face. In a call a tap is a touch (its haptic), never an
/// interruption: holding a finger on him while he talks (or VoiceOver's
/// "Interrupt") asks him to stop. A stray tap used to cut him off.
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
            // Muted and waiting for you: he looks away until you're back (award upgrade 9).
            lookingAway: Self.looksAway(muted: call.isMuted, pose: avatar.pose),
            roomHour: roomHour,
            onCue: onCue
        )
        // AvatarView's own shape (Ferni, not his whole square) is the hit area
        // for these too; an outer shape here would replace it. At rest
        // AvatarView's own touch and hold apply instead.
        .gesture(
            LongPressGesture(minimumDuration: Self.interruptAfter)
                .onEnded { _ in if speaking { Task { await call.interrupt() } } }
                .exclusively(before: TapGesture().onEnded { touched() }),
            including: avatar.pose == .idle ? .none : .all
        )
        .accessibilityHint(speaking ? "Touch and hold to interrupt" : "")
        .accessibilityActions {
            if speaking {
                Button("Interrupt \(PersonaRegistry.get(shown).name)") { Task { await call.interrupt() } }
            }
        }
    }

    /// How long a finger stays on him before it interrupts.
    static let interruptAfter = 0.5

    @State private var lastTouch: ContinuousClock.Instant?

    /// A tap in a call: the touch's haptic, at most one every 2 s (as at rest).
    private func touched() {
        if let last = lastTouch, ContinuousClock.now - last < .seconds(2) { return }
        lastTouch = .now
        onCue?(.touch)
    }

    /// Only while he'd otherwise be watching you: not while he talks or thinks.
    static func looksAway(muted: Bool, pose: AvatarPose) -> Bool { muted && pose == .listening }

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
    /// For a few seconds after a handoff at accessibility sizes, the chip says
    /// "Maya joined" with her dot: there the captions keep their two lines for
    /// words (critic M-F).
    @State private var justJoined = false
    @Environment(\.dynamicTypeSize) private var typeSize

    static let joinedSeconds = 4.0

    var body: some View {
        let persona = PersonaRegistry.get(shown ?? personaID)
        let marks = justJoined && typeSize.isAccessibilitySize
        HStack(spacing: 6) {
            if marks {
                Circle()
                    .fill(WindowPersona(personaId: persona.id).primaryColor)
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
            }
            Text(marks ? "\(persona.name) joined" : "\(persona.name) · \(persona.role)")
        }
            .font(FerniType.caption)
            .foregroundStyle(FerniColor.textSecondary)
            .contentTransition(.opacity)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("call.nameChip")
            .task(id: personaID) {
                let handoff = shown.map { $0 != personaID } ?? false
                if let from = shown, from != personaID {
                    try? await Task.sleep(for: .seconds(AliveRig.handoffSeconds(from: WindowPersona(personaId: from))))
                    guard !Task.isCancelled else { return }
                }
                withAnimation(.easeOut(duration: 0.25)) { shown = personaID; justJoined = handoff }
                guard handoff else { return }
                try? await Task.sleep(for: .seconds(Self.joinedSeconds))
                guard !Task.isCancelled else { return }
                withAnimation(.easeOut(duration: 0.25)) { justJoined = false }
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
        let lines = showWords ? Self.shown(call.captions.lines, accessibilitySize: typeSize.isAccessibilitySize) : []
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            let labelled = Self.labelled(lines)
            ForEach(lines) { line in
              if line.joined, let id = line.personaID {
                Joined(personaID: id)
              } else {
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
            }
            if let state = Self.state(call, name: name) {
                HStack(spacing: FerniSpace.breath) {
                    Text(state)
                    if call.avatar.pose == .thinking { ThinkingDots() }
                }
                .font(FerniType.body)
                // Secondary ink in medium weight: the muted grey's thin strokes read
                // 4.9:1 at best on the room, and the audit failed "Calling Ferni…",
                // "Reconnecting…" and "On hold" once a scenario showed them (design
                // audit P2 #20).
                .fontWeight(.medium)
                .foregroundStyle(FerniColor.textSecondary)
                .frame(maxWidth: .infinity)
                .contentTransition(.opacity)
                .accessibilityElement(children: .combine)
            }
        }
        .animation(.easeOut(duration: 0.2), value: lines)
    }

    private var name: String { PersonaRegistry.get(call.avatar.personaID).name }

    /// The lines on screen: the last three, or two at accessibility sizes,
    /// where three no longer fit above the controls. There a join doesn't take
    /// one of the two (critic M-F): the name chip marks it and VoiceOver hears
    /// it (AvatarDirector's "Maya joined." announcement).
    static func shown(_ lines: [Caption], accessibilitySize: Bool) -> [Caption] {
        accessibilitySize ? Array(lines.filter { !$0.joined }.suffix(2)) : Array(lines.suffix(3))
    }

    /// Lines that start a run from one teammate get their name over them, once
    /// more than Ferni has spoken (or a teammate took the call): after a
    /// handoff, Maya's words looked exactly like Ferni's (design audit P1-3).
    /// A call with only Ferni stays as it was.
    static func labelled(_ lines: [Caption]) -> Set<String> {
        let ours = lines.filter { $0.speaker == .ferni && !$0.joined }
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
/// A teammate came in (award upgrade 4): her dot and "Maya joined", quiet
/// and centred between the words, so the captions say when the voice changed.
/// VoiceOver reads it in place among the captions; the handoff itself is
/// announced once, by the avatar.
private struct Joined: View {
    let personaID: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(WindowPersona(personaId: personaID).primaryColor)
                .frame(width: 8, height: 8)
            Text("\(PersonaRegistry.get(personaID).name) joined")
                .font(FerniType.caption)
                .foregroundStyle(FerniColor.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("captions.joined.\(personaID)")
    }
}

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
                    .accessibilityIdentifier("home.talk")
                }
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.55), value: call.isActive)
        .sensoryFeedback(trigger: call.isActive) { old, new in Self.startHaptic(from: old, to: new) }
        .padding(.horizontal, FerniSpace.rest)
        .padding(.bottom, FerniSpace.pause)
    }

    /// The call circles keep their size, so their glyphs stop growing here;
    /// a long press shows the Large Content Viewer instead, as bar buttons do.
    static let largestGlyph = DynamicTypeSize.xxxLarge

    /// One tap when a call starts. Ending and failing have the avatar's own
    /// haptics, so the controls add none (one per event, critic M5).
    static func startHaptic(from old: Bool, to new: Bool) -> SensoryFeedback? {
        !old && new ? .impact(weight: .medium) : nil
    }

    private func circle(_ symbol: String, muted: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: muted ? "mic.slash.fill" : symbol)
                .font(.title2)
                .dynamicTypeSize(...Self.largestGlyph)
                // Muted is plain at a glance: an ink circle, the glyph in paper
                // (design audit P2 #4: it barely looked different).
                .foregroundStyle(muted ? FerniColor.background : FerniColor.textPrimary)
                .frame(width: 60, height: 60)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityShowsLargeContentViewer { Label(label, systemImage: muted ? "mic.slash.fill" : symbol) }
        .glassEffect(muted ? .regular.tint(FerniColor.textPrimary).interactive() : .regular.interactive(), in: .circle)
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
                        IconRow("Get help now (988)", systemImage: "phone.arrow.up.right")
                    }
                    Link(destination: URL(string: "sms:988")!) {
                        IconRow("Text 988", systemImage: "message")
                    }
                } footer: {
                    SettingsFooter("988 is the Suicide & Crisis Lifeline in the US, free and open all day and night.")
                }
                Section {
                    Toggle("Captions", isOn: $showCaptions)
                    if let lastReply {
                        Button {
                            dismiss()
                            report(lastReply)
                        } label: { IconRow("Report something Ferni said", systemImage: "flag") }
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
