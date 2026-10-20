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
    @FocusState private var writing: Bool

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
            HStack(spacing: FerniSpace.breath) {
                Button("Not quite") {
                    draft = item.value
                    editing = item.id
                    problem = nil
                }
                .buttonStyle(Pressable())
                .accessibilityLabel("Not quite: correct \(item.sentence)")
                Button("Forget") { Task { await forget(item) } }
                    .buttonStyle(Pressable())
                    .accessibilityLabel("Forget \(item.sentence)")
            }
            .font(FerniType.footnote)
            .tint(FerniColor.accent)
        }
    }

    /// A text button whose whole 44 pt row presses, not just its 16 pt of
    /// words (design audit P1-5: "Not quite" and "Forget" were 16 pt tall).
    private struct Pressable: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .foregroundStyle(.tint)
                .frame(minWidth: 44, minHeight: 44)
                .padding(.horizontal, FerniSpace.breath / 2)
                .contentShape(Rectangle())
                .opacity(configuration.isPressed ? 0.5 : 1)
        }
    }

    private func editor(_ item: CallRemembered.Item) -> some View {
        VStack(alignment: .leading, spacing: FerniSpace.breath) {
            if let key = item.key {
                Text(key.prefix(1).uppercased() + key.dropFirst())
                    .font(FerniType.footnote)
                    .foregroundStyle(FerniColor.textSecondary)
            }
            // Wraps as you write and takes the keyboard at once (design audit
            // P1-5: one line, and a second tap before you could type). Done saves.
            TextField("What's right?", text: $draft, axis: .vertical)
                // Room for the whole thought from the start, so the card doesn't
                // grow under the keyboard as you write.
                .lineLimit(4, reservesSpace: true)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)
                .focused($writing)
                .accessibilityIdentifier("remember.correction")
                .onChange(of: draft) { _, text in
                    // Return is Done here: a fact is one thought.
                    if text.contains("\n") {
                        draft = text.replacingOccurrences(of: "\n", with: "")
                        Task { await save(item) }
                        return
                    }
                    if text.count > CallRemembered.maxCorrection { draft = String(text.prefix(CallRemembered.maxCorrection)) }
                }
                .onAppear { writing = true }
            HStack(spacing: FerniSpace.breath) {
                Button("Cancel") { editing = nil }
                    .buttonStyle(Pressable())
                Button("Save") { Task { await save(item) } }
                    .buttonStyle(Pressable())
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .font(FerniType.footnote)
            .tint(FerniColor.accent)
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

/// "When did I mention Ana?": the notes that answer, with when you said them.
/// Searched on this phone by its own model; shown only where that exists.
private struct OnDeviceSearch: ViewModifier {
    @Binding var query: String
    let submit: () -> Void

    func body(content: Content) -> some View {
        if NoteSearch.isAvailable {
            content
                .searchable(text: $query, prompt: Text("When did I mention…"))
                .onSubmit(of: .search, submit)
        } else {
            content
        }
    }
}

/// Everything Ferni remembers, grouped, each note forgettable (UX spec §5).
struct MemoryScreen: View {
    let memory: MemoryStore
    let lock: MemoryLock
    @Environment(\.scenePhase) private var scenePhase
    @State private var query = ""
    @State private var search = NoteSearch(ranker: OnDeviceNoteRanker())

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
        .ferniPaper()
        .overlay { if lock.isEnabled && scenePhase != .active { Rectangle().fill(.regularMaterial).ignoresSafeArea() } }
        .navigationTitle("What Ferni remembers")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var searchResults: some View {
        Section {
            switch search.state {
            case .searching:
                ProgressView()
            case .done where search.results.isEmpty, .failed:
                Text("Nothing in your notes about that.")
                    .foregroundStyle(FerniColor.textSecondary)
            default:
                ForEach(search.results) { note in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(note.content)
                        if let when = note.learnedAt {
                            Text(when.formatted(date: .abbreviated, time: .omitted))
                                .font(FerniType.footnote)
                                .foregroundStyle(FerniColor.textSecondary)
                        }
                    }
                }
            }
        } header: {
            Text("From your notes")
        } footer: {
            Text("Searched on this iPhone. Nothing left it.")
        }
    }

    private var notes: some View {
        List {
            if !query.isEmpty, search.state != .idle { searchResults }
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
        .modifier(OnDeviceSearch(query: $query) { Task { await search.search(query, in: memory.notes) } })
        .onChange(of: query) { _, text in if text.isEmpty { search.clear() } }
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
