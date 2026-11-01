import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// One room for Home and the call (design north star §3.3-3.4). At rest:
/// Ferni, his line and your team. In a call Ferni comes closer, the caption
/// area carries what's said and who's doing what, and the Talk button becomes
/// the call controls. There's no screen change. Never silent, never stuck:
/// End (Cancel while connecting) is always there.
struct HomeView: View {
    /// False in the iPad sidebar layout, which has Settings in the sidebar.
    var showsAccountButton = true
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var widthClass
    @State private var landscape = false

    var body: some View {
        @Bindable var model = model
        let call = model.call
        let inCall = call.isActive
        // iPad in landscape: the captions sit beside Ferni, not under (UX spec §9).
        let beside = inCall && widthClass == .regular && landscape
        NavigationStack {
            ScrollView {
                VStack(spacing: FerniSpace.rest) {
                    if beside {
                        HStack(alignment: .center, spacing: FerniSpace.silence) {
                            VStack(spacing: FerniSpace.rest) {
                                NameChip(personaID: call.avatar.personaID)
                                avatar(call: call, size: 320)
                            }
                            .frame(maxWidth: 600)
                            CallCaptions(call: call, showWords: model.showCaptions) { model.reporting = $0 }
                                .frame(maxWidth: 380)
                        }
                    } else {
                        if inCall { NameChip(personaID: call.avatar.personaID) }
                        avatar(call: call, size: inCall ? 240 : 200)
                            .padding(.top, inCall ? FerniSpace.breath : FerniSpace.silence)
                        if inCall {
                            CallCaptions(call: call, showWords: model.showCaptions) { model.reporting = $0 }
                        } else {
                            TimelineView(.everyMinute) { minute in
                                RestingLine(call: call, home: model.homeLine.current, now: minute.date)
                            }
                            if call.phase == .ended {
                                RememberCard(call: call, remembered: model.callRemembered)
                                NextStepsCard(call: call, steps: model.nextSteps)
                                #if FERNI_PUSH
                                NotificationAsk(push: model.push, uid: model.account.user?.uid)
                                #endif
                            }
                            if call.phase == .idle, let note = model.homeLine.current?.note {
                                NoteCard(note: note) { model.talk(aboutNote: note) }
                            }
                            if let prompt = SignInPrompt.shown(model.account.state) {
                                SignInPromptView(prompt: prompt) { model.isSigningIn = true }
                            }
                            TeamRow(team: model.team)
                        }
                    }
                    // At accessibility text sizes the controls scroll with the
                    // content instead of covering it.
                    if typeSize.isAccessibilitySize { controls }
                }
                .frame(maxWidth: beside ? 1000 : 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, FerniSpace.rest)
                .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.55), value: inCall)
            }
            .scrollBounceBehavior(.basedOnSize)
            .onGeometryChange(for: Bool.self) { $0.size.width > $0.size.height } action: { landscape = $0 }
            .safeAreaInset(edge: .bottom) {
                if !typeSize.isAccessibilitySize { controls }
            }
            .background(TimelineView(.everyMinute) { minute in
                // The room's light follows the clock, so an evening glow doesn't last until morning.
                RoomBackground(persona: WindowPersona(personaId: call.avatar.personaID), date: minute.date)
            })
            .task(id: reduceMotion) { call.avatar.reduceMotion = reduceMotion }
            // Trouble is announced wherever you are, including after the call view goes.
            .onChange(of: CallAnnouncement.text(phase: call.phase, onHold: call.isOnHold)) { _, line in
                if let line { AccessibilityNotification.Announcement(line).post() }
            }
            .toolbar {
                if showsAccountButton { ToolbarItem(placement: .topBarTrailing) {
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
                } }
            }
            .sheet(isPresented: $model.isShowingSettings) {
                SettingsView()
            }
            .sheet(isPresented: $model.isShowingCallMore) {
                CallMoreSheet(
                    showCaptions: $model.showCaptions,
                    lastReply: call.captions.lines.last { $0.speaker == .ferni }
                ) { model.reporting = $0 }
            }
            .sheet(item: $model.reporting) { caption in
                ReportSheet(caption: caption) { reason, note in try await model.report(caption, reason: reason, note: note) }
            }
            // A sheet over the room rather than a cover: Home stays behind it.
            .sheet(isPresented: $model.isAskingConsent) {
                ConsentView(
                    onAgree: {
                        model.isAskingConsent = false
                        Task { await model.agreeAndTalk() }
                    },
                    onNotNow: { model.notNow() },
                    account: model.account
                )
                .presentationDetents([.large])
            }
            .sheet(isPresented: $model.isSigningIn, onDismiss: { model.signInFinished() }) {
                SignInView(account: model.account)
            }
        }
    }

    private func avatar(call: CallSession, size: CGFloat) -> some View {
        // The Settings page sheet and the consent cover hide Ferni; the
        // smaller sheets (More, Report) leave him in view.
        CallAvatar(call: call, covered: model.isShowingSettings || model.isAskingConsent, wake: model.wakeCount) { model.feedback.play($0) }
            .frame(width: size, height: size)
            .opacity(call.phase == .reconnecting ? 0.5 : 1)
    }

    private var controls: some View {
        CallControls(call: model.call, team: model.team, talk: model.talk) {
            model.isShowingCallMore = true
        }
    }
}

/// At rest: Ferni's hello and the last outcome (an ended call, or what went wrong).
private struct RestingLine: View {
    let call: CallSession
    let home: HomeLineStore.Home?
    /// The minute it is, so the greeting changes with the day.
    let now: Date
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: FerniSpace.breath) {
            switch call.phase {
            case .failed(let problem):
                Text(problem.message)
                    .font(FerniType.bodyLarge)
                    .foregroundStyle(FerniColor.textPrimary)
                if problem == .microphoneDenied {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                    .tint(FerniColor.accent)
                }
            default:
                let words = RestingWords.words(
                    home: home, ended: call.phase == .ended,
                    hour: Calendar.current.component(.hour, from: now), hasTalked: call.hasTalked
                )
                greeting(words.headline, words.detail)
            }
        }
        .multilineTextAlignment(.center)
    }

    @ViewBuilder private func greeting(_ headline: String, _ detail: String) -> some View {
        Text(headline)
            .font(FerniType.greeting)
            .foregroundStyle(FerniColor.textPrimary)
        Text(detail)
            .font(FerniType.bodyLarge)
            .foregroundStyle(FerniColor.textSecondary)
    }
}

/// Coming back to the app (delight gap 1). After 20 minutes away the last
/// call's goodbye (or its failure) is old news; after 8 hours Ferni wakes up
/// as you open the app. Nothing changes under a call.
enum Welcome {
    static let forgetAfter: TimeInterval = 20 * 60
    static let wakeAfter: TimeInterval = 8 * 3600

    static func onReturn(callEndedAt: Date?, wasActiveAt: Date?, inCall: Bool, now: Date) -> (forgetCall: Bool, wake: Bool) {
        guard !inCall else { return (false, false) }
        let forget = callEndedAt.map { now.timeIntervalSince($0) > forgetAfter } ?? false
        let wake = wasActiveAt.map { now.timeIntervalSince($0) > wakeAfter } ?? false
        return (forget, wake)
    }
}

/// What Home says at rest. Right after a call: the goodbye. Otherwise the
/// time of day (or the introduction on a first visit; the server's answer
/// decides that when there is one, since it knows calls on other devices)
/// and, when Ferni has a follow-up, that follow-up as his question. The
/// follow-up is in the person's own words (GET /api/home); the clock words
/// stay the app's own, so they're localised.
enum RestingWords {
    static func words(home: HomeLineStore.Home?, ended: Bool, hour: Int, hasTalked: Bool) -> (headline: String, detail: String) {
        if ended { return (String(localized: "Talk soon."), String(localized: "I'm here whenever you want to talk again.")) }
        let firstVisit = home?.greeting.map { $0 == .firstVisit } ?? !hasTalked
        let detail: String = if case .followUp(let text, _)? = home?.greeting {
            String(localized: "How's \(text) going?")
        } else {
            String(localized: "Whenever you're ready, I'm here.")
        }
        return (Greeting.headline(hour: hour, firstVisit: firstVisit), detail)
    }
}

/// Ferni's note on Home: something he's been turning over from your last
/// talks, in your own words (GET /api/home `note`).
enum NoteWords {
    static func line(_ note: HomeLineStore.Home.Note) -> String {
        String(localized: "I've been thinking about \(note.text).")
    }
}

/// At rest, when Ferni has a note: his thought and a way to talk about it.
private struct NoteCard: View {
    let note: HomeLineStore.Home.Note
    let talk: () -> Void

    var body: some View {
        VStack(spacing: FerniSpace.breath) {
            Text(NoteWords.line(note))
                .font(FerniType.body)
                .foregroundStyle(FerniColor.textSecondary)
                .multilineTextAlignment(.center)
            Button("Talk about this", action: talk)
                .font(FerniType.button)
                .frame(minHeight: 44)
                .tint(FerniColor.accent)
        }
        .padding(FerniSpace.rest)
        .frame(maxWidth: .infinity)
        .background(FerniColor.surface, in: .rect(cornerRadius: FerniRadius.medium))
    }
}

/// Ferni's hello, by time of day. A first visit gets an introduction.
enum Greeting {
    static func headline(hour: Int, firstVisit: Bool) -> String {
        if firstVisit { return String(localized: "Hi, I'm Ferni.") }
        switch hour {
        case 5..<12: return String(localized: "Good morning.")
        case 12..<17: return String(localized: "Good afternoon.")
        case 17..<22: return String(localized: "Good evening.")
        default: return String(localized: "Up late? I'm here.")
        }
    }
}

/// Who the team row on Home shows: only your team, and no row at all while
/// that's just Ferni (the first visit). Locked teammates and why they aren't
/// here yet live on the Team page (Settings, or the iPad sidebar), never on
/// Home (critic M9, delight plan §0 item 5).
enum TeamRowModel {
    static func shown(unlocked: Set<String>) -> [Persona] {
        let team = PersonaRegistry.all.filter { unlocked.contains($0.id) }
        return team.count > 1 ? team : []
    }
}

/// Your corner: your team, small. Tap a teammate to choose who answers next.
private struct TeamRow: View {
    let team: TeamStore

    var body: some View {
        let shown = TeamRowModel.shown(unlocked: team.unlocked)
        if !shown.isEmpty {
            HStack(spacing: FerniSpace.pause) {
                ForEach(shown) { persona in
                    Button {
                        team.choose(persona.id)
                    } label: {
                        AvatarPortrait(persona: WindowPersona(personaId: persona.id))
                            .frame(width: 40, height: 40)
                            .padding(2)
                            .overlay {
                                if team.chosen == persona.id {
                                    Circle().stroke(FerniColor.accent, lineWidth: 2)
                                }
                            }
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(.circle)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(persona.name), \(persona.role.lowercased())")
                    .accessibilityValue(team.chosen == persona.id ? "Answers next" : "On your team")
                }
            }
            .sensoryFeedback(.selection, trigger: team.chosen)
        }
    }
}

#Preview {
    HomeView().environment(AppModel(config: .production, firebaseReady: false))
}
