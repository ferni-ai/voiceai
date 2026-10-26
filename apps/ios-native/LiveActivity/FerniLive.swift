import ActivityKit
import FerniDesign
import SwiftUI
import WidgetKit

@main
struct FerniLiveBundle: WidgetBundle {
    var body: some Widget {
        CallLiveActivity()
        TalkControl()
        FerniHomeWidget()
    }
}

/// The call while the phone is locked or you're in another app: who, what
/// they're doing, how long, and End. System animations only.
struct CallLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CallActivityAttributes.self) { context in
            HStack(spacing: 12) {
                portrait(context.state).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.state.words(context.state.personaName)).font(.headline)
                    duration(context.attributes)
                }
                Spacer()
                if context.state.state.hasControls {
                    muteButton(context.state.muted)
                    endButton
                }
            }
            .padding()
            .activityBackgroundTint(FerniColor.background)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { portrait(context.state).frame(width: 40, height: 40) }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.state.hasControls {
                        HStack(spacing: 8) { muteButton(context.state.muted); endButton }
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.state.words(context.state.personaName)).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) { duration(context.attributes) }
            } compactLeading: {
                portrait(context.state).frame(width: 22, height: 22)
            } compactTrailing: {
                Image(systemName: context.state.muted ? "mic.slash.fill" : "waveform")
                    .symbolEffect(.variableColor.iterative, isActive: context.state.state == .speaking && !context.state.muted)
                    .contentTransition(.symbolEffect(.replace))
            } minimal: {
                portrait(context.state).frame(width: 22, height: 22)
            }
        }
        .supplementalActivityFamilies([.small])
    }

    private func portrait(_ state: CallActivityAttributes.ContentState) -> some View {
        AvatarPortrait(persona: WindowPersona(personaId: state.personaID))
            .accessibilityLabel(state.personaName)
    }

    private func duration(_ attributes: CallActivityAttributes) -> some View {
        Text(timerInterval: attributes.startedAt...Date.distantFuture, countsDown: false)
            .monospacedDigit()
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .contentTransition(.numericText())
    }

    /// Mute only: a locked phone can mute the call but never turn the mic back
    /// on. Muted, it's a plain sign; unmuting is in the app (#2868 item 45).
    @ViewBuilder private func muteButton(_ muted: Bool) -> some View {
        if muted {
            Image(systemName: "mic.slash.fill")
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
                .accessibilityLabel("Muted. Open Ferni to unmute.")
        } else {
            Button(intent: MuteCallIntent()) {
                Image(systemName: "mic.fill")
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mute")
        }
    }

    private var endButton: some View {
        Button(intent: EndCallIntent()) {
            Image(systemName: "phone.down.fill")
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(FerniColor.error, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("End call")
    }
}
