import ActivityKit
import FerniDesign
import SwiftUI
import WidgetKit

@main
struct FerniLiveBundle: WidgetBundle {
    var body: some Widget { CallLiveActivity() }
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
                endButton
            }
            .padding()
            .activityBackgroundTint(FerniColor.background)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { portrait(context.state).frame(width: 40, height: 40) }
                DynamicIslandExpandedRegion(.trailing) { endButton }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.state.words(context.state.personaName)).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) { duration(context.attributes) }
            } compactLeading: {
                portrait(context.state).frame(width: 22, height: 22)
            } compactTrailing: {
                Image(systemName: "waveform")
                    .symbolEffect(.variableColor.iterative, isActive: context.state.state == .speaking)
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
