import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

@main
struct FerniApp: App {
    @State private var model: AppModel

    init() {
        _model = State(initialValue: AppModel(firebaseReady: FerniFirebase.configure()))
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(model)
                // Silent, anonymous on a first launch: talking never waits on a sign-in screen.
                .task {
                    await model.account.start()
                    await model.team.refresh()
                }
                // Consent belongs to whoever is signed in: switch with them.
                .onChange(of: LiveActivityController.content(for: model.call)) { _, content in
                    model.liveActivity.follow(content, startedAt: model.call.startedAt)
                }
                .task { EndCallIntent.end = { [call = model.call] in await call.end() } }
                .onChange(of: model.account.user?.uid, initial: true) { old, uid in
                    model.accountChanged(from: old, to: uid)
                }
        }
    }
}

/// App-wide state the screens share: the account, the server API as that
/// account, and the call.
@MainActor
@Observable
final class AppModel {
    private static let haptics = CoreHapticsPlayer()

    /// The avatar's feedback: one haptic per moment, and VoiceOver announcements.
    private static func play(_ effect: AvatarEffect) {
        switch effect {
        case .haptic(let cue): haptics.play(cue)
        case .announce(let text): AccessibilityNotification.Announcement(text).post()
        }
    }

    let config: FerniConfig
    let account: AccountStore
    let api: FerniAPI
    let call: CallSession
    let consent = ConsentStore()
    let team: TeamStore
    let memory: MemoryStore
    let liveActivity = LiveActivityController()
    var isShowingSettings = false
    var isAskingConsent = false
    var isShowingCallMore = false
    /// A line of Ferni's being reported.
    var reporting: Caption?

    func report(_ caption: Caption, reason: ReplyReport.Reason, note: String) async throws {
        try await ReplyReport.send(
            using: api, sessionID: call.roomName ?? "unknown", saidAt: caption.at, reason: reason,
            note: note, textHint: caption.text, appVersion: SettingsView.version()
        )
    }
    /// Ferni's words in the caption area; off leaves only who's doing what.
    var showCaptions = UserDefaults.standard.object(forKey: "ferni.captions") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showCaptions, forKey: "ferni.captions") }
    }

    /// Talk: the consent screen first if this person hasn't agreed (or withdrew).
    func talk() {
        if consent.hasAgreed { call.start(personaID: team.chosen) } else { isAskingConsent = true }
    }

    /// "I agree, let's talk": recorded for the signed-in account only, so the
    /// account is settled first.
    func agreeAndTalk() async {
        await account.start()
        consent.use(uid: account.user?.uid)
        if consent.agree() { call.start(personaID: team.chosen) }
    }

    /// Delete the account on the server, then everything this phone kept about
    /// the person, then start fresh. Throws (and keeps everything) if the server says no.
    func deleteAccount() async throws {
        let uid = account.user?.uid
        try await AccountDeletion.delete(using: api)
        if let uid { consent.forget(uid: uid) }
        AccountDeletion.localKeys.forEach(UserDefaults.standard.removeObject(forKey:))
        forgetPerson()
        await account.signOut()
    }

    /// Sign out: this person's agreement and everything shown about them leave
    /// the phone with them.
    func signOut() async {
        if let uid = account.user?.uid { consent.forget(uid: uid) }
        forgetPerson()
        await account.signOut()
    }

    /// Every per-person store follows the signed-in account.
    func accountChanged(from old: String?, to uid: String?) {
        consent.use(uid: uid)
        guard old != nil, old != uid else { return } // first launch keeps what's loading
        forgetPerson()
        Task { await team.refresh() }
    }

    private func forgetPerson() {
        memory.reset()
        team.reset()
        call.forgetLastCall()
        UserDefaults.standard.removeObject(forKey: "ferni.call.hasTalked")
    }

    init(config: FerniConfig = .fromBundle(), firebaseReady: Bool) {
        self.config = config
        account = AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        api = account.api(baseURL: config.apiBaseURL)
        team = TeamStore(api: api)
        memory = MemoryStore(api: api)
        account.uploadAppleCode = AppleAuthorizationUpload.uploader(api: api)
        let level = AudioLevelMeter()
        call = CallSession(
            fetchToken: CallTokens.fetcher(api: api),
            makeRoom: { LiveKitVoiceRoom(agentLevel: level) },
            audio: SystemCallAudio(),
            avatar: AvatarModel(play: Self.play),
            lifecycle: ConversationLifecycle.isAvailable ? ConversationLifecycle() : nil,
            agentLevel: level
        )
    }
}
