import FerniDesign
import FerniKit
import FerniVoice
import SwiftUI

/// After a call: what Ferni kept from it, each one fixable ("Not quite") or
/// forgettable (design north star §3.4). Nothing shows when the call taught
/// nothing new, or when the server has nothing to show.
struct RememberCard: View {
    let call: CallSession
    let remembered: CallRemembered
    @State private var items: [CallRemembered.Item] = []
    @State private var editing: String?
    @State private var draft = ""
    @State private var problem: String?

    var body: some View {
        // A permanent zero-height anchor: .task on a view that renders nothing never runs.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if !items.isEmpty {
                VStack(alignment: .leading, spacing: FerniSpace.breath) {
                    Text("I'll remember")
                        .font(FerniType.headline)
                        .foregroundStyle(FerniColor.textPrimary)
                    ForEach(items) { item in
                        if editing == item.id { editor(item) } else { row(item) }
                    }
                    if let problem {
                        Text(problem)
                            .font(FerniType.footnote)
                            .foregroundStyle(FerniColor.textSecondary)
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

    private func row(_ item: CallRemembered.Item) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(item.sentence)
                .font(FerniType.body)
                .foregroundStyle(FerniColor.textSecondary)
            HStack(spacing: FerniSpace.rest) {
                Button("Not quite") {
                    draft = item.value
                    editing = item.id
                    problem = nil
                }
                .accessibilityLabel("Not quite: correct \(item.sentence)")
                Button("Forget") { Task { await forget(item) } }
                    .accessibilityLabel("Forget \(item.sentence)")
            }
            .font(FerniType.footnote)
            .tint(FerniColor.accent)
            .frame(minHeight: 44)
        }
    }

    private func editor(_ item: CallRemembered.Item) -> some View {
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            if let key = item.key {
                Text(key.prefix(1).uppercased() + key.dropFirst())
                    .font(FerniType.footnote)
                    .foregroundStyle(FerniColor.textSecondary)
            }
            TextField("What's right?", text: $draft)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)
                .onSubmit { Task { await save(item) } }
                .onChange(of: draft) { _, text in
                    if text.count > CallRemembered.maxCorrection { draft = String(text.prefix(CallRemembered.maxCorrection)) }
                }
            HStack(spacing: FerniSpace.rest) {
                Button("Cancel") { editing = nil }
                Button("Save") { Task { await save(item) } }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .font(FerniType.footnote)
            .tint(FerniColor.accent)
            .frame(minHeight: 44)
        }
    }

    /// Facts are written as the call wraps up, so look once more a little later.
    private func load() async {
        guard let since = call.startedAt else { return }
        for attempt in 0..<2 {
            if attempt > 0 { try? await Task.sleep(for: .seconds(4)) }
            items = await remembered.items(since: since)
            if !items.isEmpty { return }
        }
    }

    private func save(_ item: CallRemembered.Item) async {
        if let fixed = await remembered.correct(item, to: draft) {
            items = items.map { $0.id == item.id ? fixed : $0 }
            editing = nil
            problem = nil
        } else {
            problem = String(localized: "Couldn't save that. Try again?")
        }
    }

    private func forget(_ item: CallRemembered.Item) async {
        let before = items
        items.removeAll { $0 == item }
        if !(await remembered.forget(item)) {
            items = before
            problem = String(localized: "Couldn't forget that. Try again?")
        }
    }
}

/// Everything Ferni remembers, grouped, each note forgettable (UX spec §5).
struct MemoryScreen: View {
    let memory: MemoryStore
    let lock: MemoryLock
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if lock.isLocked {
                // Locked: nothing is fetched or shown until the phone's owner confirms.
                ContentUnavailableView {
                    Label("What Ferni remembers is locked", systemImage: "lock")
                } actions: {
                    Button("Unlock with \(lock.method ?? String(localized: "passcode"))") { Task { await lock.unlock() } }
                        .buttonStyle(.borderedProminent)
                        .tint(FerniColor.accent)
                }
                .task { await lock.unlock() }
            } else {
                notes
            }
        }
        // The app switcher's snapshot never shows the notes when the lock is on.
        .overlay { if lock.isEnabled && scenePhase != .active { Rectangle().fill(.regularMaterial).ignoresSafeArea() } }
        .navigationTitle("What Ferni remembers")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var notes: some View {
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
