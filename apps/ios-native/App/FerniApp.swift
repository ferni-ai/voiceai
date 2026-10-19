import FerniKit
import SwiftUI

@main
struct FerniApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(model)
        }
    }
}

/// App-wide state the screens share. Each capability arrives as its own
/// property: the account (next PR) and the call (the one after).
@MainActor
@Observable
final class AppModel {
    let config: FerniConfig
    var isShowingSettings = false

    init(config: FerniConfig = .fromBundle()) {
        self.config = config
    }
}
