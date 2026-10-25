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
                .onChange(of: model.account.user?.uid, initial: true) { _, uid in model.consent.use(uid: uid) }
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
    var isShowingSettings = false
    var isAskingConsent = false
    var isShowingCallMore = false
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

    /// Sign out: this person's agreement leaves the phone with them.
    func signOut() async {
        if let uid = account.user?.uid { consent.forget(uid: uid) }
        await account.signOut()
    }

    init(config: FerniConfig = .fromBundle(), firebaseReady: Bool) {
        self.config = config
        account = AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        api = account.api(baseURL: config.apiBaseURL)
        team = TeamStore(api: api)
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
