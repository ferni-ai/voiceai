import XCTest
@testable import FerniDesign

/// Delight gap 4 addendum: the big win (a spin and hops) is for when Ferni
/// is celebrating with you, never while you're mid-sentence.
final class WinTests: XCTestCase {
    func testTheWinWaitsForYouToFinishSpeaking() {
        XCTAssertTrue(AvatarView.winPlays(.cheering, reduceMotion: false, personSpeaking: false))
        XCTAssertFalse(AvatarView.winPlays(.cheering, reduceMotion: false, personSpeaking: true), "never over the person")
    }

    func testOnlyTheBigFacesAndNotUnderReduceMotion() {
        XCTAssertFalse(AvatarView.winPlays(.happy, reduceMotion: false, personSpeaking: false))
        XCTAssertFalse(AvatarView.winPlays(.proud, reduceMotion: true, personSpeaking: false))
        for face in [AvatarExpression.cheering, .proud, .excited] {
            XCTAssertTrue(AvatarView.winPlays(face, reduceMotion: false, personSpeaking: false), "\(face)")
        }
    }
}
