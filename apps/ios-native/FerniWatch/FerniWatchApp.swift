import SwiftUI
import FerniShared

// MARK: - Ferni Watch App
/// Main entry point for the Ferni Apple Watch app.
/// Provides quick emotional check-ins and ambient companion presence.

@main
struct FerniWatchApp: App {
    var body: some Scene {
        WindowGroup {
            FerniWatchContentView()
        }
    }
}
