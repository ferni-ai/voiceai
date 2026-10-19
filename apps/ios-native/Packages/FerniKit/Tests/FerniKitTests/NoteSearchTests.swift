import Foundation
import XCTest
@testable import FerniKit

@MainActor
final class NoteSearchTests: XCTestCase {
    struct Ranker: NoteRanker {
        let answer: [Int]
        var fails = false
        func matches(for question: String, in notes: [String]) async throws -> [Int] {
            if fails { throw URLError(.cannotParseResponse) }
            return answer
        }
    }

    final class Seen: @unchecked Sendable { var lines: [String] = [] }
    struct Spy: NoteRanker {
        let seen: Seen
        func matches(for question: String, in notes: [String]) async throws -> [Int] { seen.lines = notes; return [] }
    }

    private func note(_ id: String, _ text: String, daysAgo: Double) -> MemoryStore.Note {
        MemoryStore.Note(id: id, content: text, kind: "fact", learnedAt: Date(timeIntervalSince1970: 1_760_000_000 - daysAgo * 86_400), canForget: true)
    }

    private lazy var notes = [note("a", "Ana is your sister", daysAgo: 3), note("b", "Loves hiking", daysAgo: 1),
                              note("c", "Ana's birthday is in June", daysAgo: 9)]

    func testTheAnswerIsTheNotesThemselves() async {
        let search = NoteSearch(ranker: Ranker(answer: [1, 2]))
        await search.search("When did I mention Ana?", in: notes)
        // Sorted newest first: b (1 day), a (3), c (9); the model picked a and c.
        XCTAssertEqual(search.results.map(\.id), ["a", "c"])
        XCTAssertEqual(search.state, .done)
    }

    /// The model can only point at notes that exist, once each.
    func testNumbersThatArentNotesAreIgnored() async {
        let search = NoteSearch(ranker: Ranker(answer: [7, -1, 1, 1]))
        await search.search("Ana", in: notes)
        XCTAssertEqual(search.results.map(\.id), ["a"])
    }

    func testAFailedSearchShowsNothing() async {
        let search = NoteSearch(ranker: Ranker(answer: [0], fails: true))
        await search.search("Ana", in: notes)
        XCTAssertTrue(search.results.isEmpty)
        XCTAssertEqual(search.state, .failed)
    }

    func testAnEmptyQuestionAsksNothing() async {
        let seen = Seen()
        let search = NoteSearch(ranker: Spy(seen: seen))
        await search.search("   ", in: notes)
        XCTAssertTrue(seen.lines.isEmpty)
        XCTAssertEqual(search.state, .idle)
    }

    func testTheModelSeesWhenEachNoteWasLearned() async {
        let seen = Seen()
        await NoteSearch(ranker: Spy(seen: seen)).search("Ana", in: notes)
        XCTAssertEqual(seen.lines.count, 3)
        XCTAssertTrue(seen.lines[0].hasPrefix("Loves hiking ("), "newest first, with its date")
    }
}
