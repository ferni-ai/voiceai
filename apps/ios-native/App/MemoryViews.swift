import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// After a call: what Ferni kept from it, in your words, each one forgettable
/// (design north star §3.4). Nothing shows when the call taught nothing new.
struct RememberCard: View {
    let call: CallSession
    let memory: MemoryStore
    @State private var notes: [MemoryStore.Note] = []

    var body: some View {
        // A permanent zero-height anchor: .task on a view that renders nothing never runs.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if !notes.isEmpty {
                VStack(alignment: .leading, spacing: FerniSpace.breath) {
                    Text("I'll remember")
                        .font(FerniType.headline)
                        .foregroundStyle(FerniColor.textPrimary)
                    ForEach(notes) { note in
                        HStack(alignment: .firstTextBaseline) {
                            Text(note.content)
                                .font(FerniType.body)
                                .foregroundStyle(FerniColor.textSecondary)
                            Spacer(minLength: FerniSpace.breath)
                            if note.canForget {
                                Button("Forget") { Task { await forget(note) } }
                                    .font(FerniType.footnote)
                                    .tint(FerniColor.accent)
                                    .accessibilityLabel("Forget \(note.content)")
                            }
                        }
                    }
                }
                .padding(FerniSpace.pause)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FerniColor.surfaceRaised, in: RoundedRectangle(cornerRadius: FerniRadius.large))
                .overlay(RoundedRectangle(cornerRadius: FerniRadius.large).stroke(FerniColor.border))
                .transition(.opacity)
            }
        }
        .task(id: call.startedAt) { await load() }
    }

    /// Notes are written as the call wraps up, so look once more a little later.
    private func load() async {
        guard let since = call.startedAt else { return }
        for attempt in 0..<2 {
            if attempt > 0 { try? await Task.sleep(for: .seconds(4)) }
            await memory.refresh()
            notes = memory.learned(since: since)
            if !notes.isEmpty { return }
        }
    }

    private func forget(_ note: MemoryStore.Note) async {
        notes.removeAll { $0 == note }
        if !(await memory.forget(note)) { notes = memory.learned(since: call.startedAt ?? .now) }
    }
}

/// Everything Ferni remembers, grouped, each note forgettable (UX spec §5).
struct MemoryScreen: View {
    let memory: MemoryStore

    var body: some View {
        List {
            switch memory.load {
            case .failed where memory.notes.isEmpty:
                Section {
                    Text("Couldn't load your notes.")
                    Button("Try again") { Task { await memory.refresh() } }
                }
            case .loaded where memory.notes.isEmpty:
                Text("Nothing yet. As you talk, Ferni keeps notes here so you never have to repeat yourself.")
                    .foregroundStyle(FerniColor.textSecondary)
            default:
                ForEach(Self.groups, id: \.kind) { group in
                    let notes = memory.notes.filter { $0.kind == group.kind }
                    if !notes.isEmpty {
                        Section(group.title) {
                            ForEach(notes) { note in
                                Text(note.content)
                                    .swipeActions {
                                        if note.canForget {
                                            Button("Forget", role: .destructive) { Task { await memory.forget(note) } }
                                        }
                                    }
                                    .accessibilityAction(named: "Forget") {
                                        if note.canForget { Task { await memory.forget(note) } }
                                    }
                            }
                        }
                    }
                }
                Section {
                } footer: {
                    Text("Ferni's team shares what you tell Ferni, so Maya and the others know it too.")
                }
            }
        }
        .overlay { if memory.load == .loading && memory.notes.isEmpty { ProgressView() } }
        .navigationTitle("What Ferni remembers")
        .navigationBarTitleDisplayMode(.inline)
        .task { await memory.refresh() }
        .refreshable { await memory.refresh() }
    }

    static let groups: [(kind: String, title: String)] = [
        ("goal", "Things you're working on"),
        ("preference", "Things you like"),
        ("fact", "About you"),
        ("pattern", "Your rhythms"),
    ]
}
