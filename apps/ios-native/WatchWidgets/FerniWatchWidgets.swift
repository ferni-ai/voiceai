import AppIntents
import SwiftUI
import WidgetKit

@main
struct FerniWatchWidgets: WidgetBundle {
    var body: some Widget {
        TalkOnPhoneControl()
        FerniSmartStackCard()
    }
}

/// Control Center (and the Action button on Ultra): start the call on your iPhone.
struct TalkOnPhoneControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.sethdford.ferni.watch.talk") {
            ControlWidgetButton(action: TalkOnPhoneIntent()) {
                Label("Talk to Ferni", systemImage: "waveform")
            }
        }
        .displayName("Talk to Ferni")
    }
}

/// The Smart Stack: Ferni's eyes and a way into the remote. Nothing personal.
struct FerniSmartStackCard: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FerniSmartStack", provider: Provider()) { _ in
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    ForEach(0..<2, id: \.self) { _ in Ellipse().fill(.white).frame(width: 8, height: 11) }
                }
                .padding(8)
                .background(Circle().fill(Color(red: 0.29, green: 0.40, blue: 0.25)))
                .widgetAccentable()
                VStack(alignment: .leading) {
                    Text("Ferni").font(.headline)
                    Text("Talk on your iPhone").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Ferni")
        .description("Start a conversation on your iPhone.")
        .supportedFamilies([.accessoryRectangular])
    }

    struct Provider: TimelineProvider {
        struct Entry: TimelineEntry { let date: Date }
        func placeholder(in context: Context) -> Entry { Entry(date: .now) }
        func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
        func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
            completion(Timeline(entries: [Entry(date: .now)], policy: .never))
        }
    }
}
