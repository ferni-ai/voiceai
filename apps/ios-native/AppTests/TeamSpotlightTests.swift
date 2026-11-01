import CoreSpotlight
import FerniKit
import XCTest
@testable import Ferni

/// Ecosystem item 8: the teammates you've met are in Spotlight and
/// Shortcuts, found by what they're good for. Never memories, never someone
/// you haven't met.
@MainActor
final class TeamSpotlightTests: XCTestCase {
    final class FakeIndex: SpotlightIndexing {
        var indexed: [[String]] = [], removed: [[String]] = []
        func index(_ members: [TeamMember]) async throws { indexed.append(members.map(\.id).sorted()) }
        func remove(_ ids: [String]) async throws { removed.append(ids.sorted()) }
    }

    func testATeammateIsFoundByWhatTheyreGoodFor() {
        let peter = TeamMember(PersonaRegistry.get("peter"))
        let set = peter.attributeSet
        XCTAssertEqual(set.title, "Peter")
        XCTAssertEqual(set.contentDescription, PersonaRegistry.get("peter").specialty)
        let keywords = Set(set.keywords ?? [])
        for word in PersonaRegistry.get("peter").role.lowercased().split(separator: " ") {
            XCTAssertTrue(keywords.contains(String(word)), "\(word) in \(keywords)")
        }
    }

    func testOnlyTheTeammatesYouveMetAreIndexed() async {
        let index = FakeIndex()
        let spotlight = TeamSpotlight(index: index)
        await spotlight.sync(met: ["ferni", "maya"])
        XCTAssertEqual(index.indexed.last, ["ferni", "maya"])
        await spotlight.sync(met: ["ferni"])
        XCTAssertEqual(index.indexed.last, ["ferni"])
        XCTAssertEqual(index.removed.last, ["maya"], "someone no longer on the team leaves Spotlight")
        await spotlight.sync(met: ["ferni", "nobody"])
        XCTAssertEqual(index.indexed.last, ["ferni"], "only real teammates")
    }

    func testShortcutsOfferOnlyTheTeammatesYouveMet() async throws {
        let before = TeamMemberQuery.met
        defer { TeamMemberQuery.met = before }
        TeamMemberQuery.met = { ["ferni", "peter"] }
        let suggested = try await TeamMemberQuery().suggestedEntities().map(\.id)
        XCTAssertEqual(Set(suggested), ["ferni", "peter"])
        let asked = try await TeamMemberQuery().entities(for: ["peter", "maya"]).map(\.id)
        XCTAssertEqual(asked, ["peter"])
    }

    /// Opening a teammate from Spotlight is the same door as Talk: consent first.
    func testOpeningATeammateTalksThroughTheUsualDoor() async throws {
        var asked: [String] = []
        let before = TalkIntent.handler
        defer { TalkIntent.handler = before }
        TalkIntent.handler = { asked.append($0) }
        var intent = TalkToTeammateIntent()
        intent.target = TeamMember(PersonaRegistry.get("maya"))
        _ = try await intent.perform()
        XCTAssertEqual(asked, ["maya"])
    }
}
