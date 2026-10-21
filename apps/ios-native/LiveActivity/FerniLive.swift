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
                    Text(context.state.state.words(context.state.personaName, muted: context.state.muted)).font(.headline)
                    if context.state.state.showsDuration { duration(context.attributes) }
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
                DynamicIslandExpandedRegion(.leading) { portrait(context.state, onBlack: true).frame(width: 40, height: 40) }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.state.hasControls {
                        HStack(spacing: 8) { muteButton(context.state.muted); endButton }
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.state.words(context.state.personaName, muted: context.state.muted)).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.state.showsDuration { duration(context.attributes) }
                }
            } compactLeading: {
                portrait(context.state, onBlack: true).frame(width: 22, height: 22)
            } compactTrailing: {
                Image(systemName: context.state.state.islandSymbol(muted: context.state.muted))
                    .symbolEffect(.variableColor.iterative, isActive: context.state.state == .speaking && !context.state.muted)
                    .contentTransition(.symbolEffect(.replace))
            } minimal: {
                portrait(context.state, onBlack: true).frame(width: 22, height: 22)
            }
        }
        .supplementalActivityFamilies([.small])
    }

    /// - Parameter onBlack: in the Dynamic Island, always black (design audit P2 #15).
    private func portrait(_ state: CallActivityAttributes.ContentState, onBlack: Bool = false) -> some View {
        AvatarPortrait(persona: WindowPersona(personaId: state.personaID), onBlack: onBlack)
            .accessibilityLabel(state.personaName)
    }

    private func duration(_ attributes: CallActivityAttributes) -> some View {
        Text(timerInterval: attributes.startedAt...Date.distantFuture, countsDown: false)
            .monospacedDigit()
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .contentTransition(.numericText())
    }

    private func muteButton(_ muted: Bool) -> some View {
        Button(intent: MuteCallIntent()) {
            Image(systemName: muted ? "mic.slash.fill" : "mic.fill")
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(muted ? "Unmute" : "Mute")
    }

    private var endButton: some View {
        Button(intent: EndCallIntent()) {
            // On the error colour's own ink: white on dark mode's #E7A39A was 2.08:1
            // (design audit P1-12).
            Image(systemName: "phone.down.fill")
                .foregroundStyle(FerniColor.onError)
                .frame(width: 44, height: 44)
                .background(FerniColor.error, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("End call")
    }
}
