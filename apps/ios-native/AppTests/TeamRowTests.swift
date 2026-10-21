import FerniKit
import XCTest
@testable import Ferni

/// Critic M9: Home shows your team, never locked faces, and no row at all
/// while your team is just Ferni (the first visit).
final class TeamRowTests: XCTestCase {
    func testOnlyYourTeamAndNothingOnTheFirstVisit() {
        XCTAssertEqual(TeamRowModel.shown(unlocked: ["ferni"]).map(\.id), [])
        XCTAssertEqual(TeamRowModel.shown(unlocked: ["ferni", "maya", "peter"]).map(\.id), ["ferni", "maya", "peter"])
        XCTAssertFalse(TeamRowModel.shown(unlocked: ["ferni", "maya"]).contains { $0.id == "nayan" })
    }
}

/// Award upgrade 2 follow-up: the team row wraps as one set of views (the
/// audit saw ViewThatFits swap its names out instead of growing them).
final class TeamFlowTests: XCTestCase {
    private let flow = TeamFlow(spacing: 8, lineSpacing: 8)

    func testOneRowWhileTheyFitThenAsManyAsTheyNeed() {
        let five = Array(repeating: CGSize(width: 50, height: 60), count: 5)
        XCTAssertEqual(flow.rows(five, width: 400).map(\.items), [[0, 1, 2, 3, 4]], "282 pt fits in 400")
        XCTAssertEqual(flow.rows(five, width: 170).map(\.items), [[0, 1, 2], [3, 4]])
        XCTAssertEqual(flow.rows(five, width: 40).map(\.items), [[0], [1], [2], [3], [4]], "one each, never none")
        XCTAssertEqual(flow.rows(five, width: 400).first?.size, CGSize(width: 282, height: 60))
    }
}
