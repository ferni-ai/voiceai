import FerniDesign
import SwiftUI
import WidgetKit

/// Ferni on the Home Screen, in StandBy, in CarPlay and on Apple HomeView:
/// peeking. The medium size adds a Talk button that starts a call through the
/// same door as the app's (consent first); the small size, which also shows
/// on shared screens, has none (SharedScreens). Nothing personal is shown,
/// anywhere: the extension can't read the app's data.
struct FerniHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FerniHome", provider: Provider()) { _ in
            FerniHomeWidgetView()
        }
        .configurationDisplayName("Ferni")
        .description("Ferni, here when you want to talk.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }

    /// One entry that never changes: nothing to refresh.
    struct Provider: TimelineProvider {
        struct Entry: TimelineEntry { let date: Date }
        func placeholder(in context: Context) -> Entry { Entry(date: .now) }
        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            completion(Timeline(entries: [Entry(date: .now)], policy: .never))
        }
    }
}

struct FerniHomeWidgetView: View {
    @Environment(\.widgetRenderingMode) private var mode
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let peek = FerniPeek(accented: mode != .fullColor, dark: scheme == .dark)
        Group {
            if SharedScreens.widgetOffersTalk(family) {
                HStack {
                    peek
                    talk.frame(maxWidth: .infinity)
                }
            } else {
                // A tap opens Ferni on the iPhone; it never starts a call.
                peek
            }
        }
        .containerBackground(for: .widget) { FerniColor.background }
    }

    private var talk: some View {
        Button(intent: TalkIntent()) {
            Label("Talk", systemImage: "waveform")
                .font(.headline)
        }
        .tint(FerniColor.accent)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
    }
}
