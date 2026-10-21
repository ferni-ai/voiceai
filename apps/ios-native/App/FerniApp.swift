import FerniKit
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

/// App-wide state the screens share: the account and the server API as that
/// account. The call arrives with the next PR.
@MainActor
@Observable
final class AppModel {
    let config: FerniConfig
    let account: AccountStore
    let api: FerniAPI
    var isShowingSettings = false

    init(config: FerniConfig = .fromBundle(), firebaseReady: Bool) {
        self.config = config
        account = AccountStore(backend: firebaseReady ? FirebaseAuthBackend() : nil)
        api = account.api(baseURL: config.apiBaseURL)
        account.uploadAppleCode = AppleAuthorizationUpload.uploader(api: api)
    }
}
