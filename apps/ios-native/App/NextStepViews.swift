import EventKit
import EventKitUI
import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// A next step in words for the share sheet: the person's own words, with
/// the time when there is one, and no signature.
enum StepWords {
    static func share(_ step: NextSteps.Step, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let text = step.text.prefix(1).uppercased() + step.text.dropFirst()
        guard let due = step.due else { return text }
        let format = DateFormatter()
        format.locale = locale
        format.timeZone = timeZone
        format.setLocalizedDateFormatFromTemplate("EEEjmm")
        return "\(text), \(format.string(from: due))"
    }
}

/// The event the system's event sheet opens with. Calendar titles show on the
/// Lock Screen and in widgets, and the Lock Screen never shows the person's
/// own words, so the title is always neutral and their step goes in the notes,
/// which only show inside Calendar. No word list can know what's sensitive
/// ("call 988 tonight", "pick up my zoloft prescription" passed the old one).
/// The person still sees the title in the system sheet and can change it.
enum CalendarDraft {
    static let neutralTitle = String(localized: "Something you mentioned to Ferni")

    static func fill(_ event: EKEvent, from step: NextSteps.Step) {
        event.title = neutralTitle
        if let due = step.due {
            event.startDate = due
            event.endDate = due.addingTimeInterval(30 * 60)
        }
        let words = step.text.prefix(1).uppercased() + step.text.dropFirst()
        event.notes = String(localized: "From a talk with Ferni: \(words)")
    }
}

/// After a call: what the person said they'd do, ready for their calendar
/// (the system sheet; no permission is asked) or their task app (share).
struct NextStepsCard: View {
    let call: CallSession
    let steps: NextSteps
    @State private var found: [NextSteps.Step] = []
    @State private var adding: NextSteps.Step?

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 0) // .task needs a view that renders
            if !found.isEmpty {
                VStack(alignment: .leading, spacing: FerniSpace.breath) {
                    Text("Your next step")
                        .font(FerniType.headline)
                        .foregroundStyle(FerniColor.textPrimary)
                    ForEach(found) { step in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(StepWords.share(step))
                                .font(FerniType.body)
                                .foregroundStyle(FerniColor.textSecondary)
                            HStack(spacing: FerniSpace.rest) {
                                if step.due != nil {
                                    Button("Add to Calendar") { adding = step }
                                        .frame(minHeight: 44)
                                }
                                ShareLink("Share", item: StepWords.share(step))
                                    .frame(minHeight: 44)
                            }
                            .font(FerniType.body)
                            .tint(FerniColor.accent)
                        }
                    }
                }
                .padding(FerniSpace.pause)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FerniColor.surfaceRaised, in: RoundedRectangle(cornerRadius: FerniRadius.large))
                .overlay(RoundedRectangle(cornerRadius: FerniRadius.large).stroke(FerniColor.border))
            }
        }
        .task(id: call.startedAt) {
            guard let start = call.startedAt else { return found = [] }
            found = await steps.since(start)
        }
        .sheet(item: $adding) { step in EventEditor(step: step) { adding = nil } }
    }
}

/// The system's event editor (EventKitUI). It runs out of process: the app
/// can neither read the calendar nor see the saved event, so no permission.
private struct EventEditor: UIViewControllerRepresentable {
    let step: NextSteps.Step
    let done: () -> Void

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        CalendarDraft.fill(event, from: step)
        let editor = EKEventEditViewController()
        editor.eventStore = store
        editor.event = event
        editor.editViewDelegate = context.coordinator
        return editor
    }

    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let done: () -> Void
        init(done: @escaping () -> Void) { self.done = done }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { done() }
    }
}
