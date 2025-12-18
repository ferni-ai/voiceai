import WidgetKit
import SwiftUI

// MARK: - Widget Configuration
// Note: Widgets require macOS 14.0+ for full functionality
// This file provides the widget code structure for when the minimum target is updated

#if swift(>=5.9)
@available(macOS 14.0, *)
/// Ferni Voice Control Center Widget
/// Shows current persona and allows quick start/stop
struct FerniVoiceWidget: Widget {
    let kind: String = "FerniVoiceWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: FerniWidgetProvider()
        ) { entry in
            FerniWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Ferni Voice")
        .description("Quick access to voice conversations with Ferni.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
#endif

// MARK: - Timeline Provider

@available(macOS 14.0, *)
struct FerniWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> FerniWidgetEntry {
        FerniWidgetEntry(
            date: Date(),
            personaId: "ferni",
            isConnected: false
        )
    }
    
    func getSnapshot(in context: Context, completion: @escaping (FerniWidgetEntry) -> Void) {
        let entry = FerniWidgetEntry(
            date: Date(),
            personaId: "ferni",
            isConnected: false
        )
        completion(entry)
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<FerniWidgetEntry>) -> Void) {
        let entry = FerniWidgetEntry(
            date: Date(),
            personaId: "ferni",
            isConnected: checkConnectionStatus()
        )
        
        // Refresh every 5 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func checkConnectionStatus() -> Bool {
        // Check if voice session is active via shared UserDefaults
        let defaults = UserDefaults(suiteName: "group.com.ferni.voice")
        return defaults?.bool(forKey: "isConnected") ?? false
    }
}

// MARK: - Timeline Entry

@available(macOS 14.0, *)
struct FerniWidgetEntry: TimelineEntry {
    let date: Date
    let personaId: String
    let isConnected: Bool
    
    var persona: WidgetPersona {
        WidgetPersona.get(personaId)
    }
}

// MARK: - Widget View

@available(macOS 14.0, *)
struct FerniWidgetEntryView: View {
    var entry: FerniWidgetEntry
    @Environment(\.widgetFamily) var family
    
    var body: some View {
        switch family {
        case .systemSmall:
            smallWidget
        case .systemMedium:
            mediumWidget
        default:
            smallWidget
        }
    }
    
    // MARK: - Small Widget
    
    private var smallWidget: some View {
        VStack(spacing: 8) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [entry.persona.primaryColor, entry.persona.secondaryColor],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 50, height: 50)
                
                Text(entry.persona.initials)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                
                // Connection indicator
                if entry.isConnected {
                    Circle()
                        .fill(.green)
                        .frame(width: 12, height: 12)
                        .offset(x: 18, y: 18)
                }
            }
            
            Text(entry.persona.name)
                .font(.headline)
            
            Text(entry.isConnected ? "Connected" : "Tap to talk")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .widgetURL(URL(string: "fernivoice://start?persona=\(entry.personaId)")!)
    }
    
    // MARK: - Medium Widget
    
    private var mediumWidget: some View {
        HStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [entry.persona.primaryColor, entry.persona.secondaryColor],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 60, height: 60)
                
                Text(entry.persona.initials)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.persona.name)
                    .font(.headline)
                
                Text(entry.persona.role)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(entry.isConnected ? .green : .orange)
                        .frame(width: 8, height: 8)
                    Text(entry.isConnected ? "Connected" : "Ready")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // Quick action buttons
            VStack(spacing: 8) {
                Link(destination: URL(string: "fernivoice://start?persona=\(entry.personaId)")!) {
                    Image(systemName: entry.isConnected ? "phone.fill" : "mic.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 44, height: 44)
                        .background(entry.persona.primaryColor)
                        .clipShape(Circle())
                }
                
                Text(entry.isConnected ? "End" : "Start")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Widget Persona (Lightweight for Widget)

struct WidgetPersona {
    let id: String
    let name: String
    let initials: String
    let role: String
    let primaryColor: Color
    let secondaryColor: Color
    
    static func get(_ id: String) -> WidgetPersona {
        switch id {
        case "ferni":
            return WidgetPersona(
                id: "ferni", name: "Ferni", initials: "FN",
                role: "Life Coach",
                primaryColor: Color(hex: 0x4a6741),
                secondaryColor: Color(hex: 0x3d5a35)
            )
        case "maya":
            return WidgetPersona(
                id: "maya", name: "Maya", initials: "MS",
                role: "Habits Coach",
                primaryColor: Color(hex: 0xa67a6a),
                secondaryColor: Color(hex: 0x8a635a)
            )
        case "alex":
            return WidgetPersona(
                id: "alex", name: "Alex", initials: "AC",
                role: "Communications",
                primaryColor: Color(hex: 0x5a6b8a),
                secondaryColor: Color(hex: 0x4a5a73)
            )
        case "jordan":
            return WidgetPersona(
                id: "jordan", name: "Jordan", initials: "JT",
                role: "Life Planner",
                primaryColor: Color(hex: 0xc4856a),
                secondaryColor: Color(hex: 0xa86d55)
            )
        case "peter":
            return WidgetPersona(
                id: "peter", name: "Peter", initials: "PJ",
                role: "Research",
                primaryColor: Color(hex: 0x3a6b73),
                secondaryColor: Color(hex: 0x2d5359)
            )
        case "nayan":
            return WidgetPersona(
                id: "nayan", name: "Nayan", initials: "NP",
                role: "Wisdom",
                primaryColor: Color(hex: 0x9a7b5a),
                secondaryColor: Color(hex: 0x7a5b3a)
            )
        default:
            return get("ferni")
        }
    }
}

// MARK: - Color Extension (Widget-safe)

extension Color {
    init(hex: UInt) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1.0)
    }
}

// MARK: - Preview

#if swift(>=5.9)
@available(macOS 14.0, *)
#Preview("Small Widget") {
    FerniWidgetEntryView(entry: FerniWidgetEntry(date: .now, personaId: "ferni", isConnected: false))
        .frame(width: 150, height: 150)
}

@available(macOS 14.0, *)
#Preview("Medium Widget") {
    FerniWidgetEntryView(entry: FerniWidgetEntry(date: .now, personaId: "ferni", isConnected: true))
        .frame(width: 300, height: 150)
}
#endif

