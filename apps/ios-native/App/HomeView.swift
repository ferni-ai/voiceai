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
                            RestingLine(call: call)
                            if call.phase == .ended {
                                RememberCard(call: call, remembered: model.callRemembered)
                                #if FERNI_PUSH
                                NotificationAsk(push: model.push, uid: model.account.user?.uid)
                                #endif
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
            .background(RoomBackground(persona: WindowPersona(personaId: call.avatar.personaID)))
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

    private func avatar(call: CallSession, size: CGFloat) -> some View {
        // The Settings page sheet and the consent cover hide Ferni; the
        // smaller sheets (More, Report) leave him in view.
        CallAvatar(call: call, covered: model.isShowingSettings || model.isAskingConsent)
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
            case .ended:
                greeting(String(localized: "Talk soon."), String(localized: "I'm here whenever you want to talk again."))
            default:
                greeting(
                    Greeting.headline(hour: Calendar.current.component(.hour, from: .now), firstVisit: !call.hasTalked),
                    String(localized: "Whenever you're ready, I'm here.")
                )
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
