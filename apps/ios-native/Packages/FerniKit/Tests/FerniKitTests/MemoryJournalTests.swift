import XCTest
@testable import FerniKit

/// Design audit P2 #6: the memory list read like a database (third person,
/// grouped by type). It reads like a journal: said to you, newest first.
final class MemoryJournalTests: XCTestCase {
    func testNotesAreSaidToYou() {
        let cases: [(String, String)] = [
            ("Has a dog called Biscuit", "You have a dog called Biscuit"),
            ("Is training for a half marathon", "You're training for a half marathon"),
            ("Likes strong coffee", "You like strong coffee"),
            ("Worries about Sunday evenings", "You worry about Sunday evenings"),
            ("Misses living by the sea", "You miss living by the sea"),
            ("User prefers mornings", "You prefer mornings"),
            ("The user mentioned a new job", "You mentioned a new job"),
            ("User's sister lives in Lisbon", "Your sister lives in Lisbon"),
            ("Sister Ana's birthday is Friday", "Your sister Ana's birthday is Friday"),
            ("Mom's knee surgery went well", "Your mom's knee surgery went well"),
        ]
        for (note, said) in cases { XCTAssertEqual(MemoryJournal.toYou(note), said, note) }
    }

    /// Anything it isn't sure of stays exactly as Ferni wrote it.
    func testOtherShapesAreLeftAlone() {
        for note in ["Strong coffee, no sugar", "Walk before work, three mornings a week", "Ana", "Is",
                     "Usernames are hard", "Biscuit is a beagle", "Family dinner on Sundays"] {
            XCTAssertEqual(MemoryJournal.toYou(note), note)
        }
    }

    func testNewestFirstByWhenItWasLearned() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func note(_ id: String, daysAgo: Double?, kind: String = "fact") -> MemoryStore.Note {
            MemoryStore.Note(id: id, content: id, kind: kind, learnedAt: daysAgo.map { now.addingTimeInterval(-$0 * 86_400) },
                             canForget: true)
        }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let sections = MemoryJournal.sections([
            note("old", daysAgo: 90, kind: "goal"), note("undated-1", daysAgo: nil), note("yesterday", daysAgo: 1, kind: "pattern"),
            note("today", daysAgo: 0.1), note("fortnight", daysAgo: 14, kind: "preference"), note("undated-2", daysAgo: nil),
        ], now: now, calendar: utc)
        XCTAssertEqual(sections.map(\.period), [.thisWeek, .thisMonth, .earlier])
        XCTAssertEqual(sections.map { $0.notes.map(\.id) }, [["today", "yesterday"], ["fortnight"], ["old", "undated-1", "undated-2"]],
                       "types mixed, newest first; undated last in the server's order")
        XCTAssertEqual(MemoryJournal.sections([note("a", daysAgo: 40)], now: now, calendar: utc).map(\.period), [.earlier],
                       "only periods that have notes")
    }
}
