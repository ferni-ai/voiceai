import XCTest
@testable import FerniVoice

/// The car shows who to talk to and what's happening, never what's said.
final class CarScreensTests: XCTestCase {
    func testContinueWithWhoeverAnswersNextThenTheTeam() {
        let rows = CarScreens.rows(team: ["ferni", "maya", "peter"], chosen: "maya")
        XCTAssertEqual(rows.map(\.personaID), ["maya", "ferni", "peter"])
        XCTAssertEqual(rows.first?.title, "Continue with Maya")
    }

    func testTeammatesNotOnYourTeamArentOffered() {
        let rows = CarScreens.rows(team: ["ferni"], chosen: "ferni")
        XCTAssertEqual(rows.map(\.personaID), ["ferni"])
    }

    func testTheVoiceScreenFollowsTheCall() {
        typealias S = CarScreens.VoiceState
        XCTAssertEqual(S.of(phase: .connecting, pose: .idle, onHold: false), .connecting)
        XCTAssertEqual(S.of(phase: .reconnecting, pose: .speaking, onHold: false), .connecting)
        XCTAssertEqual(S.of(phase: .live, pose: .speaking, onHold: false), .speaking)
        XCTAssertEqual(S.of(phase: .live, pose: .thinking, onHold: false), .thinking)
        XCTAssertEqual(S.of(phase: .live, pose: .listening, onHold: false), .listening)
        XCTAssertEqual(S.of(phase: .live, pose: .speaking, onHold: true), .onHold)
    }

    /// Short titles only: nothing longer than a glance.
    func testTitlesAreAGlanceLong() {
        for state in CarScreens.VoiceState.allCases {
            let titles = state.titles(name: "Ferni")
            XCTAssertFalse(titles.isEmpty)
            XCTAssertTrue(titles.allSatisfy { $0.count <= 20 }, "\(state): \(titles)")
        }
    }
}
