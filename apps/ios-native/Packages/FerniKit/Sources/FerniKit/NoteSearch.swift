import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Picks which of a person's own notes answer their question.
public protocol NoteRanker: Sendable {
    /// Indexes into `notes`, best first.
    func matches(for question: String, in notes: [String]) async throws -> [Int]
}

/// "When did I mention Ana?": searches the notes already on this phone with
/// the on-device model, and answers with those notes themselves, word for
/// word, with when you mentioned them. Nothing is generated in Ferni's voice
/// and nothing leaves the phone. Only on devices with Apple Intelligence.
@MainActor
@Observable
public final class NoteSearch {
    public enum State: Equatable, Sendable { case idle, searching, done, failed }

    public private(set) var state = State.idle
    public private(set) var results: [MemoryStore.Note] = []
    private let ranker: any NoteRanker
    /// Recent notes only: the on-device model's context is small.
    static let window = 120

    public init(ranker: any NoteRanker) { self.ranker = ranker }

    /// Whether this phone can search on device (the feature is hidden otherwise).
    public static var isAvailable: Bool {
        #if canImport(FoundationModels)
        SystemLanguageModel.default.availability == .available
        #else
        false
        #endif
    }

    public func search(_ question: String, in notes: [MemoryStore.Note]) async {
        let question = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return clear() }
        let recent = Array(notes.sorted { ($0.learnedAt ?? .distantPast) > ($1.learnedAt ?? .distantPast) }.prefix(Self.window))
        state = .searching
        do {
            let picked = try await ranker.matches(for: question, in: recent.map(Self.line))
            var seen = Set<Int>()
            results = picked.filter { recent.indices.contains($0) && seen.insert($0).inserted }.prefix(5).map { recent[$0] }
            state = .done
        } catch {
            results = []
            state = .failed
        }
    }

    public func clear() {
        results = []
        state = .idle
    }

    /// A note as the model sees it, with when it was learned (for "when" questions).
    static func line(_ note: MemoryStore.Note) -> String {
        let when = note.learnedAt.map { " (\($0.formatted(date: .abbreviated, time: .omitted)))" } ?? ""
        return String(note.content.prefix(160)) + when
    }
}

#if canImport(FoundationModels)
/// The on-device model only: `SystemLanguageModel.default`, never Private Cloud Compute.
public struct OnDeviceNoteRanker: NoteRanker {
    @Generable
    struct Matches {
        @Guide(description: "The numbers of the notes that answer the question, best first. Empty if none do.")
        var numbers: [Int]
    }

    public init() {}

    public func matches(for question: String, in notes: [String]) async throws -> [Int] {
        let session = LanguageModelSession(
            model: SystemLanguageModel.default,
            instructions: """
            You find which of a person's own notes answer their question. \
            Reply only with note numbers from the list. Never invent a note.
            """
        )
        let list = notes.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
        let answer = try await session.respond(to: "Notes:\n\(list)\n\nQuestion: \(question)", generating: Matches.self)
        return answer.content.numbers.map { $0 - 1 }
    }
}
#endif
