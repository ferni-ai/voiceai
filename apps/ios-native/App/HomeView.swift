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
    /// Home's own size: on iPad Ferni is sized to it.
    @State private var room = CGSize.zero
    /// The height Home can show without scrolling (between the bar and Talk).
    @State private var visibleHeight: CGFloat = 0
    /// The resting line's height, for Ferni's size at accessibility sizes.
    @State private var restingHeight: CGFloat = 0
    /// The keyboard is up (correcting what Ferni remembered).
    @State private var typing = false

    var body: some View {
        @Bindable var model = model
        let call = model.call
        let inCall = call.isActive
        // iPad in landscape: the captions sit beside Ferni, not under (UX spec §9).
        let beside = inCall && widthClass == .regular && landscape
        NavigationStack {
            ScrollViewReader { scroller in
            ScrollView {
                VStack(spacing: FerniSpace.rest) {
                    #if DEBUG
                    // A faint line across the floor, first in the content (test only).
                    if UITestScenario.floorFixture { FloorFixture(below: max(visibleHeight - 30, 0)) }
                    #endif
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
                        // At accessibility sizes Ferni steps back so the words fit: in a
                        // call, the captions; at home, the greeting above the pinned Talk
                        // (design audit P1-9: on an SE at AX5 it sat behind Talk).
                        avatar(call: call, size: typeSize.isAccessibilitySize ? (inCall ? 120 : restSizeLarge) : (inCall ? 240 : restSize))
                            .padding(.top, inCall || typeSize.isAccessibilitySize ? FerniSpace.breath : FerniSpace.silence)
                        if inCall {
                            CallCaptions(call: call, showWords: model.showCaptions) { model.reporting = $0 }
                        } else {
                            TimelineView(.everyMinute) { minute in
                                RestingLine(call: call, home: model.homeLine.current, now: minute.date, chosen: model.team.chosen,
                                            knownHere: model.account.needsSignIn)
                            }
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { restingHeight = $0 }
                            if call.phase == .ended {
                                RememberCard(call: call, remembered: model.callRemembered, forgotten: model.memory.forgotten)
                                    .id(Self.rememberID)
                                    // Over the team row while it rises past it (award upgrade 8).
                                    .zIndex(1)
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
                            TeamRow(team: model.team, shelf: widthClass == .regular)
                        }
                    }
                }
                .frame(maxWidth: beside ? 1000 : 560)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, FerniSpace.rest)
                // At rest, the room's middle, not its top half with the bottom 40%
                // empty (design audit P2 #2). Taller than the screen, it scrolls as before.
                .frame(minHeight: inCall ? 0 : visibleHeight, alignment: .center)
                .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.55), value: inCall)
            }
            .scrollBounceBehavior(.basedOnSize)
            .onGeometryChange(for: CGSize.self) { $0.size } action: { room = $0; landscape = $0.width > $0.height }
            // The container's size is already inside the bar and Talk's inset.
            .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height } action: { _, height in
                visibleHeight = height
            }
            // Who you're talking with stays in view: at AX5 the chip scrolled
            // up under the status bar with the captions (design audit P2 #19).
            .safeAreaInset(edge: .top, spacing: 0) {
                if inCall && !beside {
                    NameChip(personaID: call.avatar.personaID)
                        .padding(.vertical, FerniSpace.breath)
                        .frame(maxWidth: .infinity)
                        .background { TimelineView(.everyMinute) { RoomFade(date: HomeClock.time($0.date), from: .top) } }
                }
            }
            // Pinned at every text size: End, Mute and More (and Talk) never
            // scroll away. At accessibility sizes they scrolled with the
            // captions and End left the screen (design audit P0-1, 2026-10-20).
            .safeAreaInset(edge: .bottom) {
                // While you type, Talk steps aside: riding the keyboard it covered
                // the field and its Save (design audit P1-5).
                if inCall || !typing {
                    controls
                        .padding(.top, FerniSpace.rest)
                        // What scrolls under Talk fades into the floor instead of sitting
                        // half-covered behind it (design audit P1-4).
                        .background { TimelineView(.everyMinute) { RoomFade(date: HomeClock.time($0.date)) } }
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in typing = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in typing = false }
            // The card you're correcting, whole, above the keyboard.
            .onChange(of: typing) { _, now in
                if now, !inCall { withAnimation(reduceMotion ? nil : .default) { scroller.scrollTo(Self.rememberID, anchor: .bottom) } }
            }
            }
            .background(TimelineView(.everyMinute) { minute in
                // The room's light follows the clock, so an evening glow doesn't last until morning.
                RoomBackground(persona: WindowPersona(personaId: shownPersona(call)), date: HomeClock.time(minute.date))
            })
            .task(id: reduceMotion) { call.avatar.reduceMotion = reduceMotion }
            // Trouble is announced wherever you are, including after the call view goes.
            .onChange(of: CallAnnouncement.text(phase: call.phase, onHold: call.isOnHold)) { _, line in
                if let line { AccessibilityNotification.Announcement(line).post() }
            }
            .toolbar {
                // In a call the room is Ferni's and yours: the account button
                // steps out until it ends (design audit P2 #5).
                // What Ferni remembers, one tap from Home (award upgrade 7); on iPad
                // it's in the sidebar.
                if showsAccountButton && !inCall { ToolbarItem(placement: .topBarLeading) {
                    Button {
                        model.isShowingMemory = true
                    } label: {
                        Image(systemName: "heart.text.square")
                            .font(.title2)
                            .foregroundStyle(FerniColor.accent)
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular.interactive(), in: .circle)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("What Ferni remembers")
                    .accessibilityIdentifier("home.memory")
                }
                .sharedBackgroundVisibility(.hidden) }
                if showsAccountButton && !inCall { ToolbarItem(placement: .topBarTrailing) {
                    // Its own 44 pt glass circle: in the bar's shared glass it was 48 by 36
                    // (design audit P2 #18).
                    Button {
                        model.isShowingSettings = true
                    } label: {
                        Image(systemName: model.account.user?.isSignedInWithApple == true
                              ? "person.crop.circle.fill" : "person.crop.circle")
                            .font(.title2)
                            .foregroundStyle(FerniColor.accent)
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular.interactive(), in: .circle)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Account and settings")
                }
                .sharedBackgroundVisibility(.hidden) }
            }
            .sheet(isPresented: $model.isShowingSettings) {
                SettingsView()
            }
            .sheet(isPresented: $model.isShowingMemory) {
                NavigationStack {
                    MemoryScreen(memory: model.memory, lock: model.memoryLock)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) { Button("Done") { model.isShowingMemory = false } }
                        }
                }
            }
            // iPhone: sheets over the call. iPad: the whole screen, like consent
            // there: as form sheets the call's captions and the sidebar showed,
            // dimmed, around them, and the audit failed them as text out of
            // VoiceOver's reach (2026-10-21).
            .sheet(isPresented: pad ? .constant(false) : $model.isShowingCallMore) { moreSheet(call) }
            .fullScreenCover(isPresented: pad ? $model.isShowingCallMore : .constant(false)) { moreSheet(call) }
            .sheet(item: pad ? .constant(nil) : $model.reporting) { reportSheet($0) }
            .fullScreenCover(item: pad ? $model.reporting : .constant(nil)) { reportSheet($0) }
            // iPhone: a sheet over the room, so Home stays behind it. iPad: the
            // whole screen. As a form sheet the sidebar stayed drawn behind it but
            // out of VoiceOver's reach, and at AX5 the words ran past the sheet's
            // edge onto the dimmed room, so the audit failed both (2026-10-20).
            .sheet(isPresented: askingConsent(fullScreen: false)) {
                consent.presentationDetents([.large])
            }
            .fullScreenCover(isPresented: askingConsent(fullScreen: true)) { consent }
            .sheet(isPresented: $model.isSigningIn, onDismiss: { model.signInFinished() }) {
                SignInView(account: model.account)
            }
        }
    }

    private static let rememberID = "home.remember"

    private var pad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    private func moreSheet(_ call: CallSession) -> some View {
        @Bindable var model = model
        return CallMoreSheet(
            showCaptions: $model.showCaptions,
            lastReply: call.captions.lines.last { $0.speaker == .ferni && !$0.joined }
        ) { model.reporting = $0 }
    }

    private func reportSheet(_ caption: Caption) -> some View {
        ReportSheet(caption: caption) { reason, note in try await model.report(caption, reason: reason, note: note) }
    }

    /// Ferni at rest: on a phone up to 280 pt; on iPad, sized to the room (design
    /// audit P1-14: a phone column, ~65% of the screen empty).
    /// Ferni at rest at accessibility sizes: up to 140 pt, smaller when the
    /// room is short, so his words sit whole above the floor at rest (critic
    /// M-A: on an SE at AX5 "Whenever you're ready, I'm here." ran into the
    /// fade behind Talk). Never under 44 pt.
    private var restSizeLarge: CGFloat {
        guard visibleHeight > 0, restingHeight > 0 else { return 140 }
        return min(140, max(44, visibleHeight - restingHeight - FerniSpace.breath - FerniSpace.rest - FerniSpace.pause))
    }

    private var restSize: CGFloat { Self.restSize(room: room, regular: widthClass == .regular) }

    /// On a phone, up to 280 pt as the room's height allows (award upgrade 2:
    /// a Home that's never half empty; it was 200 everywhere): about 260 on a
    /// 17 Pro and 280 on a Pro Max, less on an SE, so his words, a thread card
    /// and the team still clear the fade over Talk.
    static func restSize(room: CGSize, regular: Bool) -> CGFloat {
        guard room.width > 0, room.height > 0 else { return 200 }
        guard regular else { return min(max(room.height * 0.42, 200), 280, room.width * 0.72) }
        return min(max(min(room.width * 0.5, room.height * 0.42), 200), 440)
    }

    /// In a call, who's talking; at home, who answers next (design audit P1-1:
    /// choosing a teammate changed only Talk's label).
    private func shownPersona(_ call: CallSession) -> String {
        call.isActive ? call.avatar.personaID : model.team.chosen
    }

    private var consent: some View {
        ConsentView(
            onAgree: {
                model.isAskingConsent = false
                Task { await model.agreeAndTalk() }
            },
            onNotNow: { model.notNow() },
            account: model.account
        )
    }

    /// Consent is asked one way at a time. Only the model's answer closes it, so
    /// a width change mid-question moves it across instead of dropping it.
    private func askingConsent(fullScreen: Bool) -> Binding<Bool> {
        Binding(get: { model.isAskingConsent && (widthClass == .regular) == fullScreen }, set: { _ in })
    }

    private func avatar(call: CallSession, size: CGFloat) -> some View {
        CallAvatar(
            call: call, covered: model.coversFerni,
            wake: model.wakeCount, doubleTake: model.doubleTakeCount,
            onCue: { model.feedback.play($0) }, personaID: shownPersona(call),
            roomHour: Calendar.current.component(.hour, from: HomeClock.time(.now))
        )
            .frame(width: size, height: size)
            .opacity(call.phase == .reconnecting ? 0.5 : 1)
            .accessibilityIdentifier("home.avatar")
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
    /// Who answers the next call.
    var chosen = PersonaRegistry.ferni.id
    /// Someone with an account on this phone before, signed out (design audit P2 #11).
    var knownHere = false
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
                    hour: Self.hour(at: now), hasTalked: call.hasTalked, chosen: chosen, knownHere: knownHere
                )
                greeting(words.headline, words.detail)
            }
        }
        .multilineTextAlignment(.center)
        // On a paper plate at every size and hour (award upgrade 3: light you can
        // feel, text on solid plates). Without it the audit failed the line on
        // the room's glow and gradient though its pixels pass: at AX5 in every
        // band (design audit P1-10, 6.4:1), the failed message at 13.1:1
        // (critic M3), the follow-up line on iPad at 7.0:1 (award upgrade 2).
        .padding(FerniSpace.pause)
        .background {
            RoundedRectangle(cornerRadius: FerniRadius.large).fill(FerniColor.background)
        }
    }

    private static func hour(at date: Date) -> Int {
        Calendar.current.component(.hour, from: HomeClock.time(date))
    }

    @ViewBuilder private func greeting(_ headline: String, _ detail: String) -> some View {
        Text(headline)
            .accessibilityIdentifier("home.headline")
            .font(FerniType.greeting)
            .foregroundStyle(FerniColor.textPrimary)
        Text(detail)
            .accessibilityIdentifier("home.detail")
            .font(FerniType.bodyLarge)
            // Medium, not regular: in the evening band on iPad the audit failed
            // the regular line on contrast though its pixels measure 6.4:1
            // (#5c544a on #f2eee7); the fuller strokes pass in every band.
            .fontWeight(.medium)
            .foregroundStyle(FerniColor.textSecondary)
    }
}

/// Coming back to the app (delight gap 1). After 20 minutes away the last
/// call's goodbye (or its failure) is old news; after 8 hours Ferni wakes up
/// as you open the app. Nothing changes under a call.
/// The time Home is lit and greeted for: the clock, except that UI tests and
/// store screenshots fix the hour (-FerniHour), so the audit can check every
/// RoomLight band whatever the time it runs at.
enum HomeClock {
    static func time(_ date: Date) -> Date {
        #if DEBUG
        if let hour = UITestScenario.hour,
           let fixed = Calendar.current.date(bySettingHour: hour, minute: 30, second: 0, of: date) { return fixed }
        #endif
        return date
    }
}

enum Welcome {
    static let forgetAfter: TimeInterval = 20 * 60
    static let wakeAfter: TimeInterval = 8 * 3600
    /// Away a little while (the prototype's 4 s without seeing you): a double take.
    static let doubleTakeAfter: TimeInterval = 4

    static func onReturn(
        callEndedAt: Date?, wasActiveAt: Date?, inCall: Bool, now: Date
    ) -> (forgetCall: Bool, wake: Bool, doubleTake: Bool) {
        guard !inCall else { return (false, false, false) }
        let forget = callEndedAt.map { now.timeIntervalSince($0) > forgetAfter } ?? false
        let away = wasActiveAt.map { now.timeIntervalSince($0) }
        let wake = away.map { $0 > wakeAfter } ?? false
        let doubleTake = !wake && (away.map { $0 > doubleTakeAfter } ?? false)
        return (forget, wake, doubleTake)
    }
}

/// What Home says at rest. Right after a call: the goodbye. Otherwise the
/// time of day (or the introduction on a first visit; the server's answer
/// decides that when there is one, since it knows calls on other devices)
/// and, when Ferni has a follow-up, that follow-up as his question. The
/// follow-up is in the person's own words (GET /api/home); the clock words
/// stay the app's own, so they're localised.
enum RestingWords {
    /// - Parameter knownHere: a real account was on this phone and is signed
    ///   out. Signing out forgets that they've talked (CallSession.forgetPerson),
    ///   but they aren't new: "Hi, I'm Ferni." greeted someone Ferni knows
    ///   (design audit P2 #11).
    static func words(home: HomeLineStore.Home?, ended: Bool, hour: Int, hasTalked: Bool,
                      chosen: String = PersonaRegistry.ferni.id, knownHere: Bool = false) -> (headline: String, detail: String) {
        if ended { return (String(localized: "Talk soon."), String(localized: "I'm here whenever you want to talk again.")) }
        // A teammate chosen for the next call: Ferni introduces them, in his
        // words from the persona bundle (design audit P1-1).
        if chosen != PersonaRegistry.ferni.id, let intro = TeammateIntroduction.forPersona(chosen) {
            return (String(localized: "\(PersonaRegistry.get(chosen).name)'s here."), intro.ferniSays)
        }
        if knownHere, home == nil { return (String(localized: "Welcome back."), String(localized: "Whenever you're ready, I'm here.")) }
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

/// Ferni's hello, by time of day. A first visit gets an introduction. The
/// hours are WidgetMoment's, so the widget's hello turns over with Home's
/// (critic L6: they were two copies of 5/12/17/22).
enum Greeting {
    static func headline(hour: Int, firstVisit: Bool) -> String {
        if firstVisit { return String(localized: "Hi, I'm Ferni.") }
        switch WidgetMoment(hour: hour) {
        case .morning: return String(localized: "Good morning.")
        case .afternoon: return String(localized: "Good afternoon.")
        case .evening: return String(localized: "Good evening.")
        case .night: return String(localized: "Up late? I'm here.")
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

/// Teammates in centred rows, wrapping when the next one doesn't fit.
struct TeamFlow: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    /// Each row's subview indices and size, for a width.
    func rows(_ sizes: [CGSize], width: CGFloat) -> [(items: [Int], size: CGSize)] {
        var rows: [(items: [Int], size: CGSize)] = []
        for (i, size) in sizes.enumerated() {
            if let last = rows.last, last.size.width + spacing + size.width <= width {
                rows[rows.count - 1].items.append(i)
                rows[rows.count - 1].size = CGSize(width: last.size.width + spacing + size.width,
                                                   height: max(last.size.height, size.height))
            } else {
                rows.append(([i], size))
            }
        }
        return rows
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let rows = rows(sizes, width: proposal.width ?? .infinity)
        let height = rows.map(\.size.height).reduce(0, +) + lineSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? rows.map(\.size.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        var y = bounds.minY
        for row in rows(sizes, width: bounds.width) {
            var x = bounds.midX - row.size.width / 2
            for i in row.items {
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sizes[i]))
                x += sizes[i].width + spacing
            }
            y += row.size.height + lineSpacing
        }
    }
}

/// Your corner: your team, small, each with their name under their face (design
/// audit P1-2: no names, and Maya and Jordan look alike). Tap a teammate to
/// choose who answers next; press and hold for who they are.
private struct TeamRow: View {
    let team: TeamStore
    /// On iPad: a shelf of bigger faces (design audit P1-14).
    var shelf = false

    var body: some View {
        let shown = TeamRowModel.shown(unlocked: team.unlocked)
        if !shown.isEmpty {
            // One row while the names fit; at large text sizes, as many rows as they
            // need. One set of views that wraps, not ViewThatFits choosing between
            // two: the audit grows the text and saw the row's names replaced
            // instead of growing ("Dynamic Type partially unsupported").
            TeamFlow(spacing: shelf ? FerniSpace.rest : FerniSpace.pause, lineSpacing: FerniSpace.pause) { faces(shown) }
                // On paper, as Home's words are (award upgrade 3): on the room's
                // gradient the audit failed the names at 7.0:1 and 14.2:1 measured
                // on iPad (award upgrade 2), and on an SE once the plated words
                // pushed the row down.
                .padding(FerniSpace.pause)
                .background { RoundedRectangle(cornerRadius: FerniRadius.large).fill(FerniColor.background) }
            .sensoryFeedback(.selection, trigger: team.chosen)
        }
    }

    @ViewBuilder private func faces(_ shown: [Persona]) -> some View {
        ForEach(shown) { persona in
            Button {
                team.choose(persona.id)
            } label: {
                VStack(spacing: 4) {
                    AvatarPortrait(persona: WindowPersona(personaId: persona.id))
                        .frame(width: shelf ? 72 : 40, height: shelf ? 72 : 40)
                        .padding(2)
                        .overlay {
                            if team.chosen == persona.id {
                                Circle().stroke(FerniColor.accent, lineWidth: 2)
                            }
                        }
                        .frame(minWidth: 44, minHeight: 44)
                    Text(persona.name)
                        .font(shelf ? FerniType.footnote : FerniType.caption)
                        .foregroundStyle(team.chosen == persona.id ? FerniColor.textPrimary : FerniColor.textSecondary)
                        .fixedSize()
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("team.\(persona.id)")
            .accessibilityLabel("\(persona.name), \(persona.role.lowercased())")
            .accessibilityValue(team.chosen == persona.id ? "Answers next" : "On your team")
            .contextMenu {
                Button("Talk to \(persona.name) next", systemImage: "phone") { team.choose(persona.id) }
            } preview: {
                TeammatePeek(persona: persona)
            }
        }
    }
}

/// Who a teammate is, in Ferni's words, when you press and hold their face.
private struct TeammatePeek: View {
    let persona: Persona

    var body: some View {
        VStack(spacing: FerniSpace.breath) {
            AvatarPortrait(persona: WindowPersona(personaId: persona.id))
                .frame(width: 72, height: 72)
            Text(persona.name)
                .font(FerniType.headline)
                .foregroundStyle(FerniColor.textPrimary)
            Text(persona.role)
                .font(FerniType.footnote)
                .foregroundStyle(FerniColor.textSecondary)
            if let intro = TeammateIntroduction.forPersona(persona.id) {
                Text(intro.ferniSays)
                    .font(FerniType.body)
                    .foregroundStyle(FerniColor.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(FerniSpace.rest)
        .frame(width: 300)
        .background(FerniColor.background)
    }
}

#Preview {
    HomeView().environment(AppModel(config: .production, firebaseReady: false))
}
