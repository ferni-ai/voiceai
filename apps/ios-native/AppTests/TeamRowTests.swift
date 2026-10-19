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
