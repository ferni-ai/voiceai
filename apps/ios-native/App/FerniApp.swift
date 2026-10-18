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
                .task { await model.account.start() }
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
    var isShowingSettings = false
    var isAskingConsent = false

    /// Talk: the consent screen first if this person hasn't agreed (or withdrew).
    func talk() {
        if consent.hasAgreed { call.start() } else { isAskingConsent = true }
    }

    /// "I agree, let's talk": recorded for the signed-in account only, so the
    /// account is settled first.
    func agreeAndTalk() async {
        await account.start()
        consent.use(uid: account.user?.uid)
        if consent.agree() { call.start() }
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
        account.uploadAppleCode = AppleAuthorizationUpload.uploader(api: api)
        let level = AudioLevelMeter()
        call = CallSession(
            fetchToken: CallTokens.fetcher(api: api),
            makeRoom: { LiveKitVoiceRoom(agentLevel: level) },
            audio: SystemCallAudio(),
            avatar: AvatarModel(play: Self.play),
            agentLevel: level
        )
    }
}
