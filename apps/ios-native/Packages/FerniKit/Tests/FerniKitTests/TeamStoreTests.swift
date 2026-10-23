import Foundation
import XCTest
@testable import FerniKit

/// The team as the server decides it (src/api/routes/relationship.ts).
@MainActor
final class TeamStoreTests: XCTestCase {
    /// The route's real shape, trimmed.
    private let answer = #"""
    {"stage":"getting-started","tier":"free","unlockedMembers":["ferni","maya-santos"],
     "members":[{"id":"ferni","unlocked":true,"teaserMessage":null},
                {"id":"maya-santos","unlocked":true,"teaserMessage":null},
                {"id":"peter-john","unlocked":false,"teaserMessage":"Peter can show you patterns once we talk more."},
                {"id":"someone-new","unlocked":false,"teaserMessage":"?"}]}
    """#

    func testBeforeTheServerAnswersItsFerniAlone() {
        let team = TeamStore(fetch: { throw URLError(.notConnectedToInternet) })
        XCTAssertEqual(team.unlocked, ["ferni"])
        XCTAssertEqual(team.chosen, "ferni")
    }

    func testTheServersAnswerDecidesWhosOnTheTeam() async {
        let data = Data(answer.utf8)
        let team = TeamStore(fetch: { data })
        await team.refresh()
        XCTAssertEqual(team.unlocked, ["ferni", "maya"])
        XCTAssertEqual(team.teasers, ["peter": "Peter can show you patterns once we talk more."])
    }

    func testOnlySomeoneOnTheTeamCanAnswer() async {
        let data = Data(answer.utf8)
        let team = TeamStore(fetch: { data })
        await team.refresh()
        XCTAssertFalse(team.choose("peter"))
        XCTAssertEqual(team.chosen, "ferni")
        XCTAssertTrue(team.choose("maya"))
        XCTAssertEqual(team.chosen, "maya")
    }

    func testAFailedRefreshKeepsTheLastAnswer() async {
        final class Box: @unchecked Sendable { var fail = false }
        let box = Box()
        let data = Data(answer.utf8)
        let team = TeamStore(fetch: { if box.fail { throw URLError(.timedOut) }; return data })
        await team.refresh()
        box.fail = true
        await team.refresh()
        XCTAssertEqual(team.unlocked, ["ferni", "maya"])
    }

    func testIfTheChosenTeammateLeavesFerniAnswers() async {
        final class Box: @unchecked Sendable { var body = "" }
        let box = Box()
        box.body = answer
        let team = TeamStore(fetch: { Data(box.body.utf8) })
        await team.refresh()
        team.choose("maya")
        box.body = #"{"unlockedMembers":["ferni"],"members":[]}"#
        await team.refresh()
        XCTAssertEqual(team.chosen, "ferni")
    }
}
