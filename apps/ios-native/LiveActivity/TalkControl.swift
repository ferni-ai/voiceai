import AppIntents
import SwiftUI
import WidgetKit

/// "Talk to Ferni" in Control Center, on the Lock Screen and on the Action button.
struct TalkControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.sethdford.ferni.talk") {
            ControlWidgetButton(action: TalkIntent()) {
                Label("Talk to Ferni", systemImage: "waveform")
            }
        }
        .displayName("Talk to Ferni")
        .description("Start talking with Ferni.")
    }
}
