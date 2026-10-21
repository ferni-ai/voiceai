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
    /// Send with no reason picked says what's missing (it's never greyed out).
    @State private var nudge = false

    enum SendState { case editing, sending, sent, failed }

    var body: some View {
        NavigationStack {
            Form {
                // Its title inside the card: as the first section's header, right
                // under the bar, the audit failed its contrast though the
                // screenshot measures 7.1:1 (2026-10-21).
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        SettingsHeader("What Ferni said")
                        Text(caption.text.trimmingCharacters(in: .whitespacesAndNewlines))
                            .foregroundStyle(FerniColor.textSecondary)
                    }
                    .accessibilityElement(children: .combine)
                }
                Section {
                    ForEach(ReplyReport.Reason.allCases, id: \.self) { option in
                        Button {
                            reason = option
                            nudge = false
                        } label: {
                            HStack {
                                Text(option.label).foregroundStyle(FerniColor.textPrimary)
                                Spacer()
                                if reason == option { Image(systemName: "checkmark").foregroundStyle(FerniColor.accent) }
                            }
                        }
                        .accessibilityAddTraits(reason == option ? .isSelected : [])
                    }
                } header: {
                    SettingsHeader("What's wrong with it?")
                } footer: {
                    if nudge {
                        Text("Pick what's wrong first.").font(FerniType.footnote).foregroundStyle(FerniColor.error)
                    }
                }
                Section {
                    // The system's placeholder grey failed the contrast audit.
                    TextField(text: $note, prompt: Text("Anything else? (optional)").foregroundStyle(FerniColor.textSecondary),
                              axis: .vertical) { Text("Anything else? (optional)") }
                        .lineLimit(3...6)
                } footer: {
                    switch state {
                    case .sent: SettingsFooter("Thanks for telling us. We'll look at it.")
                    case .failed: Text("Couldn't send that. Try again?").font(FerniType.footnote).foregroundStyle(FerniColor.error)
                    default: SettingsFooter("We read reports to make Ferni better. What you were talking about stays private.")
                    }
                }
            }
            .ferniPaper()
            .navigationTitle("Report a reply")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(state == .sent ? "Done" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if state != .sent {
                        // Never greyed out: the dimmed "Send" failed the contrast
                        // audit (critic H-C). Without a reason it says what's missing.
                        Button("Send") {
                            guard reason != nil else { nudge = true; return }
                            Task { await submit() }
                        }
                        .disabled(state == .sending)
                    }
                }
            }
            .tint(FerniColor.accent)
        }
        .presentationDetents([.medium, .large])
        // Paper, not glass: the call showed through (design audit P2 #3).
        .presentationBackground(FerniColor.background)
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
