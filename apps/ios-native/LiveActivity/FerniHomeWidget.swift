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
        StaticConfiguration(kind: "FerniHome", provider: Provider()) { entry in
            FerniHomeWidgetView(date: entry.date)
        }
        .configurationDisplayName("Ferni")
        .description("Ferni, here when you want to talk.")
        .supportedFamilies([.systemSmall, .systemMedium])
        // Ferni peeks up from the widget's own edge, not from inside its margins.
        .contentMarginsDisabled()
    }

    /// The day's turns (WidgetMoment): the hello and the room's light change
    /// with the time of day (design audit P2 #16: one entry that never changed).
    struct Provider: TimelineProvider {
        struct Entry: TimelineEntry { let date: Date }
        func placeholder(in context: Context) -> Entry { Entry(date: .now) }
        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            let now = Date.now
            let entries = [Entry(date: now)] + WidgetMoment.turns(after: now).map(Entry.init(date:))
            completion(Timeline(entries: entries, policy: .atEnd))
        }
    }
}

struct FerniHomeWidgetView: View {
    let date: Date
    @Environment(\.widgetRenderingMode) private var mode
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let peek = FerniPeek(accented: mode != .fullColor, dark: scheme == .dark)
        let hour = Calendar.current.component(.hour, from: date)
        Group {
            if SharedScreens.widgetOffersTalk(family) {
                // Two halves on one floor: Ferni peeking up on the left, his hello
                // and Talk on the right, both resting on the bottom edge's margin.
                HStack(alignment: .bottom, spacing: 0) {
                    peek.frame(maxWidth: .infinity)
                    VStack(alignment: .leading, spacing: 10) {
                        hello(WidgetMoment(hour: hour))
                            .font(.headline)
                            .foregroundStyle(FerniColor.textPrimary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        talk
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding([.trailing, .bottom], 16)
                    .padding(.top, 16)
                }
            } else {
                // A tap opens Ferni on the iPhone; it never starts a call.
                peek
            }
        }
        .containerBackground(for: .widget) {
            // The room's light at this hour, as on Home (RoomLight), and in dark
            // mode Night Ink's softer tint, so a dark widget is the app's warm
            // near-black, not brown. The widget follows the phone's appearance:
            // there's no app group, so it can't read the app's "Dark from 10 pm".
            let light = RoomLight(hour: hour)
            ZStack {
                FerniColor.background
                light.tint.opacity(light.tintOpacity(dark: scheme == .dark))
            }
        }
    }

    /// Home's hello for the hour (the app's Greeting), nothing personal.
    @ViewBuilder private func hello(_ moment: WidgetMoment) -> some View {
        switch moment {
        case .morning: Text("Good morning.")
        case .afternoon: Text("Good afternoon.")
        case .evening: Text("Good evening.")
        case .night: Text("Up late? I'm here.")
        }
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
