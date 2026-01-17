import WidgetKit
import SwiftUI
import FerniShared

// MARK: - Ferni Watch Widgets Bundle
/// Widget bundle for Apple Watch complications.
/// Uses FerniComplication from FerniShared for the actual implementation.

@main
struct FerniWatchWidgetsBundle: WidgetBundle {
    var body: some Widget {
        FerniWatchWidget()
    }
}
