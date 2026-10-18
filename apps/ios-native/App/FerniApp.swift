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
        }
    }
}

/// App-wide state the screens share: the account, the server API as that
/// account, and the call.
@MainActor
@Observable
final class AppModel {
    /// The avatar's feedback. Haptics arrive with the Core Haptics player.
    private static func play(_ effect: AvatarEffect) {
        if case .announce(let text) = effect { AccessibilityNotification.Announcement(text).post() }
    }

    let config: FerniConfig
    let account: AccountStore
    let api: FerniAPI
    let call: CallSession
    var isShowingSettings = false

    init(config: FerniConfig = .fromBundle(), firebaseReady: Bool) {
        self.config = config
        account = AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        api = account.api(baseURL: config.apiBaseURL)
        account.uploadAppleCode = AppleAuthorizationUpload.uploader(api: api)
        call = CallSession(
            fetchToken: CallTokens.fetcher(api: api),
            makeRoom: { LiveKitVoiceRoom() },
            audio: SystemCallAudio(),
            avatar: AvatarModel(play: Self.play)
        )
    }
}
