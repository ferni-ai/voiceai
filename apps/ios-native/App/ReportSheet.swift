import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// "Report this reply": what was wrong with something Ferni said, in a few taps.
struct ReportSheet: View {
    let caption: Caption
    let send: (ReplyReport.Reason, String) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReplyReport.Reason?
    @State private var note = ""
    @State private var state = SendState.editing

    enum SendState { case editing, sending, sent, failed }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(caption.text.trimmingCharacters(in: .whitespacesAndNewlines))
                        .foregroundStyle(FerniColor.textSecondary)
                } header: {
                    Text("What Ferni said")
                }
                Section("What's wrong with it?") {
                    ForEach(ReplyReport.Reason.allCases, id: \.self) { option in
                        Button {
                            reason = option
                        } label: {
                            HStack {
                                Text(option.label).foregroundStyle(FerniColor.textPrimary)
                                Spacer()
                                if reason == option { Image(systemName: "checkmark").foregroundStyle(FerniColor.accent) }
                            }
                        }
                        .accessibilityAddTraits(reason == option ? .isSelected : [])
                    }
                }
                Section {
                    TextField("Anything else? (optional)", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                } footer: {
                    switch state {
                    case .sent: Text("Thanks for telling us. We'll look at it.")
                    case .failed: Text("Couldn't send that. Try again?").foregroundStyle(FerniColor.error)
                    default: Text("We read reports to make Ferni better. What you were talking about stays private.")
                    }
                }
            }
            .navigationTitle("Report a reply")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(state == .sent ? "Done" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if state != .sent {
                        Button("Send") { Task { await submit() } }
                            .disabled(reason == nil || state == .sending)
                    }
                }
            }
            .tint(FerniColor.accent)
        }
        .presentationDetents([.medium, .large])
    }

    private func submit() async {
        guard let reason else { return }
        state = .sending
        do {
            try await send(reason, note)
            state = .sent
        } catch {
            state = .failed
        }
    }
}
