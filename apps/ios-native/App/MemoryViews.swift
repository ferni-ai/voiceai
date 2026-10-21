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
    /// MemoryStore.forgotten: a note forgotten in What Ferni remembers leaves
    /// this card too (it was loaded once per call; critic L).
    var forgotten = 0
    @State private var items: [CallRemembered.Item] = []
    @State private var editing: String?
    @State private var draft = ""
    @State private var problem: String?
    @FocusState private var writing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                // A goodbye with weight (award upgrade 8): the card rises out of
                // where the captions were and settles, a soft spring with no
                // bounce; under Reduce Motion it fades in where it rests.
                .transition(Self.travels(reduceMotion: reduceMotion) ? .move(edge: .bottom).combined(with: .opacity) : .opacity)
            }
        }
        .task(id: "\(call.startedAt?.timeIntervalSince1970 ?? 0)-\(forgotten)") { await load() }
    }

    /// Your words in ink, with one quiet way to change them (design audit P2
    /// #8: the words were grey under three pairs of links).
    private func row(_ item: CallRemembered.Item) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: FerniSpace.breath) {
            Text(item.sentence)
                .font(FerniType.body)
                .foregroundStyle(FerniColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Menu {
                Button("Not quite") {
                    draft = item.value
                    editing = item.id
                    problem = nil
                }
                Button("Forget", role: .destructive) { Task { await forget(item) } }
            } label: {
                Image(systemName: "ellipsis")
                    .font(FerniType.body)
                    .foregroundStyle(FerniColor.textSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Change: \(item.sentence)")
            .accessibilityIdentifier("remember.change")
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
    /// How the card arrives: a slow, unbouncy settle, or a plain fade under
    /// Reduce Motion.
    static func settle(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: 0.25) : .spring(settleSpring)
    }

    /// The settle's spring: 0.6 s, nine tenths damped.
    static let settleSpring = Spring(response: 0.6, dampingRatio: 0.9)

    /// Whether the card travels up into place; under Reduce Motion it fades in where it rests.
    static func travels(reduceMotion: Bool) -> Bool { !reduceMotion }

    private func load() async {
        guard let since = call.startedAt else { return }
        for attempt in 0..<2 {
            if attempt > 0 { try? await Task.sleep(for: .seconds(4)) }
            let found = await remembered.items(since: since)
            withAnimation(Self.settle(reduceMotion: reduceMotion)) { items = found }
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
/// Searched on this phone by its own model; shown only where that exists, and
/// only when there's something to search (design audit P2 #7).
///
/// A row at the top of the list, not the system's floating search bar: that
/// bar covered the last note's Forget on an SE (critic M-D), and rows passing
/// behind its glass showed through as faint words the contrast audit failed,
/// with no element to name (critic H-B, H-C).
private struct SearchRow: View {
    @Binding var query: String
    let submit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(FerniColor.textSecondary)
                .accessibilityHidden(true)
            // Wraps instead of cutting off at large sizes (the audit read the
            // one-line field, and its prompt's "…", as clipped). Return searches.
            TextField("Search what Ferni remembers", text: $query,
                      prompt: Text("Find something you told me").foregroundStyle(FerniColor.textSecondary), axis: .vertical)
                .lineLimit(1...4)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onChange(of: query) { _, text in
                    guard text.contains("\n") else { return }
                    query = text.replacingOccurrences(of: "\n", with: "")
                    submit()
                }
                .accessibilityIdentifier("memory.search")
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(FerniColor.textSecondary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
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
    /// The note whose Forget was tapped, until you say so or don't.
    @State private var forgetting: MemoryStore.Note?

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
        // Hard edges, as in Settings (design audit P2 #10): with soft ones, at
        // AX5 (no intro) the rows under the bar showed through as faint words
        // the audit failed (critic H-B).
        .scrollEdgeEffectStyle(.hard, for: .all)
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
            SettingsHeader("From your notes")
        } footer: {
            SettingsFooter("Searched on this iPhone. Nothing left it.")
        }
    }

    private var notes: some View {
        List {
            if NoteSearch.isAvailable && !memory.notes.isEmpty {
                Section { SearchRow(query: $query) { Task { await search.search(query, in: memory.notes) } } }
            }
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
                // A journal, not a database: said to you, newest first, each note
                // with when Ferni learned it and a Forget you can see (design
                // audit P2 #6: third person, grouped by type, Forget in a swipe).
                // The people in your life first, each under their own name (award
                // upgrade 7); then the rest, newest first.
                let people = MemoryJournal.people(memory.notes)
                ForEach(people, id: \.who) { person in
                    Section {
                        ForEach(person.notes) { note in NoteRow(note: note) { forgetting = note } }
                    } header: {
                        Text("Your \(person.who)").foregroundStyle(FerniColor.textSecondary)
                    }
                    .accessibilityIdentifier("memory.person.\(person.who)")
                }
                let theirs = Set(people.flatMap(\.notes).map(\.id))
                ForEach(MemoryJournal.sections(memory.notes.filter { !theirs.contains($0.id) }, now: .now), id: \.period) { section in
                    Section {
                        ForEach(section.notes) { note in
                            // No swipe as well: it forgot without asking, and its hidden
                            // button failed the audit's hit-area check on every row.
                            NoteRow(note: note) { forgetting = note }
                        }
                    } header: {
                        // The system header grey only nearly passes the contrast audit on paper.
                        Text(Self.title(section.period)).foregroundStyle(FerniColor.textSecondary)
                    }
                }
                Section {
                } footer: {
                    SettingsFooter("Ferni's team shares what you tell Ferni, so Maya and the others know it too.")
                }
            }
        }
        .overlay { if memory.load == .loading && memory.notes.isEmpty { ProgressView() } }
        .screenIntro(ScreenIntro.memory)
        .confirmationDialog("Forget this?", isPresented: Binding(get: { forgetting != nil }, set: { if !$0 { forgetting = nil } }),
                            titleVisibility: .visible, presenting: forgetting) { note in
            Button("Forget", role: .destructive) { Task { await memory.forget(note) } }
        } message: { note in
            Text(MemoryJournal.toYou(note.content))
        }
        .onChange(of: query) { _, text in if text.isEmpty { search.clear() } }
        .task { await memory.refresh() }
        .refreshable { await memory.refresh() }
    }

    static func title(_ period: MemoryJournal.Period) -> LocalizedStringKey {
        switch period {
        case .thisWeek: "This week"
        case .thisMonth: "This month"
        case .earlier: "Before that"
        }
    }
}

/// One note: in ink, said to you, with when it was learned and, where it can
/// be, a Forget that asks first.
private struct NoteRow: View {
    let note: MemoryStore.Note
    let forget: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: FerniSpace.breath) {
            VStack(alignment: .leading, spacing: 2) {
                Text(MemoryJournal.toYou(note.content))
                    .foregroundStyle(FerniColor.textPrimary)
                if let when = note.learnedAt {
                    Text(when.formatted(.relative(presentation: .named)))
                        .font(FerniType.footnote)
                        .foregroundStyle(FerniColor.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if note.canForget {
                Button(action: forget) {
                    // The whole 44 pt square is the target, not just the word.
                    Text("Forget")
                        .font(FerniType.footnote)
                        .foregroundStyle(FerniColor.textSecondary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                    .accessibilityLabel(Text("Forget: \(MemoryJournal.toYou(note.content))"))
            }
        }
    }
}
